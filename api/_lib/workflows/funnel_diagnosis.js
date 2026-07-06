/**
 * funnel_diagnosis 工作流：链路诊断
 * 查数 → 漏斗归因 → 找最大损耗点 → 给诊断结论
 * 轻量级，不生成完整提案。
 */

const { buildChatMessages } = require("../workflow-utils");
const { tracePush, reportProgress, buildStepStart } = require("../workflow-progress");
const { emptyTokenUsage, mergeTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");

function getSystemPrompt(brandName, params) {
  return [
    "你是 BrandPilot AI 的链路诊断专家，正在为「" + brandName + "」诊断搜索到核销的转化链路。",
    "",
    "你的任务：",
    "1. 用 computeFunnel 工具计算7阶段转化漏斗",
    "2. 找出最大损耗点（转化率最低的环节）",
    "3. 分析造成损耗的可能原因",
    "4. 给出针对性的优化建议",
    "",
    "漏斗阶段：搜索曝光 → 搜索点击 → POI点击 → 套餐详情 → 下单提交 → 支付订单 → 核销订单",
    "",
    "分析要点：",
    "- 每个阶段的转化率和绝对流失量",
    "- 最大损耗点是在哪个环节",
    "- 损耗原因可能是：页面承接不足、套餐吸引力不够、下单体验差、支付门槛高、到店动力弱",
    "- 给出具体的优化方向",
    "",
    "回复结构清晰，包含：",
    "1. 【漏斗概览】各阶段的量和转化率",
    "2. 【最大损耗点】具体是什么环节，转化率多少",
    "3. 【损耗原因分析】2-3条可能原因",
    "4. 【优化建议】2-3条可执行的改善方向",
    "",
    "禁止编造数据，只使用工具返回的真实数值。",
    "品牌固定为" + brandName + "，周期为" + (params.period || "最新数据") + "。"
  ].join("\n");
}

async function buildToolDefinitions() {
  const { buildSharedTools } = require("../ai-tools-factory");
  return buildSharedTools(["computeFunnel", "queryBrandData", "retrieveKnowledge", "runNl2Sql"]);
}

function buildFunnelChart(funnelStr) {
  try {
    const data = JSON.parse(funnelStr);
    const stages = data.funnel || [];
    return [{
      type: "funnel",
      title: "搜索到核销转化漏斗",
      data: {
        labels: stages.map((s) => s.stage),
        datasets: [{ label: "用户数", data: stages.map((s) => s.count) }]
      }
    }, {
      type: "bar",
      title: "各阶段转化率",
      data: {
        labels: stages.slice(1).map((s) => s.label),
        datasets: [{ label: "转化率 (%)", data: stages.slice(1).map((s) => (s.rateFromPrevious || 0) * 100) }]
      }
    }];
  } catch {
    return [];
  }
}

async function execute(params) {
  const { message, modelConfig, brandName = "海底捞", intentParams = {}, onProgress } = params;
  const startedAt = Date.now();
  const agentTrace = [];

  const [{ generateText }, { createOpenAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai")
  ]);

  const model = createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelConfig.model);

  const toolsDefined = await buildToolDefinitions();
  const systemPrompt = getSystemPrompt(brandName, intentParams);

  let funnelRaw = null;
  let answer = "";
  let tokenUsage = emptyTokenUsage();
  const toolStart = Date.now();
  reportProgress(onProgress, buildStepStart("链路诊断 Agent", "计算漏斗并生成诊断结论…"));

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: buildChatMessages(params.history, message),
      tools: toolsDefined,
      maxSteps: 6,
      temperature: 0.3,
      maxOutputTokens: modelConfig.maxTokens,
      onStepFinish: (event) => {
        const tools = (event.toolCalls || []).map((tc) => tc.toolName).filter(Boolean);
        if (!tools.length) return;
        reportProgress(onProgress, {
          name: "工具调用",
          tool: tools.join(" → "),
          summary: "完成 " + tools.join("、"),
          durationMs: 0
        });
      }
    });

    answer = result.text;
    tokenUsage = mergeTokenUsage(tokenUsage, extractUsageFromGenerateResult(result));

    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            if (tc.toolName === "computeFunnel" && tc.result) {
              funnelRaw = tc.result;
            }
            tracePush(agentTrace, onProgress, {
              name: "工具调用",
              tool: tc.toolName,
              summary: "call " + tc.toolName + " done",
              durationMs: 0
            });
          }
        }
      }
    }

    tracePush(agentTrace, onProgress, {
      name: "链路诊断Agent",
      tool: "推理完成",
      summary: "完成漏斗分析和损耗诊断",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    // 调试态：LLM 失败不再降级到确定性分析，直接抛错暴露问题
    throw new Error("链路诊断 Agent LLM 调用失败：" + error.message);
  }

  const charts = funnelRaw ? buildFunnelChart(funnelRaw) : [];

  return {
    workflow: "funnel_diagnosis",
    answer,
    agentTrace,
    charts,
    tokenUsage,
    totalDurationMs: Date.now() - startedAt
  };
}

function buildFallbackCharts() {
  return [{
    type: "funnel",
    title: "搜索到核销转化漏斗",
    data: {
      labels: ["搜索曝光", "搜索点击", "POI点击", "套餐详情", "下单提交", "支付订单", "核销订单"],
      datasets: [{ label: "用户数", data: [5120000, 486400, 205000, 94500, 33900, 21600, 18400] }]
    }
  }];
}

module.exports = { execute };
