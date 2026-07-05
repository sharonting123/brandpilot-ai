const { getRuntimeConfig } = require("./_lib/env");
const { assertMethod, handleError, sendJson } = require("./_lib/http");

module.exports = function handler(req, res) {
  try {
    assertMethod(req, ["GET"]);
    const config = getRuntimeConfig();
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
        nodeEnv: config.nodeEnv
      },
      "s-maxage=60, stale-while-revalidate=300"
    );
  } catch (error) {
    return handleError(res, error, "CONFIG_FAILED", "Runtime config unavailable.");
  }
};
