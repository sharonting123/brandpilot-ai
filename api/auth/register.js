const { handleError, HttpError, readJson, sendJson } = require("../_lib/http");
const {
  isAuthConfigured,
  validateUsername,
  validatePassword,
  hashPassword,
  signToken
} = require("../_lib/auth");
const { createUser, isUsernameAvailable } = require("../_lib/chat-store");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET" && isCheckUsernameRequest(req)) {
      return handleCheckUsername(req, res);
    }
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 POST /api/auth/register。");
    }
    if (!isAuthConfigured()) {
      throw new HttpError(
        503,
        "AUTH_NOT_CONFIGURED",
        "未配置 AUTH_SECRET 或 SUPABASE_SERVICE_ROLE_KEY，无法注册。"
      );
    }

    const body = await readJson(req, { limitBytes: 16 * 1024 });
    const username = validateUsername(body.username);
    const password = validatePassword(body.password);

    const user = await createUser({
      username,
      passwordHash: hashPassword(password)
    });

    const token = signToken(user);
    return sendJson(res, 201, {
      token,
      user,
      expiresInMs: 7 * 24 * 60 * 60 * 1000
    });
  } catch (error) {
    return handleError(res, error, "REGISTER_FAILED", "注册失败。");
  }
};

function isCheckUsernameRequest(req) {
  const url = new URL(req.url || "/api/auth/register", "http://localhost");
  return url.pathname.includes("check-username") || url.searchParams.has("username");
}

async function handleCheckUsername(req, res) {
  if (!isAuthConfigured()) {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "未配置 AUTH_SECRET，无法校验用户名。");
  }

  const url = new URL(req.url || "/api/auth/register", "http://localhost");
  const raw = url.searchParams.get("username") || "";
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
}
