/**
 * 百炼数字人生成 API
 * POST /api/digital-human  — 提交 TTS + wan2.2-s2v 对口型任务
 * GET  /api/digital-human?taskId=xxx — 轮询任务状态
 */

const { handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const {
  getDashScopeConfig,
  getTaskStatus,
  startDigitalHumanJob,
  truncateForS2v
} = require("./_lib/dashscope-client");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return handleGet(req, res);
    }
    if (req.method === "POST") {
      return handlePost(req, res);
    }
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 GET 或 POST /api/digital-human。");
  } catch (error) {
    return handleError(res, error, "DIGITAL_HUMAN_FAILED", "数字人生成失败。");
  }
};

async function handlePost(req, res) {
  const config = getDashScopeConfig(process.env);
  if (!config.configured) {
    throw new HttpError(
      503,
      "DASHSCOPE_NOT_CONFIGURED",
      "请在环境变量中配置 DASHSCOPE_API_KEY（百炼 API Key，华北2北京地域）。"
    );
  }

  const body = await readJson(req, { limitBytes: 256 * 1024 });
  const text = pickNarrationText(body);
  if (!text) {
    throw new HttpError(400, "TEXT_REQUIRED", "请提供 text、liveScript 或 sceneIndex。");
  }

  const result = await startDigitalHumanJob({
    text,
    imageUrl: body.imageUrl || config.avatarUrl
  });

  return sendJson(res, 200, {
    status: "ok",
    mode: "dashscope_s2v",
    message: "已提交百炼 wan2.2-s2v 对口型任务，请轮询 taskId 获取视频。",
    taskId: result.taskId,
    taskStatus: result.taskStatus,
    audioUrl: result.audioUrl,
    imageUrl: result.imageUrl,
    text: result.text,
    subtitles: result.subtitles,
    provider: result.provider,
    models: result.models,
    pollIntervalSec: 15,
    estimatedWaitMin: "5-10"
  });
}

async function handleGet(req, res) {
  const config = getDashScopeConfig(process.env);
  if (!config.configured) {
    throw new HttpError(503, "DASHSCOPE_NOT_CONFIGURED", "未配置 DASHSCOPE_API_KEY。");
  }

  const url = new URL(req.url || "/", "http://localhost");
  const taskId = String(url.searchParams.get("taskId") || "").trim();
  if (!taskId) {
    throw new HttpError(400, "TASK_ID_REQUIRED", "请提供 taskId 查询参数。");
  }

  const status = await getTaskStatus(taskId, config);
  return sendJson(res, 200, {
    status: "ok",
    ...status,
    done: status.taskStatus === "SUCCEEDED" || status.taskStatus === "FAILED" || status.taskStatus === "CANCELED"
  });
}

function pickNarrationText(body) {
  if (body.text) return truncateForS2v(body.text);

  const liveScript = body.liveScript || null;
  if (!liveScript) return "";

  const sceneIndex = Number.isFinite(Number(body.sceneIndex)) ? Number(body.sceneIndex) : 0;
  const scenes = liveScript.scenes || [];
  if (scenes.length && scenes[sceneIndex]) {
    return truncateForS2v(scenes[sceneIndex].narration || scenes[sceneIndex].title);
  }

  if (liveScript.fullScript) return truncateForS2v(liveScript.fullScript);
  return "";
}
