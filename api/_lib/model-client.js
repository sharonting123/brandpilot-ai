const { HttpError } = require("./http");

async function requestJsonModel({ modelConfig, system, user, maxTokens }) {
  let response;
  try {
    response = await fetch(`${modelConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelConfig.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelConfig.model,
        max_tokens: maxTokens || modelConfig.maxTokens,
        temperature: 0.12,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: typeof user === "string" ? user : JSON.stringify(user) }
        ]
      }),
      signal: AbortSignal.timeout(modelConfig.timeoutMs)
    });
  } catch (error) {
    throw new HttpError(502, "MODEL_NETWORK_FAILED", `模型 API 网络连接失败：${error.cause?.code || error.message}`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || data.message || `HTTP ${response.status}`;
    if (/quota|billing|insufficient/i.test(detail)) {
      throw new HttpError(502, "MODEL_BILLING_UNAVAILABLE", "模型 API 已连通，但当前 Key 额度不足或账单不可用。");
    }
    throw new HttpError(502, "MODEL_PROVIDER_FAILED", `模型 API 调用失败：${detail}`);
  }

  const content = extractMessageContent(data);
  if (!content) {
    const finishReason = data.choices?.[0]?.finish_reason || "unknown";
    throw new HttpError(502, "MODEL_EMPTY_RESPONSE", `模型 API 未返回可解析内容，finish_reason=${finishReason}`);
  }

  return parseJsonContent(content);
}

function extractMessageContent(data) {
  const message = data.choices?.[0]?.message;
  const content = message?.content || data.choices?.[0]?.text || data.output_text;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || part.content || "").join("\n").trim();
  }
  if (typeof content === "string") return content.trim();
  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item) => item.content || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim();
  }
  return "";
}

function parseJsonContent(content) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new HttpError(502, "MODEL_INVALID_JSON", "模型返回内容不是合法 JSON。");
  }
}

module.exports = {
  requestJsonModel
};
