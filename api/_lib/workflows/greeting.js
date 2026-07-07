/**
 * greeting 工作流：寒暄 / 身份咨询 Agent
 * 仅回答身份、能力说明与简短礼貌回应，不触发查数与分析。
 */

const { buildChatMessages } = require("../workflow-utils");
const { tracePush } = require("../workflow-progress");
const { emptyTokenUsage, mergeTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");

const OFF_TOPIC_REPLY =
  "我主要负责品牌经营分析，暂不聊其他话题。你可以直接问我例如：「海底捞 2026 年 6 月 GMV 多少？」「6 月搜索到核销哪里损耗最大？」";

function buildGreetingSystemPrompt(brandName) {
  return [
    "你是 BrandPilot AI 的经营顾问「悦悦」，服务品牌「" + brandName + "」。",
    "",
    "你只能回答以下类型问题：",
    "1. 简短寒暄（你好、谢谢、再见等）",
    "2. 你的身份、名字、角色介绍",
    "3. 你能提供的经营分析能力说明",
    "",
    "你的能力范围（介绍时用口语说明，不要编造未接入能力）：",
    "- 智能查数：用大白话问 GMV、核销率、ROI 等",
    "- 链路诊断：搜索→下单→核销漏斗损耗",
    "- 竞对对比：平台或品牌竞品对比",
    "- 同环比分析：趋势、增长、城市贡献",
    "- 经营提案：阶段性复盘与行动建议",
    "- 文档解析：上传 txt/pdf/docx 等结合文档分析",
    "",
    "严格禁止：",
    "- 展开任何经营数据分析、编造数字、调用数据结论",
    "- 闲聊八卦、情感陪伴、写代码、翻译、做题等无关话题",
    "- 假装已经开始分析；用户没问数据时，引导其提出具体经营问题",
    "",
    "回复要求：中文、简洁友好，2-5 句话，可用列表介绍能力。"
  ].join("\n");
}

function templateAnswer(message, brandName, greetingType) {
  if (greetingType === "closing") {
    return "不客气！有需要随时叫我，帮你查数、看漏斗或写经营分析都可以。";
  }

  if (greetingType === "identity" || /你是谁|你叫什么|什么能力|能做什么|能帮我/.test(message)) {
    return [
      "我是 **悦悦**，" + brandName + " 的专属品牌经营顾问。",
      "",
      "我可以帮你：",
      "- **智能查数**：例如「6 月 GMV 和核销率是多少」",
      "- **链路诊断**：找出搜索→核销的最大损耗点",
      "- **竞对对比**：美团 vs 抖音，或品牌竞品对比",
      "- **经营提案**：阶段性复盘与行动建议",
      "",
      "直接告诉我想看的**统计周期**和**问题**就行。"
    ].join("\n");
  }

  return [
    "你好！我是 **悦悦**，" + brandName + " 的品牌经营顾问。",
    "",
    "我可以帮你查经营数据、诊断转化漏斗、对比竞对、写经营提案。",
    "直接输入问题即可，例如：「海底捞 2026 年 6 月 GMV 多少？」"
  ].join("\n");
}

function isOffTopicForGreeting(message) {
  const text = String(message || "").trim();
  if (!text) return true;
  if (
    /天气|新闻|股票|笑话|故事|诗歌|代码|编程|翻译|游戏|电影|感情|心情不好/.test(text)
  ) {
    return true;
  }
  return false;
}

async function execute(params) {
  const {
    message,
    modelConfig,
    brandName = "海底捞",
    intentParams = {},
    history,
    onProgress
  } = params;
  const startedAt = Date.now();
  const agentTrace = [];
  const greetingType = intentParams.greetingType || "greeting";
  const userMessage = String(message || "").trim();

  tracePush(agentTrace, onProgress, {
    name: "寒暄 Agent",
    tool: "greeting",
    summary: "识别为寒暄或身份咨询",
    durationMs: 0
  });

  if (isOffTopicForGreeting(userMessage)) {
    tracePush(agentTrace, onProgress, {
      name: "寒暄 Agent",
      tool: "guardrail",
      summary: "拒绝无关闲聊",
      durationMs: Date.now() - startedAt
    });
    return {
      workflow: "greeting",
      answer: OFF_TOPIC_REPLY,
      agentTrace,
      charts: [],
      tokenUsage: emptyTokenUsage(),
      totalDurationMs: Date.now() - startedAt
    };
  }

  const useTemplate =
    greetingType !== "unknown" &&
    (greetingType === "greeting" ||
      greetingType === "closing" ||
      greetingType === "identity" ||
      userMessage.length <= 24);

  if (useTemplate || !modelConfig || !modelConfig.configured) {
    const answer = templateAnswer(userMessage, brandName, greetingType);
    tracePush(agentTrace, onProgress, {
      name: "寒暄 Agent",
      tool: "template",
      summary: "返回身份/寒暄模板",
      durationMs: Date.now() - startedAt
    });
    return {
      workflow: "greeting",
      answer,
      agentTrace,
      charts: [],
      tokenUsage: emptyTokenUsage(),
      totalDurationMs: Date.now() - startedAt
    };
  }

  try {
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
      system: buildGreetingSystemPrompt(brandName),
      messages: buildChatMessages(history, userMessage),
      temperature: 0.3,
      maxOutputTokens: Math.min(modelConfig.maxTokens || 1024, 512)
    });

    tracePush(agentTrace, onProgress, {
      name: "寒暄 Agent",
      tool: "llm",
      summary: "生成身份/寒暄回复",
      durationMs: Date.now() - startedAt
    });

    return {
      workflow: "greeting",
      answer: result.text || templateAnswer(userMessage, brandName, greetingType),
      agentTrace,
      charts: [],
      tokenUsage: extractUsageFromGenerateResult(result),
      totalDurationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      workflow: "greeting",
      answer: templateAnswer(userMessage, brandName, greetingType),
      agentTrace,
      charts: [],
      tokenUsage: emptyTokenUsage(),
      totalDurationMs: Date.now() - startedAt,
      warnings: ["寒暄 Agent LLM 失败，已使用模板回复：" + error.message]
    };
  }
}

module.exports = { execute };
