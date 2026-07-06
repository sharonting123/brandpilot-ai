/**
 * 用户 / 会话 / 消息持久化（Supabase service role；无密钥时内存降级仅供本地）
 */

const { HttpError } = require("./http");
const { getSupabaseConfig } = require("./env");
const { normalizeUsername } = require("./auth");

const memoryUsers = new Map();
const memorySessions = new Map();
const memoryMessages = new Map();

function getAdminConfig(env = process.env) {
  const base = getSupabaseConfig(env);
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (base.configured && serviceKey) {
    return {
      mode: "supabase",
      url: base.url.replace(/\/$/, ""),
      key: serviceKey,
      timeoutMs: base.timeoutMs
    };
  }
  // 调试态：不再降级到内存模式，直接抛错暴露 Supabase service_role 配置缺失
  throw new Error("会话存储失败：Supabase service_role 未配置（SUPABASE_SERVICE_ROLE_KEY 缺失）。调试态已关闭内存降级。");
}

function adminHeaders(config) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
}

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      ...adminHeaders(config),
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const msg = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return payload;
}

async function isUsernameAvailable(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;
  const existing = await findUserByUsername(normalized);
  return !existing;
}

async function createUser({ username, passwordHash }) {
  const config = getAdminConfig();
  const normalized = normalizeUsername(username);
  if (config.mode === "memory") {
    if (memoryUsers.has(normalized)) {
      throw new HttpError(409, "USERNAME_EXISTS", "用户名已被注册。");
    }
    const user = {
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      username: normalized,
      password_hash: passwordHash,
      display_name: normalized,
      created_at: new Date().toISOString()
    };
    memoryUsers.set(normalized, user);
    return sanitizeUser(user);
  }

  const existing = await supabaseRequest(
    config,
    `app_users?username=ilike.${encodeURIComponent(normalized)}&select=id&limit=1`
  );
  if (Array.isArray(existing) && existing.length) {
    throw new HttpError(409, "USERNAME_EXISTS", "用户名已被注册。");
  }

  let rows;
  try {
    rows = await supabaseRequest(config, "app_users", {
      method: "POST",
      body: {
        username: normalized,
        password_hash: passwordHash,
        display_name: normalized
      }
    });
  } catch (error) {
    const msg = String(error.message || "");
    if (/duplicate|unique|23505|already exists/i.test(msg)) {
      throw new HttpError(409, "USERNAME_EXISTS", "用户名已被注册。");
    }
    throw error;
  }
  return sanitizeUser(rows[0]);
}

async function findByUsernameColumn(config, normalized) {
  if (config.mode === "memory") {
    return memoryUsers.get(normalized) || null;
  }
  const rows = await supabaseRequest(
    config,
    `app_users?username=ilike.${encodeURIComponent(normalized)}&select=*&limit=1`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findByDisplayNameColumn(config, normalized) {
  if (config.mode === "memory") {
    for (const user of memoryUsers.values()) {
      if (normalizeUsername(user.display_name || "") === normalized) return user;
    }
    return null;
  }
  const rows = await supabaseRequest(
    config,
    `app_users?display_name=ilike.${encodeURIComponent(normalized)}&select=*&limit=1`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function syncUserProfile(userId, username) {
  const normalized = normalizeUsername(username);
  const config = getAdminConfig();
  if (config.mode === "memory") {
    for (const user of memoryUsers.values()) {
      if (user.id === userId) {
        memoryUsers.delete(normalizeUsername(user.username));
        user.username = normalized;
        user.display_name = normalized;
        memoryUsers.set(normalized, user);
        return;
      }
    }
    return;
  }
  await supabaseRequest(config, `app_users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { username: normalized, display_name: normalized },
    prefer: "return=minimal"
  });
}

async function syncDisplayNameOnly(userId, username) {
  const normalized = normalizeUsername(username);
  const config = getAdminConfig();
  if (config.mode === "memory") {
    for (const user of memoryUsers.values()) {
      if (user.id === userId) {
        user.display_name = normalized;
        return;
      }
    }
    return;
  }
  await supabaseRequest(config, `app_users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { display_name: normalized },
    prefer: "return=minimal"
  });
}

async function reconcileUserRecord(record, loginName) {
  if (!record) return null;
  const login = normalizeUsername(loginName || record.username);
  const currentUsername = normalizeUsername(record.username);
  const currentDisplay = normalizeUsername(record.display_name || "");

  if (currentUsername === login) {
    if (currentDisplay && currentDisplay !== login) {
      await syncDisplayNameOnly(record.id, login);
      record.display_name = login;
    }
    record.username = login;
    return record;
  }

  if (currentDisplay === login && currentUsername !== login) {
    await syncUserProfile(record.id, login);
    record.username = login;
    record.display_name = login;
    return record;
  }

  record.username = currentUsername;
  return record;
}

async function resolveUserRecord(record) {
  if (!record) return null;
  const canonical = normalizeUsername(record.username);
  const currentDisplay = normalizeUsername(record.display_name || "");
  if (!canonical) return record;
  if (currentDisplay && currentDisplay !== canonical) {
    await syncDisplayNameOnly(record.id, canonical);
    record.display_name = canonical;
  }
  record.username = canonical;
  return record;
}

async function findUserByUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const config = getAdminConfig();
  let record = await findByUsernameColumn(config, normalized);
  if (!record) {
    record = await findByDisplayNameColumn(config, normalized);
  }
  if (!record) return null;
  return reconcileUserRecord(record, normalized);
}

async function findUserById(userId) {
  const config = getAdminConfig();
  if (config.mode === "memory") {
    for (const user of memoryUsers.values()) {
      if (user.id === userId) return resolveUserRecord(user);
    }
    return null;
  }
  const rows = await supabaseRequest(
    config,
    `app_users?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
  );
  const record = Array.isArray(rows) && rows.length ? rows[0] : null;
  return resolveUserRecord(record);
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: normalizeUsername(user.username),
    createdAt: user.created_at
  };
}

async function createSession(userId, { brandId = "haidilao", title = "新对话" } = {}) {
  const config = getAdminConfig();
  const now = new Date().toISOString();
  if (config.mode === "memory") {
    const session = {
      id: `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      user_id: userId,
      brand_id: brandId,
      title,
      created_at: now,
      updated_at: now
    };
    memorySessions.set(session.id, session);
    return formatSession(session);
  }

  const rows = await supabaseRequest(config, "chat_sessions", {
    method: "POST",
    body: { user_id: userId, brand_id: brandId, title }
  });
  return formatSession(rows[0]);
}

async function listSessions(userId, limit = 30) {
  const config = getAdminConfig();
  const max = Math.max(1, Math.min(limit, 100));
  if (config.mode === "memory") {
    return [...memorySessions.values()]
      .filter((s) => s.user_id === userId)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, max)
      .map(formatSession);
  }

  const rows = await supabaseRequest(
    config,
    `chat_sessions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=updated_at.desc&limit=${max}`
  );
  return (rows || []).map(formatSession);
}

