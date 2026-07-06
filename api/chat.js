/**
 * api/chat.js — BrandPilot AI 主入口
 * POST /api/chat  { message: string, brandHint?: string, history?: [] }
 *
 * 架构：意图识别路由 → 工作流分发 → Agent 执行（NL2SQL/RAG/工具）→ 事件持久化 → 统一响应
 */

const { handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { getModelConfig, getSupabaseConfig } = require("./_lib/env");
const { recognizeIntent, workflowLabel } = require("./_lib/intent-router");
const { resetContextCache, getContext } = require("./_lib/agent-tools");
const { persistWorkflowRun } = require("./_lib/event-store");
const { buildLiveScript } = require("./_lib/live-script");

const WORKFLOW_REGISTRY = {
  annual_proposal: () => require("./_lib/workflows/annual_proposal"),
  funnel_diagnosis: () => require("./_lib/workflows/funnel_diagnosis"),
  competitor_benchmark: () => require("./_lib/workflows/competitor_benchmark"),
  data_query: () => require("./_lib/workflows/data_query")
};

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = makeRequestId();

  try {
    if (req.method && req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 POST /api/chat。");
    }

    const body = await readJson(req, { limitBytes: 128 * 1024 });
    const message = String(body.message || "").trim();
    if (!message) {
      throw new HttpError(400, "MESSAGE_REQUIRED", "请提供 message 字段。");
    }

    const brandHint = String(body.brandHint || "haidilao").trim();
    const brandId = brandHint === "海底捞" ? "haidilao" : brandHint;
    const brandName = brandId === "haidilao" ? "海底捞" : brandHint;
    const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
    const modelConfig = getModelConfig(process.env);

    const intentStart = Date.now();
    const intent = await recognizeIntent(message, modelConfig);
    const intentTrace = {
      name: "意图识别路由",
      tool: intent.recognitionMode,
      summary:
        "识别为「" +
        workflowLabel(intent.workflow) +
        "」（置信度 " +
        (intent.confidence * 100).toFixed(0) +
        "%）: " +
        intent.reasoning,
      durationMs: Date.now() - intentStart
    };

    resetContextCache();

    const workflowLoader = WORKFLOW_REGISTRY[intent.workflow];
    if (!workflowLoader) {
      throw new HttpError(400, "UNKNOWN_WORKFLOW", "未知工作流：" + intent.workflow);
    }

    const workflowModule = workflowLoader();
    const workflowResult = await workflowModule.execute({
      message,
      modelConfig,
      brandName,
      intentParams: intent.params || {},
      history
    });

    let dataMode = "fixture";
    let warnings = [];
    let scene = null;
    try {
      const ctx = await getContext(brandId);
      dataMode = ctx.dataMode || "fixture";
      warnings = ctx.warnings || [];
      scene = buildArScene(ctx, workflowResult);
    } catch (err) {
      warnings.push("场景数据加载失败：" + err.message);
    }

    const agentTrace = [intentTrace, ...(workflowResult.agentTrace || [])];
    const liveScript = buildLiveScript({
      brandName,
      workflow: intent.workflow,
      proposal: workflowResult.proposal || null,
      answer: workflowResult.answer || "",
      charts: workflowResult.charts || []
    });

    const persistResult = await persistWorkflowRun({
      requestId,
      brandId,
      brandName,
      workflow: intent.workflow,
      message,
      intent: {
        confidence: intent.confidence,
        reasoning: intent.reasoning,
        recognitionMode: intent.recognitionMode
      },
      agentTrace,
      proposal: workflowResult.proposal || null,
      answer: workflowResult.answer || "",
      charts: workflowResult.charts || [],
      dataMode,
      warnings: [...warnings, ...(workflowResult.warnings || [])],
      totalDurationMs: Date.now() - startedAt
    });

    if (persistResult.warning) warnings.push(persistResult.warning);

    const supabaseConfig = getSupabaseConfig(process.env);
    const response = {
      requestId,
      workflow: intent.workflow,
      workflowLabel: workflowLabel(intent.workflow),
      intent: {
        confidence: intent.confidence,
        reasoning: intent.reasoning,
        recognitionMode: intent.recognitionMode
      },
      agentTrace,
      answer: workflowResult.answer || "分析完成，请查看右侧面板。",
      charts: workflowResult.charts || [],
      proposal: workflowResult.proposal || null,
      liveScript,
      scene,
      persistence: {
        mode: persistResult.mode,
        persisted: persistResult.persisted,
        proposalId: persistResult.proposalId,
        eventCount: (persistResult.eventIds || []).length
      },
      dataMode,
      warnings: [...warnings, ...(workflowResult.warnings || [])],
      supabaseStatus: supabaseConfig.configured ? "已连接" : "未配置",
      capabilities: {
        nl2sql: true,
        rag: true,
        eventPersistence: true,
        arScene: Boolean(scene),
        digitalHuman: true
      },
      totalDurationMs: Date.now() - startedAt
    };

    return sendJson(res, 200, response);
  } catch (error) {
    return handleError(res, error, "CHAT_FAILED", "Agent 编排执行失败。");
  }
};

function buildArScene(ctx, workflowResult) {
  const cities = (ctx.cityMonthlyFacts || [])
    .slice()
    .sort((a, b) => (b.gmv || 0) - (a.gmv || 0))
    .slice(0, 8)
    .map((c, index) => ({
      id: "city_" + index,
      name: c.city,
      gmv: c.gmv || 0,
      roi: c.roi || 0,
      verifiedRate: c.paid_orders ? (c.verified_orders || 0) / c.paid_orders : 0,
      storeCount: c.store_count || 0,
      position: cityPosition(c.city, index)
    }));

  let funnel = [];
  const funnelChart = (workflowResult.charts || []).find((c) => c.type === "funnel");
  if (funnelChart && funnelChart.data) {
    funnel = (funnelChart.data.labels || []).map((label, index) => ({
      stage: label,
      value: funnelChart.data.datasets && funnelChart.data.datasets[0]
        ? funnelChart.data.datasets[0].data[index]
        : 0
    }));
  }

  const pois = (ctx.pois || []).slice(0, 12).map((p, index) => ({
    id: p.poi_id || "poi_" + index,
    name: p.poi_name,
    city: p.city,
    position: {
      x: ((index % 4) - 1.5) * 2.2,
      y: 0.2,
      z: (Math.floor(index / 4) - 1) * 2.2
    }
  }));

  return {
    brandName: (ctx.brandProfile && ctx.brandProfile.brand_name) || "海底捞",
    cities,
    funnel,
    pois,
    opportunityScore:
      (workflowResult.proposal && workflowResult.proposal.opportunityScore) || 80,
    summary:
      (workflowResult.proposal && workflowResult.proposal.summary) ||
      String(workflowResult.answer || "").slice(0, 80)
  };
}

function cityPosition(city, index) {
  const presets = {
    上海: { x: 2.4, y: 0, z: 1.2 },
    北京: { x: 0.4, y: 0, z: 2.6 },
    深圳: { x: 2.8, y: 0, z: -1.4 },
    成都: { x: -2.2, y: 0, z: -0.6 },
    杭州: { x: 1.6, y: 0, z: 0.2 },
    广州: { x: 2.1, y: 0, z: -2.1 },
    南京: { x: 0.8, y: 0, z: 1.1 },
    武汉: { x: -0.6, y: 0, z: -0.2 }
  };
  if (presets[city]) return presets[city];
  const angle = (index / 8) * Math.PI * 2;
  return { x: Math.cos(angle) * 2.5, y: 0, z: Math.sin(angle) * 2.5 };
}

function makeRequestId() {
  return "bp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
