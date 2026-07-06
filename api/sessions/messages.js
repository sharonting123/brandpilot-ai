const { handleError, HttpError, sendJson } = require("../_lib/http");
const { requireUser } = require("../_lib/auth");
const { listMessages } = require("../_lib/chat-store");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET /api/sessions/messages?sessionId=。");
    }

    const user = requireUser(req);
    const url = new URL(req.url || "/", "http://localhost");
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      throw new HttpError(400, "SESSION_ID_REQUIRED", "请提供 sessionId 查询参数。");
    }

    const limit = Number(url.searchParams.get("limit")) || 200;
    const messages = await listMessages(sessionId, user.id, limit);
    return sendJson(res, 200, { sessionId, messages });
  } catch (error) {
    return handleError(res, error, "MESSAGES_FAILED", "读取消息失败。");
  }
};
