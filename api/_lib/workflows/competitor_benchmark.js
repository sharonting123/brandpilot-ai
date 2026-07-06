/**
 * competitor_benchmark 工作流
 * - 平台对比：美团 vs 抖音
 * - 品牌竞品：海底捞 vs 呷哺呷哺
 */

const { buildChatMessages } = require("../workflow-utils");
const { tracePush, reportProgress, buildStepStart } = require("../workflow-progress");
const {
  buildPlatformBenchmarks,
  buildBrandPeerBenchmarks,
  detectComparisonFocus
} = require("../brand-peer");
const { getContext } = require("../agent-tools");
const { emptyTokenUsage, mergeTokenUsage, extractUsageFromGenerateResult } = require("../token-usage");

function getSystemPrompt(brandName, intentParams) {
  const focus = detectComparisonFocus("", intentParams);
  const focusLine =
    focus === "brand"
      ? "本次重点做品牌竞品对比（海底捞 vs 呷哺呷哺）。"
      : focus === "platform"
        ? "本次重点做平台对比（美团 vs 抖音）。"
        : "本次需同时覆盖平台对比（美团 vs 抖音）与品牌竞品（海底捞 vs 呷哺呷哺）。";

  return [
    "你是 BrandPilot AI 的竞对分析专家，正在为「" + brandName + "」做对比分析。",
    focusLine,
    "",
    "你的任务：",
    "1. 拉取平台对比数据（美团 vs 抖音）",
    "2. 拉取品牌竞品数据（海底捞 vs 呷哺呷哺）",
    "3. 分别给出平台差异与品牌差异，并输出差异化经营建议",
    "",
    "对比框架：",
    "- 平台对比：美团高意图搜索、高核销；抖音高内容流量、低核销、补贴更高",
    "- 品牌竞品：对比 GMV/GTV、客单价、核销率、ROI，识别海底捞相对呷哺呷哺的优势城市",
    "",
    "回复结构：",
    "1. 【平台对比】美团 vs 抖音",
    "2. 【品牌竞品】海底捞 vs 呷哺呷哺",
    "3. 【差异化建议】3-4 条可执行策略",
    "",
    "禁止编造数据，只使用工具返回的真实数值。"
  ].join("\n");
}

async function buildToolDefinitions() {
  const { buildSharedTools } = require("../ai-tools-factory");
  return buildSharedTools(["getCompetitorBenchmark", "getBrandPeerBenchmark", "retrieveKnowledge", "runNl2Sql"]);
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
  const labels = [peerData.ownBrand.name, peerData.peerBrand.name];
  return [{
    type: "comparison",
    title: "品牌竞品 · 海底捞 vs 呷哺呷哺",
    data: {
      labels,
      datasets: [
        { label: "GTV（万元）", data: [peerData.ownBrand.gtv / 10000, peerData.peerBrand.gtv / 10000] },
        { label: "客单价（元）", data: [peerData.ownBrand.avgOrderValue, peerData.peerBrand.avgOrderValue] },
        { label: "核销率 (%)", data: [peerData.ownBrand.verifiedRate * 100, peerData.peerBrand.verifiedRate * 100] }
      ]
    }
  }, {
    type: "bar",
    title: "同城市 GMV 对比（万元）",
    data: {
      labels: peerData.cities.map((item) => item.city),
      datasets: [
        { label: peerData.ownBrand.name, data: peerData.cities.map((item) => (item.own.gmv || 0) / 10000) },
        { label: peerData.peerBrand.name, data: peerData.cities.map((item) => (item.peer.gmv || 0) / 10000) }
      ]
    }
  }];
}

function buildDeterministicAnswer(brandName, platforms, peerData) {
  const platformRows = platforms.map((item) =>
    "| " + item.name + " | " + ((item.marketShare || 0) * 100).toFixed(0) + "% | " +
    (item.avgOrderValue || 0).toFixed(0) + "元 | " +
    ((item.verificationRate || 0) * 100).toFixed(1) + "% | " +
    ((item.subsidyRate || 0) * 100).toFixed(1) + "% |"
  ).join("\n");

  const peer = peerData || buildBrandPeerBenchmarks({});
  const cityRows = (peer.cities || []).map((item) =>
    "| " + item.city + " | " + ((item.own.gmv || 0) / 10000).toFixed(0) + "万 | " +
    ((item.peer.gmv || 0) / 10000).toFixed(0) + "万 | " +
    ((item.own.verifiedRate || 0) * 100).toFixed(1) + "% | " +
    ((item.peer.verifiedRate || 0) * 100).toFixed(1) + "% |"
  ).join("\n");

  return [
    "# " + brandName + " 竞对对比分析（确定性分析）",
    "",
    "## 平台对比 · 美团 vs 抖音",
    "| 平台 | 渠道份额 | 客单价 | 核销率 | 补贴率 |",
    "|------|---------|--------|--------|--------|",
    platformRows,
    "",
    "- **美团**：高意图搜索、核销率更高，是核心成交阵地。",
    "- **抖音**：内容流量占比更高，但核销率与客单价偏低，补贴依赖更强。",
    "",
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
    "",
    "## 差异化建议",
    "- **美团阵地**：继续放大高核销套餐与搜索广告，巩固成交效率优势。",
    "- **抖音承接**：以种草曝光为主，核销引导至美团或会员私域。",
    "- **品牌溢价**：海底捞在客单价与 GMV 上领先，重点守住高线城市核心商圈。",
    "- **竞品防守**：呷哺在部分城市 ROI 接近，需关注套餐价差与错峰策略。",
    "",
    "> 确定性分析模式，建议配置 MODEL_API_KEY 获得 AI 增强分析。"
  ].join("\n");
}

async function execute(params) {
  const { message, modelConfig, brandName = "海底捞", intentParams = {}, onProgress } = params;
  const startedAt = Date.now();
  const agentTrace = [];

  const loadedContext = await getContext("haidilao");
  const platforms = buildPlatformBenchmarks(loadedContext.competitorBenchmarks || []);
  const peerData = buildBrandPeerBenchmarks(loadedContext);

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

  let answer = "";
  let tokenUsage = emptyTokenUsage();
  const toolStart = Date.now();
  reportProgress(onProgress, buildStepStart("竞对分析 Agent", "拉取平台与品牌竞品数据…"));

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

    answer = result.text;
    tokenUsage = mergeTokenUsage(tokenUsage, extractUsageFromGenerateResult(result));

    if (result.steps) {
      for (const step of result.steps) {
        if (!step.toolCalls) continue;
        for (const tc of step.toolCalls) {
          tracePush(agentTrace, onProgress, {
            name: "工具调用",
            tool: tc.toolName,
            summary: "调用 " + tc.toolName + " 完成",
            durationMs: 0
          });
        }
      }
    }

    tracePush(agentTrace, onProgress, {
      name: "竞对分析Agent",
      tool: "推理完成",
      summary: "完成平台与品牌竞品对比分析",
      durationMs: Date.now() - toolStart
    });
  } catch (error) {
    answer = buildDeterministicAnswer(brandName, platforms, peerData);
    tracePush(agentTrace, onProgress, {
      name: "竞对分析Agent",
      tool: "fallback",
      summary: "LLM 调用失败：" + error.message + "，使用确定性分析",
      durationMs: Date.now() - toolStart
    });
  }

  const charts = [
    ...buildPlatformCharts(platforms),
    ...buildBrandPeerCharts(peerData)
  ];

  return {
    workflow: "competitor_benchmark",
    answer,
    agentTrace,
    charts,
    tokenUsage,
    totalDurationMs: Date.now() - startedAt
  };
}

module.exports = { execute };
