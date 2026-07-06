/**
 * LLM 输出 token：直接沿用 MODEL_MAX_TOKENS，不再人为封顶。
 * 未配置时使用较高默认值；实际上限由模型与 MODEL_MAX_TOKENS 环境变量决定。
 */

const DEFAULT_AGENT_TOKENS = 65536;
const DEFAULT_STRUCTURED_TOKENS = 65536;
const DEFAULT_INTENT_TOKENS = 2048;

function resolveOutputTokens(modelConfig = {}, fallback) {
  const number = Number(modelConfig.maxTokens);
  if (Number.isFinite(number) && number > 0) {
    return Math.round(number);
  }
  return fallback;
}

function getIntentMaxTokens(modelConfig = {}) {
  return resolveOutputTokens(modelConfig, DEFAULT_INTENT_TOKENS);
}

function getAgentMaxTokens(modelConfig = {}) {
  return resolveOutputTokens(modelConfig, DEFAULT_AGENT_TOKENS);
}

function getStructuredMaxTokens(modelConfig = {}) {
  return resolveOutputTokens(modelConfig, DEFAULT_STRUCTURED_TOKENS);
}

module.exports = {
  getIntentMaxTokens,
  getAgentMaxTokens,
  getStructuredMaxTokens,
  resolveOutputTokens
};
