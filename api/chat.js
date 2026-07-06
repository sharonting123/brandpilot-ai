/**
 * api/chat.js — BrandPilot AI 主入口
 * POST /api/chat  { message, brandHint?, history?, stream?: true }
 */

const { handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { getModelConfig } = require("./_lib/env");
const { requireUser } = require("./_lib/auth");
const { runChatRequest } = require("./_lib/chat-runner");
const { initSse, sendSseEvent, endSse } = require("./_lib/sse");

module.exports = async function handler(req, res) {
  try {
    if (req.method && req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 POST /api/chat。");
    }

    const body = await readJson(req, { limitBytes: 256 * 1024 });
    const message = String(body.message || "").trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (!message && !attachments.length) {
      throw new HttpError(400, "MESSAGE_REQUIRED", "请提供 message 或上传文档。");
    }

    const sessionId = body.sessionId ? String(body.sessionId) : "";
    const authUser = requireUser(req);
    const brandHint = String(body.brandHint || "haidilao").trim();
    const brandId = brandHint === "海底捞" ? "haidilao" : brandHint;
    const brandName = brandId === "haidilao" ? "海底捞" : brandHint;
    const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
    const modelConfig = getModelConfig(process.env);

    const ctx = {
      message,
      attachments,
      brandId,
      brandName,
      history,
      modelConfig,
      authUser,
      sessionId
    };

    if (body.stream) {
      return handleStream(res, ctx);
    }

    const response = await runChatRequest(ctx);
    return sendJson(res, 200, response);
  } catch (error) {
    return handleError(res, error, "CHAT_FAILED", "Agent 编排执行失败。");
  }
};

async function handleStream(res, ctx) {
  initSse(res);
  try {
    const response = await runChatRequest({
      ...ctx,
      emit: (event, data) => sendSseEvent(res, event, data)
    });
    sendSseEvent(res, "done", response);
    endSse(res);
  } catch (error) {
    const message = error instanceof HttpError ? error.message : error.message || "Agent 编排执行失败。";
    sendSseEvent(res, "error", {
      error: error.code || "CHAT_FAILED",
      message
    });
    endSse(res);
  }
}
