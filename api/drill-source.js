const { handleError, HttpError, sendJson } = require("./_lib/http");
const { optionalUser } = require("./_lib/auth");
const { getContext } = require("./_lib/agent-tools");
const { buildDrillSource } = require("./_lib/ar-scene-builder");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET /api/drill-source。");
    }
    optionalUser(req);
    const brandId = String(req.query?.brandId || "haidilao");
    const ctx = await getContext(brandId);
    return sendJson(res, 200, {
      brandId,
      drillSource: buildDrillSource(ctx)
    });
  } catch (error) {
    return handleError(res, error, "DRILL_SOURCE_FAILED", "沙盘数据加载失败。");
  }
};
