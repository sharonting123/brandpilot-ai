/**
 * 分析算子统一入口
 */

const { buildFunnelMetrics } = require("./funnel-metrics");
const { registerCalculation } = require("./citation-registry");
const { computePeriodCompare } = require("./operators/period-compare");
const { computeContribution } = require("./operators/contribution");
const { buildFunnelStageFormulas } = require("./calculation-format");

function computeFunnel(context, filters = {}, inputRefs = []) {
  const metrics = buildFunnelMetrics(context, filters);
  const formulaLines = buildFunnelStageFormulas(metrics);
  const formulaText = formulaLines.join("\n");
  const calcRef = registerCalculation("漏斗转化计算", formulaText, {
    formula: "conversion_rate = current_stage / previous_stage",
    formulaLines,
    operator: "computeFunnel",
    inputs: inputRefs,
    result: {
      bottleneck: metrics.bottleneck,
      stageCount: (metrics.funnel || []).length
    },
    filters
  });
  return {
    operator: "computeFunnel",
    ...metrics,
    formulaLines,
    formulaText,
    refs: [calcRef.id, ...inputRefs]
  };
}

const OPERATORS = {
  computePeriodCompare,
  computeContribution,
  computeFunnel
};

function runOperator(name, params) {
  const fn = OPERATORS[name];
  if (!fn) throw new Error("未知算子：" + name);
  return fn(params);
}

module.exports = {
  OPERATORS,
  runOperator,
  computePeriodCompare,
  computeContribution,
  computeFunnel
};
