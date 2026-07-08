const { handleError, HttpError, readJson, sendJson, getClientIp } = require("../_lib/http");
const {
  isAuthConfigured,
  validateUsername,
  validatePassword,
  verifyPassword,
  signToken,
  TOKEN_TTL_MS
} = require("../_lib/auth");
const { findUserByUsername, sanitizeUser, recordLoginEvent } = require("../_lib/chat-store");

module.exports = async function handler(req, res) {
  const ipAddress = getClientIp(req);
  const userAgent = getRequestUserAgent(req);
  let attemptedUsername = "";

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 POST /api/auth/login。");
    }
    if (!isAuthConfigured()) {
      throw new HttpError(503, "AUTH_NOT_CONFIGURED", "未配置 AUTH_SECRET，无法登录。");
    }

    const body = await readJson(req, { limitBytes: 16 * 1024 });
    const username = validateUsername(body.username);
    attemptedUsername = username;
    const password = validatePassword(body.password);

    const record = await findUserByUsername(username);
    if (!record || !verifyPassword(password, record.password_hash)) {
      await safeRecordLoginEvent({
        userId: record && record.id ? record.id : null,
        username,
        eventType: "login_failed",
        ipAddress,
        userAgent,
        metadata: { reason: "invalid_credentials" }
      });
      throw new HttpError(401, "INVALID_CREDENTIALS", "用户名或密码错误。");
    }

    const user = sanitizeUser(record);
    const token = signToken(user);

    await safeRecordLoginEvent({
      userId: user.id,
      username: user.username,
      eventType: "login_success",
      ipAddress,
      userAgent
    });

    return sendJson(res, 200, {
      token,
      user,
      expiresInMs: TOKEN_TTL_MS
    });
  } catch (error) {
    if (
      attemptedUsername &&
      error instanceof HttpError &&
      error.statusCode !== 401 &&
      error.code !== "INVALID_CREDENTIALS"
    ) {
      await safeRecordLoginEvent({
        username: attemptedUsername,
        eventType: "login_failed",
        ipAddress,
        userAgent,
        metadata: { reason: error.code || "login_error" }
      });
    }
    return handleError(res, error, "LOGIN_FAILED", "登录失败。");
  }
};

function getRequestUserAgent(req) {
  return String(req.headers?.["user-agent"] || "").slice(0, 512);
}

async function safeRecordLoginEvent(input) {
  try {
    await recordLoginEvent(input);
  } catch (error) {
    console.warn("[login-event]", error.message || error);
  }
}
