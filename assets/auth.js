/**
 * 登录 / 注册 / 会话 API 客户端
 */
(function (global) {
  "use strict";

  var TOKEN_KEY = "bp_auth_token";
  var currentUser = null;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders(extra) {
    var headers = Object.assign({ "Content-Type": "application/json" }, extra || {});
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function apiFetch(url, options) {
    options = options || {};
    options.headers = authHeaders(options.headers);
    return fetch(url, options).then(function (resp) {
      return resp.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { message: text };
          }
        } else {
          data = {};
        }
        if (!resp.ok) {
          var err = new Error((data && data.message) || "请求失败 (" + resp.status + ")");
          err.status = resp.status;
          err.code = data && data.error;
          throw err;
        }
        return data;
      });
    });
  }

  function normalizeUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: String(user.username || "").trim().toLowerCase(),
      createdAt: user.createdAt || user.created_at || null
    };
  }

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return Boolean(currentUser && getToken());
  }

  function loadMe() {
    if (!getToken()) {
      currentUser = null;
      return Promise.resolve(null);
    }
    return apiFetch("/api/auth/me")
      .then(function (data) {
        if (data.authenticated && data.user) {
          currentUser = normalizeUser(data.user);
          return currentUser;
        }
        currentUser = null;
        setToken(null);
        return null;
      })
      .catch(function () {
        currentUser = null;
        setToken(null);
        return null;
      });
  }

  function login(username, password) {
    return apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username, password: password })
    }).then(function (data) {
      setToken(data.token);
      return loadMe().then(function (user) {
        return { token: data.token, user: user || normalizeUser(data.user), expiresInMs: data.expiresInMs };
      });
    });
  }

  function register(username, password) {
    return apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: username,
        password: password
      })
    }).then(function (data) {
      setToken(data.token);
      return loadMe().then(function (user) {
        return { token: data.token, user: user || normalizeUser(data.user), expiresInMs: data.expiresInMs };
      });
    });
  }

  function checkUsername(username) {
    var value = String(username || "").trim();
    if (!value) {
      return Promise.resolve({ available: false, message: "请输入用户名" });
    }
    return apiFetch("/api/auth/check-username?username=" + encodeURIComponent(value));
  }

  function logout() {
    currentUser = null;
    setToken(null);
  }

  function listSessions(limit) {
    return apiFetch("/api/sessions?limit=" + encodeURIComponent(limit || 30));
  }

  function createSession(brandId, title) {
    return apiFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ brandId: brandId || "haidilao", title: title || "新对话" })
    });
  }

  function loadMessages(sessionId) {
    return apiFetch(
      "/api/sessions/messages?sessionId=" + encodeURIComponent(sessionId) + "&limit=200"
    );
  }

  global.BrandPilotAuth = {
    getToken: getToken,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    loadMe: loadMe,
    login: login,
    register: register,
    checkUsername: checkUsername,
    logout: logout,
    listSessions: listSessions,
    createSession: createSession,
    loadMessages: loadMessages,
    apiFetch: apiFetch,
    authHeaders: authHeaders
  };
})(window);
