/**
 * data_query 工作流：纯数据问答
 * 用户问具体数字 → 查对应表 → 直接回答 + 可选小图表
 */

const { TOOL_REGISTRY } = require("../agent-tools");

function getSystemPrompt(brandName) {
  return [
    "你是 BrandPilot AI 的数据查询助手，负责回答关于「" + brandName + "」的具体数据问题。",
    "",
    "你的任务：",
    "1. 理解用户问的是哪个维度的数据（GMV、核销率、曝光、订单、ROI、客单价等）",
    "2. 调用合适的工具获取数据",
    "3. 用简洁清晰的语言回答，附带具体数字",
    "",
    "可用工具：",
    "- queryBrandData：品牌全量数据概览",
    "- computeFunnel：漏斗各阶段数据",
    "- aggregateMonthly：月度经营数据（GTV、用户数、频次、客单、变现率等）",
    "- getCompetitorBenchmark：竞对基准数据",
    "",
    "回复要点：",
    "- 直接回答数字，不要过度展开",
    "- 如果用户问的是月度数据，优先用 aggregateMonthly",
    "- 如果用户问的是漏斗/转化，用 computeFunnel",
    "- 如果数据模式为 fixture，必须告知用户",
    "- 用中文回答，清晰标注数值和单位",
    "品牌固定为" + brandName + "。"
  ].join("\n");
}

async function buildToolDefinitions() {
  const [{ tool }, { z }] = await Promise.all([
    import("ai"),
    import("zod")
  ]);

  return {
    queryBrandData: tool({
      description: TOOL_REGISTRY.queryBrandData.description,
      parameters: z.object({
        brandId: z.string().default("haidilao").describe("品牌 ID")
      }),
      execute: async (args) => await TOOL_REGISTRY.queryBrandData.fn(args)
    }),
    computeFunnel: tool({
      description: TOOL_REGISTRY.computeFunnel.description,
      parameters: z.object({
        brandId: z.string().default("haidilao").describe("品牌 ID")
      }),
      execute: async (args) => await TOOL_REGISTRY.computeFunnel.fn(args)
    }),
    aggregateMonthly: tool({
      description: TOOL_REGISTRY.aggregateMonthly.description,
      parameters: z.object({
        brandId: z.string().default("haidilao").describe("品牌 ID")
      }),
      execute: async (args) => await TOOL_REGISTRY.aggregateMonthly.fn(args)
    }),
    getCompetitorBenchmark: tool({
      description: TOOL_REGISTRY.getCompetitorBenchmark.description,
      parameters: z.object({
        brandId: z.string().default("haidilao").describe("品牌 ID")
      }),
      execute: async (args) => await TOOL_REGISTRY.getCompetitorBenchmark.fn(args)
    })
  };
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
  const { message, modelConfig, brandName = "海底捞", intentParams = {} } = params;
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
  const systemPrompt = getSystemPrompt(brandName);

  let monthlyRaw = null;
  let answer = "";
  const toolStart = Date.now();

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
      tools: toolsDefined,
      maxSteps: 6,
      temperature: 0.3
    });

    answer = result.text;

    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            if (tc.toolName === "aggregateMonthly" && tc.result) {
              monthlyRaw = tc.result;
            }
            agentTrace.push({
              name: "工具调用",
              tool: tc.toolName,
              summary: "调用 " + tc.toolName + " 完成",
              durationMs: 0
            });
          }
        }
      }
    }

    agentTrace.push({
      name: "数据查询Agent",
      tool: "推理完成",
      summary: "完成数据查询和回答",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    monthlyRaw = await TOOL_REGISTRY.aggregateMonthly.fn({ brandId: "haidilao" });
    const data = JSON.parse(monthlyRaw);
    const latest = data.latest || {};
    const totals = data.totals || {};

    answer = [
      "# " + brandName + " 数据查询结果（确定性分析）",
      "",
      "## 最新月度数据",
      "- **月份**：" + (latest.month || "N/A"),
      "- **GTV**：" + (latest.gtv ? (latest.gtv / 10000).toFixed(1) + "万元" : "N/A"),
      "- **活跃用户**：" + (latest.activeUsers ? latest.activeUsers.toLocaleString() : "N/A"),
      "- **客单价**：" + (latest.avgOrderValue ? latest.avgOrderValue.toFixed(1) + "元" : "N/A"),
      "- **核销率**：" + (latest.verifiedRate ? (latest.verifiedRate * 100).toFixed(1) + "%" : "N/A"),
      "- **综合 take rate**：" + (latest.takeRate ? (latest.takeRate * 100).toFixed(2) + "%" : "N/A"),
      "",
      "## H1 累计",
      "- **总 GTV**：" + (totals.gtv ? (totals.gtv / 100000000).toFixed(2) + "亿" : "N/A"),
      "- **总支付订单**：" + (totals.paidOrders ? totals.paidOrders.toLocaleString() : "N/A"),
      "",
      data.dataMode === "fixture" ? "> 当前使用演示数据，实际数值以正式环境为准。" : ""
    ].filter(Boolean).join("\n");

    agentTrace.push({
      name: "数据查询Agent",
      tool: "fallback",
      summary: "LLM 调用失败：" + error.message + "，使用确定性数据",
      durationMs: Date.now() - toolStart
    });
  }

  const charts = monthlyRaw ? buildTrendChart(monthlyRaw) : buildFallbackCharts();

  return {
    workflow: "data_query",
    answer,
    agentTrace,
    charts,
    totalDurationMs: Date.now() - startedAt
  };
}

function buildFallbackCharts() {
  return [{
    type: "line",
    title: "月度 GTV 趋势",
    data: {
      labels: ["1月", "2月", "3月", "4月", "5月", "6月"],
      datasets: [{ label: "GTV（万元）", data: [8626, 9421, 8926, 8871, 10073, 11045] }]
    }
  }];
}

module.exports = { execute };
