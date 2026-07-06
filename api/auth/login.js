const { handleError, HttpError, readJson, sendJson } = require("../_lib/http");
const {
  isAuthConfigured,
  validateUsername,
  validatePassword,
  verifyPassword,
  signToken,
  TOKEN_TTL_MS
} = require("../_lib/auth");
const { findUserByUsername } = require("../_lib/chat-store");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 POST /api/auth/login。");
    }
    if (!isAuthConfigured()) {
      throw new HttpError(503, "AUTH_NOT_CONFIGURED", "未配置 AUTH_SECRET，无法登录。");
    }

    const body = await readJson(req, { limitBytes: 16 * 1024 });
    const username = validateUsername(body.username);
    const password = validatePassword(body.password);

    const record = await findUserByUsername(username);
    if (!record || !verifyPassword(password, record.password_hash)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "用户名或密码错误。");
    }

    const user = {
      id: record.id,
      username: record.username,
      createdAt: record.created_at
    };
    const token = signToken(user);

    return sendJson(res, 200, {
      token,
      user,
      expiresInMs: TOKEN_TTL_MS
    });
  } catch (error) {
    return handleError(res, error, "LOGIN_FAILED", "登录失败。");
  }
};
