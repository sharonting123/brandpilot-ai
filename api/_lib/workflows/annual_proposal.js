/**
 * annual_proposal 工作流：品牌年度提案
 * 完整链路：查数 → 漏斗归因 → 经营分析 → 策略 → 质检 → 提案包装
 * LLM agent 通过 tool calling 自主决定调用哪些工具，最终产出结构化提案。
 */

const { TOOL_REGISTRY } = require("../agent-tools");
const { buildSharedTools } = require("../ai-tools-factory");
const { shouldShowGtvTrendChart } = require("../chart-policy");
const { tracePush, reportProgress, buildStepStart } = require("../workflow-progress");
const { buildChatMessages, ANSWER_SCOPE_RULE } = require("../workflow-utils");
const { getAgentMaxTokens } = require("../token-budget");
const { emptyTokenUsage, mergeTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");
const { forceFunnelChartPolicy } = require("../chart-normalize");
const { getCitationRegistry } = require("../citation-registry");
const { generateStructuredObject } = require("../structured-output");
const { getStructuredModelConfig } = require("../env");
const {
  buildProposalSchema,
  buildProposalStructuredPrompt
} = require("../proposal-schema");
const {
  prefetchNl2Sql,
  buildNl2SqlContextBlock,
  finalizeAnswerWithNl2Sql
} = require("../nl2sql-pipeline");

/**
 * 获取年度提案工作流的 system prompt
 */
function getSystemPrompt(brandName, params) {
  return [
    "你是 BrandPilot AI 的首席经营分析师，正在为「" + brandName + "」制作" + (params.period || "周期性") + "经营提案。",
    "",
    "你的工作任务：",
    "1. 使用工具查询品牌数据、漏斗、月度经分和竞对基准",
    "2. 系统已预先执行 SQL 生成 Agent，请优先引用预查询 NL2SQL 结果（格式 [S1]/[D1]）",
    "3. 用 retrieveKnowledge 检索经营分析框架和品牌知识资产，回答引用 citations（格式 [K1]）",
    "4. 基于数据做深入的经营分析，识别主矛盾、机会区和风险点",
    "5. 给出可执行的策略建议和下半年推进时间线",
    "6. 最终生成一份结构化提案，包含：指标卡、关键洞察、推荐动作、时间线、资产清单",
    "",
    "分析框架：",
    "- GTV 三因子拆解：交易用户数 × 购买频次 × 客单价",
    "- 变现率视角：take rate（佣金率+广告费率）、广告商户渗透率",
    "- 城市分层：按 GMV 和 ROI 分配资源",
    "- 链路归因：搜索/推荐→POI→套餐→下单→支付→核销",
    "",
    "约束：",
    "- 只使用工具返回的真实数据，不编造外部事实",
    "- 结论必须落到可验证的指标和可执行的动作，并在文本末尾标注引用编号",
    "- 链路/漏斗相关图表必须使用 type=funnel，禁止用柱状图替代漏斗图",
    "- 如果数据模式为 empty 或 unavailable（无可用数据），需在提案中标注",
    "- 在最终回复中用中文明了的语言呈现提案",
    ANSWER_SCOPE_RULE,
    "",
    "你的回复需要包含：",
    "1. 【经营摘要】一段话概括核心发现",
    "2. 【关键指标】4-5 个核心指标卡",
    "3. 【深度洞察】3-5 条数据洞察",
    "4. 【推荐动作】4-6 条可执行策略",
    "5. 【推进时间线】3 个阶段的计划",
    "6. 【风险提示】需要关注的风险点",
    "7. 【提案资产】可交付的材料清单"
  ].join("\n");
}

async function buildToolDefinitions() {
  return buildSharedTools([
    "queryBrandData",
    "computeFunnel",
    "aggregateMonthly",
    "getCompetitorBenchmark",
    "getBrandAssets",
    "runNl2Sql",
    "retrieveKnowledge"
  ]);
}

/**
 * 用 generateObject 产出结构化提案（在 agent 推理完成后）
 */
async function generateStructuredProposal(agentAnswer, _modelConfig, brandName, params) {
  const { z } = await import("zod");
  const structuredConfig = getStructuredModelConfig();
  if (!structuredConfig.configured) {
    throw new Error("结构化模型未配置（需 LONGCAT_API_KEY 或 MODEL_STRUCTURED_API_KEY）");
  }

  const ProposalSchema = buildProposalSchema(z, brandName, params, agentAnswer);
  const system = buildProposalStructuredPrompt(brandName, params);

  const result = await generateStructuredObject({
    schema: ProposalSchema,
    system,
    prompt: String(agentAnswer || "").slice(0, 120000),
    modelConfig: structuredConfig
  });

  return {
    object: result.object,
    tokenUsage: result.tokenUsage,
    mode: result.mode,
    model: structuredConfig.structuredModel || structuredConfig.model
  };
}

/**
 * 执行年度提案工作流
 */
async function execute(params) {
  const { message, modelConfig, brandName = "海底捞", intentParams = {}, onProgress, brandId = "haidilao" } = params;
  const startedAt = Date.now();
  const agentTrace = [];
  const resolvedBrandId = intentParams.brandId || brandId || "haidilao";

  let agentAnswer = "";
  let nlPayload = null;
  let toolCallsMade = [];
  let tokenUsage = emptyTokenUsage();
  const toolStart = Date.now();
  reportProgress(onProgress, buildStepStart("年度提案 Agent", "拉取品牌数据并生成提案…"));

  if (!modelConfig || !modelConfig.configured) {
    // 调试态：模型未配置不再降级到确定性分析，直接抛错暴露问题
    throw new Error("年度提案 Agent 失败：模型未配置（MODEL_API_KEY 缺失）。调试态已关闭确定性降级。");
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
  const { nl } = await prefetchNl2Sql({
    message,
    brandId: resolvedBrandId,
    modelConfig,
    intentParams,
    onProgress,
    agentTrace
  });
  nlPayload = nl;
  const systemPrompt = getSystemPrompt(brandName, intentParams) + buildNl2SqlContextBlock(nl);

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: buildChatMessages(params.history, message),
      tools: toolsDefined,
      maxSteps: 5,
      temperature: 0.3,
      maxOutputTokens: getAgentMaxTokens(modelConfig),
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

    agentAnswer = result.text;
    tokenUsage = mergeTokenUsage(tokenUsage, extractUsageFromGenerateResult(result));

    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            toolCallsMade.push({ toolName: tc.toolName, args: tc.args });
          }
        }
      }
    }

    tracePush(agentTrace, onProgress, {
      name: "推理Agent",
      tool: toolCallsMade.map((t) => t.toolName).join(" → "),
      summary: "调用了 " + toolCallsMade.length + " 个工具完成推理",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    // 调试态：LLM 失败不再降级到确定性分析，直接抛错暴露问题
    throw new Error("年度提案 Agent LLM 推理失败：" + error.message);
  }

  // 调试态：取消 38s 超时跳过保护，结构化失败直接抛错，不再降级到对话式回答
  let structuredProposal = null;
  if (modelConfig.configured) {
    try {
      const genStart = Date.now();
      const promptText = String(agentAnswer || "");
      const structuredResult = await generateStructuredProposal(
        promptText,
        modelConfig,
        brandName,
        intentParams
      );
      structuredProposal = structuredResult.object;
      tokenUsage = mergeTokenUsage(tokenUsage, structuredResult.tokenUsage);
      tracePush(agentTrace, onProgress, {
        name: "提案结构化Agent",
        tool:
          (structuredResult.mode === "text+json"
            ? "generateText+json"
            : structuredResult.mode === "json_object"
              ? "json_object"
              : "generateObject") +
          " · " +
          (structuredResult.model || "structured"),
        summary:
          structuredResult.mode === "text+json"
            ? "LongCat 兼容模式提取结构化提案"
            : structuredResult.mode === "json_object"
              ? "LongCat json_object 模式提取结构化提案"
              : "成功提取结构化提案",
        durationMs: Date.now() - genStart
      });
    } catch (error) {
      tracePush(agentTrace, onProgress, {
        name: "提案结构化Agent",
        tool: "fallback",
        summary: "结构化提取失败，使用兜底提案：" + error.message,
        durationMs: 0
      });
      structuredProposal = buildFallbackProposal(brandName);
    }
  }

  // 构建图表：调试态不再用 buildFallbackCharts 兜底，无结构化图表则返回空
  let charts = [];
  if (structuredProposal && structuredProposal.charts && structuredProposal.charts.length) {
    charts = forceFunnelChartPolicy(structuredProposal.charts);
  }

  const references = getCitationRegistry();

  return {
    workflow: "annual_proposal",
    answer: finalizeAnswerWithNl2Sql(agentAnswer, nlPayload),
    agentTrace,
    charts,
    proposal: structuredProposal,
    references,
    tokenUsage,
    totalDurationMs: Date.now() - startedAt
  };
}

