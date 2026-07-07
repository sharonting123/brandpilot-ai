const { getClientIp, handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { checkRateLimit } = require("./_lib/rate-limit");
const { getSupabaseConfig } = require("./_lib/env");
const { loadSupabaseContext } = require("./_lib/supabase-context");
const { runDeterministicAgents } = require("./_lib/agent-workflow");
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
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST /api/sidecar-report.");
    }

    const rate = checkRateLimit(getClientIp(req));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rate.resetAt / 1000)));
    if (!rate.allowed) {
      throw new HttpError(429, "RATE_LIMITED", "Report requests are temporarily rate limited.");
    }

    const body = await readJson(req, { limitBytes: 96 * 1024 });
    const config = getSidecarConfig(process.env);
    if (!config.enabled) {
      throw new HttpError(503, "SIDECAR_DISABLED", "请设置 SIDECAR_ENABLED=true 后再调用侧车报告服务。");
    }

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
      request: normalizeRequest(body),
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
    return handleError(res, error, "SIDECAR_REPORT_FAILED", "侧车报告生成失败。");
  }
};

function normalizeRequest(body) {
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

function makeRequestId() {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
