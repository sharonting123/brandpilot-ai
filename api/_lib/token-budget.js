/**
 * LLM token 预算：避免 MODEL_MAX_TOKENS 过大导致多轮调用超时。
 */
function getIntentMaxTokens(modelConfig = {}) {
  return clamp(modelConfig.maxTokens, 256, 1024, 512);
}

function getAgentMaxTokens(modelConfig = {}) {
  return clamp(modelConfig.maxTokens, 1024, 8192, 6144);
}

function getStructuredMaxTokens(modelConfig = {}) {
  return clamp(modelConfig.maxTokens, 1024, 4096, 3072);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

module.exports = {
  getIntentMaxTokens,
  getAgentMaxTokens,
  getStructuredMaxTokens
};
