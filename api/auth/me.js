const { handleError, HttpError, sendJson } = require("../_lib/http");
const { isAuthConfigured, requireUser } = require("../_lib/auth");
const { findUserById } = require("../_lib/chat-store");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET /api/auth/me。");
    }
    if (!isAuthConfigured()) {
      return sendJson(res, 200, { authenticated: false, reason: "AUTH_NOT_CONFIGURED" });
    }

    const tokenUser = requireUser(req);
    const record = await findUserById(tokenUser.id);
    if (!record) {
      throw new HttpError(401, "UNAUTHORIZED", "用户不存在或已失效。");
    }

    return sendJson(res, 200, {
      authenticated: true,
      user: {
        id: record.id,
        username: record.username,
        createdAt: record.created_at
      }
    });
  } catch (error) {
    return handleError(res, error, "AUTH_ME_FAILED", "读取登录状态失败。");
  }
};
