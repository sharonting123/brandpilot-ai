/**
 * Chat 编排主流程（JSON / SSE 共用）
 */

const { HttpError } = require("./http");
const { getModelConfig, getSupabaseConfig } = require("./env");
const { recognizeIntent, workflowLabel, recognitionModeLabel } = require("./intent-router");
const { mergeTokenUsage, emptyTokenUsage } = require("./token-usage");
const { appendMessages } = require("./chat-store");
const {
  buildUserMessageRecord,
  buildAssistantMessageRecord,
  buildModelSnapshot
} = require("./message-persistence");
const { resetContextCache, getContext } = require("./agent-tools");
const { persistWorkflowRun } = require("./event-store");
const { filterWorkflowCharts } = require("./chart-policy");
const { normalizeCharts } = require("./chart-normalize");
const { buildDataSpec, attachDataSpecToCharts } = require("./data-spec");
const { composeMessageWithAttachments } = require("./document-parser");
const { buildDrillMetrics } = require("./drill-data");
const { streamTextChunks } = require("./sse");
const {
  resetCitationRegistry,
  getEnrichedCitationRegistry
} = require("./citation-registry");
const {
  buildAgentDossier,
  enrichProposalWithReferences
} = require("./agent-dossier");
const {
  friendlyStepName,
  friendlyTool,
  friendlyStepSummary,
  friendlyDuration,
  sanitizeTechTerms
} = require("./friendly-steps");
const { runQualityGates } = require("./quality-gates");
const { inferStepStatus } = require("./step-status");
const WORKFLOW_REGISTRY = {
  greeting: () => require("./workflows/greeting"),
  document_qa: () => require("./workflows/document_qa"),
  annual_proposal: () => require("./workflows/annual_proposal"),
  funnel_diagnosis: () => require("./workflows/funnel_diagnosis"),
  competitor_benchmark: () => require("./workflows/competitor_benchmark"),
  period_compare: () => require("./workflows/period_compare"),
  data_query: () => require("./workflows/data_query")
};

function isLightweightWorkflow(workflow) {
  return workflow === "greeting" || workflow === "document_qa";
}

function workflowStartSummary(workflow) {
  if (workflow === "greeting") return "悦悦跟你打个招呼…";
  return "开始帮你查数、算指标、写分析…";
}

function getDisplayReferences(brandId = "haidilao") {
  return getEnrichedCitationRegistry(brandId).filter((ref) => ref.type !== "agent");
}

function emitFriendlyStep(emit, payload) {
  if (!emit) return;
  const status =
    payload.status === "running"
      ? "running"
      : inferStepStatus(payload);
  emit("step", {
    ...payload,
    status,
    name: friendlyStepName(payload.name),
    tool: payload.tool ? friendlyTool(payload.tool) : undefined,
    summary: friendlyStepSummary(payload)
  });
}

function emitFriendlyStart(emit, id, name, summary, meta) {
  if (!emit) return;
  const options = meta || {};
  emit("step_start", {
    id,
    name: friendlyStepName(name),
    summary: friendlyStepSummary({ name, summary }),
    parentId: options.parentId || null,
    level: options.level != null ? options.level : options.parentId ? 2 : 1,
    group: options.group || null,
    workflow: options.workflow || null,
    routeReason: options.routeReason || null
  });
}

function inferWorkflowStepGroup(name) {
  const value = String(name || "");
  if (/指标粒度|选表|Data Query|QueryPlan|SQL|NL2SQL|时间语义|目标粒度|统一查数/.test(value)) {
    return "query";
  }
  if (/结构化|提案卡片/.test(value)) return "package";
  return "analysis";
}

function createProgressEmitter(emit) {
  let counter = 0;
  return {
    start(name, summary, meta) {
      if (!emit) return null;
      counter += 1;
      const id = (meta && meta.id) || "step_" + counter;
      emitFriendlyStart(emit, id, name, summary || `正在${friendlyStepName(name)}…`, meta || {});
      return id;
    },
    done(step) {
      if (!emit || !step) return;
      counter += 1;
      emitFriendlyStep(emit, { id: "step_" + counter, status: "done", ...step });
    },
    delta(text) {
      if (emit && text) emit("answer_delta", { text });
    }
  };
}

