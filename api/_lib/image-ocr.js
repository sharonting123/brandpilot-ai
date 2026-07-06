/**
 * 图片 OCR
 * - longcat / meituan：美团 LongCat 多模态（OpenAI 兼容视觉接口，默认）
 * - dashscope：百炼 qwen-vl-ocr（备用）
 */

const { HttpError } = require("./http");

const DASHSCOPE_MULTIMODAL_PATH = "/services/aigc/multimodal-generation/generation";
const DEFAULT_LONGCAT_BASE_URL = "https://api.longcat.chat/openai";
const DEFAULT_OCR_PROMPT =
  "请提取图片中的全部文字，按自然阅读顺序输出纯文本。保留段落与表格换行，不要添加解释或 Markdown 标题。";

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeProvider(value) {
  const provider = String(value || "longcat").trim().toLowerCase();
  if (provider === "meituan") return "longcat";
  if (provider === "dashscope" || provider === "qwen" || provider === "aliyun") return "dashscope";
  return "longcat";
}

function resolveLongcatConfig(env = process.env) {
  const apiKey =
    env.LONGCAT_API_KEY ||
    env.OCR_API_KEY ||
    env.MODEL_API_KEY ||
    env.OPENAI_API_KEY ||
    "";
  const baseUrl = String(
    env.OCR_API_BASE_URL ||
    env.LONGCAT_API_BASE_URL ||
    env.MODEL_API_BASE_URL ||
    env.OPENAI_BASE_URL ||
    DEFAULT_LONGCAT_BASE_URL
  ).replace(/\/$/, "");
  return {
    provider: "longcat",
    apiKey,
    configured: Boolean(apiKey),
    baseUrl,
    model: env.OCR_MODEL || env.LONGCAT_OCR_MODEL || "LongCat-2.0",
    prompt: env.OCR_PROMPT || DEFAULT_OCR_PROMPT,
    timeoutMs: clampNumber(env.OCR_TIMEOUT_MS, 5000, 180000, 90000)
  };
}

function resolveDashscopeConfig(env = process.env) {
  const apiKey = env.DASHSCOPE_API_KEY || env.BAILIAN_API_KEY || "";
  return {
    provider: "dashscope",
    apiKey,
    configured: Boolean(apiKey),
    baseUrl: String(env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, ""),
    model: env.OCR_MODEL || "qwen-vl-ocr-latest",
    task: env.OCR_TASK || "document_parsing",
    timeoutMs: clampNumber(env.OCR_TIMEOUT_MS, 5000, 180000, 90000)
  };
}

function getOcrConfig(env = process.env) {
  const provider = normalizeProvider(env.OCR_PROVIDER);
  if (provider === "dashscope") return resolveDashscopeConfig(env);
  return resolveLongcatConfig(env);
}

function mimeFromFilename(filename = "") {
  const ext = String(filename).toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp"
  };
  return map[ext] || "image/jpeg";
}

function stripCodeFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function flattenOcrResult(ocrResult) {
  if (!ocrResult) return "";
  if (typeof ocrResult === "string") return ocrResult;

  if (ocrResult.kv_result && typeof ocrResult.kv_result === "object") {
    return Object.entries(ocrResult.kv_result)
      .map(([key, value]) => key + "：" + String(value ?? ""))
      .join("\n");
  }

  if (Array.isArray(ocrResult.words_info)) {
    return ocrResult.words_info
      .map((item) => String(item?.text || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractDashscopeOcrText(payload) {
  const content = payload?.output?.choices?.[0]?.message?.content;
  if (!Array.isArray(content) || !content.length) {
    const fallback = payload?.output?.text;
    if (fallback) return stripCodeFence(fallback);
    return "";
  }

  const texts = [];
  content.forEach((part) => {
    if (!part || typeof part !== "object") return;
    const ocrText = flattenOcrResult(part.ocr_result);
    if (ocrText) texts.push(ocrText);
    if (part.processed_text) texts.push(stripCodeFence(part.processed_text));
    else if (part.text) texts.push(stripCodeFence(part.text));
  });

  return texts
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function extractOpenAiVisionText(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return stripCodeFence(content);
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        return part.text || part.content || "";
      })
      .join("\n")
      .trim();
  }
  if (typeof payload?.output_text === "string") return stripCodeFence(payload.output_text);
  return "";
}

function buildChatCompletionsUrl(baseUrl) {
  const normalized = String(baseUrl || "").replace(/\/$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  if (normalized.endsWith("/v1")) return normalized + "/chat/completions";
  return normalized + "/v1/chat/completions";
}

async function recognizeWithLongcat(buffer, config, options = {}) {
  const mimeType = options.mimeType || mimeFromFilename(options.filename);
  const dataUrl = "data:" + mimeType + ";base64," + buffer.toString("base64");

  let response;
  try {
    response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: clampNumber(process.env.OCR_MAX_TOKENS, 256, 8192, 4096),
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: config.prompt },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ]
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });
  } catch (error) {
    throw new HttpError(502, "OCR_NETWORK_FAILED", "LongCat OCR 连接失败：" + (error.message || "unknown"));
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || payload.code || "HTTP " + response.status;
    throw new HttpError(502, "OCR_PROVIDER_FAILED", "LongCat OCR 识别失败：" + detail);
  }

  const text = extractOpenAiVisionText(payload);
  if (!text) {
    throw new HttpError(502, "OCR_EMPTY_RESULT", "LongCat OCR 未识别到可用文字，请换一张更清晰的图片。");
  }

  return {
    text,
    model: config.model,
    provider: "longcat",
    requestId: payload.id || null
  };
}

async function recognizeWithDashscope(buffer, config, options = {}) {
  const mimeType = options.mimeType || mimeFromFilename(options.filename);
  const dataUrl = "data:" + mimeType + ";base64," + buffer.toString("base64");

  let response;
  try {
    response = await fetch(config.baseUrl + DASHSCOPE_MULTIMODAL_PATH, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  image: dataUrl,
                  min_pixels: 3072,
                  max_pixels: 8388608,
                  enable_rotate: true
                }
              ]
            }
          ]
        },
        parameters: {
          ocr_options: {
            task: options.task || config.task
          }
        }
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });
  } catch (error) {
    throw new HttpError(502, "OCR_NETWORK_FAILED", "DashScope OCR 连接失败：" + (error.message || "unknown"));
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code) {
    const detail = payload.message || payload.code || "HTTP " + response.status;
    throw new HttpError(502, "OCR_PROVIDER_FAILED", "DashScope OCR 识别失败：" + detail);
  }

  const text = extractDashscopeOcrText(payload);
  if (!text) {
    throw new HttpError(502, "OCR_EMPTY_RESULT", "DashScope OCR 未识别到可用文字，请换一张更清晰的图片。");
  }

  return {
    text,
    model: config.model,
    provider: "dashscope",
    task: options.task || config.task,
    requestId: payload.request_id || null
  };
}

async function recognizeImageBuffer(buffer, options = {}) {
  const config = getOcrConfig(options.env);
  if (!config.configured) {
    const hint =
      config.provider === "dashscope"
        ? "未配置 DASHSCOPE_API_KEY，无法识别图片。"
        : "未配置 LONGCAT_API_KEY / OCR_API_KEY / MODEL_API_KEY，无法识别图片。";
    throw new HttpError(503, "OCR_NOT_CONFIGURED", hint);
  }
  if (!buffer || !buffer.length) {
    throw new HttpError(400, "EMPTY_IMAGE", "图片内容为空。");
  }

  if (config.provider === "dashscope") {
    return recognizeWithDashscope(buffer, config, options);
  }
  return recognizeWithLongcat(buffer, config, options);
}

module.exports = {
  getOcrConfig,
  mimeFromFilename,
  extractDashscopeOcrText,
  extractOpenAiVisionText,
  recognizeImageBuffer
};
