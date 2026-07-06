/**
 * competitor_benchmark 工作流：竞对对比
 * 查竞对基准表 → 对比分析（美团到餐 vs 抖音到店 vs 私域会员） → 给差异化建议
 */

function getSystemPrompt(brandName, params) {
  const competitors = (params.competitors || []).length
    ? params.competitors.join("、")
    : "美团到餐、抖音到店、私域会员";

  return [
    "你是 BrandPilot AI 的竞对分析专家，正在为「" + brandName + "」做多平台竞对对比。",
    "对比维度：" + competitors,
    "",
    "你的任务：",
    "1. 用 getCompetitorBenchmark 工具获取竞对基准数据",
    "2. 从市场份额、核销率、客单价、补贴率、广告费率、内容份额等维度对比",
    "3. 识别各平台的核心优势和短板",
    "4. 给" + brandName + "的差异化经营建议",
    "",
    "对比框架：",
    "- 美团到餐：高意图搜索、高核销率、高广告变现效率",
    "- 抖音到店：高内容流量、低核销率、强补贴依赖",
    "- 私域会员：高客单价、最高核销率、零广告费",
    "",
    "回复结构：",
    "1. 【数据总览】各平台核心指标一览",
    "2. 【维度对比】按市场份额、核销率、客单价、补贴率逐项分析",
    "3. 【差异化建议】3-4条针对" + brandName + "的差异化经营策略",
    "",
    "禁止编造数据，只使用工具返回的真实数值。"
  ].join("\n");
}

async function buildToolDefinitions() {
  const [{ tool }, { z }] = await Promise.all([
    import("ai"),
    import("zod")
  ]);

  const { TOOL_REGISTRY } = require("../agent-tools");

  return {
    getCompetitorBenchmark: tool({
      description: "获取品牌在各平台的竞对基准数据（市场份额、核销率、客单价、补贴率、广告费率等）",
      parameters: z.object({
        brandId: z.string().default("haidilao").describe("品牌 ID")
      }),
      execute: async (args) => await TOOL_REGISTRY.getCompetitorBenchmark.fn(args)
    })
  };
}

function buildComparisonChart(benchmarksStr) {
  try {
    const data = JSON.parse(benchmarksStr);
    const benchmarks = data.benchmarks || [];
    const labels = benchmarks.map((b) => b.competitor);

    return [{
      type: "comparison",
      title: "平台核心指标对比",
      data: {
        labels,
        datasets: [
          { label: "市场份额 (%)", data: benchmarks.map((b) => (b.marketShare || 0) * 100) },
          { label: "核销率 (%)", data: benchmarks.map((b) => (b.verificationRate || 0) * 100) },
          { label: "补贴率 (%)", data: benchmarks.map((b) => (b.subsidyRate || 0) * 100) }
        ]
      }
    }, {
      type: "bar",
      title: "平台客单价对比（元）",
      data: {
        labels,
        datasets: [{ label: "客单价", data: benchmarks.map((b) => b.avgOrderValue || 0) }]
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
  const systemPrompt = getSystemPrompt(brandName, intentParams);

  let benchmarksRaw = null;
  let answer = "";
  const toolStart = Date.now();

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
      tools: toolsDefined,
      maxSteps: 4,
      temperature: 0.3
    });

    answer = result.text;

    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            if (tc.toolName === "getCompetitorBenchmark" && tc.result) {
              benchmarksRaw = tc.result;
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
      name: "竞对分析Agent",
      tool: "推理完成",
      summary: "完成竞对对比分析和差异化建议",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    const { TOOL_REGISTRY } = require("../agent-tools");
    benchmarksRaw = await TOOL_REGISTRY.getCompetitorBenchmark.fn({ brandId: "haidilao" });

    const data = JSON.parse(benchmarksRaw);
    const benchmarks = data.benchmarks || [];
    const rows = benchmarks.map((b) =>
      "| " + b.competitor + " | " + ((b.marketShare || 0) * 100).toFixed(0) + "% | " +
      (b.avgOrderValue || 0).toFixed(0) + "元 | " +
      ((b.verificationRate || 0) * 100).toFixed(1) + "% | " +
      ((b.subsidyRate || 0) * 100).toFixed(1) + "% |"
    ).join("\n");

    answer = [
      "# " + brandName + " 多平台竞对对比分析（确定性分析）",
      "",
      "## 数据总览",
      "| 平台 | 市场份额 | 客单价 | 核销率 | 补贴率 |",
      "|------|---------|--------|--------|--------|",
      rows,
      "",
      "## 维度分析",
      "- **美团到餐**：市场份额60%，核销率85.3%，高意图搜索优势明显，是核心经营阵地。",
      "- **抖音到店**：市场份额30%，核销率57%，内容流量大但购买决策质量低，强依赖补贴。",
      "- **私域会员**：市场份额10%，核销率91%，客单价最高，零广告费但用户规模有限。",
      "",
      "## 差异化建议",
      "- **美团阵地深耕**：利用高核销率优势继续放大搜索广告和套餐经营。",
      "- **抖音差异化承接**：在抖音做品牌曝光和种草，但引导核销到美团或私域。",
      "- **私域会员升级**：打通美团交易数据和会员权益互通，做大私域规模。",
      "- **补贴策略优化**：美团补贴率1.4% vs 抖音2.6%，不宜在美团大幅提补贴。",
      "",
      "> 确定性分析模式，建议配置 MODEL_API_KEY 获得 AI 增强分析。"
    ].join("\n");

    agentTrace.push({
      name: "竞对分析Agent",
      tool: "fallback",
      summary: "LLM 调用失败：" + error.message + "，使用确定性分析",
      durationMs: Date.now() - toolStart
    });
  }

  const charts = benchmarksRaw ? buildComparisonChart(benchmarksRaw) : buildFallbackCharts();

  return {
    workflow: "competitor_benchmark",
    answer,
    agentTrace,
    charts,
    totalDurationMs: Date.now() - startedAt
  };
}

function buildFallbackCharts() {
  return [{
    type: "comparison",
    title: "平台核心指标对比",
    data: {
      labels: ["美团到餐", "抖音到店", "私域会员"],
      datasets: [
        { label: "市场份额 (%)", data: [60, 30, 10] },
        { label: "核销率 (%)", data: [85.3, 57, 91] },
        { label: "补贴率 (%)", data: [1.4, 2.6, 0.6] }
      ]
    }
  }];
}

module.exports = { execute };
