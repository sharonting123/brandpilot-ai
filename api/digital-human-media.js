/**
 * 代理百炼 OSS 音视频，解决 HTTPS 页面无法加载 http:// 资源的混合内容问题。
 * GET /api/digital-human-media?u=<encoded_url>
 */

const { applySecurityHeaders, handleError, HttpError } = require("./_lib/http");

const ALLOWED_HOST_RE =
  /^dashscope-result-[a-z0-9-]+\.oss-cn-[a-z0-9-]+\.aliyuncs\.com$/i;

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET /api/digital-human-media。");
    }

    const url = new URL(req.url || "/", "http://localhost");
    const target = String(url.searchParams.get("u") || "").trim();
    if (!target) {
      throw new HttpError(400, "URL_REQUIRED", "请提供 u 查询参数。");
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      throw new HttpError(400, "INVALID_URL", "媒体 URL 无效。");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new HttpError(400, "INVALID_URL", "仅支持 HTTP(S) 媒体地址。");
    }
    if (!ALLOWED_HOST_RE.test(parsed.hostname)) {
      throw new HttpError(403, "HOST_NOT_ALLOWED", "不允许代理该媒体域名。");
    }

    const upstream = await fetch(parsed.toString(), {
      headers: { "User-Agent": "BrandPilot-Media-Proxy/1.0" },
      signal: AbortSignal.timeout(120000)
    });

    if (!upstream.ok) {
      throw new HttpError(502, "UPSTREAM_FAILED", `媒体拉取失败 HTTP ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") || guessContentType(parsed.pathname);
    applySecurityHeaders(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (upstream.headers.get("content-length")) {
      res.setHeader("Content-Length", upstream.headers.get("content-length"));
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    return handleError(res, error, "MEDIA_PROXY_FAILED", "媒体代理失败。");
  }
};

function guessContentType(pathname) {
  const lower = String(pathname || "").toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}
