/**
 * Chat 编排主流程（JSON / SSE 共用）
 */

const { HttpError } = require("./http");
const { getModelConfig, getSupabaseConfig } = require("./env");
const { recognizeIntent, workflowLabel, recognitionModeLabel } = require("./intent-router");
const { mergeTokenUsage, emptyTokenUsage } = require("./token-usage");
const { appendMessages } = require("./chat-store");
const { resetContextCache, getContext } = require("./agent-tools");
const { persistWorkflowRun } = require("./event-store");
const { filterWorkflowCharts } = require("./chart-policy");
const { buildDataSpec, attachDataSpecToCharts } = require("./data-spec");
const { streamTextChunks } = require("./sse");
const {
  friendlyStepName,
  friendlyTool,
  friendlyStepSummary,
  friendlyDuration,
  sanitizeTechTerms
} = require("./friendly-steps");
const WORKFLOW_REGISTRY = {
  annual_proposal: () => require("./workflows/annual_proposal"),
  funnel_diagnosis: () => require("./workflows/funnel_diagnosis"),
  competitor_benchmark: () => require("./workflows/competitor_benchmark"),
  data_query: () => require("./workflows/data_query")
};

function emitFriendlyStep(emit, payload) {
  if (!emit) return;
  emit("step", {
    ...payload,
    name: friendlyStepName(payload.name),
    tool: payload.tool ? friendlyTool(payload.tool) : undefined,
    summary: friendlyStepSummary(payload)
  });
}

function emitFriendlyStart(emit, id, name, summary) {
  if (!emit) return;
  emit("step_start", {
    id,
    name: friendlyStepName(name),
    summary: friendlyStepSummary({ name, summary })
  });
}

function createProgressEmitter(emit) {
  let counter = 0;
  return {
    start(name, summary) {
      if (!emit) return null;
      counter += 1;
      const id = "step_" + counter;
      emitFriendlyStart(emit, id, name, summary || `正在${friendlyStepName(name)}…`);
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

  const intentId = progress.start("意图识别路由", "意图识别中…");
  const intentStart = Date.now();
  const intent = await recognizeIntent(message, modelConfig);
  const intentTrace = {
    name: "意图识别路由",
    tool: recognitionModeLabel(intent.recognitionMode),
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
    emitFriendlyStep(emit, { id: intentId, status: "done", ...intentTrace });
  }

  resetContextCache();

  const workflowLoader = WORKFLOW_REGISTRY[intent.workflow];
  if (!workflowLoader) {
    throw new HttpError(400, "UNKNOWN_WORKFLOW", "未知工作流：" + intent.workflow);
  }

  const workflowModule = workflowLoader();
  const workflowId = progress.start(
    workflowLabel(intent.workflow),
    "开始帮你查数、算指标、写分析…"
  );

  const workflowResult = await workflowModule.execute({
    message,
    modelConfig,
    brandName,
    intentParams: intent.params || {},
    history,
    onProgress: (step) => {
      emitFriendlyStep(emit, { id: workflowId, status: "running", ...step });
    }
  });

  if (emit) {
    emitFriendlyStep(emit, {
      id: workflowId,
      status: "done",
      name: workflowLabel(intent.workflow),
      tool: "workflow",
      summary: "工作流执行完成",
      durationMs: workflowResult.totalDurationMs || Date.now() - startedAt
    });
  }

  let dataMode = "empty";
  let warnings = [];
  let dataSpec = null;
  const contextId = progress.start("经营数据", "加载品牌经营数据…");
  const contextStart = Date.now();
  const context = await getContext(brandId);
  dataMode = context.dataMode || "empty";
  warnings = context.warnings || [];
  dataSpec = buildDataSpec({
    message,
    workflow: intent.workflow,
    intentParams: intent.params || {},
    context,
    dataMode
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
  if (emit) {
    emitFriendlyStep(emit, { id: contextId, status: "done", ...contextTrace });
  }

  let agentTrace = [intentTrace, ...(workflowResult.agentTrace || []), contextTrace];

  const persistId = progress.start("事件持久化", "把这次分析记下来…");
  const persistStart = Date.now();
  let persistResult;
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
    // 调试态：持久化失败不降级到内存，标记为 failed 暴露问题
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
    emitFriendlyStep(emit, { id: persistId, status: "done", ...persistTrace });
  }

  if (persistResult.warning) warnings.push(persistResult.warning);

  const responseCharts = attachDataSpecToCharts(
    filterWorkflowCharts(workflowResult.charts || [], {
      message,
      workflow: intent.workflow,
      agentTrace
    }),
    dataSpec
  );

  const answer = workflowResult.answer || "分析完成，请查看右侧面板。";
  if (emit) {
    const answerId = progress.start("生成回答", "正在把结论写成你能直接看的文字…");
    await streamTextChunks(answer, emit, { chunkSize: 28, delayMs: 10 });
    emitFriendlyStep(emit, {
      id: answerId,
      status: "done",
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
    answer,
    charts: responseCharts,
    proposal: workflowResult.proposal || null,
    dataSpec,
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
      eventPersistence: true
    },
    totalDurationMs: Date.now() - startedAt
  };

  if (authUser && sessionId) {
    const saveId = progress.start("保存对话", "放进左侧历史记录…");
    try {
      await appendMessages(sessionId, authUser.id, [
        { role: "user", content: message },
        {
          role: "assistant",
          content: response.answer,
          metadata: {
            requestId,
            workflow: response.workflow,
            workflowLabel: response.workflowLabel,
            proposal: response.proposal,
            charts: response.charts,
            capabilities: response.capabilities,
            dataSpec: response.dataSpec,
            intent: response.intent,
            tokenUsage: response.tokenUsage
          }
        }
      ]);
      response.sessionId = sessionId;
      response.messageSaved = true;
      if (emit) {
        emitFriendlyStep(emit, {
          id: saveId,
          status: "done",
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
          status: "done",
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

function makeRequestId() {
  return "bp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

module.exports = {
  runChatRequest
};
