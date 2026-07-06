/**
 * 意图识别路由层
 * 职责：将用户自然语言输入识别到4个工作流之一。
 * 主路径：用 Vercel AI SDK generateObject + Zod schema 做 LLM 意图识别。
 * 兜底路径：LLM 不可用时用关键词规则匹配。
 */

const { getModelConfig } = require("./env");

// 工作流关键词规则（兜底路径）
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
    keywords: ["竞对", "对比", "抖音", "美团", "私域", "竞品", "比较", "benchmark", "差异化"],
    weight: 1.0
  },
  {
    workflow: "data_query",
    keywords: ["多少", "GMV", "多少万", "多少钱", "核销率", "ROI", "客单价", "曝光", "点击", "订单数", "转化率", "营业额", "收入"],
    weight: 0.5
  }
];

/**
 * 用 LLM generateObject 做意图识别
 */
async function recognizeIntentWithLLM(message, modelConfig) {
  // 动态导入 AI SDK（ESM only，在 CJS 中用动态 import）
  const [{ generateObject }, { createOpenAI }, { z }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai"),
    import("zod")
  ]);

  const model = createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelConfig.model);

  // Zod schema：意图识别输出格式
  const IntentSchema = z.object({
    workflow: z.enum([
      "annual_proposal",
      "funnel_diagnosis",
      "competitor_benchmark",
      "data_query"
    ]).describe("匹配到的工作流类型"),
    brandId: z.string().default("haidilao").describe("品牌 ID，默认 haidilao"),
    params: z.object({
      period: z.string().optional().describe("分析周期，如 '2026 H1'、'6月'"),
      competitors: z.array(z.string()).optional().describe("要对比的竞对，如 ['美团到餐', '抖音到店']"),
      city: z.string().optional().describe("关注的城市，如 '上海'"),
      metric: z.string().optional().describe("具体指标，如 'GMV'、'核销率'")
    }).default({}).describe("从用户消息中提取的分析参数"),
    confidence: z.number().min(0).max(1).describe("识别的置信度 0-1"),
    reasoning: z.string().describe("为什么选择这个工作流的推理过程")
  });

  const systemPrompt = [
    "你是 BrandPilot AI 的意图识别路由。分析用户输入，将其分类到以下4个工作流之一：",
    "",
    "1. annual_proposal（品牌年度提案）：用户要完整提案/报告/年度复盘/方案规划，涵盖链路归因、经营分析、策略建议。",
    "2. funnel_diagnosis（链路诊断）：用户问搜索到核销的转化漏斗、损耗点、哪个环节断点最大，轻量级诊断。",
    "3. competitor_benchmark（竞对对比）：用户要对比不同平台（美团 vs 抖音 vs 私域）的表现，给差异化建议。",
    "4. data_query（纯数据问答）：用户问具体数字，如「6月GMV多少」「上海ROI是多少」，直接查数回答。",
    "",
    "当前只支持海底捞（brandId=haidilao）品牌。",
    "从用户消息中提取周期、城市、关注的指标等参数。"
  ].join("\n");

  const { object } = await generateObject({
    model,
    schema: IntentSchema,
    system: systemPrompt,
    prompt: message,
    maxOutputTokens: modelConfig.maxTokens
  });

  return object;
}

/**
 * 关键词规则兜底匹配（LLM 不可用时）
 */
function recognizeIntentWithKeywords(message) {
  const text = (message || "").toLowerCase();

  // 计算每个工作流的匹配得分
  const scores = KEYWORD_RULES.map((rule) => {
    const matched = rule.keywords.filter((kw) => text.includes(kw.toLowerCase()));
    return {
      workflow: rule.workflow,
      score: matched.length * rule.weight,
      matchedKeywords: matched
    };
  });

  // 选得分最高的
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // 如果没有任何关键词匹配，默认 data_query
  if (best.score === 0) {
    return {
      workflow: "data_query",
      brandId: "haidilao",
      params: {},
      confidence: 0.5,
      reasoning: "未匹配到明确关键词，默认路由到数据问答工作流。请尝试更具体的问题。"
    };
  }

  // 提取周期参数
  const periodMatch = text.match(/(\d{4}\s*(年|h[12]|H[12]|[上下]半年))|(\d{1,2}\s*月)/);
  const params = {};
  if (periodMatch) params.period = periodMatch[0];

  // 提取城市
  const cityMatch = text.match(/(上海|北京|深圳|广州|成都|杭州|南京|武汉|重庆|西安)/);
  if (cityMatch) params.city = cityMatch[0];

  return {
    workflow: best.workflow,
    brandId: "haidilao",
    params,
    confidence: Math.min(0.7, best.score * 0.35 + 0.3),
    reasoning: "关键词匹配到：" + best.matchedKeywords.join("、") + "，路由到「" + workflowLabel(best.workflow) + "」工作流。"
  };
}

/**
 * 意图识别主函数
 * 优先用 LLM，失败时降级到关键词规则
 */
async function recognizeIntent(message, modelConfig) {
  if (modelConfig && modelConfig.configured) {
    try {
      const result = await recognizeIntentWithLLM(message, modelConfig);
      return {
        ...result,
        recognitionMode: "llm"
      };
    } catch (error) {
      console.warn("LLM 意图识别失败，降级到关键词规则：", error.message);
      const fallback = recognizeIntentWithKeywords(message);
      return {
        ...fallback,
        recognitionMode: "keyword_fallback",
        llmError: error.message
      };
    }
  }

  // 模型未配置，直接用关键词
  const fallback = recognizeIntentWithKeywords(message);
  return {
    ...fallback,
    recognitionMode: "keyword_only"
  };
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
  workflowLabel
};
