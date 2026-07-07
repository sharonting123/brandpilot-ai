/**
 * 意图识别路由层
 * 两段式：关键词快路径（强信号） + LLM 语义理解（含交叉校验）
 * 生产态：LLM 失败回退关键词；调试态（INTENT_STRICT_DEBUG=true）可关闭回退
 */

const { getIntentMaxTokens } = require("./token-budget");
const { extractUsageFromGenerateResult } = require("./token-usage");
const { enrichCompetitorParams } = require("./brand-peer");
const { workflowRequiresNl2Sql } = require("./nl2sql-pipeline");
const { detectGreetingIntent } = require("./greeting-intent");
const { extractAnalysisSlots, mergeSlotsIntoIntentParams } = require("./intent-slots");
const { detectCityFromText } = require("./drill-knowledge-graph");

const FAST_PATH_THRESHOLD = 0.72;

const { getWorkflows, getQueryTypeMap } = require("./semantic-graph");

const WORKFLOWS = getWorkflows();

const KEYWORD_RULES = [
  {
    workflow: "annual_proposal",
    strong: ["提案", "年度", "半年", "报告", "方案", "规划", "复盘", "全链路"],
    weak: [],
    weight: 1.0
  },
  {
    workflow: "period_compare",
    strong: ["环比", "同比", "同环比", "比上月", "较上月", "去年同期", "同月比"],
    weak: ["增长", "下降", "回落", "回升", "趋势", "拖累", "拉动"],
    weight: 1.0
  },
  {
    workflow: "funnel_diagnosis",
    strong: ["漏斗", "损耗", "断点", "链路", "搜索到", "下单到", "转化链", "搜索到核销"],
    weak: ["转化", "流失", "诊断", "核销"],
    weight: 1.0
  },
  {
    workflow: "competitor_benchmark",
    strong: ["竞对", "竞品", "抖音", "美团", "呷哺", "品牌对比", "品牌竞品"],
    weak: ["对比", "比较", "benchmark", "差异化"],
    weight: 1.0
  },
  {
    workflow: "data_query",
    strong: [],
    weak: ["多少", "GMV", "多少万", "多少钱", "核销率", "ROI", "客单价", "曝光", "点击", "订单数", "转化率", "营业额", "收入", "gtv"],
    weight: 0.5
  }
];

const INTENT_JSON_INSTRUCTION = [
  "你是 BrandPilot AI 的意图识别路由。分析用户输入，将其分类到以下 6 个工作流之一：",
  "",
  "0. greeting（寒暄/身份咨询）：纯打招呼（你好、在吗）、问你是谁/能做什么/有什么能力、谢谢/再见。不包含任何经营数据或分析请求。",
  "1. annual_proposal（品牌年度提案）：用户要完整提案/报告/年度复盘/方案规划。",
  "2. funnel_diagnosis（链路诊断）：用户问搜索到核销的转化漏斗、损耗点、断点。",
  "3. competitor_benchmark（竞对对比）：用户要对比平台（美团 vs 抖音）或品牌竞品（海底捞 vs 呷哺呷哺）。",
  "4. period_compare（同环比分析）：用户问环比/同比/趋势变化、是否下降、哪个城市拖累。",
  "5. data_query（纯数据问答）：用户问具体数字，如「6月GMV多少」。",
  "",
  "消歧规则：",
  "- 只有寒暄或身份问题、没有数据/分析诉求时，必须选 greeting。",
  "- 「你好，6月GMV多少」含数据问题 → data_query，不是 greeting。",
  "- 同时出现「环比/同比」和「下降/转化」时，优先 period_compare（除非明确问漏斗/链路）。",
  "- 出现美团/抖音/呷哺/竞对时，优先 competitor_benchmark。",
  "- 出现提案/年度/报告时，优先 annual_proposal。",
  "",
  "涉及数据分析的工作流进入后都会先走 Data Query Engine 查数，再生成结论。greeting 不查数。",
  "当前只支持海底捞（brandId=haidilao）。从用户消息中提取 period、city、metric、competitors 等参数。",
  "",
  "只输出一个 JSON 对象，不要 Markdown，不要解释：",
  '{"workflow":"greeting|annual_proposal|funnel_diagnosis|competitor_benchmark|period_compare|data_query","brandId":"haidilao","params":{},"confidence":0.0,"reasoning":"..."}'
].join("\n");

function isStrictDebug() {
  return process.env.INTENT_STRICT_DEBUG === "true";
}

