/**
 * period_compare 工作流：同环比 / 趋势 / 城市贡献拆解
 * Planner -> Query Engine -> Metric Operators -> Composer -> Quality Gates
 */

const { getContext } = require("../agent-tools");
const { buildAnalysisPlan } = require("../analysis-planner");
const { queryMetric, queryBreakdown } = require("../data-query-engine");
const { computePeriodCompare, computeContribution } = require("../metric-operators");
const { composeAnswer } = require("../answer-composer");
const { runQualityGates } = require("../quality-gates");
const { getCitationRegistry } = require("../citation-registry");
const { queryFromQuestion } = require("../data-query-engine");
const { tracePush, reportProgress, buildStepStart } = require("../workflow-progress");
const { emptyTokenUsage } = require("../token-usage");

const METRIC_LABELS = {
  gmv: "GMV",
  gtv: "GTV",
  roi: "ROI",
  verified_orders: "核销订单",
  avg_order_value: "客单价"
};

function buildCompareChart(calculations, metric) {
  const compare = (calculations || []).find((item) => item.operator === "computePeriodCompare");
  if (!compare) return [];
  const label = METRIC_LABELS[metric] || metric;
  return [{
    type: "bar",
    title: `${label} · 当期 vs 上期`,
    data: {
      labels: [compare.previous.period || "上期", compare.current.period || "当期"],
      datasets: [{ label, data: [compare.previous.value || 0, compare.current.value || 0] }]
    }
  }];
}

async function executePlanStep(step, state) {
  const brandId = state.brandId;
  if (step.type === "query") {
    if (step.tool === "queryMetric") {
      const result = await queryMetric({ brandId, ...step.params });
      state.queries[step.id] = result;
      state.facts.push({
        id: step.id,
        type: "metric",
        metric: result.metric,
        period: result.current && result.current.period,
        value: result.current && result.current.value,
        ref: result.citationRef
      });
      return;
    }
    if (step.tool === "queryBreakdown") {
      const result = await queryBreakdown({ brandId, ...step.params });
      state.queries[step.id] = result;
      state.facts.push({
        id: step.id,
        type: "breakdown",
        dimension: result.dimension,
        rowCount: result.rowCount,
        ref: result.citationRef
      });
    }
  }

  if (step.type === "calculate") {
    if (step.operator === "computePeriodCompare") {
      const current = state.queries.q_current && state.queries.q_current.current;
      const previous = state.queries.q_previous && state.queries.q_previous.current;
      const samePeriodLastYear = state.queries.q_yoy && state.queries.q_yoy.current;
      const calc = computePeriodCompare({
        metric: state.metric,
        current,
        previous,
        samePeriodLastYear,
        inputRefs: [
          state.queries.q_current && state.queries.q_current.citationRef,
          state.queries.q_previous && state.queries.q_previous.citationRef,
          state.queries.q_yoy && state.queries.q_yoy.citationRef
        ].filter(Boolean)
      });
      state.calculations.push(calc);
      return;
    }
    if (step.operator === "computeContribution") {
      const breakdown = state.queries.q_breakdown;
      const calc = computeContribution({
        dimension: (step.params && step.params.dimension) || (breakdown && breakdown.dimension) || "city",
        metric: state.metric,
        currentPeriod: state.plan.period.key,
        previousPeriod: state.plan.previous.key,
        rows: (breakdown && breakdown.breakdownRows) || [],
        inputRefs: [breakdown && breakdown.citationRef].filter(Boolean)
      });
      state.calculations.push(calc);
    }
  }
}

async function execute(params) {
  const {
    message,
    modelConfig,
    brandName = "海底捞",
    intentParams = {},
    onProgress,
    brandId = "haidilao",
    history = []
  } = params;
  const startedAt = Date.now();
  const agentTrace = [];
  const resolvedBrandId = intentParams.brandId || brandId || "haidilao";

  reportProgress(onProgress, buildStepStart("同环比分析", "生成分析计划并查数…"));

  const plan = buildAnalysisPlan("period_compare", message, intentParams);
  if (plan.error) {
    return {
      workflow: "period_compare",
      answer: "> " + plan.message,
      agentTrace,
      charts: [],
      tokenUsage: emptyTokenUsage(),
      totalDurationMs: Date.now() - startedAt,
      warnings: [plan.message]
    };
  }

  tracePush(agentTrace, onProgress, {
    name: "Analysis Planner",
    tool: "period_compare",
    summary: `计划 ${plan.steps.length} 步：${plan.metric} @ ${plan.period.key}`,
    durationMs: 0
  });

  const context = await getContext(resolvedBrandId);
  const state = {
    brandId: resolvedBrandId,
    plan,
    metric: plan.metric,
    queries: {},
    facts: [],
    calculations: []
  };

  const planStart = Date.now();
  for (const step of plan.steps) {
    await executePlanStep(step, state);
  }

  state.calculations.forEach((calc) => {
    const stepName =
      calc.operator === "computePeriodCompare"
        ? "环比/同比计算"
        : calc.operator === "computeContribution"
          ? "贡献度拆解"
          : "指标计算";
    tracePush(agentTrace, onProgress, {
      name: stepName,
      tool: calc.operator,
      summary: (calc.formulaLines && calc.formulaLines[0]) || "完成双指标计算",
      formulas: calc.formulaLines || [],
      durationMs: 0
    });
  });

  tracePush(agentTrace, onProgress, {
    name: "Metric Operators",
    tool: state.calculations.map((c) => c.operator).join(" → ") || "compute",
    summary: "完成确定性计算",
    formulas: state.calculations.flatMap((c) => c.formulaLines || []),
    durationMs: Date.now() - planStart
  });

  const nl = await queryFromQuestion({
    brandId: resolvedBrandId,
    question: message,
    modelConfig,
    intentParams
  });

  const composeStart = Date.now();
  const composed = await composeAnswer({
    scenario: "period_compare",
    message,
    history,
    modelConfig,
    brandName,
    metric: METRIC_LABELS[plan.metric] || plan.metric,
    period: plan.period,
    facts: state.facts,
    calculations: state.calculations,
    queries: Object.values(state.queries),
    warnings: state.calculations.flatMap((c) => c.warnings || [])
  });

  let answer = composed.answer || "";

  const references = getCitationRegistry();
  const quality = runQualityGates({
    answer,
    references,
    calculations: state.calculations,
    dataMode: context.dataMode
  });

  tracePush(agentTrace, onProgress, {
    name: "Answer Composer",
    tool: composed.mode || "compose",
    summary: quality.passed ? "完成结论表达" : "完成结论表达（存在质检告警）",
    durationMs: Date.now() - composeStart
  });

  if (!quality.passed || quality.issues.length) {
    tracePush(agentTrace, onProgress, {
      name: "Quality Gates",
      tool: "quality-gates",
      summary: quality.issues.map((i) => i.message).join("；") || "通过",
      durationMs: 0
    });
  }

  const charts = buildCompareChart(state.calculations, plan.metric);
  const warnings = [
    ...quality.issues.map((item) => item.message),
    ...state.calculations.flatMap((c) => (c.warnings || []).map((w) => w.message))
  ];

  return {
    workflow: "period_compare",
    answer,
    agentTrace,
    charts,
    calculations: state.calculations,
    quality,
    tokenUsage: emptyTokenUsage(),
    totalDurationMs: Date.now() - startedAt,
    warnings
  };
}

module.exports = { execute };
