/**
 * 独立登录 / 注册页（左右滑动切换）
 */
(function () {
  "use strict";

  var authSwitch = document.getElementById("authSwitch");
  var loginForm = document.getElementById("loginForm");
  var registerForm = document.getElementById("registerForm");
  var loginError = document.getElementById("loginError");
  var registerError = document.getElementById("registerError");
  var registerUsernameHint = document.getElementById("registerUsernameHint");
  var usernameCheckTimer = 0;
  var lastUsernameCheck = "";

  var params = new URLSearchParams(window.location.search);
  var nextUrl = params.get("next") || "/";
  if (!nextUrl.startsWith("/") || nextUrl.startsWith("//")) {
    nextUrl = "/";
  }

  function switchAuthTab(tab) {
    var isLogin = tab !== "register";
    if (authSwitch) authSwitch.setAttribute("data-active", isLogin ? "login" : "register");
    if (loginError) loginError.hidden = true;
    if (registerError) registerError.hidden = true;
    document.title = (isLogin ? "登录" : "注册") + " · BrandPilot AI";

    var slotMap = {
      ".auth-switch-slot--login-form": isLogin,
      ".auth-switch-slot--login-promo": !isLogin,
      ".auth-switch-slot--register-promo": isLogin,
      ".auth-switch-slot--register-form": !isLogin
    };
    Object.keys(slotMap).forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) el.hidden = !slotMap[selector];
    });

    document.querySelectorAll(".auth-switch-mobile-tab").forEach(function (btn) {
      var active = btn.getAttribute("data-switch") === (isLogin ? "login" : "register");
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    var url = new URL(window.location.href);
    if (isLogin) url.searchParams.delete("tab");
    else url.searchParams.set("tab", "register");
    if (nextUrl !== "/") url.searchParams.set("next", nextUrl);
    else url.searchParams.delete("next");
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  function redirectHome() {
    window.location.href = nextUrl;
  }

  document.querySelectorAll("[data-switch]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchAuthTab(btn.getAttribute("data-switch"));
    });
  });

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!window.BrandPilotAuth) return;
      var fd = new FormData(loginForm);
      if (loginError) loginError.hidden = true;
      window.BrandPilotAuth.login(fd.get("username"), fd.get("password"))
        .then(redirectHome)
        .catch(function (err) {
          if (loginError) {
            loginError.textContent = err.message || "登录失败，请检查用户名和密码";
            loginError.hidden = false;
          }
        });
    });
  }

  function setRegisterUsernameHint(text, type) {
    if (!registerUsernameHint) return;
    if (!text) {
      registerUsernameHint.hidden = true;
      registerUsernameHint.textContent = "";
      registerUsernameHint.className = "auth-field-hint";
      return;
    }
    registerUsernameHint.hidden = false;
    registerUsernameHint.textContent = text;
    registerUsernameHint.className = "auth-field-hint auth-field-hint--" + (type || "muted");
  }

  function scheduleUsernameCheck(raw) {
    if (!window.BrandPilotAuth || !window.BrandPilotAuth.checkUsername) return;
    var value = String(raw || "").trim();
    if (!value || value.length < 3) {
      setRegisterUsernameHint("");
      return;
    }
    if (!/^[A-Za-z0-9_]+$/.test(value)) {
      setRegisterUsernameHint("用户名仅支持字母、数字、下划线", "error");
      return;
    }
    clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(function () {
      if (value === lastUsernameCheck) return;
      lastUsernameCheck = value;
      setRegisterUsernameHint("正在检查用户名…", "muted");
      window.BrandPilotAuth.checkUsername(value)
        .then(function (result) {
          if (String(registerForm && registerForm.username && registerForm.username.value || "").trim().toLowerCase() !== value.toLowerCase()) {
            return;
          }
          if (result.available) {
            setRegisterUsernameHint("用户名可用", "ok");
          } else {
            setRegisterUsernameHint(result.message || "用户名已被注册", "error");
          }
        })
        .catch(function () {
          setRegisterUsernameHint("");
        });
    }, 320);
  }

  if (registerForm && registerForm.username) {
    registerForm.username.addEventListener("input", function () {
      lastUsernameCheck = "";
      scheduleUsernameCheck(registerForm.username.value);
    });
    registerForm.username.addEventListener("blur", function () {
      scheduleUsernameCheck(registerForm.username.value);
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!window.BrandPilotAuth) return;
      var fd = new FormData(registerForm);
      if (fd.get("password") !== fd.get("password2")) {
        if (registerError) {
          registerError.textContent = "两次输入的密码不一致，请重新填写";
          registerError.hidden = false;
        }
        return;
      }
      if (registerError) registerError.hidden = true;
      var username = fd.get("username");
      var submitRegister = function () {
        window.BrandPilotAuth.register(username, fd.get("password"))
          .then(redirectHome)
          .catch(function (err) {
            if (registerError) {
              registerError.textContent = err.message || "注册失败，请稍后重试";
              registerError.hidden = false;
            }
            if (err.code === "USERNAME_EXISTS") {
              setRegisterUsernameHint("用户名已被注册，请换一个", "error");
            }
          });
      };
      if (window.BrandPilotAuth.checkUsername) {
        window.BrandPilotAuth.checkUsername(username)
          .then(function (result) {
            if (!result.available) {
              if (registerError) {
                registerError.textContent = result.message || "用户名已被注册";
                registerError.hidden = false;
              }
              setRegisterUsernameHint(result.message || "用户名已被注册", "error");
              return;
            }
            submitRegister();
          })
          .catch(submitRegister);
        return;
      }
      submitRegister();
    });
  }

  switchAuthTab(params.get("tab") === "register" ? "register" : "login");

  if (window.BrandPilotAuth) {
    window.BrandPilotAuth.loadMe().then(function (user) {
      if (user) redirectHome();
    });
  }
})();
