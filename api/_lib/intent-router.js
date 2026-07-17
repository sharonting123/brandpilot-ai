/**
 * 意图识别路由层
 * 分层路由：确定性快路径 + 向量语义召回 + LLM 结构化分类（含交叉校验）
 * 生产态：外部能力失败时回退本地关键词；调试态可关闭 LLM 回退
 */

const { getIntentMaxTokens } = require("./token-budget");
const { enrichCompetitorParams } = require("./brand-peer");
const { workflowRequiresNl2Sql } = require("./nl2sql-pipeline");
const { detectGreetingIntent } = require("./greeting-intent");
const { detectDocumentQaIntent } = require("./document-intent");
const { extractAnalysisSlots, mergeSlotsIntoIntentParams } = require("./intent-slots");
const { detectCityFromText } = require("./drill-knowledge-graph");
const { isEmbeddingConfigured, embedTexts, cosineSimilarity } = require("./rag-embeddings");
const { generateStructuredObject } = require("./structured-output");
const { z } = require("zod");

const FAST_PATH_THRESHOLD = 0.72;
const SEMANTIC_FAST_PATH_THRESHOLD = 0.86;
const SEMANTIC_OVERRIDE_THRESHOLD = 0.84;
const SEMANTIC_MIN_MARGIN = 0.06;

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
    strong: ["漏斗", "损耗", "断点", "链路", "搜索到", "推荐链路", "搜索链路", "推荐路径", "转化链", "搜索到核销"],
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

const INTENT_PROFILES = [
  {
    workflow: "annual_proposal",
    text: "品牌年度提案、半年经营复盘、完整分析报告、经营方案与未来规划。示例：帮我出一份经营复盘；制定下半年增长方案；生成完整品牌报告。"
  },
  {
    workflow: "period_compare",
    text: "同比、环比、跨周期趋势和增减归因。示例：最近表现变好还是变差；与上一周期相比如何；哪个城市拖累增长。"
  },
  {
    workflow: "funnel_diagnosis",
    text: "搜索或推荐到核销的转化漏斗、链路损耗和断点诊断。示例：用户在哪一步流失最多；转化链路哪里有问题；从曝光到核销怎么优化。"
  },
  {
    workflow: "competitor_benchmark",
    text: "平台或品牌竞品对标、市场差距和竞争表现。示例：和主要对手相比表现如何；不同平台经营效果对比；分析竞品优势。"
  },
  {
    workflow: "data_query",
    text: "查询具体经营指标、数值或事实。示例：销售额是多少；查询客单价；订单量和转化率分别是多少。"
  }
];

const INTENT_RESULT_SCHEMA = z.object({
  workflow: z.enum([
    "greeting",
    "document_qa",
    "annual_proposal",
    "funnel_diagnosis",
    "competitor_benchmark",
    "period_compare",
    "data_query"
  ]),
  brandId: z.string().default("haidilao"),
  params: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().default("LLM 语义识别完成。")
});

let intentProfileVectors = null;

