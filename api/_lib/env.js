const DEFAULT_MODEL = "gpt-4o-mini";

function getModelConfig(env = process.env) {
  const apiKey = env.MODEL_API_KEY || env.OPENAI_API_KEY || "";
  const baseUrl = (env.MODEL_API_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.MODEL_NAME || env.OPENAI_MODEL || DEFAULT_MODEL;
  const maxTokens = clampNumber(env.MODEL_MAX_TOKENS, 256, 200000, 4096);
  const timeoutMs = clampNumber(env.MODEL_TIMEOUT_MS, 5000, 65000, 55000);

  return {
    apiKey,
    baseUrl,
    configured: Boolean(apiKey),
    maxTokens,
    model,
    timeoutMs
  };
}

function getSupabaseConfig(env = process.env) {
  return {
    url: env.SUPABASE_URL || "",
    anonKey: env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
    configured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    browserEnabled: env.SUPABASE_BROWSER_ENABLED !== "false",
    timeoutMs: clampNumber(env.SUPABASE_TIMEOUT_MS, 1000, 30000, 5000)
  };
}

function getDashScopeConfig(env = process.env) {
  const { getDashScopeConfig: getConfig } = require("./dashscope-client");
  return getConfig(env);
}

function getRuntimeConfig(env = process.env) {
  const model = getModelConfig(env);
  const supabase = getSupabaseConfig(env);
  const dashscope = getDashScopeConfig(env);
  return {
    model,
    supabase,
    dashscope,
    nodeEnv: env.NODE_ENV || "development"
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

module.exports = {
  DEFAULT_MODEL,
  getModelConfig,
  getRuntimeConfig,
  getSupabaseConfig,
  getDashScopeConfig
};
