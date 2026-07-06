/**
 * GET /api/events — 查询最近 Agent 事件
 * POST /api/events 可选 limit
 */

const { handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { listRecentEvents } = require("./_lib/event-store");

module.exports = async function handler(req, res) {
  try {
    let limit = 20;
    if (req.method === "POST") {
      const body = await readJson(req, { limitBytes: 8 * 1024 });
      limit = Number(body.limit) || 20;
    } else if (req.method && req.method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET 或 POST /api/events。");
    }

    const result = await listRecentEvents(limit);
    return sendJson(res, 200, {
      status: "ok",
      ...result
    });
  } catch (error) {
    return handleError(res, error, "EVENTS_FAILED", "读取 Agent 事件失败。");
  }
};
