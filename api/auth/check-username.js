const { handleError, HttpError, sendJson } = require("../_lib/http");
const { isAuthConfigured, validateUsername } = require("../_lib/auth");
const { isUsernameAvailable } = require("../_lib/chat-store");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET /api/auth/check-username。");
    }
    if (!isAuthConfigured()) {
      throw new HttpError(503, "AUTH_NOT_CONFIGURED", "未配置 AUTH_SECRET，无法校验用户名。");
    }

    const raw = req.query?.username || "";
    let username;
    try {
      username = validateUsername(raw);
    } catch (error) {
      return sendJson(res, 200, {
        available: false,
        username: String(raw || "").trim().toLowerCase(),
        message: error.message || "用户名格式不正确"
      });
    }

    const available = await isUsernameAvailable(username);
    return sendJson(res, 200, {
      available,
      username,
      message: available ? "用户名可用" : "用户名已被注册"
    });
  } catch (error) {
    return handleError(res, error, "CHECK_USERNAME_FAILED", "用户名校验失败。");
  }
};
