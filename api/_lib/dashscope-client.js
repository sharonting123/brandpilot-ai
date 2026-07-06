/**
 * 阿里云百炼 DashScope 配置（RAG Embedding / Rerank 等）
 */

function getDashScopeConfig(env = process.env) {
  const apiKey = env.DASHSCOPE_API_KEY || env.BAILIAN_API_KEY || "";
  return {
    apiKey,
    configured: Boolean(apiKey)
  };
}

module.exports = {
  getDashScopeConfig
};
