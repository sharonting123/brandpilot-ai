const { getRuntimeConfig } = require("./_lib/env");
const { assertMethod, handleError, sendJson } = require("./_lib/http");
const { getSidecarConfig, probeSidecarHealth } = require("./_lib/sidecar-client");

module.exports = async function handler(req, res) {
  try {
    assertMethod(req, ["GET"]);
    if (isSidecarHealthRequest(req)) {
      return handleSidecarHealth(res);
    }

    const config = getRuntimeConfig();
    const deep = shouldRunDeepCheck(req);
    const supabaseLive = deep && config.supabase.configured ? await checkSupabase(config.supabase) : null;
    const checks = {
      api: "ok",
      model: config.model.configured ? "ok" : "missing_key",
      supabase: config.supabase.configured ? "configured" : "not_configured",
      ...(deep ? { supabaseLive: supabaseLive?.status || "skipped" } : {})
    };
    const healthy = checks.model === "ok" && (!deep || !config.supabase.configured || supabaseLive?.ok);

    return sendJson(
      res,
      healthy ? 200 : 503,
      {
        status: healthy ? "ok" : "degraded",
        checks,
        modelName: config.model.model,
        ...(supabaseLive?.latencyMs ? { supabaseLatencyMs: supabaseLive.latencyMs } : {}),
        ...(supabaseLive?.error ? { supabaseError: supabaseLive.error } : {}),
        timestamp: new Date().toISOString()
      },
      "no-store"
    );
  } catch (error) {
    return handleError(res, error, "HEALTH_CHECK_FAILED", "Health check failed.");
  }
};

function shouldRunDeepCheck(req) {
  const url = new URL(req.url || "/api/health", "http://localhost");
  return url.searchParams.get("deep") === "1";
}

function isSidecarHealthRequest(req) {
  const url = new URL(req.url || "/api/health", "http://localhost");
  return url.pathname.includes("sidecar-health") || url.searchParams.get("scope") === "sidecar";
}

async function handleSidecarHealth(res) {
  const config = getSidecarConfig(process.env);
  const health = await probeSidecarHealth(config);
  return sendJson(res, 200, {
    ok: true,
    config: {
      enabled: config.enabled,
      reportEnabled: config.reportEnabled,
      toolBaseUrl: config.toolBaseUrl,
      backendBaseUrl: config.backendBaseUrl
    },
    health
  });
}

async function checkSupabase(config) {
  const startedAt = Date.now();
  const endpoint = config.url.replace(/\/$/, "");
  try {
    const response = await fetch(`${endpoint}/rest/v1/brand_proposals?select=id&limit=1`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      },
      signal: AbortSignal.timeout(config.timeoutMs)
    });
    return {
      ok: response.ok,
      status: response.ok ? "ok" : `http_${response.status}`,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      error: error.cause?.code || error.message
    };
  }
}
