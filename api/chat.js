/**
 * api/chat.js — BrandPilot AI 主入口
 * POST /api/chat  { message: string, brandHint?: string, history?: [] }
 *
 * 架构：意图识别路由 → 工作流分发 → Agent 执行 → 统一响应
 * 使用 Vercel AI SDK 做真 function calling 多 agent 编排。
 */

const { getClientIp, handleError, HttpError, readJson, sendJson } = require("./_lib/http");
const { getModelConfig, getSupabaseConfig } = require("./_lib/env");
const { loadSupabaseContext } = require("./_lib/supabase-context");
const { recognizeIntent, workflowLabel } = require("./_lib/intent-router");
const { resetContextCache } = require("./_lib/agent-tools");

// 工作流注册表
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
    // 只接受 POST
    if (req.method && req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "使用 POST /api/chat。");
    }

    // 解析请求体
    const body = await readJson(req, { limitBytes: 128 * 1024 });
    const message = String(body.message || "").trim();
    if (!message) {
      throw new HttpError(400, "MESSAGE_REQUIRED", "请提供 message 字段。");
    }

    const brandHint = String(body.brandHint || "haidilao").trim();
    const history = Array.isArray(body.history) ? body.history.slice(-20) : [];

    // 获取配置
    const modelConfig = getModelConfig(process.env);

    // Step 1: 意图识别路由
    const intentStart = Date.now();
    const intent = await recognizeIntent(message, modelConfig);

    const intentTrace = {
      name: "意图识别路由",
      tool: intent.recognitionMode,
      summary: "识别为「" + workflowLabel(intent.workflow) + "」（置信度 " + (intent.confidence * 100).toFixed(0) + "%）: " + intent.reasoning,
      durationMs: Date.now() - intentStart
    };

    // 重置工具上下文缓存
    resetContextCache();

    // Step 2: 根据工作流执行 Agent
    const workflowLoader = WORKFLOW_REGISTRY[intent.workflow];
    if (!workflowLoader) {
      throw new HttpError(400, "UNKNOWN_WORKFLOW", "未知工作流：" + intent.workflow);
    }

    const workflowModule = workflowLoader();
    const workflowResult = await workflowModule.execute({
      message,
      modelConfig,
      brandName: brandHint === "haidilao" ? "海底捞" : brandHint,
      intentParams: intent.params || {},
      history
    });

    // Step 3: 组装统一响应
    const supabaseConfig = getSupabaseConfig(process.env);
    const supabaseSummary = supabaseConfig.configured ? "已连接" : "未配置";

    // 检查数据模式
    let dataMode = "fixture";
    let warnings = [];
    try {
      const ctx = await loadSupabaseContext(getSupabaseConfig(process.env), { brandId: "haidilao" });
      dataMode = ctx.dataMode || "fixture";
      warnings = ctx.warnings || [];
    } catch (err) {
      // 忽略 supabase 连接错误
    }

    const response = {
      requestId,
      workflow: intent.workflow,
      workflowLabel: workflowLabel(intent.workflow),
      intent: {
        confidence: intent.confidence,
        reasoning: intent.reasoning,
        recognitionMode: intent.recognitionMode
      },
      agentTrace: [intentTrace, ...(workflowResult.agentTrace || [])],
      answer: workflowResult.answer || "分析完成，请查看右侧面板。",
      charts: workflowResult.charts || [],
      proposal: workflowResult.proposal || null,
      dataMode,
      warnings: [...warnings, ...(workflowResult.warnings || [])],
      supabaseStatus: supabaseSummary,
      totalDurationMs: Date.now() - startedAt
    };

    return sendJson(res, 200, response);
  } catch (error) {
    return handleError(res, error, "CHAT_FAILED", "Agent 编排执行失败。");
  }
};

function makeRequestId() {
  return "bp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