function matchKeywords(text, keywords) {
  return (keywords || []).filter((kw) => text.includes(kw.toLowerCase()));
}

function scoreKeywordRule(text, rule) {
  const strongMatched = matchKeywords(text, rule.strong);
  const weakMatched = matchKeywords(text, rule.weak);
  const allMatched = [...strongMatched, ...weakMatched];
  const strongScore = strongMatched.length * 2;
  const weakScore = weakMatched.length * 1;
  return {
    workflow: rule.workflow,
    score: (strongScore + weakScore) * rule.weight,
    matchedKeywords: allMatched,
    strongMatched,
    weakMatched,
    hasStrong: strongMatched.length > 0
  };
}

/**
 * 消歧：在原始打分后调整 workflow 优先级
 */
function applyDisambiguation(text, scores) {
  const lower = text.toLowerCase();
  const byWorkflow = Object.fromEntries(scores.map((s) => [s.workflow, s]));
  const boost = (workflow, amount, reason) => {
    if (!byWorkflow[workflow]) return;
    byWorkflow[workflow].score += amount;
    byWorkflow[workflow].disambiguation = reason;
  };

  const hasPeriodStrong = matchKeywords(lower, KEYWORD_RULES.find((r) => r.workflow === "period_compare").strong).length > 0;
  const hasFunnelStrong = matchKeywords(lower, KEYWORD_RULES.find((r) => r.workflow === "funnel_diagnosis").strong).length > 0;
  const hasCompetitorStrong = matchKeywords(lower, KEYWORD_RULES.find((r) => r.workflow === "competitor_benchmark").strong).length > 0;
  const hasProposalStrong = matchKeywords(lower, KEYWORD_RULES.find((r) => r.workflow === "annual_proposal").strong).length > 0;

  if (hasProposalStrong) {
    boost("annual_proposal", 3, "提案/报告强信号优先");
  }
  if (hasCompetitorStrong) {
    boost("competitor_benchmark", 3, "平台/竞品强信号优先");
  }
  if (hasPeriodStrong && !hasFunnelStrong) {
    boost("period_compare", 2, "同环比强信号优先于弱「下降/趋势」词");
  }
  if (hasFunnelStrong && !hasPeriodStrong) {
    boost("funnel_diagnosis", 2, "漏斗/链路强信号优先");
  }
  if (hasPeriodStrong && hasFunnelStrong) {
    if (/漏斗|链路|损耗|断点|搜索到/.test(lower)) {
      boost("funnel_diagnosis", 2, "同时命中时，漏斗语境优先");
    } else {
      boost("period_compare", 2, "同时命中时，同环比语境优先");
    }
  }
  if (/美团|抖音/.test(lower) && /对比|比较|vs/.test(lower)) {
    boost("competitor_benchmark", 2, "平台对比语境");
  }

  return Object.values(byWorkflow).sort((a, b) => b.score - a.score);
}

function extractIntentParams(message) {
  const text = String(message || "").toLowerCase();
  const params = {};
  const periodMatch = text.match(/(\d{4}\s*(年|h[12]|H[12]|[上下]半年))|(\d{1,2}\s*月)/);
  if (periodMatch) params.period = periodMatch[0];
  const city = detectCityFromText(message);
  if (city) params.city = city;
  return params;
}

function buildKeywordResult(best, message) {
  const params = extractIntentParams(message);
  const rule = KEYWORD_RULES.find((item) => item.workflow === best.workflow);
  const weight = rule ? rule.weight : 1;
  const hitCount = best.matchedKeywords.length;
  const strongCount = (best.strongMatched || []).length;
  const computedConfidence = Math.min(0.85, strongCount * 0.25 + hitCount * weight * 0.2 + 0.25);
  const eligibleFastPath = best.hasStrong || (strongCount >= 1 && hitCount >= 2);

  return {
    workflow: best.workflow,
    brandId: "haidilao",
    params:
      best.workflow === "competitor_benchmark"
        ? enrichCompetitorParams(message, params)
        : params,
    confidence: computedConfidence,
    reasoning:
      "关键词匹配到：" +
      best.matchedKeywords.join("、") +
      (best.disambiguation ? "（" + best.disambiguation + "）" : "") +
      "，路由到「" +
      workflowLabel(best.workflow) +
      "」工作流。",
    keywordMeta: {
      matchedKeywords: best.matchedKeywords,
      strongMatched: best.strongMatched || [],
      hitCount,
      strongCount,
      weight,
      eligibleFastPath,
      formula: "min(85%, strong×0.25 + hit×weight×0.2 + 0.25)",
      computedConfidence
    }
  };
}

