/**
 * 账号密码认证（scrypt + JWT），不依赖 Supabase Auth
 */

const crypto = require("crypto");
const { HttpError } = require("./http");

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getAuthSecret(env = process.env) {
  const secret = env.AUTH_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) return null;
  return secret;
}

function isAuthConfigured(env = process.env) {
  return Boolean(getAuthSecret(env));
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function validateUsername(username) {
  const value = normalizeUsername(username);
  if (value.length < 3 || value.length > 32) {
    throw new HttpError(400, "INVALID_USERNAME", "用户名需 3–32 个字符。");
  }
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new HttpError(400, "INVALID_USERNAME", "用户名仅支持字母、数字、下划线。");
  }
  return value;
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 6 || value.length > 128) {
    throw new HttpError(400, "INVALID_PASSWORD", "密码需 6–128 个字符。");
  }
  return value;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !String(storedHash).startsWith("scrypt:")) return false;
  const parts = String(storedHash).split(":");
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const expected = parts[2];
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signToken(user, env = process.env) {
  const secret = getAuthSecret(env);
  if (!secret) throw new HttpError(503, "AUTH_NOT_CONFIGURED", "未配置 AUTH_SECRET 或服务端密钥。");

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      iat: Date.now(),
      exp: Date.now() + TOKEN_TTL_MS
    })
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token, env = process.env) {
  const secret = getAuthSecret(env);
  if (!secret || !token) return null;

  const parts = String(token).split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }

  if (!data.sub || !data.exp || Date.now() > Number(data.exp)) return null;
  return {
    id: data.sub,
    username: normalizeUsername(data.username || "")
  };
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function requireUser(req, env = process.env) {
  const user = verifyToken(getBearerToken(req), env);
  if (!user) {
    throw new HttpError(401, "UNAUTHORIZED", "请先登录。");
  }
  return user;
}

function optionalUser(req, env = process.env) {
  return verifyToken(getBearerToken(req), env);
}

module.exports = {
  TOKEN_TTL_MS,
  getAuthSecret,
  isAuthConfigured,
  normalizeUsername,
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  getBearerToken,
  requireUser,
  optionalUser
};