async function runChatRequest(ctx) {
  const {
    message,
    attachments = [],
    brandId,
    brandName,
    history,
    modelConfig,
    authUser,
    sessionId,
    emit
  } = ctx;

  const startedAt = Date.now();
  const requestId = makeRequestId();
  const progress = createProgressEmitter(emit);
  const effectiveMessage = composeMessageWithAttachments(message, attachments);

  const intentId = progress.start("意图识别路由", "意图识别中…", {
    parentId: "local_start",
    level: 1,
    group: "intent"
  });
  const intentStart = Date.now();
  const intent = await recognizeIntent(message, modelConfig, { attachments });
  const intentTrace = {
    name: "意图识别路由",
    tool: recognitionModeLabel(intent.recognitionMode),
    group: "intent",
    workflow: intent.workflow,
    routeReason: intent.reasoning,
    summary: sanitizeTechTerms(
      "识别为「" +
      workflowLabel(intent.workflow) +
      "」（置信度 " +
      (intent.confidence * 100).toFixed(0) +
      "%）: " +
      intent.reasoning +
      (intent.llmError ? " [智能分析: " + intent.llmError + "]" : "")
    ),
    durationMs: Date.now() - intentStart
  };
  if (emit) {
    emitFriendlyStep(emit, {
      id: intentId,
      status: "done",
      parentId: "local_start",
      level: 1,
      group: "intent",
      workflow: intent.workflow,
      routeReason: intent.reasoning,
      ...intentTrace
    });
    if (intent.analysisSlots && Array.isArray(intent.analysisSlots.steps)) {
      intent.analysisSlots.steps.forEach((step, index) => {
        emitFriendlyStep(emit, {
          id: intentId + "_slot_" + (index + 1),
          status: "done",
          parentId: intentId,
          level: 2,
          group: "planning",
          name: step.label,
          tool: step.stage,
          summary: step.summary,
          durationMs: 0
        });
      });
    }
  }

  resetContextCache();
  resetCitationRegistry();

  const workflowLoader = WORKFLOW_REGISTRY[intent.workflow];
  if (!workflowLoader) {
    throw new HttpError(400, "UNKNOWN_WORKFLOW", "未知工作流：" + intent.workflow);
  }

  const workflowModule = workflowLoader();
  const workflowId = progress.start(
    workflowLabel(intent.workflow),
    workflowStartSummary(intent.workflow),
    {
      parentId: "local_start",
      level: 1,
      group: "workflow",
      workflow: intent.workflow
    }
  );

  let workflowSubSeq = 0;
  let openWorkflowSubId = null;

  function finishOpenWorkflowSub(step) {
    if (!emit || !openWorkflowSubId) return;
    emitFriendlyStep(emit, {
      id: openWorkflowSubId,
      status: inferStepStatus(step || {}),
      parentId: workflowId,
      level: 2,
      ...(step || {})
    });
    openWorkflowSubId = null;
  }

  const workflowResult = await workflowModule.execute({
    message: effectiveMessage,
    userMessage: message,
    attachments,
    modelConfig,
    brandId,
    brandName,
    intentParams: intent.params || {},
    history,
    onProgress: (step) => {
      if (!emit) return;

      if (step.phase === "start") {
        finishOpenWorkflowSub();
        emitFriendlyStep(emit, {
          id: workflowId,
          status: "done",
          parentId: "local_start",
          level: 1,
          group: "workflow",
          workflow: intent.workflow,
          name: workflowLabel(intent.workflow),
          tool: "workflow",
          summary: step.summary || workflowStartSummary(intent.workflow)
        });
        workflowSubSeq += 1;
        openWorkflowSubId = workflowId + "_sub_" + workflowSubSeq;
        emitFriendlyStart(emit, openWorkflowSubId, step.name, step.summary, {
          parentId: workflowId,
          level: 2,
          group: step.group || "analysis"
        });
        return;
      }

      if (step.phase === "update") {
        if (!openWorkflowSubId) return;
        emitFriendlyStep(emit, {
          id: openWorkflowSubId,
          status: "running",
          parentId: workflowId,
          level: 2,
          group: step.group || "analysis",
          name: step.name,
          tool: step.tool,
          summary: step.summary
        });
        return;
      }

      if (step.phase === "done") {
        if (!openWorkflowSubId) return;
        emitFriendlyStep(emit, {
          id: openWorkflowSubId,
          status: inferStepStatus(step),
          parentId: workflowId,
          level: 2,
          group: step.group || "analysis",
          name: step.name,
          tool: step.tool,
          summary: step.summary,
          durationMs: step.durationMs
        });
        openWorkflowSubId = null;
        return;
      }

      finishOpenWorkflowSub();
      workflowSubSeq += 1;
      const subId = workflowId + "_sub_" + workflowSubSeq;
      const subGroup = step.group || inferWorkflowStepGroup(step.name);
      emitFriendlyStep(emit, {
        id: subId,
        status: inferStepStatus(step),
        parentId: workflowId,
        level: 2,
        group: subGroup,
        name: step.name,
        tool: step.tool,
        summary: step.summary || friendlyStepSummary(step),
        durationMs: step.durationMs
      });
    }
  });

  finishOpenWorkflowSub();

  if (emit) {
    emitFriendlyStep(emit, {
      id: workflowId,
      status: "done",
      parentId: "local_start",
      level: 1,
      group: "workflow",
      workflow: intent.workflow,
      name: workflowLabel(intent.workflow),
      tool: "workflow",
      summary: "工作流执行完成",
      durationMs: workflowResult.totalDurationMs || Date.now() - startedAt
    });
  }

  let dataMode = "empty";
  let warnings = [];
  let dataSpec = null;
  let context = null;
  let drillMetrics = null;
  let agentTrace = [
    { ...intentTrace, group: "intent", status: inferStepStatus(intentTrace) }
  ];
  if (intent.analysisSlots && Array.isArray(intent.analysisSlots.steps)) {
    intent.analysisSlots.steps.forEach((step) => {
      agentTrace.push({
        name: step.label,
        tool: step.stage,
        summary: step.summary,
        durationMs: 0,
        group: "planning",
        status: "done"
      });
    });
  }
  agentTrace.push(...(workflowResult.agentTrace || []));

  if (!isLightweightWorkflow(intent.workflow)) {
    const contextId = progress.start("经营数据", "加载品牌经营数据…", {
      parentId: "local_start",
      level: 1,
      group: "post"
    });
    const contextStart = Date.now();
    context = await getContext(brandId);
    dataMode = context.dataMode || "empty";
    warnings = context.warnings || [];
    dataSpec = buildDataSpec({
      message: effectiveMessage,
      workflow: intent.workflow,
      intentParams: intent.params || {},
      context,
      dataMode
    });
    drillMetrics = buildDrillMetrics(context, {
      message: effectiveMessage,
      workflow: intent.workflow,
      intentParams: intent.params || {},
      dataSpec
    });

    const contextTrace = {
      name: "经营数据",
      tool: dataMode === "supabase" ? "Supabase" : "empty",
      summary:
        dataMode === "supabase"
          ? "已连接 Supabase 经营底表"
          : "当前无可用经营数据",
      durationMs: Date.now() - contextStart
    };
    agentTrace.push(contextTrace);
    if (emit) {
      emitFriendlyStep(emit, {
        id: contextId,
        status: inferStepStatus(contextTrace),
        parentId: "local_start",
        level: 1,
        group: "post",
        ...contextTrace
      });
    }
  } else {
    warnings = workflowResult.warnings || [];
  }

  let persistResult = {
    persisted: false,
    mode: "skipped",
    warning: null,
    eventIds: [],
    proposalId: null
  };

  if (!isLightweightWorkflow(intent.workflow)) {
    const persistId = progress.start("事件持久化", "把这次分析记下来…", {
      parentId: "local_start",
      level: 1,
      group: "post"
    });
    const persistStart = Date.now();
    try {
      persistResult = await persistWorkflowRun({
        requestId,
        brandId,
        brandName,
        workflow: intent.workflow,
        message,
        intent: {
          confidence: intent.confidence,
          reasoning: intent.reasoning,
          recognitionMode: intent.recognitionMode,
          recognitionModeLabel: recognitionModeLabel(intent.recognitionMode),
          llmError: intent.llmError || null
        },
        agentTrace,
        proposal: workflowResult.proposal || null,
        answer: workflowResult.answer || "",
        charts: workflowResult.charts || [],
        dataMode,
        warnings: [...warnings, ...(workflowResult.warnings || [])],
        totalDurationMs: Date.now() - startedAt
      });
    } catch (persistError) {
      persistResult = {
        persisted: false,
        mode: "failed",
        error: persistError.message,
        warning: "事件持久化失败：" + persistError.message,
        eventIds: [],
        proposalId: null
      };
    }

    const persistTrace = {
      name: "事件持久化",
      tool: persistResult.persisted ? persistResult.mode || "supabase" : "failed",
      summary: persistResult.persisted
        ? "已写入 " + ((persistResult.eventIds || []).length) + " 条 Agent 事件"
        : persistResult.warning || "事件持久化失败",
      durationMs: Date.now() - persistStart
    };
    agentTrace.push(persistTrace);
    if (emit) {
      emitFriendlyStep(emit, {
        id: persistId,
        status: inferStepStatus(persistTrace),
        parentId: "local_start",
        level: 1,
        group: "post",
        ...persistTrace
      });
    }

    if (persistResult.warning) warnings.push(persistResult.warning);
  }

  const responseCharts = normalizeCharts(
    attachDataSpecToCharts(
      filterWorkflowCharts(workflowResult.charts || [], {
        message: effectiveMessage,
        workflow: intent.workflow,
        agentTrace
      }),
      dataSpec
    )
  );

  const answer =
    workflowResult.answer ||
    (isLightweightWorkflow(intent.workflow) ? "你好！" : "分析完成，请查看右侧面板。");
  if (emit) {
    const answerId = progress.start("生成回答", "正在把结论写成你能直接看的文字…", {
      parentId: "local_start",
      level: 1,
      group: "post"
    });
    await streamTextChunks(answer, emit, { chunkSize: 28, delayMs: 10 });
    emitFriendlyStep(emit, {
      id: answerId,
      status: "done",
      parentId: "local_start",
      level: 1,
      group: "post",
      name: "生成回答",
      tool: "stream",
      summary: "回答已生成",
      durationMs: Date.now() - startedAt
    });
  }

  const supabaseConfig = getSupabaseConfig(process.env);
  const tokenUsage = mergeTokenUsage(
    intent.tokenUsage || emptyTokenUsage(),
    workflowResult.tokenUsage || emptyTokenUsage()
  );

  const references = getDisplayReferences(brandId);
  const enrichedProposal = workflowResult.proposal
    ? enrichProposalWithReferences(workflowResult.proposal, references)
    : null;
  const quality = runQualityGates({
    answer,
    references,
    calculations: workflowResult.calculations || [],
    dataMode,
    requireReferences: !["data_query", "greeting", "document_qa"].includes(intent.workflow),
    proposal: enrichedProposal
  });
  if (quality.issues.length) {
    warnings.push(...quality.issues.map((item) => item.message));
  }
  const dossier = isLightweightWorkflow(intent.workflow)
    ? null
    : buildAgentDossier({
        workflow: intent.workflow,
        workflowLabel: workflowLabel(intent.workflow),
        brandName,
        period: (intent.params && intent.params.period) || (dataSpec && dataSpec.period && dataSpec.period.label) || "",
        agentTrace,
        proposal: enrichedProposal,
        references
      });

  const response = {
    requestId,
    workflow: intent.workflow,
    workflowLabel: workflowLabel(intent.workflow),
    intent: {
      confidence: intent.confidence,
      reasoning: intent.reasoning,
      recognitionMode: intent.recognitionMode,
      recognitionModeLabel: recognitionModeLabel(intent.recognitionMode),
      confidenceMeta: intent.confidenceMeta || null,
      llmError: intent.llmError || null
    },
    tokenUsage,
    agentTrace,
    model: buildModelSnapshot(modelConfig),
    answer,
    charts: responseCharts,
    proposal: enrichedProposal,
    references,
    quality,
    dossier,
    scene: isLightweightWorkflow(intent.workflow)
      ? null
      : buildArSandboxScene(drillMetrics, { ...workflowResult, proposal: enrichedProposal }),
    dataSpec,
    persistence: {
      mode: persistResult.mode,
      persisted: persistResult.persisted,
      proposalId: persistResult.proposalId,
      eventCount: (persistResult.eventIds || []).length
    },
    dataMode,
    warnings: [...warnings, ...(workflowResult.warnings || [])],
    calculations: workflowResult.calculations || [],
    supabaseStatus: supabaseConfig.configured ? "已连接" : "未配置",
    capabilities: {
      nl2sql: true,
      rag: true,
      eventPersistence: true,
      arScene: true
    },
    totalDurationMs: Date.now() - startedAt
  };

  if (authUser && sessionId) {
    const saveId = progress.start("保存对话", "放进左侧历史记录…", {
      parentId: "local_start",
      level: 1,
      group: "post"
    });
    try {
      await appendMessages(sessionId, authUser.id, [
        buildUserMessageRecord({
          message,
          attachments,
          brandId,
          requestId
        }),
        buildAssistantMessageRecord(response, {
          requestId,
          brandId,
          userMessage: message,
          modelConfig,
          messageSavedAt: new Date().toISOString()
        })
      ]);
      response.sessionId = sessionId;
      response.messageSaved = true;
      if (emit) {
        emitFriendlyStep(emit, {
          id: saveId,
          status: "done",
          parentId: "local_start",
          level: 1,
          group: "post",
          name: "保存对话",
          tool: "supabase",
          summary: "对话已保存",
          durationMs: 0
        });
      }
    } catch (saveError) {
      response.warnings = [...(response.warnings || []), "对话保存失败：" + saveError.message];
      response.messageSaved = false;
      if (emit) {
        emitFriendlyStep(emit, {
          id: saveId,
          status: "error",
          parentId: "local_start",
          level: 1,
          group: "post",
          name: "保存对话",
          tool: "error",
          summary: saveError.message,
          durationMs: 0
        });
      }
    }
  }

  return response;
}

