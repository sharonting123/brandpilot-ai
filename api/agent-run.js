const { getClientIp, handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { getModelConfig, getSupabaseConfig } = require("./_lib/env");
const { checkRateLimit } = require("./_lib/rate-limit");
const { loadSupabaseContext } = require("./_lib/supabase-context");
const { runHaidilaoWorkflow, runDeterministicAgents } = require("./_lib/agent-workflow");
const {
  buildReportTaskFromWorkflowState,
  buildTaskFromClientPayload,
  enrichWorkflowWithSidecarReport,
  getSidecarConfig,
  requestToolReport
} = require("./_lib/sidecar-client");

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = makeRequestId();

  try {
    if (req.method && req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST /api/agent-run.");
    }

    const rate = checkRateLimit(getClientIp(req));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.allowed) {
      throw new HttpError(429, "RATE_LIMITED", "Agent requests are temporarily rate limited.");
    }

    const body = await readJson(req, { limitBytes: 96 * 1024 });
    if (isSidecarReportRequest(req, body)) {
      return handleSidecarReport(req, res, body, { startedAt, requestId });
    }

    const request = validateAgentRequest(body);
    const modelConfig = getModelConfig(process.env);
    if (!modelConfig.configured) {
      throw new HttpError(
        503,
        "MODEL_API_KEY_NOT_CONFIGURED",
        "服务端未配置 MODEL_API_KEY 或 OPENAI_API_KEY，不能进行真实模型调用。"
      );
    }

    const supabaseContext = await loadSupabaseContext(getSupabaseConfig(process.env), { brandId: "haidilao" });
    const result = await runHaidilaoWorkflow({
      modelConfig,
      request,
      requestId,
      supabaseContext
    });

    return sendJson(res, 200, {
      ...result,
      requestId,
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    return handleError(res, error, "AGENT_RUN_FAILED", "多 Agent 工作流执行失败。");
  }
};

function validateAgentRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  }

  const brand = value.brand && typeof value.brand === "object" ? value.brand : {};
  return {
    brand: {
      id: "haidilao",
      name: "海底捞",
      title: safeText(brand.title, "海底捞半年度经营提案", 160),
      score: clampScore(brand.score ?? 82),
      metrics: asArray(brand.metrics).slice(0, 8),
      insights: asArray(brand.insights).slice(0, 8),
      actions: asArray(brand.actions).slice(0, 8)
    },
    scenario: "semiannual",
    scenarioLabel: "半年度提案",
    arMode: safeText(value.arMode, "growth", 40),
    selectedZone: value.selectedZone && typeof value.selectedZone === "object" ? value.selectedZone : {},
    liveMode: safeText(value.liveMode, "pitch", 40),
    budgetSimulation: Number.isFinite(Number(value.budgetSimulation)) ? Number(value.budgetSimulation) : 0
  };
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 82;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function safeText(value, fallback, maxLength) {
  const text = String(value ?? fallback ?? "").trim();
  return text.slice(0, maxLength);
}

function makeRequestId() {
  return `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isSidecarReportRequest(req, body) {
  const url = new URL(req.url || "/api/agent-run", "http://localhost");
  return url.pathname.includes("sidecar-report") || body?.action === "sidecar-report";
}

async function handleSidecarReport(req, res, body, meta) {
  const { startedAt, requestId } = meta;
  const config = getSidecarConfig(process.env);
  if (!config.enabled) {
    return sendJson(res, 503, {
      ok: false,
      error: "SIDECAR_DISABLED",
      message: "请设置 SIDECAR_ENABLED=true 后再调用侧车报告服务。"
    });
  }

  try {
    const taskText =
      (body.task && String(body.task).trim()) ||
      (body.proposal || body.summary || body.charts ? buildTaskFromClientPayload(body) : "");

    if (taskText) {
      const report = await requestToolReport({
        task: taskText,
        requestId,
        fileType: body.fileType || config.reportFileType,
        templateType: body.templateType || config.templateType,
        config
      });
      return sendJson(res, 200, {
        ok: true,
        mode: "direct-task",
        requestId,
        report,
        latencyMs: Date.now() - startedAt
      });
    }

    const supabaseContext = await loadSupabaseContext(getSupabaseConfig(process.env), {
      brandId: body.brandId || "haidilao"
    });

    const state = {
      request: normalizeSidecarRequest(body),
      requestId,
      supabaseContext,
      outputs: {},
      trace: []
    };

    await runDeterministicAgents(state);
    const sidecar = await enrichWorkflowWithSidecarReport(state, process.env);

    return sendJson(res, 200, {
      ok: true,
      mode: "workflow-report",
      requestId,
      taskPreview: buildReportTaskFromWorkflowState(state).slice(0, 1200),
      workflow: {
        agents: state.trace,
        qualityGates: (state.outputs["quality-agent"] && state.outputs["quality-agent"].gates) || []
      },
      sidecar,
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    return sendJson(res, 503, {
      ok: false,
      error: "SIDECAR_REPORT_FAILED",
      message: error.message || "侧车报告服务不可用",
      requestId,
      latencyMs: Date.now() - startedAt
    });
  }
}

function normalizeSidecarRequest(body) {
  const brand = body.brand && typeof body.brand === "object" ? body.brand : {};
  return {
    brand: {
      id: body.brandId || "haidilao",
      name: brand.name || "海底捞",
      title: brand.title || "海底捞半年度经营提案"
    },
    scenario: "semiannual",
    scenarioLabel: "半年度提案"
  };
}