async function getSession(sessionId, userId) {
  const config = getAdminConfig();
  let session = null;
  if (config.mode === "memory") {
    session = memorySessions.get(sessionId) || null;
  } else {
    const rows = await supabaseRequest(
      config,
      `chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`
    );
    session = Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  if (!session || session.user_id !== userId) {
    throw new HttpError(404, "SESSION_NOT_FOUND", "会话不存在。");
  }
  return formatSession(session);
}

async function touchSession(sessionId, userId, patch = {}) {
  const session = await getSession(sessionId, userId);
  const config = getAdminConfig();
  const updatedAt = new Date().toISOString();
  if (config.mode === "memory") {
    const raw = memorySessions.get(sessionId);
    if (patch.title) raw.title = patch.title;
    raw.updated_at = updatedAt;
    return formatSession(raw);
  }

  const body = { updated_at: updatedAt };
  if (patch.title) body.title = patch.title;
  const rows = await supabaseRequest(
    config,
    `chat_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", body, prefer: "return=representation" }
  );
  return formatSession(Array.isArray(rows) ? rows[0] : session);
}

async function listMessages(sessionId, userId, limit = 200) {
  await getSession(sessionId, userId);
  const config = getAdminConfig();
  const max = Math.max(1, Math.min(limit, 500));
  if (config.mode === "memory") {
    const key = sessionId;
    return (memoryMessages.get(key) || []).slice(-max).map(formatMessage);
  }

  const rows = await supabaseRequest(
    config,
    `chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.asc&limit=${max}`
  );
  return (rows || []).map(formatMessage);
}

async function appendMessages(sessionId, userId, messages = []) {
  if (!messages.length) return [];
  const session = await getSession(sessionId, userId);
  const config = getAdminConfig();
  const now = new Date().toISOString();

  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser && (session.title === "新对话" || !session.title)) {
    await touchSession(sessionId, userId, {
      title: String(firstUser.content || "新对话").slice(0, 40)
    });
  } else {
    await touchSession(sessionId, userId, {});
  }

  if (config.mode === "memory") {
    const list = memoryMessages.get(sessionId) || [];
    const created = messages.map((msg) => {
      const row = {
        id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        session_id: sessionId,
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata || {},
        created_at: now
      };
      list.push(row);
      return formatMessage(row);
    });
    memoryMessages.set(sessionId, list);
    return created;
  }

  const rows = await supabaseRequest(config, "chat_messages", {
    method: "POST",
    body: messages.map((msg) => ({
      session_id: sessionId,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata || {}
    })),
    prefer: "return=representation"
  });
  return (rows || []).map(formatMessage);
}

function formatSession(session) {
  return {
    id: session.id,
    userId: session.user_id,
    brandId: session.brand_id,
    title: session.title,
    createdAt: session.created_at,
    updatedAt: session.updated_at
  };
}

function formatMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata || {},
    createdAt: row.created_at
  };
}

function isChatStoreConfigured(env = process.env) {
  try {
    const config = getAdminConfig(env);
    return config.mode === "supabase";
  } catch {
    return false;
  }
}

module.exports = {
  getAdminConfig,
  isChatStoreConfigured,
  createUser,
  isUsernameAvailable,
  findUserByUsername,
  findUserById,
  sanitizeUser,
  createSession,
  listSessions,
  getSession,
  touchSession,
  listMessages,
  appendMessages
};