const INTENT_JSON_INSTRUCTION = [
  "你是 BrandPilot AI 的意图识别路由。分析用户输入，将其分类到以下 7 个工作流之一：",
  "",
  "0. greeting（寒暄/身份咨询）：纯打招呼（你好、在吗）、问你是谁/能做什么/有什么能力、谢谢/再见。不包含任何经营数据或分析请求。",
  "0b. document_qa（文档解析）：用户已上传文档，问文档主要内容/总结/解读，且不涉及 GMV/核销等经营查数。",
  "1. annual_proposal（品牌年度提案）：用户要完整提案/报告/年度复盘/方案规划。",
  "2. funnel_diagnosis（链路诊断）：用户问搜索/推荐到核销的七阶段转化漏斗、损耗点、断点；可指定 trafficPath=search|recommend|all。",
  "3. competitor_benchmark（竞对对比）：用户要对比平台（美团 vs 抖音）或品牌竞品（海底捞 vs 呷哺呷哺）。",
  "4. period_compare（同环比分析）：用户问环比/同比/趋势变化、是否下降、哪个城市拖累。",
  "5. data_query（纯数据问答）：用户问具体数字，如「6月GMV多少」。",
  "",
  "消歧规则：",
  "- 只有寒暄或身份问题、没有数据/分析诉求时，必须选 greeting。",
  "- 用户问上传文档的内容/摘要，且没有经营查数诉求时，选 document_qa。",
  "- 「你好，6月GMV多少」含数据问题 → data_query，不是 greeting。",
  "- 同时出现「环比/同比」和「下降/转化」时，优先 period_compare（除非明确问漏斗/链路）。",
  "- 出现美团/抖音/呷哺/竞对时，优先 competitor_benchmark。",
  "- 出现提案/年度/报告时，优先 annual_proposal。",
  "",
  "涉及数据分析的工作流进入后都会先走 Data Query Engine 查数，再生成结论。greeting 与 document_qa 不查数。",
  "当前只支持海底捞（brandId=haidilao）。从用户消息中提取 period、city、metric、competitors 等参数。",
  "",
  "只输出一个 JSON 对象，不要 Markdown，不要解释：",
  '{"workflow":"greeting|document_qa|annual_proposal|funnel_diagnosis|competitor_benchmark|period_compare|data_query","brandId":"haidilao","params":{},"confidence":0.0,"reasoning":"..."}'
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

async function recognizeIntentWithSemantic(message) {
  if (process.env.INTENT_EMBEDDING_ENABLED === "false" || !isEmbeddingConfigured(process.env)) {
    return null;
  }

  if (!intentProfileVectors) {
    intentProfileVectors = await embedTexts(
      INTENT_PROFILES.map((profile) => profile.text),
      { textType: "document" }
    );
  }

  const [queryVector] = await embedTexts([String(message || "")], { textType: "query" });
  const ranked = INTENT_PROFILES.map((profile, index) => ({
    workflow: profile.workflow,
    score: cosineSimilarity(queryVector, intentProfileVectors[index])
  })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1] || { score: 0 };
  if (!best || best.score <= 0) return null;

  const margin = Math.max(0, best.score - second.score);
  const confidence = Math.min(
    0.9,
    Math.max(0.5, 0.5 + Math.max(0, best.score - 0.5) * 0.9 + Math.min(margin, 0.2) * 0.5)
  );

  return {
    workflow: best.workflow,
    brandId: "haidilao",
    params:
      best.workflow === "competitor_benchmark"
        ? enrichCompetitorParams(message, extractIntentParams(message))
        : extractIntentParams(message),
    confidence,
    reasoning:
      "向量语义最接近「" +
      workflowLabel(best.workflow) +
      "」（相似度 " +
      best.score.toFixed(3) +
      "，领先 " +
      margin.toFixed(3) +
      "）。",
    semanticMeta: {
      score: best.score,
      margin,
      candidates: ranked.slice(0, 3)
    }
  };
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

function crossValidateSemantic(llmResult, semanticResult) {
  if (!llmResult || !semanticResult) return llmResult;
  if (llmResult.recognitionMode === "keyword_override") return llmResult;
  if (llmResult.workflow === semanticResult.workflow) {
    return {
      ...llmResult,
      confidence: Math.min(0.95, (llmResult.confidence || 0.75) + 0.03),
      reasoning: llmResult.reasoning + "（与向量语义召回一致）"
    };
  }

  const meta = semanticResult.semanticMeta || {};
  if (
    semanticResult.confidence >= SEMANTIC_OVERRIDE_THRESHOLD &&
    meta.margin >= SEMANTIC_MIN_MARGIN
  ) {
    return {
      ...semanticResult,
      confidence: Math.max(semanticResult.confidence, 0.84),
      reasoning:
        "LLM 识别为「" +
        workflowLabel(llmResult.workflow) +
        "」，但高置信度向量语义指向「" +
        workflowLabel(semanticResult.workflow) +
        "」，采用语义结果。",
      recognitionMode: "semantic_override"
    };
  }

  return {
    ...llmResult,
    confidence: Math.max(0.55, (llmResult.confidence || 0.75) - 0.05),
    reasoning:
      llmResult.reasoning +
      "（向量语义倾向「" +
      workflowLabel(semanticResult.workflow) +
      "」，证据不足以覆盖模型结果）"
  };
}

function chooseFallbackIntent(keywordResult, semanticResult) {
  if (!semanticResult) return keywordResult;
  const noKeywordHit =
    !keywordResult.keywordMeta || keywordResult.keywordMeta.matchedKeywords.length === 0;
  const semanticReliable =
    semanticResult.confidence >= 0.68 &&
    semanticResult.semanticMeta &&
    semanticResult.semanticMeta.margin >= 0.03;
  if (semanticReliable && (noKeywordHit || keywordResult.confidence <= 0.55)) {
    return {
      ...semanticResult,
      recognitionMode: "semantic_fallback"
    };
  }
  return keywordResult;
}

async function recognizeIntentWithLLM(message, modelConfig, semanticResult = null) {
  const semanticHint = semanticResult
    ? [
        "",
        "向量召回仅作为参考证据，仍需独立判断：",
        JSON.stringify({
          workflow: semanticResult.workflow,
          score: Number(semanticResult.semanticMeta.score.toFixed(4)),
          margin: Number(semanticResult.semanticMeta.margin.toFixed(4))
        })
      ].join("\n")
    : "";
  const result = await generateStructuredObject({
    modelConfig,
    schema: INTENT_RESULT_SCHEMA,
    system: INTENT_JSON_INSTRUCTION,
    prompt: message + semanticHint,
    maxOutputTokens: getIntentMaxTokens(modelConfig),
  });

  return {
    ...normalizeIntentPayload(result.object),
    tokenUsage: result.tokenUsage,
    structuredOutputMode: result.mode
  };
}

function normalizeIntentPayload(payload) {
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

  if (intent.recognitionMode && intent.recognitionMode.startsWith("semantic_")) {
    const sm = intent.semanticMeta || {};
    return {
      percent,
      source: intent.recognitionMode,
      sourceLabel:
        intent.recognitionMode === "semantic_override"
          ? "向量语义校正"
          : intent.recognitionMode === "semantic_fallback"
            ? "向量语义回退"
            : "向量语义匹配",
      explanation:
        "语义召回分类为「" +
        wfLabel +
        "」，相似度 " +
        Number(sm.score || 0).toFixed(3) +
        "，领先候选 " +
        Number(sm.margin || 0).toFixed(3) +
        "。"
    };
  }

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
  if (!intent || intent.workflow === "greeting" || intent.workflow === "document_qa") return intent;

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

function buildDocumentQaResult(detection) {
  return {
    workflow: "document_qa",
    brandId: "haidilao",
    params: {},
    confidence: detection.confidence,
    reasoning: detection.reasoning || "识别为文档解析请求。"
  };
}

/**
 * 意图识别主函数
 */
async function recognizeIntent(message, modelConfig, options = {}) {
  const attachments = options.attachments || [];
  const routingMessage = String(message || "").trim();

  const greetingDetection = detectGreetingIntent(routingMessage);
  if (greetingDetection) {
    return finalizeIntent(buildGreetingResult(greetingDetection), "keyword_fast", routingMessage);
  }

  const documentDetection = detectDocumentQaIntent(routingMessage, attachments);
  if (documentDetection) {
    return finalizeIntent(buildDocumentQaResult(documentDetection), "keyword_fast", routingMessage);
  }

  const keywordResult = recognizeIntentWithKeywords(routingMessage);
  const canFastPath =
    keywordResult.keywordMeta &&
    keywordResult.keywordMeta.eligibleFastPath &&
    keywordResult.confidence >= FAST_PATH_THRESHOLD;

  if (canFastPath) {
    return finalizeIntent(keywordResult, "keyword_fast", routingMessage);
  }

  let semanticResult = null;
  try {
    semanticResult = await recognizeIntentWithSemantic(routingMessage);
  } catch {
    semanticResult = null;
  }

  const canSemanticFastPath =
    semanticResult &&
    semanticResult.confidence >= SEMANTIC_FAST_PATH_THRESHOLD &&
    semanticResult.semanticMeta.margin >= SEMANTIC_MIN_MARGIN;
  if (canSemanticFastPath) {
    return finalizeIntent(semanticResult, "semantic_fast", routingMessage);
  }

  if (!modelConfig || !modelConfig.configured) {
    if (isStrictDebug()) {
      throw new Error("意图识别失败：模型未配置（MODEL_API_KEY 缺失）。INTENT_STRICT_DEBUG=true 已关闭关键词降级。");
    }
    const fallback = chooseFallbackIntent(keywordResult, semanticResult);
    return finalizeIntent(
      fallback,
      fallback.recognitionMode || "keyword_fallback",
      routingMessage
    );
  }

  try {
    const llmResult = await recognizeIntentWithLLM(routingMessage, modelConfig, semanticResult);
    const enriched =
      llmResult.workflow === "competitor_benchmark"
        ? { ...llmResult, params: enrichCompetitorParams(routingMessage, llmResult.params) }
        : llmResult;
    const keywordValidated = crossValidateIntent(enriched, keywordResult);
    const validated = crossValidateSemantic(keywordValidated, semanticResult);
    const mode = validated.recognitionMode || "llm";
    return finalizeIntent(validated, mode, routingMessage);
  } catch (error) {
    if (isStrictDebug()) {
      throw new Error("意图识别 LLM 调用失败：" + error.message);
    }
    const fallback = chooseFallbackIntent(keywordResult, semanticResult);
    return finalizeIntent(
      {
        ...fallback,
        reasoning: "LLM 不可用，回退本地路由证据：" + fallback.reasoning
      },
      fallback.recognitionMode || "keyword_fallback",
      routingMessage
    );
  }
}

function recognitionModeLabel(mode) {
  const labels = {
    llm: "智能理解",
    keyword_fast: "快速匹配",
    keyword_fallback: "关键词回退",
    keyword_override: "关键词校正",
    keyword_only: "快速匹配",
    semantic_fast: "语义快速匹配",
    semantic_fallback: "语义回退",
    semantic_override: "语义校正"
  };
  return labels[mode] || mode;
}

function workflowLabel(workflow) {
  const labels = {
    greeting: "寒暄招呼",
    document_qa: "文档解析",
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
  FAST_PATH_THRESHOLD,
  SEMANTIC_FAST_PATH_THRESHOLD,
  recognizeIntentWithSemantic
};