/**
 * 关键词规则匹配
 */
function recognizeIntentWithKeywords(message) {
  const text = (message || "").toLowerCase();
  const rawScores = KEYWORD_RULES.map((rule) => scoreKeywordRule(text, rule));
  const scores = applyDisambiguation(text, rawScores);
  const best = scores[0];

  if (!best || best.score === 0) {
    return {
      workflow: "data_query",
      brandId: "haidilao",
      params: extractIntentParams(message),
      confidence: 0.5,
      reasoning: "未匹配到明确关键词，默认路由到数据问答工作流。",
      keywordMeta: { matchedKeywords: [], hitCount: 0, strongCount: 0, eligibleFastPath: false }
    };
  }

  return buildKeywordResult(best, message);
}

function crossValidateIntent(llmResult, keywordResult) {
  if (!keywordResult || !llmResult) return llmResult;

  const kw = keywordResult;
  const strongCount = (kw.keywordMeta && kw.keywordMeta.strongCount) || 0;
  const kwConfident = kw.confidence >= 0.55 && strongCount > 0;
  const mismatch = kw.workflow !== llmResult.workflow;

  if (!mismatch) {
    return {
      ...llmResult,
      confidence: Math.min(0.95, (llmResult.confidence || 0.75) + 0.05),
      reasoning: llmResult.reasoning + "（与关键词规则一致）"
    };
  }

  if (kwConfident && kw.keywordMeta && kw.keywordMeta.eligibleFastPath) {
    return {
      ...kw,
      confidence: Math.max(kw.confidence, 0.68),
      reasoning:
        "LLM 识别为「" +
        workflowLabel(llmResult.workflow) +
        "」，但关键词强信号指向「" +
        workflowLabel(kw.workflow) +
        "」，采用关键词结果。",
      recognitionMode: "keyword_override"
    };
  }

  return {
    ...llmResult,
    confidence: Math.max(0.55, (llmResult.confidence || 0.75) - 0.1),
    reasoning:
      llmResult.reasoning +
      "（关键词倾向「" +
      workflowLabel(kw.workflow) +
      "」，置信度略下调）"
  };
}

async function recognizeIntentWithLLM(message, modelConfig) {
  const [{ generateText }, { createOpenAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai")
  ]);

  const model = createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelConfig.model);

  const result = await generateText({
    model,
    system: INTENT_JSON_INSTRUCTION,
    prompt: message,
    maxOutputTokens: getIntentMaxTokens(modelConfig),
    temperature: 0
  });

  return {
    ...parseIntentJson(result.text),
    tokenUsage: extractUsageFromGenerateResult(result)
  };
}

function parseIntentJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let payload;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("模型未返回合法 JSON");
    }
    payload = JSON.parse(cleaned.slice(start, end + 1));
  }

  const workflow = WORKFLOWS.includes(payload.workflow) ? payload.workflow : "data_query";
  const confidence = clampNumber(payload.confidence, 0, 1, 0.75);
  const params = payload.params && typeof payload.params === "object" ? payload.params : {};

  return {
    workflow,
    brandId: String(payload.brandId || "haidilao"),
    params,
    confidence,
    reasoning: String(payload.reasoning || "LLM 语义识别完成。")
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function buildConfidenceMeta(intent) {
  const percent = Math.round((Number(intent.confidence) || 0) * 100);
  const wfLabel = workflowLabel(intent.workflow);

  if (intent.recognitionMode === "llm" || intent.recognitionMode === "keyword_override") {
    return {
      percent,
      source: intent.recognitionMode === "keyword_override" ? "keyword_override" : "llm",
      sourceLabel: intent.recognitionMode === "keyword_override" ? "关键词校正" : "模型自评",
      explanation:
        intent.recognitionMode === "keyword_override"
          ? "LLM 与关键词不一致，采用关键词强信号结果（" + percent + "%）。"
          : "意图识别大模型返回 confidence=" + (Number(intent.confidence) || 0).toFixed(2) + "，分类为「" + wfLabel + "」。"
    };
  }

  if (intent.keywordMeta) {
    const km = intent.keywordMeta;
    return {
      percent,
      source: "keyword",
      sourceLabel: "关键词匹配",
      explanation:
        "命中「" +
        km.matchedKeywords.join("、") +
        "」（强信号 " +
        (km.strongCount || 0) +
        " 个），估算置信度 " +
        percent +
        "%。"
    };
  }

  if (percent === 50) {
    return {
      percent,
      source: "default",
      sourceLabel: "默认路由",
      explanation: "未命中明确关键词，默认按「数据问答」处理。"
    };
  }

  return {
    percent,
    source: "keyword",
    sourceLabel: "关键词匹配",
    explanation: intent.reasoning || "基于关键词规则估算。"
  };
}

function enrichIntentWithAnalysisSlots(intent, message) {
  if (!intent || intent.workflow === "greeting") return intent;

  const slots = extractAnalysisSlots(message, {
    workflow: intent.workflow,
    intentParams: intent.params || {}
  });
  return {
    ...intent,
    params: mergeSlotsIntoIntentParams(intent.params || {}, slots),
    analysisSlots: slots
  };
}

function finalizeIntent(intent, recognitionMode, message) {
  const enriched = message ? enrichIntentWithAnalysisSlots(intent, message) : intent;
  return {
    ...enriched,
    recognitionMode,
    confidenceMeta: buildConfidenceMeta({ ...enriched, recognitionMode })
  };
}

function buildGreetingResult(detection) {
  const typeLabels = {
    greeting: "寒暄招呼",
    identity: "身份/能力咨询",
    closing: "礼貌结束语"
  };
  return {
    workflow: "greeting",
    brandId: "haidilao",
    params: {
      greetingType: detection.type
    },
    confidence: detection.confidence,
    reasoning: "识别为「" + (typeLabels[detection.type] || "寒暄") + "」，由寒暄 Agent 回复，不触发数据分析。"
  };
}

/**
 * 意图识别主函数
 */
async function recognizeIntent(message, modelConfig) {
  const greetingDetection = detectGreetingIntent(message);
  if (greetingDetection) {
    return finalizeIntent(buildGreetingResult(greetingDetection), "keyword_fast", message);
  }

  const keywordResult = recognizeIntentWithKeywords(message);
  const canFastPath =
    keywordResult.keywordMeta &&
    keywordResult.keywordMeta.eligibleFastPath &&
    keywordResult.confidence >= FAST_PATH_THRESHOLD;

  if (canFastPath) {
    return finalizeIntent(keywordResult, "keyword_fast", message);
  }

  if (!modelConfig || !modelConfig.configured) {
    if (isStrictDebug()) {
      throw new Error("意图识别失败：模型未配置（MODEL_API_KEY 缺失）。INTENT_STRICT_DEBUG=true 已关闭关键词降级。");
    }
    return finalizeIntent(keywordResult, "keyword_fallback", message);
  }

  try {
    const llmResult = await recognizeIntentWithLLM(message, modelConfig);
    const enriched =
      llmResult.workflow === "competitor_benchmark"
        ? { ...llmResult, params: enrichCompetitorParams(message, llmResult.params) }
        : llmResult;
    const validated = crossValidateIntent(enriched, keywordResult);
    const mode = validated.recognitionMode || "llm";
    return finalizeIntent(validated, mode, message);
  } catch (error) {
    if (isStrictDebug()) {
      throw new Error("意图识别 LLM 调用失败：" + error.message);
    }
    return finalizeIntent(
      {
        ...keywordResult,
        reasoning: "LLM 不可用，回退关键词匹配：" + keywordResult.reasoning
      },
      "keyword_fallback",
      message
    );
  }
}

function recognitionModeLabel(mode) {
  const labels = {
    llm: "智能理解",
    keyword_fast: "快速匹配",
    keyword_fallback: "关键词回退",
    keyword_override: "关键词校正",
    keyword_only: "快速匹配"
  };
  return labels[mode] || mode;
}

function workflowLabel(workflow) {
  const labels = {
    greeting: "寒暄招呼",
    annual_proposal: "品牌年度提案",
    funnel_diagnosis: "链路诊断",
    competitor_benchmark: "竞对对比",
    period_compare: "同环比分析",
    data_query: "数据问答"
  };
  return labels[workflow] || workflow;
}

module.exports = {
  recognizeIntent,
  recognizeIntentWithKeywords,
  recognitionModeLabel,
  workflowLabel,
  buildConfidenceMeta,
  workflowRequiresNl2Sql,
  WORKFLOWS,
  FAST_PATH_THRESHOLD
};
