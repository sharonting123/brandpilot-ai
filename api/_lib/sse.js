/**
 * SSE 流式响应工具
 */

const { applySecurityHeaders } = require("./http");

function initSse(res) {
  applySecurityHeaders(res);
  if (!res.headersSent) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
  }
}

function sendSseEvent(res, event, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
  if (typeof res.flush === "function") res.flush();
}

function endSse(res) {
  res.end();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamTextChunks(text, emit, options = {}) {
  const value = String(text || "");
  if (!value) return;
  const chunkSize = options.chunkSize || 24;
  const delayMs = options.delayMs || 12;
  for (let i = 0; i < value.length; i += chunkSize) {
    emit("answer_delta", { text: value.slice(i, i + chunkSize) });
    if (delayMs > 0) await sleep(delayMs);
  }
}

module.exports = {
  initSse,
  sendSseEvent,
  endSse,
  streamTextChunks
};
