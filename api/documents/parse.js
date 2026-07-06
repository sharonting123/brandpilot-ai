/**
 * POST /api/documents/parse
 * { filename, contentBase64 }
 */

const { requireUser } = require("../_lib/auth");
const { readJson, sendJson, handleError, HttpError } = require("../_lib/http");
const { isSupportedDocument, parseDocumentBuffer } = require("../_lib/document-parser");

module.exports = async function handler(req, res) {
  try {
    if (req.method && req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 POST /api/documents/parse。");
    }

    requireUser(req);
    const body = await readJson(req, { limitBytes: 8 * 1024 * 1024 });
    const filename = String(body.filename || "").trim();
    const contentBase64 = String(body.contentBase64 || "").trim();

    if (!filename) {
      throw new HttpError(400, "FILENAME_REQUIRED", "请提供 filename。");
    }
    if (!contentBase64) {
      throw new HttpError(400, "CONTENT_REQUIRED", "请提供 contentBase64。");
    }
    if (!isSupportedDocument(filename)) {
      throw new HttpError(400, "UNSUPPORTED_FORMAT", "不支持的文件格式。");
    }

    const buffer = Buffer.from(contentBase64, "base64");
    if (!buffer.length) {
      throw new HttpError(400, "EMPTY_FILE", "文件内容为空。");
    }
    if (buffer.length > 6 * 1024 * 1024) {
      throw new HttpError(413, "FILE_TOO_LARGE", "单文件不能超过 6MB。");
    }

    const parsed = await parseDocumentBuffer(filename, buffer);
    return sendJson(res, 200, parsed);
  } catch (error) {
    return handleError(res, error, "DOCUMENT_PARSE_FAILED", "文档解析失败。");
  }
};
