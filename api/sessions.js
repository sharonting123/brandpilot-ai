const { handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { requireUser } = require("./_lib/auth");
const {
  createSession,
  listSessions,
  touchSession
} = require("./_lib/chat-store");

module.exports = async function handler(req, res) {
  try {
    const user = requireUser(req);

    if (req.method === "GET") {
      const url = new URL(req.url || "/", "http://localhost");
      const limit = Number(url.searchParams.get("limit")) || 30;
      const sessions = await listSessions(user.id, limit);
      return sendJson(res, 200, { sessions });
    }

    if (req.method === "POST") {
      const body = await readJson(req, { limitBytes: 8 * 1024 });
      const session = await createSession(user.id, {
        brandId: body.brandId || body.brandHint || "haidilao",
        title: String(body.title || "新对话").slice(0, 80)
      });
      return sendJson(res, 201, { session });
    }

    if (req.method === "PATCH") {
      const body = await readJson(req, { limitBytes: 8 * 1024 });
      if (!body.sessionId) {
        throw new HttpError(400, "SESSION_ID_REQUIRED", "请提供 sessionId。");
      }
      const session = await touchSession(body.sessionId, user.id, {
        title: body.title ? String(body.title).slice(0, 80) : undefined
      });
      return sendJson(res, 200, { session });
    }

    throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET / POST / PATCH /api/sessions。");
  } catch (error) {
    return handleError(res, error, "SESSIONS_FAILED", "会话操作失败。");
  }
};
