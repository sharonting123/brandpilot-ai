const { getRuntimeConfig } = require("./_lib/env");
const { getSidecarConfig, probeSidecarHealth } = require("./_lib/sidecar-client");
const { isAuthConfigured } = require("./_lib/auth");
const { getAdminConfig } = require("./_lib/chat-store");
const { assertMethod, handleError, sendJson } = require("./_lib/http");

function buildMapConfig() {
  const amapKey = String(process.env.AMAP_WEB_KEY || process.env.AMAP_KEY || "").trim();
  return {
    provider: amapKey ? "amap" : "leaflet",
    amapKey,
    defaultZoom: 13,
    tileAttribution: amapKey ? "© 高德地图" : "© 高德地图"
  };
}

module.exports = async function handler(req, res) {
  try {
    assertMethod(req, ["GET"]);
    const config = getRuntimeConfig();
    const sidecarConfig = getSidecarConfig(process.env);
    let sidecarHealth = null;
    if (sidecarConfig.enabled) {
      try {
        sidecarHealth = await probeSidecarHealth(sidecarConfig);
      } catch (_error) {
        sidecarHealth = null;
      }
    }
    let chatStorageMode = "unknown";
    try {
      chatStorageMode = getAdminConfig().mode;
    } catch (_error) {
      chatStorageMode = config.supabase.configured ? "supabase" : "unconfigured";
    }
    const exposeSupabase = config.supabase.configured && config.supabase.browserEnabled;

    return sendJson(
      res,
      200,
      {
        supabaseUrl: exposeSupabase ? config.supabase.url : null,
        supabaseAnonKey: exposeSupabase ? config.supabase.anonKey : null,
        supabaseBrowserEnabled: exposeSupabase,
        modelConfigured: config.model.configured,
        modelName: config.model.model,
        dashscopeConfigured: config.dashscope.configured,
        ocrConfigured: config.ocr.configured,
        ocrProvider: config.ocr.provider,
        ocrModel: config.ocr.model,
        ragEmbeddingConfigured: config.rag.embeddingEnabled,
        ragRerankConfigured: config.rag.rerankEnabled,
        ragEmbeddingModel: config.rag.embeddingModel,
        ragRerankModel: config.rag.rerankModel,
        authConfigured: isAuthConfigured(),
        chatStorageMode,
        nodeEnv: config.nodeEnv,
        sidecarEnabled: sidecarConfig.enabled,
        sidecarReadyForReport: Boolean(sidecarHealth && sidecarHealth.readyForReport),
        map: buildMapConfig()
      },
      "s-maxage=60, stale-while-revalidate=300"
    );
  } catch (error) {
    return handleError(res, error, "CONFIG_FAILED", "Runtime config unavailable.");
  }
};
