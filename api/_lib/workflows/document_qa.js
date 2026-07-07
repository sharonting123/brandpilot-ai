/**
 * document_qa 工作流：基于用户上传文档作答，不查 Supabase 经营库
 */

const { buildChatMessages } = require("../workflow-utils");
const { tracePush } = require("../workflow-progress");
const { emptyTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");
const { buildAttachmentContext } = require("../document-parser");

function buildDocumentSystemPrompt(brandName, attachments = []) {
  const names = (attachments || [])
    .map((item) => item.filename || item.name)
    .filter(Boolean)
    .join("、");

  return [
    "你是 BrandPilot AI 的文档解读助手「悦悦」，服务品牌「" + brandName + "」。",
    "",
    "用户已上传文档" + (names ? "（" + names + "）" : "") + "，并在消息中附带了文档片段。",
    "你的任务：",
    "1. 只根据文档内容回答，概括主题、结构、关键信息",
    "2. 若文档与品牌经营相关，可点出与经营分析相关的要点，但不要编造文档里没有的数字",
    "3. 不要提示「Supabase 未配置」或「无经营数据」——此问题与数据库无关",
    "4. 若文档片段不完整，说明可能只看到了部分内容，并基于已有片段回答",
    "",
    "禁止：调用或假设已查询 GMV/核销等经营库数据；忽略文档去答数据库问题。",
    "用中文回答，结构清晰，可先给一句话摘要再分点说明。"
  ].join("\n");
}

function templateSummary(userMessage, attachments = []) {
  const context = buildAttachmentContext(attachments, userMessage);
  const snippet = context.replace(/^[\s\S]*?】\n/, "").trim().slice(0, 800);
  if (!snippet) {
    return "已收到文档，但未能提取到可读文本。请确认文件格式（支持 txt/md/html/docx/pdf 等）或换一份文档重试。";
  }

  const firstLine = snippet.split(/\n+/).find((line) => line.trim().length > 12) || snippet.slice(0, 120);
  return [
    "根据上传文档，主要内容概括如下：",
    "",
    "**摘要：** " + firstLine.trim() + (snippet.length > firstLine.length ? "…" : ""),
    "",
    "文档共约 " + snippet.length.toLocaleString("zh-CN") + " 字（本次送入片段）。如需更细的结构化解读，可继续追问，例如「列出三个要点」或「文档里提到了哪些指标」。"
  ].join("\n");
}

async function execute(params) {
  const {
    message,
    userMessage,
    attachments = [],
    modelConfig,
    brandName = "海底捞",
    history,
    onProgress
  } = params;
  const startedAt = Date.now();
  const agentTrace = [];
  const query = String(userMessage || message || "").trim();

  tracePush(agentTrace, onProgress, {
    name: "文档解读",
    tool: "document_qa",
    summary: "结合上传文档生成回答",
    durationMs: 0
  });

  if (!modelConfig || !modelConfig.configured) {
    const answer = templateSummary(query, attachments);
    return {
      workflow: "document_qa",
      answer,
      agentTrace,
      charts: [],
      tokenUsage: emptyTokenUsage(),
      totalDurationMs: Date.now() - startedAt,
      warnings: ["模型未配置，已基于文档片段生成简要摘要。"]
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
      system: buildDocumentSystemPrompt(brandName, attachments),
      messages: buildChatMessages(history, message),
      temperature: 0.3,
      maxOutputTokens: Math.min(modelConfig.maxTokens || 2048, 2048)
    });

    tracePush(agentTrace, onProgress, {
      name: "文档解读",
      tool: "llm",
      summary: "已生成文档摘要回答",
      durationMs: Date.now() - startedAt
    });

    return {
      workflow: "document_qa",
      answer: result.text || templateSummary(query, attachments),
      agentTrace,
      charts: [],
      tokenUsage: extractUsageFromGenerateResult(result),
      totalDurationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      workflow: "document_qa",
      answer: templateSummary(query, attachments),
      agentTrace,
      charts: [],
      tokenUsage: emptyTokenUsage(),
      totalDurationMs: Date.now() - startedAt,
      warnings: ["文档解读 LLM 失败，已使用片段摘要：" + error.message]
    };
  }
}

module.exports = { execute };
