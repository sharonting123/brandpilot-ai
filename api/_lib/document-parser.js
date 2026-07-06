/**
 * 上传文档解析：txt / md / html / csv / json / docx / pdf
 */

const path = require("path");
const { recognizeImageBuffer, mimeFromFilename } = require("./image-ocr");

const MAX_EXTRACT_CHARS = 48000;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 120;
const MAX_CONTEXT_CHARS = 12000;
const MAX_CHUNKS_PER_DOC = 8;
const SUPPORTED_EXT = new Set([
  ".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".json", ".docx", ".pdf",
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"
]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const SENTENCE_END = /[。！？；\n]/;

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

function splitLongParagraph(text, maxChars = CHUNK_SIZE) {
  const parts = [];
  let rest = String(text || "").trim();
  while (rest.length > maxChars) {
    let cut = maxChars;
    const slice = rest.slice(0, maxChars);
    const matches = [...slice.matchAll(SENTENCE_END)];
    if (matches.length) {
      const last = matches[matches.length - 1];
      if (last.index >= Math.floor(maxChars * 0.45)) {
        cut = last.index + 1;
      }
    }
    const chunk = rest.slice(0, cut).trim();
    if (!chunk) {
      parts.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars).trim();
      continue;
    }
    parts.push(chunk);
    rest = rest.slice(cut).trim();
    if (rest.length && cut < maxChars * 0.5 && parts[parts.length - 1] === chunk) {
      rest = rest.slice(Math.max(0, cut - CHUNK_OVERLAP)).trim();
    }
  }
  if (rest) parts.push(rest);
  return parts;
}

function splitDocumentText(text, options = {}) {
  const maxChars = options.chunkSize || CHUNK_SIZE;
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const rawChunks = [];
  let buffer = "";

  function flushBuffer() {
    const value = buffer.trim();
    if (!value) return;
    if (value.length <= maxChars) {
      rawChunks.push(value);
    } else {
      rawChunks.push(...splitLongParagraph(value, maxChars));
    }
    buffer = "";
  }

  paragraphs.forEach((paragraph) => {
    if (paragraph.length > maxChars) {
      flushBuffer();
      rawChunks.push(...splitLongParagraph(paragraph, maxChars));
      return;
    }
    const candidate = buffer ? buffer + "\n\n" + paragraph : paragraph;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      return;
    }
    flushBuffer();
    buffer = paragraph;
  });
  flushBuffer();

  if (!rawChunks.length && normalized) {
    return splitLongParagraph(normalized, maxChars);
  }

  return rawChunks.map((content, index) => ({
    index: index + 1,
    content
  }));
}

function tokenizeQuery(text) {
  const value = String(text || "").toLowerCase();
  const tokens = value
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  const grams = [];
  const chars = value.replace(/[^\u4e00-\u9fa5]/g, "");
  for (let i = 0; i < chars.length - 1; i += 1) {
    grams.push(chars.slice(i, i + 2));
  }
  return [...new Set(tokens.concat(grams))];
}

function scoreDocumentChunk(chunk, queryTokens) {
  if (!queryTokens.length) return 0;
  const haystack = String(chunk.content || "").toLowerCase();
  let score = 0;
  queryTokens.forEach((token) => {
    if (!token || !haystack.includes(token)) return;
    score += token.length >= 4 ? 3 : token.length >= 2 ? 2 : 1;
  });
  return score;
}

