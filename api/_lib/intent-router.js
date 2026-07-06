/**
 * 意图识别路由层
 * 职责：将用户自然语言输入识别到4个工作流之一。
 * 主路径：LLM 输出 JSON（兼容 DeepSeek / LongCat 等无 structured output 的网关）。
 * 快路径：高置信关键词命中时跳过 LLM。
 * 兜底：LLM 不可用时用关键词规则匹配。
 */

const { getIntentMaxTokens } = require("./token-budget");
const { extractUsageFromGenerateResult } = require("./token-usage");
const { enrichCompetitorParams } = require("./brand-peer");

const WORKFLOWS = [
  "annual_proposal",
  "funnel_diagnosis",
  "competitor_benchmark",
  "data_query"
];

const KEYWORD_RULES = [
  {
    workflow: "annual_proposal",
    keywords: ["提案", "年度", "半年", "报告", "方案", "规划", "复盘", "全链路"],
    weight: 1.0
  },
  {
    workflow: "funnel_diagnosis",
    keywords: ["漏斗", "转化", "损耗", "断点", "流失", "诊断", "链路", "搜索到", "下单到", "核销"],
    weight: 1.0
  },
  {
    workflow: "competitor_benchmark",
    keywords: ["竞对", "对比", "抖音", "美团", "呷哺", "竞品", "比较", "benchmark", "差异化", "品牌对比"],
    weight: 1.0
  },
  {
    workflow: "data_query",
    keywords: ["多少", "GMV", "多少万", "多少钱", "核销率", "ROI", "客单价", "曝光", "点击", "订单数", "转化率", "营业额", "收入"],
    weight: 0.5
  }
];

const INTENT_JSON_INSTRUCTION = [
  "你是 BrandPilot AI 的意图识别路由。分析用户输入，将其分类到以下4个工作流之一：",
  "",
  "1. annual_proposal（品牌年度提案）：用户要完整提案/报告/年度复盘/方案规划。",
  "2. funnel_diagnosis（链路诊断）：用户问搜索到核销的转化漏斗、损耗点、断点。",
  "3. competitor_benchmark（竞对对比）：用户要对比平台（美团 vs 抖音）或品牌竞品（海底捞 vs 呷哺呷哺）。",
  "4. data_query（纯数据问答）：用户问具体数字，如「6月GMV多少」。",
  "",
  "当前只支持海底捞（brandId=haidilao）。从用户消息中提取 period、city、metric、competitors 等参数。",
  "",
  "只输出一个 JSON 对象，不要 Markdown，不要解释：",
  '{"workflow":"annual_proposal|funnel_diagnosis|competitor_benchmark|data_query","brandId":"haidilao","params":{},"confidence":0.0,"reasoning":"..."}'
].join("\n");

/**
 * 用 LLM generateText + JSON 解析做意图识别（兼容 OpenAI-compatible 网关）
 */
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

/**
 * 关键词规则兜底匹配（LLM 不可用时）
 */
function recognizeIntentWithKeywords(message) {
  const text = (message || "").toLowerCase();

  const scores = KEYWORD_RULES.map((rule) => {
    const matched = rule.keywords.filter((kw) => text.includes(kw.toLowerCase()));
    return {
      workflow: rule.workflow,
      score: matched.length * rule.weight,
      matchedKeywords: matched
    };
  });

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  if (best.score === 0) {
    return {
      workflow: "data_query",
      brandId: "haidilao",
      params: {},
      confidence: 0.5,
      reasoning: "未匹配到明确关键词，默认路由到数据问答工作流。请尝试更具体的问题。"
    };
  }

  const periodMatch = text.match(/(\d{4}\s*(年|h[12]|H[12]|[上下]半年))|(\d{1,2}\s*月)/);
  const params = {};
  if (periodMatch) params.period = periodMatch[0];

  const cityMatch = text.match(/(上海|北京|深圳|广州|成都|杭州|南京|武汉|重庆|西安)/);
  if (cityMatch) params.city = cityMatch[0];

  const rule = KEYWORD_RULES.find((item) => item.workflow === best.workflow);
  const weight = rule ? rule.weight : 1;
  const hitCount = best.matchedKeywords.length;
  const computedConfidence = Math.min(0.7, hitCount * weight * 0.35 + 0.3);

  return {
    workflow: best.workflow,
    brandId: "haidilao",
    params:
      best.workflow === "competitor_benchmark"
        ? enrichCompetitorParams(message, params)
        : params,
    confidence: computedConfidence,
    reasoning: "关键词匹配到：" + best.matchedKeywords.join("、") + "，路由到「" + workflowLabel(best.workflow) + "」工作流。",
    keywordMeta: {
      matchedKeywords: best.matchedKeywords,
      hitCount,
      weight,
      formula: "min(70%, hitCount×weight×0.35+30%)",
      computedConfidence
    }
  };
}

