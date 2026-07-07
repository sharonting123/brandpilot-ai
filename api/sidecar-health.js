const { handleError, sendJson } = require("./_lib/http");
const { getSidecarConfig, probeSidecarHealth } = require("./_lib/sidecar-client");

module.exports = async function handler(req, res) {
  try {
    if (req.method && req.method !== "GET") {
      return sendJson(res, 405, { ok: false, message: "Use GET /api/sidecar-health." });
    }

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
  } catch (error) {
    return handleError(res, error, "SIDECAR_HEALTH_FAILED", "侧车健康检查失败。");
  }
};
