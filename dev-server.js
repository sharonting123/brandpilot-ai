const http = require("http");
const fs = require("fs");
const path = require("path");
const { applySecurityHeaders } = require("./api/_lib/http");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const envFile = path.join(root, ".env.local");
const secretsEnvFile = path.join(root, ".env.secrets");
const prodEnvFile = path.join(root, ".env.production");
const fileTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

loadDotEnv(prodEnvFile);
loadDotEnv(envFile);
loadDotEnv(secretsEnvFile);
seedLocalDevUser();

// API 路由处理器（包括新增的 /api/chat）
const apiHandlers = {
  "/api/config": require("./api/config"),
  "/api/agent-run": require("./api/agent-run"),
  "/api/chat": require("./api/chat"),
  "/api/events": require("./api/events"),
  "/api/health": require("./api/health"),
  "/api/sidecar-health": require("./api/health"),
  "/api/sidecar-report": require("./api/agent-run"),
  "/api/auth/register": require("./api/auth/register"),
  "/api/auth/check-username": require("./api/auth/register"),
  "/api/auth/login": require("./api/auth/login"),
  "/api/auth/me": require("./api/auth/me"),
  "/api/documents/parse": require("./api/documents/parse"),
  "/api/sessions": require("./api/sessions"),
  "/api/sessions/messages": require("./api/sessions/messages")
};

const server = http.createServer(async (req, res) => {
  try {
    applySecurityHeaders(res);
    const url = new URL(req.url, "http://localhost");
    if (apiHandlers[url.pathname]) {
      await apiHandlers[url.pathname](req, decorateResponse(res));
      return;
    }

    let rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    if (url.pathname === "/login") {
      rel = "login.html";
    }
    if (url.pathname === "/sandbox") {
      rel = "sandbox.html";
    }
    rel = rel.replace(/^\/+/, "");
    const file = path.resolve(root, rel);
    if (!file.startsWith(path.resolve(root))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": fileTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": cacheControlFor(file)
      });
      fs.createReadStream(file).pipe(res);
    });
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error.message);
  }
});

server.keepAliveTimeout = 70 * 1000;
server.headersTimeout = 75 * 1000;

server.listen(port, host, () => {
  console.log("BrandPilot server http://" + host + ":" + port);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function decorateResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
    }
    res.end(JSON.stringify(payload));
  };
  return res;
}

function cacheControlFor(file) {
  const name = path.basename(file);
  if (name === "index.html") return "no-store";
  if (file.includes(path.sep + "assets" + path.sep)) return "public, max-age=3600";
  return "no-store";
}

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}

function seedLocalDevUser() {
  if (process.env.LOCAL_DEV_AUTH !== "true") return;
  const { hashPassword } = require("./api/_lib/auth");
  const chatStore = require("./api/_lib/chat-store");
  const username = "121212";
  const password = "121212";
  chatStore
    .findUserByUsername(username)
    .then((existing) => {
      if (existing) return existing;
      return chatStore.createUser({
        username,
        passwordHash: hashPassword(password)
      });
    })
    .then(() => {
      console.log("Local dev user ready:", username);
    })
    .catch((error) => {
      console.warn("Local dev user seed skipped:", error.message);
    });
}
