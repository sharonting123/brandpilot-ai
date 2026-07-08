/**
 * funnel_diagnosis 工作流：链路诊断
 * NL2SQL 取数 → 漏斗聚合 → LLM 归因诊断
 */

const { TOOL_REGISTRY } = require("../agent-tools");
const { buildChatMessages, ANSWER_SCOPE_RULE } = require("../workflow-utils");
const { tracePush, traceOnlyPush, reportProgress, buildStepStart } = require("../workflow-progress");
const { emptyTokenUsage, mergeTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");
const { prefetchNl2Sql } = require("../nl2sql-pipeline");
const { buildFunnelStageFormulas } = require("../calculation-format");
const { trafficPathLabel } = require("../semantic-graph");

function getSystemPrompt(brandName, params, nl, funnelRaw) {
  const periodLabel =
    nl && nl.filters && nl.filters.year && nl.filters.monthNum
      ? `${nl.filters.year}年${nl.filters.monthNum}月`
      : params.period || "最新数据";
  const pathLabel =
    (nl && nl.filters && nl.filters.trafficPathLabel) ||
    (params.filters && params.filters.trafficPathLabel) ||
    (params.trafficPath && trafficPathLabel(params.trafficPath)) ||
    "搜索+推荐汇总";
  const pathNote =
    pathLabel === "搜索+推荐汇总"
      ? "当前为搜索与推荐双路径汇总口径。"
      : `当前仅统计「${pathLabel}」来源流量（trafficPath=${(nl && nl.filters && nl.filters.trafficPath) || params.trafficPath || "all"}）。`;

  return [
    "你是 BrandPilot AI 的链路诊断专家，正在为「" + brandName + "」诊断转化链路。",
    "",
    "【流量来源】" + pathNote,
    "",
    "【重要】系统已预先执行 NL2SQL 与漏斗聚合，请直接基于下方 JSON 数据分析，不要再次调用 runNl2Sql / computeFunnel。",
    "",
    "你的任务：",
    "1. 阅读 NL2SQL 返回的 SQL 与各阶段行结果",
    "2. 结合漏斗聚合结果，找出最大损耗点（转化率最低的环节）",
    "3. 分析造成损耗的可能原因",
    "4. 给出针对性的优化建议",
    "",
    "漏斗阶段：流量曝光 → 流量点击 → POI点击 → 套餐详情 → 下单提交 → 支付订单 → 核销订单（阶段名会随搜索/推荐来源变化）",
    "",
    "回复结构清晰，包含：",
    "1. 【漏斗概览】各阶段的量和转化率",
    "2. 【最大损耗点】具体是什么环节，转化率多少",
    "3. 【损耗原因分析】2-3条可能原因",
    "4. 【优化建议】2-3条可执行的改善方向",
    "",
    "禁止编造数据，只使用预查询结果中的真实数值。",
    "数据结论必须在句末标注引用编号（如 [S1][D1]），对应 NL2SQL 的 citationRefs。",
    ANSWER_SCOPE_RULE,
    "品牌固定为" + brandName + "，周期为" + periodLabel + "。",
    "",
    "## 预查询 NL2SQL 结果",
    "```json",
    JSON.stringify(nl || {}, null, 2),
    "```",
    "",
    "## 预查询漏斗聚合",
    "```json",
    funnelRaw || "{}",
    "```"
  ].join("\n");
}

async function buildToolDefinitions(onProgress) {
  const { buildSharedTools } = require("../ai-tools-factory");
  return buildSharedTools(["retrieveKnowledge", "queryBrandData"], { onProgress });
}

function buildFunnelChart(funnelStr, pathLabel) {
  try {
    const data = typeof funnelStr === "string" ? JSON.parse(funnelStr) : funnelStr;
    const stages = data.funnel || [];
    const sourceSuffix =
      pathLabel && pathLabel !== "搜索+推荐汇总" ? `（${pathLabel}）` : "";
    return [{
      type: "funnel",
      title: "转化漏斗" + sourceSuffix,
      description: data.bottleneck ? data.bottleneck.label : "链路漏斗（各阶段转化率见漏斗连接标注）",
      data: {
        labels: stages.map((s) => s.stage),
        datasets: [{ label: "用户数", data: stages.map((s) => s.count) }]
      },
      meta: {
        bottleneck: data.bottleneck || null,
        rates: stages.map((s) => s.rateFromPrevious)
      }
    }];
  } catch {
    return [];
  }
}

async function execute(params) {
  const { message, modelConfig, brandName = "海底捞", intentParams = {}, onProgress, brandId = "haidilao" } = params;
  const startedAt = Date.now();
  const agentTrace = [];
  const resolvedBrandId = intentParams.brandId || brandId || "haidilao";

  let funnelRaw = null;
  let nl = null;
  let answer = "";
  let tokenUsage = emptyTokenUsage();

  reportProgress(onProgress, buildStepStart("链路诊断", "执行 SQL 生成 Agent 与漏斗聚合…"));

  ({ nl } = await prefetchNl2Sql({
    message,
    brandId: resolvedBrandId,
    modelConfig,
    intentParams,
    onProgress,
    agentTrace
  }));

  const funnelStart = Date.now();
  funnelRaw = await TOOL_REGISTRY.computeFunnel.fn({
    brandId: resolvedBrandId,
    question: message,
    filters: (nl && nl.filters) || {}
  });

  let funnelFormulas = [];
  try {
    const funnelData = typeof funnelRaw === "string" ? JSON.parse(funnelRaw) : funnelRaw;
    funnelFormulas = funnelData.formulaLines || buildFunnelStageFormulas(funnelData);
  } catch (error) {
    funnelFormulas = [];
  }

  tracePush(agentTrace, onProgress, {
    name: "漏斗聚合",
    tool: "computeFunnel",
    summary: funnelFormulas[0] || "完成七阶段漏斗计算",
    formulas: funnelFormulas,
    durationMs: Date.now() - funnelStart
  });

  const [{ generateText }, { createOpenAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai")
  ]);

  const model = createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelConfig.model);

  const toolsDefined = await buildToolDefinitions(onProgress);
  const systemPrompt = getSystemPrompt(brandName, intentParams, nl, funnelRaw);
  const toolStart = Date.now();
  reportProgress(onProgress, buildStepStart("链路诊断 Agent", "基于 NL2SQL 结果生成诊断结论…"));

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: buildChatMessages(params.history, message),
      tools: toolsDefined,
      maxSteps: 4,
      temperature: 0.3,
      maxOutputTokens: modelConfig.maxTokens
    });

    answer = result.text;
    tokenUsage = mergeTokenUsage(tokenUsage, extractUsageFromGenerateResult(result));

    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            traceOnlyPush(agentTrace, {
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
      summary: "完成漏斗分析和损耗诊断",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    answer = "> 诊断结论生成失败：" + error.message + "。请查看下方分析过程中的查询数据与引用。";
    tracePush(agentTrace, onProgress, {
      name: "链路诊断Agent",
      summary: error.message,
      durationMs: Date.now() - toolStart
    });
  }

  const pathLabel =
    (nl && nl.filters && nl.filters.trafficPathLabel) ||
    (intentParams.filters && intentParams.filters.trafficPathLabel) ||
    (intentParams.trafficPath && trafficPathLabel(intentParams.trafficPath)) ||
    "搜索+推荐汇总";

  const charts = funnelRaw ? buildFunnelChart(funnelRaw, pathLabel) : [];

  return {
    workflow: "funnel_diagnosis",
    answer,
    agentTrace,
    charts,
    tokenUsage,
    totalDurationMs: Date.now() - startedAt
  };
}

module.exports = { execute };
