/**
 * competitor_benchmark 工作流
 * - 平台对比：美团 vs 抖音
 * - 品牌竞品：海底捞 vs 呷哺呷哺
 * 按用户问题 focus 只输出对应板块（除非明确问两类）
 */

const { buildChatMessages, ANSWER_SCOPE_RULE } = require("../workflow-utils");
const { tracePush, reportProgress, buildStepStart } = require("../workflow-progress");
const {
  buildPlatformBenchmarks,
  buildBrandPeerBenchmarks,
  detectComparisonFocus
} = require("../brand-peer");
const { getContext } = require("../agent-tools");
const { emptyTokenUsage, mergeTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");
const {
  prefetchNl2Sql,
  buildNl2SqlContextBlock,
  finalizeAnswerWithNl2Sql
} = require("../nl2sql-pipeline");
const { formatMonthLabel } = require("../period-utils");

function getSystemPrompt(brandName, message, intentParams, focus) {
  const focusLine =
    focus === "brand"
      ? "本次只做品牌竞品对比（海底捞 vs 呷哺呷哺），不要展开美团/抖音平台对比。"
      : focus === "platform"
        ? "本次只做平台对比（美团 vs 抖音），不要展开海底捞 vs 呷哺呷哺品牌竞品。"
        : "本次需同时覆盖平台对比（美团 vs 抖音）与品牌竞品（海底捞 vs 呷哺呷哺）。";

  const tasks =
    focus === "brand"
      ? ["1. 拉取品牌竞品数据（海底捞 vs 呷哺呷哺）", "2. 输出品牌差异与差异化经营建议"]
      : focus === "platform"
        ? ["1. 拉取平台对比数据（美团 vs 抖音）", "2. 输出平台差异与差异化经营建议"]
        : [
            "1. 拉取平台对比数据（美团 vs 抖音）",
            "2. 拉取品牌竞品数据（海底捞 vs 呷哺呷哺）",
            "3. 分别给出平台差异与品牌差异，并输出差异化经营建议"
          ];

  const structure =
    focus === "brand"
      ? ["1. 【品牌竞品】海底捞 vs 呷哺呷哺", "2. 【差异化建议】3-4 条可执行策略"]
      : focus === "platform"
        ? ["1. 【平台对比】美团 vs 抖音", "2. 【差异化建议】3-4 条可执行策略"]
        : [
            "1. 【平台对比】美团 vs 抖音",
            "2. 【品牌竞品】海底捞 vs 呷哺呷哺",
            "3. 【差异化建议】3-4 条可执行策略"
          ];

  return [
    "你是 BrandPilot AI 的竞对分析专家，正在为「" + brandName + "」做对比分析。",
    "用户原问题：" + String(message || ""),
    focusLine,
    "",
    "你的任务：",
    ...tasks,
    "",
    "对比框架：",
    focus !== "brand" ? "- 平台对比：美团高意图搜索、高核销；抖音高内容流量、低核销、补贴更高" : "",
    focus !== "platform" ? "- 品牌竞品：对比 GMV/GTV、客单价、核销率、ROI（仅用户问到品牌竞品时）" : "",
    "",
    "回复结构：",
    ...structure,
    "",
    "禁止编造数据，只使用工具返回的真实数值。",
    ANSWER_SCOPE_RULE
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildToolDefinitions(focus) {
  const { buildSharedTools } = require("../ai-tools-factory");
  const names =
    focus === "brand"
      ? ["getBrandPeerBenchmark", "retrieveKnowledge"]
      : focus === "platform"
        ? ["getCompetitorBenchmark", "retrieveKnowledge"]
        : ["getCompetitorBenchmark", "getBrandPeerBenchmark", "retrieveKnowledge"];
  return buildSharedTools(names);
}

function buildPlatformCharts(platforms) {
  const labels = platforms.map((item) => item.name);
  return [{
    type: "comparison",
    title: "平台对比 · 美团 vs 抖音",
    data: {
      labels,
      datasets: [
        { label: "渠道份额 (%)", data: platforms.map((item) => (item.marketShare || 0) * 100) },
        { label: "核销率 (%)", data: platforms.map((item) => (item.verificationRate || 0) * 100) },
        { label: "补贴率 (%)", data: platforms.map((item) => (item.subsidyRate || 0) * 100) }
      ]
    }
  }, {
    type: "bar",
    title: "平台客单价对比（元）",
    data: {
      labels,
      datasets: [{ label: "客单价", data: platforms.map((item) => item.avgOrderValue || 0) }]
    }
  }];
}

function buildBrandPeerCharts(peerData) {
  if (!peerData) return [];
  const monthLabel = formatMonthLabel(peerData.month);
  return [{
    type: "bar",
    title: "品牌 GTV 对比（万元，" + monthLabel + "）",
    description: "只比较交易规模，单位统一为万元。",
    data: {
      labels: [peerData.ownBrand.name, peerData.peerBrand.name],
      datasets: [
        { label: "GTV（万元）", data: [peerData.ownBrand.gtv / 10000, peerData.peerBrand.gtv / 10000] }
      ]
    }
  }, {
    type: "bar",
    title: "品牌客单价对比（元，" + monthLabel + "）",
    description: "只比较平均客单价，单位统一为元。",
    data: {
      labels: [peerData.ownBrand.name, peerData.peerBrand.name],
      datasets: [
        { label: "客单价（元）", data: [peerData.ownBrand.avgOrderValue, peerData.peerBrand.avgOrderValue] }
      ]
    }
  }, {
    type: "bar",
    title: "品牌核销率对比（%，" + monthLabel + "）",
    description: "只比较支付订单到核销订单的转化结果，单位统一为百分比。",
    data: {
      labels: [peerData.ownBrand.name, peerData.peerBrand.name],
      datasets: [
        { label: "核销率（%）", data: [peerData.ownBrand.verifiedRate * 100, peerData.peerBrand.verifiedRate * 100] }
      ]
    }
  }, {
    type: "bar",
    title: "同城市 GMV 对比（万元，" + monthLabel + "）",
    description: "按共同覆盖城市比较 GMV，单位统一为万元。",
    data: {
      labels: peerData.cities.map((item) => item.city),
      datasets: [
        { label: peerData.ownBrand.name, data: peerData.cities.map((item) => (item.own.gmv || 0) / 10000) },
        { label: peerData.peerBrand.name, data: peerData.cities.map((item) => (item.peer.gmv || 0) / 10000) }
      ]
    }
  }];
}

function buildDeterministicAnswer(brandName, platforms, peerData, focus) {
  const sections = ["# " + brandName + " 竞对对比分析（确定性分析）", ""];

  if (focus !== "brand") {
    const platformRows = platforms.map((item) =>
      "| " + item.name + " | " + ((item.marketShare || 0) * 100).toFixed(0) + "% | " +
      (item.avgOrderValue || 0).toFixed(0) + "元 | " +
      ((item.verificationRate || 0) * 100).toFixed(1) + "% | " +
      ((item.subsidyRate || 0) * 100).toFixed(1) + "% |"
    ).join("\n");
    sections.push(
      "## 平台对比 · 美团 vs 抖音",
      "| 平台 | 渠道份额 | 客单价 | 核销率 | 补贴率 |",
      "|------|---------|--------|--------|--------|",
      platformRows,
      "",
      "- **美团**：高意图搜索、核销率更高，是核心成交阵地。",
      "- **抖音**：内容流量占比更高，但核销率与客单价偏低，补贴依赖更强。",
      ""
    );
  }

  if (focus !== "platform") {
    const peer = peerData || buildBrandPeerBenchmarks({});
    const cityRows = (peer.cities || []).map((item) =>
      "| " + item.city + " | " + ((item.own.gmv || 0) / 10000).toFixed(0) + "万 | " +
      ((item.peer.gmv || 0) / 10000).toFixed(0) + "万 | " +
      ((item.own.verifiedRate || 0) * 100).toFixed(1) + "% | " +
      ((item.peer.verifiedRate || 0) * 100).toFixed(1) + "% |"
    ).join("\n");
    sections.push(
      "## 品牌竞品 · 海底捞 vs 呷哺呷哺",
      "| 品牌 | GTV | 客单价 | 核销率 |",
      "|------|-----|--------|--------|",
      "| 海底捞 | " + ((peer.ownBrand.gtv || 0) / 100000000).toFixed(2) + "亿 | " +
        (peer.ownBrand.avgOrderValue || 0).toFixed(0) + "元 | " +
        ((peer.ownBrand.verifiedRate || 0) * 100).toFixed(1) + "% |",
      "| 呷哺呷哺 | " + ((peer.peerBrand.gtv || 0) / 100000000).toFixed(2) + "亿 | " +
        (peer.peerBrand.avgOrderValue || 0).toFixed(0) + "元 | " +
        ((peer.peerBrand.verifiedRate || 0) * 100).toFixed(1) + "% |",
      "",
      "### 同城市 GMV / 核销率",
      "| 城市 | 海底捞 GMV | 呷哺 GMV | 海底捞核销 | 呷哺核销 |",
      "|------|-----------|---------|-----------|---------|",
      cityRows,
      ""
    );
  }

  const tips =
    focus === "platform"
      ? [
          "- **美团阵地**：继续放大高核销套餐与搜索广告，巩固成交效率优势。",
          "- **抖音承接**：以种草曝光为主，核销引导至美团或会员私域。"
        ]
      : focus === "brand"
        ? [
            "- **品牌溢价**：海底捞在客单价与 GMV 上领先，重点守住高线城市核心商圈。",
            "- **竞品防守**：呷哺在部分城市 ROI 接近，需关注套餐价差与错峰策略。"
          ]
        : [
            "- **美团阵地**：继续放大高核销套餐与搜索广告，巩固成交效率优势。",
            "- **抖音承接**：以种草曝光为主，核销引导至美团或会员私域。",
            "- **品牌溢价**：海底捞在客单价与 GMV 上领先，重点守住高线城市核心商圈。",
            "- **竞品防守**：呷哺在部分城市 ROI 接近，需关注套餐价差与错峰策略。"
          ];

  sections.push("## 差异化建议", ...tips, "", "> 确定性分析模式，建议配置 MODEL_API_KEY 获得 AI 增强分析。");
  return sections.join("\n");
}

async function execute(params) {
  const { message, modelConfig, brandName = "海底捞", intentParams = {}, onProgress, brandId = "haidilao" } = params;
  const startedAt = Date.now();
  const agentTrace = [];
  const resolvedBrandId = intentParams.brandId || brandId || "haidilao";
  const focus = detectComparisonFocus(message, intentParams);

  const loadedContext = await getContext(resolvedBrandId);
  const platforms = buildPlatformBenchmarks(loadedContext.competitorBenchmarks || []);
  const peerData = focus !== "platform" ? buildBrandPeerBenchmarks(loadedContext) : null;

  const { nl } = await prefetchNl2Sql({
    message,
    brandId: resolvedBrandId,
    modelConfig,
    intentParams,
    onProgress,
    agentTrace
  });

  const [{ generateText }, { createOpenAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai")
  ]);

  const model = createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelConfig.model);

  const toolsDefined = await buildToolDefinitions(focus);
  const systemPrompt = getSystemPrompt(brandName, message, intentParams, focus) + buildNl2SqlContextBlock(nl);

  let answer = "";
  let tokenUsage = emptyTokenUsage();
  const toolStart = Date.now();
  reportProgress(onProgress, buildStepStart(
    "竞对分析 Agent",
    focus === "platform"
      ? "getCompetitorBenchmark → retrieveKnowledge → runNl2Sql"
      : focus === "brand"
        ? "getBrandPeerBenchmark → retrieveKnowledge → runNl2Sql"
        : "getCompetitorBenchmark → getBrandPeerBenchmark → retrieveKnowledge → runNl2Sql"
  ));

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: buildChatMessages(params.history, message),
      tools: toolsDefined,
      maxSteps: 5,
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

    answer = finalizeAnswerWithNl2Sql(result.text, nl);
    tokenUsage = mergeTokenUsage(tokenUsage, extractUsageFromGenerateResult(result));

    if (result.steps) {
      for (const step of result.steps) {
        if (!step.toolCalls) continue;
        for (const tc of step.toolCalls) {
          tracePush(agentTrace, onProgress, {
            name: "工具调用",
            tool: tc.toolName,
            summary: "call " + tc.toolName + " done",
            durationMs: 0
          });
        }
      }
    }

    tracePush(agentTrace, onProgress, {
      name: "竞对分析Agent",
      summary: focus === "platform" ? "完成平台对比分析" : focus === "brand" ? "完成品牌竞品分析" : "完成平台与品牌竞品对比分析",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    // 调试态：LLM 失败不再降级到确定性分析，直接抛错暴露问题
    throw new Error("竞对分析 Agent LLM 调用失败：" + error.message);
  }

  const charts = [
    ...(focus !== "brand" ? buildPlatformCharts(platforms) : []),
    ...(focus !== "platform" ? buildBrandPeerCharts(peerData) : [])
  ];

  return {
    workflow: "competitor_benchmark",
    compareFocus: focus,
    answer,
    agentTrace,
    charts,
    tokenUsage,
    totalDurationMs: Date.now() - startedAt
  };
}

module.exports = { execute };
