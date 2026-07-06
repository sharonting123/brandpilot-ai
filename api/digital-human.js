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
  splitNarrationSegments
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
  const { segmentText, allSegments, segmentIndex } = resolveSegments(body, config);

  if (!segmentText) {
    throw new HttpError(400, "TEXT_REQUIRED", "请提供 text、liveScript 或 sceneIndex。");
  }

  const result = await startDigitalHumanJob({
    text: segmentText,
    imageUrl: body.imageUrl || config.avatarUrl
  });

  const total = allSegments.length;
  const waitMin = total > 1 ? `${5 * total}–${10 * total}` : "5–10";

  return sendJson(res, 200, {
    status: "ok",
    mode: total > 1 ? "dashscope_s2v_batch" : "dashscope_s2v",
    message:
      total > 1
        ? `已提交第 ${segmentIndex + 1}/${total} 段对口型任务，完成后将自动继续下一段。`
        : "已提交百炼 wan2.2-s2v 对口型任务，请轮询 taskId 获取视频。",
    taskId: result.taskId,
    taskStatus: result.taskStatus,
    audioUrl: result.audioUrl,
    imageUrl: result.imageUrl,
    text: result.text,
    subtitles: result.subtitles,
    provider: result.provider,
    models: result.models,
    batch: {
      total,
      current: segmentIndex,
      segments: allSegments
    },
    pollIntervalSec: 15,
    estimatedWaitMin: waitMin
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

function resolveSegments(body, config) {
  if (body.text) {
    const text = String(body.text || "").trim();
    return {
      segmentText: text,
      allSegments: [text],
      segmentIndex: 0
    };
  }

  const fullText = resolveNarrationText(body);
  const allSegments = splitNarrationSegments(fullText, config.s2vMaxChars);
  const segmentIndex = Number.isFinite(Number(body.segmentIndex))
    ? Math.max(0, Number(body.segmentIndex))
    : 0;
  const segmentText = allSegments[segmentIndex] || allSegments[0] || "";

  return { segmentText, allSegments, segmentIndex };
}

function resolveNarrationText(body) {
  const liveScript = body.liveScript || null;
  if (!liveScript) return "";

  const sceneIndex = Number.isFinite(Number(body.sceneIndex)) ? Number(body.sceneIndex) : 0;
  const scenes = liveScript.scenes || [];
  if (scenes.length && scenes[sceneIndex]) {
    return String(scenes[sceneIndex].narration || scenes[sceneIndex].title || "").trim();
  }

  if (liveScript.fullScript) return String(liveScript.fullScript).trim();
  return "";
}
