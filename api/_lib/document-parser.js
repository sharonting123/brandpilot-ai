/**
 * 上传文档解析：txt / md / html / csv / json / docx / pdf
 */

const path = require("path");

const MAX_EXTRACT_CHARS = 48000;
const SUPPORTED_EXT = new Set([".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".json", ".docx", ".pdf"]);

function normalizeText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(text, maxChars = MAX_EXTRACT_CHARS) {
  const value = normalizeText(text);
  if (value.length <= maxChars) {
    return { text: value, truncated: false, charCount: value.length };
  }
  return {
    text: value.slice(0, maxChars) + "\n\n[文档已截断，仅保留前 " + maxChars + " 字]",
    truncated: true,
    charCount: value.length
  };
}

function stripHtml(html) {
  return normalizeText(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function extFromName(filename = "") {
  return path.extname(String(filename)).toLowerCase();
}

function isSupportedDocument(filename = "") {
  return SUPPORTED_EXT.has(extFromName(filename));
}

async function parseDocumentBuffer(filename, buffer) {
  const ext = extFromName(filename);
  if (!SUPPORTED_EXT.has(ext)) {
    throw new Error("不支持的文件格式：" + (ext || "未知") + "。支持 txt、md、html、csv、json、docx、pdf。");
  }
  if (!buffer || !buffer.length) {
    throw new Error("文件内容为空。");
  }

  let text = "";
  if ([".txt", ".md", ".markdown", ".csv", ".json"].includes(ext)) {
    text = buffer.toString("utf8");
  } else if (ext === ".html" || ext === ".htm") {
    text = stripHtml(buffer.toString("utf8"));
  } else if (ext === ".docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || "";
  } else if (ext === ".pdf") {
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(buffer);
    text = result.text || "";
  }

  const packed = truncateText(text);
  if (!packed.text) {
    throw new Error("未能从文档中提取到可用文本，请换一份文档或改用 txt/md。");
  }

  return {
    filename,
    format: ext.replace(/^\./, ""),
    mimeType: guessMime(ext),
    ...packed
  };
}

function guessMime(ext) {
  const map = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".csv": "text/csv",
    ".json": "application/json",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pdf": "application/pdf"
  };
  return map[ext] || "application/octet-stream";
}

function buildAttachmentContext(attachments = []) {
  const list = (attachments || []).filter((item) => item && item.text);
  if (!list.length) return "";

  const blocks = list.map((item, index) => {
    const title = item.filename || item.name || "文档" + (index + 1);
    return "【上传文档 " + (index + 1) + "：" + title + "】\n" + String(item.text).trim();
  });

  return [
    "",
    "---",
    "用户上传了以下文档，请结合文档内容回答；若与数据库查询冲突，以数据库/工具返回为准，文档作补充参考。",
    "",
    blocks.join("\n\n")
  ].join("\n");
}

function composeMessageWithAttachments(message, attachments = []) {
  const base = String(message || "").trim();
  const context = buildAttachmentContext(attachments);
  if (!context) return base;
  if (!base) return "请结合上传文档内容进行分析。" + context;
  return base + context;
}

module.exports = {
  MAX_EXTRACT_CHARS,
  SUPPORTED_EXT,
  isSupportedDocument,
  normalizeText,
  stripHtml,
  parseDocumentBuffer,
  buildAttachmentContext,
  composeMessageWithAttachments
};