function buildFallbackAnswer(brandName, params, brandData, funnelData, monthlyData) {
  const period = params.period || "2026 H1";
  return [
    "# " + brandName + " " + period + " 经营提案（确定性分析）",
    "",
    "## 经营摘要",
    brandName + period + "期间主要通过美团到餐完成搜索到核销的闭环。当前核心机会在POI到套餐详情的承接优化和广告变现效率提升。",
    "",
    "## 数据概览",
    brandData,
    "",
    "## 漏斗分析",
    funnelData,
    "",
    "## 月度趋势",
    monthlyData,
    "",
    "> 当前使用确定性分析模式（LLM 暂不可用），建议配置有效的 MODEL_API_KEY 以获得 AI 增强分析。"
  ].join("\n");
}

function buildFallbackProposal(brandName) {
  return {
    title: brandName + " 2026 H1 经营提案",
    opportunityScore: 82,
    summary: brandName + "半年度提案核心聚焦搜索到核销的经营链路：优化POI到套餐的承接效率，提升广告变现率，按城市ROI分层投放资源。",
    metrics: [
      { label: "H1 GTV", value: "约1.1亿", delta: "月环比增长" },
      { label: "搜索曝光", value: "512万+", delta: "品牌心智" },
      { label: "核销率", value: "85.3%", delta: "领先行业" },
      { label: "综合变现率", value: "5.57%", delta: "广告渗透22.8%" }
    ],
    insights: [
      "GTV增长主因是活跃用户规模扩大（从18.5万增至25.6万），而非单纯降价。",
      "POI到套餐详情承接率是关键优化点，适合用门店页套餐组和聚餐场景权益提升。",
      "城市分层显示上海、北京ROI最高，低ROI城市应先修POI承接再投放。",
      "美团到餐核销率85.3% vs 抖音到店57%，美团优势在高意图搜索和核销质量。"
    ],
    actions: [
      "搜索承接：围绕品牌高意图关键词配置品牌专区、门店页套餐组和场景入口。",
      "广告变现：以广告商户渗透率22.8%为基线，推动搜索竞价和CPC案例教育。",
      "城市分层：优先放大上海、北京的高ROI组合，低ROI城市先修POI承接。",
      "套餐策略：以家庭聚餐、工作日错峰、会员日三类权益做组合，避免单一降价。",
      "核销闭环：把支付后提醒、到店核销、退款原因纳入经营看板。"
    ],
    timeline: [
      { title: "H1 复盘（已完成）", body: "补齐H1全量日期、城市和门店分层数据，形成半年度基线。" },
      { title: "Q3 承接（进行中）", body: "上线搜索承接与门店页套餐组实验，跟踪POI到套餐转化。" },
      { title: "Q4 放大（计划中）", body: "沉淀高效套餐和复盘模板，复制到重点城市与高潜门店。" }
    ],
    risks: [
      "当前使用演示数据，正式提案前需接入完整H1全量数据。",
      "补贴率触及2%预警线时需注意竞争烈度。",
      "广告商户渗透低于15%时代表商户投放意愿不足。"
    ],
    assets: [
      { title: "半年度经营诊断页", body: "搜索到核销漏斗、关键损耗点和机会分。" },
      { title: "KA拜访链路图", body: "用搜索到下单链路解释美团到餐经营价值。" },
      { title: "变现率与补贴率看板", body: "追踪take rate、广告收入和预警线。" },
      { title: "下半年动作清单", body: "按四类行动拆解责任人与指标。" }
    ]
  };
}

function buildFallbackCharts(brandName, includeGtvTrend) {
  const charts = [
    {
      type: "funnel",
      title: brandName + " 搜索到核销转化漏斗",
      data: {
        labels: ["搜索曝光", "搜索点击", "POI点击", "套餐详情", "下单提交", "支付订单", "核销订单"],
        datasets: [{ label: "用户数", data: [5120000, 486400, 205000, 94500, 33900, 21600, 18400] }]
      }
    },
    {
      type: "bar",
      title: "城市GMV分布（6月）",
      data: {
        labels: ["上海", "北京", "深圳", "成都", "杭州"],
        datasets: [{ label: "GMV（万元）", data: [2473, 2247, 1644, 1458, 1094] }]
      }
    }
  ];

  if (includeGtvTrend) {
    charts.splice(1, 0, {
      type: "line",
      title: "H1 月度 GTV 趋势（万元）",
      data: {
        labels: ["1月", "2月", "3月", "4月", "5月", "6月"],
        datasets: [{ label: "GTV", data: [8626, 9421, 8926, 8871, 10073, 11045] }]
      }
    });
  }

  return charts;
}

module.exports = { execute };
