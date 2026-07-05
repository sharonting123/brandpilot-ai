class HttpError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(securityHeaders)) {
    res.setHeader(key, value);
  }
}

function sendJson(res, status, payload, cacheControl = "no-store") {
  applySecurityHeaders(res);
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.setHeader("Cache-Control", cacheControl);
    return res.status(status).json(payload);
  }

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.end(JSON.stringify(payload));
}

function assertMethod(req, allowed) {
  const method = req.method || "GET";
  if (!allowed.includes(method)) {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", `Use ${allowed.join(" or ")}.`);
  }
}

async function readJson(req, options = {}) {
  const limitBytes = options.limitBytes || 64 * 1024;
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return parseJson(req.body);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      throw new HttpError(413, "REQUEST_TOO_LARGE", `Request body must be <= ${limitBytes} bytes.`);
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? parseJson(raw) : {};
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
}

function handleError(res, error, fallbackCode, fallbackMessage) {
  if (error instanceof HttpError) {
    return sendJson(res, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    });
  }

  return sendJson(res, 500, {
    error: fallbackCode,
    message: error.message || fallbackMessage
  });
}

module.exports = {
  HttpError,
  applySecurityHeaders,
  assertMethod,
  getClientIp,
  handleError,
  readJson,
  sendJson
};
