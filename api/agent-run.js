const { getClientIp, handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { getModelConfig, getSupabaseConfig } = require("./_lib/env");
const { checkRateLimit } = require("./_lib/rate-limit");
const { loadSupabaseContext } = require("./_lib/supabase-context");
const { runHaidilaoWorkflow } = require("./_lib/agent-workflow");

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = makeRequestId();

  try {
    if (req.method && req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST /api/agent-run.");
    }

    const rate = checkRateLimit(getClientIp(req));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.allowed) {
      throw new HttpError(429, "RATE_LIMITED", "Agent requests are temporarily rate limited.");
    }

    const request = validateAgentRequest(await readJson(req, { limitBytes: 64 * 1024 }));
    const modelConfig = getModelConfig(process.env);
    if (!modelConfig.configured) {
      throw new HttpError(
        503,
        "MODEL_API_KEY_NOT_CONFIGURED",
        "服务端未配置 MODEL_API_KEY 或 OPENAI_API_KEY，不能进行真实模型调用。"
      );
    }

    const supabaseContext = await loadSupabaseContext(getSupabaseConfig(process.env), { brandId: "haidilao" });
    const result = await runHaidilaoWorkflow({
      modelConfig,
      request,
      requestId,
      supabaseContext
    });

    return sendJson(res, 200, {
      ...result,
      requestId,
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    return handleError(res, error, "AGENT_RUN_FAILED", "多 Agent 工作流执行失败。");
  }
};

function validateAgentRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  }

  const brand = value.brand && typeof value.brand === "object" ? value.brand : {};
  return {
    brand: {
      id: "haidilao",
      name: "海底捞",
      title: safeText(brand.title, "海底捞半年度经营提案", 160),
      score: clampScore(brand.score ?? 82),
      metrics: asArray(brand.metrics).slice(0, 8),
      insights: asArray(brand.insights).slice(0, 8),
      actions: asArray(brand.actions).slice(0, 8)
    },
    scenario: "semiannual",
    scenarioLabel: "半年度提案",
    arMode: safeText(value.arMode, "growth", 40),
    selectedZone: value.selectedZone && typeof value.selectedZone === "object" ? value.selectedZone : {},
    liveMode: safeText(value.liveMode, "pitch", 40),
    budgetSimulation: Number.isFinite(Number(value.budgetSimulation)) ? Number(value.budgetSimulation) : 0
  };
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 82;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function safeText(value, fallback, maxLength) {
  const text = String(value ?? fallback ?? "").trim();
  return text.slice(0, maxLength);
}

function makeRequestId() {
  return `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
