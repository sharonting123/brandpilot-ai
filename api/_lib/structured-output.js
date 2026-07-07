/**
 * 结构化输出：兼容 thinking/reasoning 模型（不支持 generateObject 的 tool_choice）
 */

const { getStructuredMaxTokens } = require("./token-budget");
const { extractUsageFromGenerateResult, emptyTokenUsage } = require("./token-usage");

function isThinkingModeError(message) {
  return /thinking mode|tool_choice|does not support this tool/i.test(String(message || ""));
}

function modelIdOf(modelConfig = {}) {
  return String(
    modelConfig.structuredModel || modelConfig.model || process.env.MODEL_STRUCTURED_NAME || ""
  ).toLowerCase();
}

function isLongCatModel(modelConfig = {}) {
  const id = modelIdOf(modelConfig);
  return /longcat/.test(id) || /api\.longcat\.chat/i.test(String(modelConfig.baseUrl || ""));
}

function shouldPreferTextJson(modelConfig = {}) {
  const modelId = modelIdOf(modelConfig);
  return /longcat|thinking|reasoner|-r1\b/.test(modelId);
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("模型未返回合法 JSON");
  }
}

async function createLanguageModel(modelConfig, modelOverride) {
  const { createOpenAI } = await import("@ai-sdk/openai");
  const modelName =
    modelOverride ||
    modelConfig.structuredModel ||
    process.env.MODEL_STRUCTURED_NAME ||
    modelConfig.model;
  return createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelName);
}

async function generateStructuredViaText({ model, schema, system, prompt, maxOutputTokens }) {
  const { generateText } = await import("ai");
  const result = await generateText({
    model,
    system: [
      system,
      "",
      "只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释文字。",
      "字段名与类型必须严格符合要求。"
    ].join("\n"),
    prompt,
    temperature: 0,
    maxOutputTokens
  });
  const parsed = schema.safeParse(parseJsonObject(result.text));
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return {
    object: parsed.data,
    tokenUsage: extractUsageFromGenerateResult(result),
    mode: "text+json"
  };
}

async function generateStructuredViaJsonModel({ modelConfig, schema, system, prompt, maxOutputTokens }) {
  const { requestJsonModel } = require("./model-client");
  const raw = await requestJsonModel({
    modelConfig: { ...modelConfig, maxTokens: maxOutputTokens },
    system: [
      system,
      "",
      "只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释文字。"
    ].join("\n"),
    user: prompt,
    maxTokens: maxOutputTokens
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return {
    object: parsed.data,
    tokenUsage: emptyTokenUsage(),
    mode: "json_object"
  };
}

/**
 * 优先 generateObject；thinking 模型或 tool_choice 报错时改走 generateText + Zod 校验
 */
async function generateStructuredObject(params = {}) {
  const { schema, system, prompt, modelConfig } = params;
  if (!schema || !modelConfig) {
    throw new Error("generateStructuredObject 缺少 schema 或 modelConfig");
  }

  const maxOutputTokens = params.maxOutputTokens || getStructuredMaxTokens(modelConfig);
  const structuredOverride = modelConfig.structuredModel || process.env.MODEL_STRUCTURED_NAME || "";
  const model = await createLanguageModel(modelConfig, structuredOverride || undefined);

  if (isLongCatModel(modelConfig)) {
    return generateStructuredViaText({ model, schema, system, prompt, maxOutputTokens });
  }

  if (shouldPreferTextJson(modelConfig)) {
    return generateStructuredViaText({ model, schema, system, prompt, maxOutputTokens });
  }

  const { generateObject } = await import("ai");
  try {
    const result = await generateObject({
      model,
      schema,
      system,
      prompt,
      maxOutputTokens
    });
    return {
      object: result.object,
      tokenUsage: extractUsageFromGenerateResult(result),
      mode: "generateObject"
    };
  } catch (error) {
    if (!isThinkingModeError(error.message)) throw error;
    return generateStructuredViaText({ model, schema, system, prompt, maxOutputTokens });
  }
}

module.exports = {
  generateStructuredObject,
  isThinkingModeError,
  isLongCatModel,
  parseJsonObject,
  shouldPreferTextJson
};