function selectChunksForQuery(chunks, query, options = {}) {
  const list = (chunks || []).filter((item) => item && item.content);
  if (!list.length) return { selected: [], totalChunks: 0, mode: "empty" };

  const maxChars = options.maxChars || MAX_CONTEXT_CHARS;
  const maxChunks = options.maxChunks || MAX_CHUNKS_PER_DOC;
  const queryTokens = tokenizeQuery(query);
  const hasQuery = queryTokens.length > 0;

  const ranked = list
    .map((chunk, order) => ({
      ...chunk,
      order,
      score: hasQuery ? scoreDocumentChunk(chunk, queryTokens) : 0
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    });

  const selected = [];
  let usedChars = 0;

  function tryPush(chunk) {
    let content = String(chunk.content || "").trim();
    if (!content) return false;
    const header = "[第 " + chunk.index + " 段] ";
    if (selected.length >= maxChunks) return false;
    let block = header + content;
    if (usedChars + block.length > maxChars) {
      if (selected.length) return false;
      const budget = Math.max(200, maxChars - header.length);
      content = content.slice(0, budget) + "…";
      block = header + content;
    }
    selected.push({ ...chunk, content: block });
    usedChars += block.length;
    return true;
  }

  if (hasQuery) {
    ranked.forEach((chunk) => {
      if (chunk.score > 0) tryPush(chunk);
    });
  }

  if (!selected.length) {
    ranked
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((chunk) => tryPush(chunk));
  }

  return {
    selected,
    totalChunks: list.length,
    mode: hasQuery && selected.some((item) => scoreDocumentChunk(item, queryTokens) > 0)
      ? "relevant"
      : "sequential"
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

function isImageDocument(filename = "") {
  return IMAGE_EXT.has(extFromName(filename));
}

async function parseImageBuffer(filename, buffer, options = {}) {
  const ext = extFromName(filename);
  const ocr = await recognizeImageBuffer(buffer, {
    filename,
    mimeType: mimeFromFilename(filename),
    env: options.env
  });
  const packed = truncateText(ocr.text);
  if (!packed.text) {
    throw new Error("图片 OCR 未识别到可用文字。");
  }
  const chunks = splitDocumentText(packed.text);
  return {
    filename,
    format: ext.replace(/^\./, "") || "image",
    mimeType: mimeFromFilename(filename),
    sourceType: "ocr",
    ocrModel: ocr.model,
    ocrTask: ocr.task,
    chunks,
    chunkCount: chunks.length,
    ...packed
  };
}

async function parseDocumentBuffer(filename, buffer, options = {}) {
  const ext = extFromName(filename);
  if (!SUPPORTED_EXT.has(ext)) {
    throw new Error(
      "不支持的文件格式：" + (ext || "未知") +
      "。支持 txt、md、html、csv、json、docx、pdf、jpg、png、webp。"
    );
  }
  if (!buffer || !buffer.length) {
    throw new Error("文件内容为空。");
  }

  if (IMAGE_EXT.has(ext)) {
    return parseImageBuffer(filename, buffer, options);
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

  const chunks = splitDocumentText(packed.text);

  return {
    filename,
    format: ext.replace(/^\./, ""),
    mimeType: guessMime(ext),
    sourceType: "text",
    chunks,
    chunkCount: chunks.length,
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
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp"
  };
  return map[ext] || "application/octet-stream";
}

function buildAttachmentContext(attachments = [], query = "") {
  const list = (attachments || []).filter((item) => item && (item.text || (item.chunks && item.chunks.length)));
  if (!list.length) return "";

  const blocks = list.map((item, index) => {
    const title = item.filename || item.name || "文档" + (index + 1);
    const chunks = item.chunks && item.chunks.length
      ? item.chunks
      : splitDocumentText(item.text || "");
    const picked = selectChunksForQuery(chunks, query);
    const chunkLines = picked.selected.map((chunk) => String(chunk.content).trim()).join("\n\n");
    const meta =
      picked.totalChunks > 1
        ? "（共 " + picked.totalChunks + " 段，本次送入 " + picked.selected.length + " 段" +
          (picked.mode === "relevant" ? "，已按问题筛选相关片段" : "，按顺序选取") + "）"
        : "";
    const sourceNote = item.sourceType === "ocr" ? "，OCR 识别" : "";
    return "【上传文档 " + (index + 1) + "：" + title + sourceNote + meta + "】\n" + chunkLines;
  });

  return [
    "",
    "---",
    "用户上传了以下文档（含图片 OCR 结果）。系统已切分为段落，并优先选取与问题相关的片段；若与数据库查询冲突，以数据库/工具返回为准，文档作补充参考。",
    "",
    blocks.join("\n\n")
  ].join("\n");
}

function composeMessageWithAttachments(message, attachments = []) {
  const base = String(message || "").trim();
  const context = buildAttachmentContext(attachments, base);
  if (!context) return base;
  if (!base) return "请结合上传文档内容进行分析。" + context;
  return base + context;
}

module.exports = {
  MAX_EXTRACT_CHARS,
  CHUNK_SIZE,
  MAX_CONTEXT_CHARS,
  SUPPORTED_EXT,
  IMAGE_EXT,
  isSupportedDocument,
  isImageDocument,
  normalizeText,
  stripHtml,
  splitDocumentText,
  selectChunksForQuery,
  parseDocumentBuffer,
  parseImageBuffer,
  buildAttachmentContext,
  composeMessageWithAttachments
};
