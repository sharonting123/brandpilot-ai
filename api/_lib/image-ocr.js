/**
 * 图片 OCR：百炼 DashScope Qwen-VL-OCR
 */

const { HttpError } = require("./http");

const MULTIMODAL_PATH = "/services/aigc/multimodal-generation/generation";

function getOcrConfig(env = process.env) {
  const apiKey = env.DASHSCOPE_API_KEY || env.BAILIAN_API_KEY || "";
  const timeoutMs = clampNumber(env.OCR_TIMEOUT_MS, 5000, 180000, 90000);
  return {
    apiKey,
    configured: Boolean(apiKey),
    model: env.OCR_MODEL || "qwen-vl-ocr-latest",
    task: env.OCR_TASK || "document_parsing",
    baseUrl: String(env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, ""),
    timeoutMs
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
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

function extractOcrText(payload) {
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

async function recognizeImageBuffer(buffer, options = {}) {
  const config = getOcrConfig(options.env);
  if (!config.configured) {
    throw new HttpError(
      503,
      "OCR_NOT_CONFIGURED",
      "未配置 DASHSCOPE_API_KEY，无法识别图片。请在环境变量中配置百炼 API Key。"
    );
  }
  if (!buffer || !buffer.length) {
    throw new HttpError(400, "EMPTY_IMAGE", "图片内容为空。");
  }

  const mimeType = options.mimeType || mimeFromFilename(options.filename);
  const dataUrl = "data:" + mimeType + ";base64," + buffer.toString("base64");

  let response;
  try {
    response = await fetch(config.baseUrl + MULTIMODAL_PATH, {
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
    throw new HttpError(502, "OCR_NETWORK_FAILED", "OCR 服务连接失败：" + (error.message || "unknown"));
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code) {
    const detail = payload.message || payload.code || "HTTP " + response.status;
    throw new HttpError(502, "OCR_PROVIDER_FAILED", "OCR 识别失败：" + detail);
  }

  const text = extractOcrText(payload);
  if (!text) {
    throw new HttpError(502, "OCR_EMPTY_RESULT", "OCR 未识别到可用文字，请换一张更清晰的图片。");
  }

  return {
    text,
    model: config.model,
    task: options.task || config.task,
    requestId: payload.request_id || null
  };
}

module.exports = {
  getOcrConfig,
  mimeFromFilename,
  extractOcrText,
  recognizeImageBuffer
};
