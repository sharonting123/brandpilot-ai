/**
 * data_query 工作流：纯数据问答
 * 用户问具体数字 → 查对应表 → 直接回答 + 可选小图表
 */

const { shouldShowGtvTrendChart } = require("../chart-policy");
const { TOOL_REGISTRY } = require("../agent-tools");
const { buildSharedTools } = require("../ai-tools-factory");
const { buildChatMessages } = require("../workflow-utils");
const { tracePush, reportProgress, buildStepStart } = require("../workflow-progress");
const { emptyTokenUsage, mergeTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");

function getSystemPrompt(brandName) {
  return [
    "你是 BrandPilot AI 的数据查询助手，负责回答关于「" + brandName + "」的具体数据问题。",
    "",
    "你的任务：",
    "1. 理解用户问的是哪个维度的数据（GMV、核销率、曝光、订单、ROI、客单价等）",
    "2. 优先调用 runNl2Sql 把自然语言转成只读 SQL 查询并取数",
    "3. 若需要口径解释，调用 retrieveKnowledge 检索知识库",
    "4. 用简洁清晰的语言回答，附带具体数字，并可引用 SQL 结果",
    "",
    "可用工具：",
    "- runNl2Sql：自然语言 -> SQL 计划 + 行结果（优先）",
    "- retrieveKnowledge：检索分析框架与口径解释",
    "- queryBrandData：品牌全量数据概览",
    "- computeFunnel：漏斗各阶段数据",
    "- aggregateMonthly：月度经营数据（GTV、用户数、频次、客单、变现率等）",
    "- getCompetitorBenchmark：竞对基准数据",
    "",
    "回复要点：",
    "- 直接回答数字，不要过度展开",
    "- 如果用户问的是月度数据，优先用 runNl2Sql 或 aggregateMonthly",
    "- 如果用户问的是漏斗/转化，用 computeFunnel",
    "- 如果数据模式为 fixture，必须告知用户",
    "- 用中文回答，清晰标注数值和单位",
    "品牌固定为" + brandName + "。"
  ].join("\n");
}

async function buildToolDefinitions() {
  return buildSharedTools([
    "runNl2Sql",
    "retrieveKnowledge",
    "queryBrandData",
    "computeFunnel",
    "aggregateMonthly",
    "getCompetitorBenchmark"
  ]);
}

function buildTrendChart(monthlyRaw) {
  try {
    const data = JSON.parse(monthlyRaw);
    const trend = data.monthlyTrend || [];
    return [{
      type: "line",
      title: "月度 GTV 趋势（万元）",
      data: {
        labels: trend.map((m) => {
          const parts = String(m.month).split("-");
          return parts[1] ? parseInt(parts[1]) + "月" : m.month;
        }),
        datasets: [{ label: "GTV", data: trend.map((m) => Math.round((m.gtv || 0) / 10000)) }]
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

  let monthlyRaw = null;
  let answer = "";
  let tokenUsage = emptyTokenUsage();
  const toolStart = Date.now();
  reportProgress(onProgress, buildStepStart("数据查询 Agent", "执行 NL2SQL 与数据检索…"));

  if (!modelConfig || !modelConfig.configured) {
    const fallback = await runNl2SqlFallback(message, brandName, "模型未配置");
    return {
      workflow: "data_query",
      answer: fallback.answer,
      agentTrace: fallback.agentTrace,
      charts: fallback.charts,
      totalDurationMs: Date.now() - startedAt
    };
  }

  const [{ generateText }, { createOpenAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai")
  ]);

  const model = createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelConfig.model);

  const toolsDefined = await buildToolDefinitions();
  const systemPrompt = getSystemPrompt(brandName);

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
            if (tc.toolName === "aggregateMonthly" && tc.result) {
              monthlyRaw = tc.result;
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
      name: "数据查询Agent",
      tool: "推理完成",
      summary: "完成数据查询和回答",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    const fallback = await runNl2SqlFallback(message, brandName, error.message);
    answer = fallback.answer;
    monthlyRaw = fallback.monthlyRaw;
    (fallback.agentTrace || []).forEach((step) => tracePush(agentTrace, onProgress, step));
    tracePush(agentTrace, onProgress, {
      name: "数据查询Agent",
      tool: "nl2sql_fallback",
      summary: "LLM 调用失败，已用 NL2SQL 降级",
      durationMs: Date.now() - toolStart
    });
  }

  const charts =
    monthlyRaw && shouldShowGtvTrendChart({ message, workflow: "data_query", toolsUsed: ["aggregateMonthly"] })
      ? buildTrendChart(monthlyRaw)
      : [];

  return {
    workflow: "data_query",
    answer,
    agentTrace,
    charts,
    tokenUsage,
    totalDurationMs: Date.now() - startedAt
  };
}

async function runNl2SqlFallback(message, brandName, reason) {
  const nlStart = Date.now();
  const nlRaw = await TOOL_REGISTRY.runNl2Sql.fn({ brandId: "haidilao", question: message });
  const nl = JSON.parse(nlRaw);
  const monthlyRaw = await TOOL_REGISTRY.aggregateMonthly.fn({ brandId: "haidilao" });
  const previewRows = (nl.rows || []).slice(0, 5);
  const rowLines = previewRows.map((row) =>
    "- " + Object.keys(row).map((k) => k + "=" + row[k]).join("，")
  );

  return {
    monthlyRaw,
    charts:
      shouldShowGtvTrendChart({ message, workflow: "data_query", toolsUsed: ["aggregateMonthly"] })
        ? buildTrendChart(monthlyRaw)
        : [],
    agentTrace: [
      {
        name: "NL2SQL",
        tool: nl.templateId || "runNl2Sql",
        summary: nl.explanation || "完成自然语言到 SQL 映射",
        durationMs: Date.now() - nlStart
      }
    ],
    answer: [
      "# " + brandName + " 数据查询结果（NL2SQL）",
      "",
      "## 生成 SQL",
      "```sql",
      nl.sql || "",
      "```",
      "",
      "## 查询结果（前 " + previewRows.length + " 行）",
      ...(rowLines.length ? rowLines : ["- 无匹配行"]),
      "",
      nl.dataMode === "fixture" ? "> 当前使用演示数据，实际数值以正式环境为准。" : "",
      "",
      reason ? "> 已走 NL2SQL 路径：" + reason : ""
    ].filter(Boolean).join("\n")
  };
}

module.exports = { execute };