function buildConfidenceMeta(intent) {
  const percent = Math.round((Number(intent.confidence) || 0) * 100);
  const wfLabel = workflowLabel(intent.workflow);

  if (intent.recognitionMode === "llm") {
    return {
      percent,
      source: "llm",
      sourceLabel: "模型自评",
      explanation:
        "意图识别大模型在 JSON 中返回 confidence=" +
        (Number(intent.confidence) || 0).toFixed(2) +
        "，即对「" +
        wfLabel +
        "」这一分类的自评确信度 " +
        percent +
        "%。"
    };
  }

  if (intent.keywordMeta) {
    const km = intent.keywordMeta;
    return {
      percent,
      source: "keyword",
      sourceLabel: "关键词匹配",
      explanation:
        "命中关键词「" +
        km.matchedKeywords.join("、") +
        "」共 " +
        km.hitCount +
        " 个，按公式 min(70%, " +
        km.hitCount +
        "×" +
        km.weight +
        "×0.35+30%) ≈ " +
        percent +
        "%（非模型概率，仅为规则估算）。"
    };
  }

  if (percent === 50) {
    return {
      percent,
      source: "default",
      sourceLabel: "默认路由",
      explanation: "未命中明确关键词，默认按「数据问答」处理，置信度固定 50%。"
    };
  }

  return {
    percent,
    source: "keyword",
    sourceLabel: "关键词匹配",
    explanation: intent.reasoning || "基于关键词规则估算。"
  };
}

/**
 * 意图识别主函数
 */
async function recognizeIntent(message, modelConfig) {
  const keywordResult = recognizeIntentWithKeywords(message);
  if (keywordResult.confidence >= 0.65) {
    return {
      ...keywordResult,
      recognitionMode: "keyword_fast",
      confidenceMeta: buildConfidenceMeta({ ...keywordResult, recognitionMode: "keyword_fast" })
    };
  }

  if (modelConfig && modelConfig.configured) {
    try {
      const result = await recognizeIntentWithLLM(message, modelConfig);
      const enriched =
        result.workflow === "competitor_benchmark"
          ? { ...result, params: enrichCompetitorParams(message, result.params) }
          : result;
      return {
        ...enriched,
        recognitionMode: "llm",
        confidenceMeta: buildConfidenceMeta({ ...enriched, recognitionMode: "llm" })
      };
    } catch (error) {
      console.warn("LLM 意图识别失败，降级到关键词规则：", error.message);
      const fallback = recognizeIntentWithKeywords(message);
      return {
        ...fallback,
        recognitionMode: "keyword_fallback",
        llmError: error.message,
        confidenceMeta: buildConfidenceMeta({ ...fallback, recognitionMode: "keyword_fallback" })
      };
    }
  }

  const fallback = recognizeIntentWithKeywords(message);
  return {
    ...fallback,
    recognitionMode: "keyword_only",
    confidenceMeta: buildConfidenceMeta({ ...fallback, recognitionMode: "keyword_only" })
  };
}

function recognitionModeLabel(mode) {
  const labels = {
    llm: "智能理解",
    keyword_fast: "快速匹配",
    keyword_fallback: "快速匹配",
    keyword_only: "快速匹配"
  };
  return labels[mode] || mode;
}

function workflowLabel(workflow) {
  const labels = {
    annual_proposal: "品牌年度提案",
    funnel_diagnosis: "链路诊断",
    competitor_benchmark: "竞对对比",
    data_query: "数据问答"
  };
  return labels[workflow] || workflow;
}

module.exports = {
  recognizeIntent,
  recognizeIntentWithKeywords,
  recognitionModeLabel,
  workflowLabel,
  buildConfidenceMeta
};