function buildArSandboxScene(drillMetrics, workflowResult) {
  const cities = (drillMetrics.cities || []).map((city, index) => {
    const coordinate = cityCoordinate(city.name, index);
    return {
      id: city.id || "city_" + index,
      name: city.name,
      gmv: city.gmv || 0,
      roi: city.roi || 0,
      verifiedRate: city.verifiedRate || 0,
      storeCount: city.storeCount || 0,
      paidOrders: city.paidOrders || 0,
      verifiedOrders: city.verifiedOrders || 0,
      adSpend: city.adSpend || 0,
      avgOrderValue: city.avgOrderValue || 0,
      coordinate
    };
  });

  const cityByName = new Map(cities.map((city) => [city.name, city]));
  const districts = (drillMetrics.districts || []).map((district, index) => ({
    ...district,
    coordinate: offsetCoordinate(
      (cityByName.get(district.city) && cityByName.get(district.city).coordinate) || cityCoordinate(district.city, index),
      index,
      0.42
    )
  }));

  const districtByPoi = new Map();
  districts.forEach((district) => {
    (district.pois || []).forEach((poiId) => districtByPoi.set(poiId, district));
  });

  const pois = (drillMetrics.pois || []).map((poi, index) => {
    const district = districtByPoi.get(poi.id);
    const base = district
      ? district.coordinate
      : ((cityByName.get(poi.city) && cityByName.get(poi.city).coordinate) || cityCoordinate(poi.city, index));
    return {
      ...poi,
      coordinate: offsetCoordinate(base, index, 0.22)
    };
  });

  return {
    type: "ar_china_sandbox",
    brandName: (drillMetrics.brand && drillMetrics.brand.brandName) || "海底捞",
    dateRange: drillMetrics.dateRange || null,
    brand: drillMetrics.brand || null,
    cities,
    districts,
    pois,
    opportunityScore:
      (workflowResult.proposal && workflowResult.proposal.opportunityScore) || 80,
    summary:
      (workflowResult.proposal && workflowResult.proposal.summary) ||
      String(workflowResult.answer || "").slice(0, 120)
  };
}

function cityCoordinate(city, index) {
  const coordinates = {
    上海: [121.4737, 31.2304],
    北京: [116.4074, 39.9042],
    深圳: [114.0579, 22.5431],
    成都: [104.0665, 30.5728],
    杭州: [120.1551, 30.2741],
    广州: [113.2644, 23.1291],
    三河: [117.0783, 39.9827]
  };
  if (coordinates[city]) return coordinates[city];
  const fallback = [
    [118.7969, 32.0603],
    [114.3055, 30.5928],
    [108.9398, 34.3416],
    [106.5516, 29.563],
    [117.2009, 39.0842]
  ];
  return fallback[index % fallback.length];
}

function offsetCoordinate(coordinate, index, radius) {
  const angle = (index % 10) * 0.628 + Math.floor(index / 10) * 0.21;
  return [
    coordinate[0] + Math.cos(angle) * radius,
    coordinate[1] + Math.sin(angle) * radius
  ];
}

function makeRequestId() {
  return "bp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  runChatRequest
};
