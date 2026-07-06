/**
 * 阿里云百炼 DashScope 客户端
 * - Qwen-TTS 语音合成
 * - 临时文件上传（oss://）
 * - wan2.2-s2v 数字人对口型视频（图 + 音频 → 口型同步视频）
 */

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";
const DEFAULT_AVATAR_URL =
  "https://www.brdpilot.com/assets/digital-human-anchor-hd.jpg";

/** wan2.2-s2v 参考图规范（见阿里云百炼文档） */
const AVATAR_IMAGE_SPECS = {
  minEdgePx: 400,
  maxEdgePx: 7000,
  formats: ["jpg", "jpeg", "png", "bmp", "webp"],
  recommendedAspect: "1:1 或 3:4 半身/肖像，正面单人",
  recommendedSize: "720×720 或 1440×1797",
  currentSize: "1024×1024"
};

function getDashScopeConfig(env = process.env) {
  const apiKey = env.DASHSCOPE_API_KEY || env.BAILIAN_API_KEY || "";
  const workspaceId = env.DASHSCOPE_WORKSPACE_ID || "";
  const avatarUrl = env.DIGITAL_HUMAN_AVATAR_URL || DEFAULT_AVATAR_URL;
  const ttsModel = env.DASHSCOPE_TTS_MODEL || "qwen3-tts-flash";
  const ttsVoice = env.DASHSCOPE_TTS_VOICE || "Serena";
  const s2vModel = env.DASHSCOPE_S2V_MODEL || "wan2.2-s2v";
  const s2vResolution = env.DASHSCOPE_S2V_RESOLUTION || "480P";
  const s2vMaxChars = clampNumber(env.DASHSCOPE_S2V_MAX_CHARS, 30, 80, 58);
  const timeoutMs = Number(env.DASHSCOPE_TIMEOUT_MS) || 120000;

  return {
    apiKey,
    workspaceId,
    avatarUrl,
    ttsModel,
    ttsVoice,
    s2vModel,
    s2vResolution,
    s2vMaxChars,
    timeoutMs,
    configured: Boolean(apiKey)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function authHeaders(apiKey, extra = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function ossResolveHeaders(apiKey, extra = {}) {
  return authHeaders(apiKey, {
    "X-DashScope-OssResourceResolve": "enable",
    ...extra
  });
}

/**
 * Qwen-TTS 非流式合成，返回音频 URL
 */
async function synthesizeSpeech(text, config = getDashScopeConfig()) {
  const inputText = String(text || "").trim();
  if (!inputText) throw new Error("TTS 文本不能为空");
  if (!config.configured) throw new Error("未配置 DASHSCOPE_API_KEY");

  const response = await fetch(`${DASHSCOPE_BASE}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: authHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.ttsModel,
      input: {
        text: inputText,
        voice: config.ttsVoice,
        language_type: "Chinese"
      }
    }),
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  const payload = await parseJson(response);
  const audio = payload.output && payload.output.audio ? payload.output.audio : null;
  if (!audio) {
    throw new Error(payload.message || payload.code || "TTS 未返回音频");
  }

  return {
    audioUrl: audio.url || null,
    audioBase64: audio.data || null,
    audioId: audio.id || null,
    requestId: payload.request_id
  };
}

/**
 * 上传 Buffer 到百炼临时 OSS，返回 oss:// URL
 */
async function uploadBuffer(buffer, fileName, modelName, config = getDashScopeConfig()) {
  const policyRes = await fetch(
    `${DASHSCOPE_BASE}/uploads?action=getPolicy&model=${encodeURIComponent(modelName)}`,
    {
      headers: authHeaders(config.apiKey),
      signal: AbortSignal.timeout(30000)
    }
  );
  const policyPayload = await parseJson(policyRes);
  const policy = policyPayload.data;
  if (!policy) throw new Error("获取上传凭证失败");

  const key = `${policy.upload_dir}/${fileName}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  form.append("file", new Blob([buffer]), fileName);

  const uploadRes = await fetch(policy.upload_host, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000)
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`上传音频失败 HTTP ${uploadRes.status} ${errText.slice(0, 120)}`);
  }

  return `oss://${key}`;
}

async function resolveAudioUrlForS2v(ttsResult, config) {
  if (ttsResult.audioUrl && ttsResult.audioUrl.startsWith("http")) {
    return ttsResult.audioUrl;
  }
  if (ttsResult.audioBase64) {
    const buffer = Buffer.from(ttsResult.audioBase64, "base64");
    return uploadBuffer(buffer, `bp_tts_${Date.now()}.wav`, config.s2vModel, config);
  }
  throw new Error("TTS 未返回可用音频 URL");
}

/**
 * 创建 wan2.2-s2v 对口型视频任务（异步）
 */
async function createS2vTask(imageUrl, audioUrl, config = getDashScopeConfig()) {
  const response = await fetch(`${DASHSCOPE_BASE}/services/aigc/image2video/video-synthesis`, {
    method: "POST",
    headers: ossResolveHeaders(config.apiKey, { "X-DashScope-Async": "enable" }),
    body: JSON.stringify({
      model: config.s2vModel,
      input: {
        image_url: imageUrl,
        audio_url: audioUrl
      },
      parameters: {
        resolution: config.s2vResolution,
        style: "speech"
      }
    }),
    signal: AbortSignal.timeout(60000)
  });

  const payload = await parseJson(response);
  const taskId = payload.output && payload.output.task_id;
  if (!taskId) {
    throw new Error(payload.message || payload.code || "数字人视频任务创建失败");
  }

  return {
    taskId,
    taskStatus: payload.output.task_status || "PENDING",
    requestId: payload.request_id
  };
}

/**
 * 查询异步任务状态
 */
async function getTaskStatus(taskId, config = getDashScopeConfig()) {
  const response = await fetch(`${DASHSCOPE_BASE}/tasks/${encodeURIComponent(taskId)}`, {
    headers: authHeaders(config.apiKey),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await parseJson(response);
  const output = payload.output || {};
  return {
    taskId: output.task_id || taskId,
    taskStatus: output.task_status || "UNKNOWN",
    videoUrl: output.results && output.results.video_url ? output.results.video_url : null,
    code: output.code || null,
    message: output.message || null,
    usage: payload.usage || null,
    requestId: payload.request_id
  };
}

/**
 * 一站式：文本 → TTS → wan2.2-s2v 任务
 */
async function startDigitalHumanJob(params = {}) {
  const config = getDashScopeConfig();
  const text = truncateForS2v(params.text || "");
  const imageUrl = params.imageUrl || config.avatarUrl;

  const tts = await synthesizeSpeech(text, config);
  const audioUrl = await resolveAudioUrlForS2v(tts, config);
  const task = await createS2vTask(imageUrl, audioUrl, config);

  return {
    provider: "dashscope",
    models: {
      tts: config.ttsModel,
      s2v: config.s2vModel
    },
    text,
    audioUrl,
    imageUrl,
    subtitles: buildSubtitles(text),
    ...task
  };
}

function buildSubtitles(text) {
  const chunks = splitSubtitleChunks(text, 28);
  const totalSec = estimateSpeechSec(text);
  const perChunkSec = chunks.length ? totalSec / chunks.length : totalSec;
  return chunks.map((line, index) => ({
    index,
    text: line,
    startSec: Number((index * perChunkSec).toFixed(2)),
    endSec: Number(((index + 1) * perChunkSec).toFixed(2))
  }));
}

/** 中文口播粗略估时：约 3.2 字/秒，用于字幕分段 */
function estimateSpeechSec(text) {
  const len = String(text || "").replace(/\s+/g, "").length;
  return Math.max(2, Math.min(19, Number((len / 3.2).toFixed(2))));
}

/**
 * 将长口播切成多段，每段控制在百炼 20 秒音频上限内（默认约 58 字/段）
 */
function splitNarrationSegments(text, maxChars = 58) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return [];
  if (value.length <= maxChars) return [value];

  const segments = [];
  let rest = value;
  while (rest.length > 0) {
    if (rest.length <= maxChars) {
      segments.push(rest);
      break;
    }
    let chunk = rest.slice(0, maxChars);
    const lastStop = Math.max(
      chunk.lastIndexOf("。"),
      chunk.lastIndexOf("！"),
      chunk.lastIndexOf("？"),
      chunk.lastIndexOf("；"),
      chunk.lastIndexOf("，"),
      chunk.lastIndexOf("、"),
      chunk.lastIndexOf(" ")
    );
    if (lastStop >= 18) {
      chunk = rest.slice(0, lastStop + 1);
    }
    segments.push(chunk.trim());
    rest = rest.slice(chunk.length).trim();
  }
  return segments.filter(Boolean);
}

function truncateForS2v(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const maxChars = getDashScopeConfig().s2vMaxChars || 58;
  if (value.length <= maxChars) return value;
  return splitNarrationSegments(value, maxChars)[0] || value.slice(0, maxChars);
}

function splitSubtitleChunks(text, maxLen) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const parts = raw.split(/(?<=[。！？；，、])/);
  const lines = [];
  let buf = "";
  for (const part of parts) {
    if ((buf + part).length <= maxLen) {
      buf += part;
    } else {
      if (buf) lines.push(buf);
      buf = part;
    }
  }
  if (buf) lines.push(buf);
  return lines.length ? lines : [raw.slice(0, maxLen)];
}

async function parseJson(response) {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    const msg = payload.message || payload.error || payload.code || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return payload;
}

module.exports = {
  AVATAR_IMAGE_SPECS,
  DEFAULT_AVATAR_URL,
  getDashScopeConfig,
  synthesizeSpeech,
  uploadBuffer,
  createS2vTask,
  getTaskStatus,
  startDigitalHumanJob,
  truncateForS2v,
  splitNarrationSegments,
  buildSubtitles
};
