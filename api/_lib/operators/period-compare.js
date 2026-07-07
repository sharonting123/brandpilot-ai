/**
 * 同环比确定性算子
 */

const { registerCalculation } = require("../citation-registry");
const { buildRateFormula } = require("../calculation-format");

const METRIC_LABELS = {
  gmv: "GMV",
  gtv: "GTV",
  roi: "ROI",
  verified_orders: "核销订单",
  avg_order_value: "客单价"
};

function safeRate(numerator, denominator) {
  if (!denominator) return null;
  return (numerator - denominator) / denominator;
}

function formatRate(rate) {
  if (rate == null || !Number.isFinite(rate)) return null;
  return Number((rate * 100).toFixed(2));
}

function computePeriodCompare(params = {}) {
  const metric = params.metric || "gmv";
  const current = params.current || { period: "", value: 0 };
  const previous = params.previous || { period: "", value: 0 };
  const samePeriodLastYear = params.samePeriodLastYear || null;

  const mom = safeRate(current.value, previous.value);
  const yoy = samePeriodLastYear ? safeRate(current.value, samePeriodLastYear.value) : null;

  const result = {
    operator: "computePeriodCompare",
    metric,
    current,
    previous,
    samePeriodLastYear,
    mom,
    momPct: formatRate(mom),
    yoy,
    yoyPct: formatRate(yoy),
    direction:
      mom == null ? "unknown" : mom > 0.001 ? "up" : mom < -0.001 ? "down" : "flat",
    warnings: []
  };

  if (!previous.value) {
    result.warnings.push({
      code: "ZERO_DENOMINATOR",
      message: "上一期数值为 0，无法计算环比。"
    });
  }
  if (samePeriodLastYear && !samePeriodLastYear.value) {
    result.warnings.push({
      code: "ZERO_YOY_DENOMINATOR",
      message: "去年同期数值为 0，无法计算同比。"
    });
  }

  const metricLabel = METRIC_LABELS[metric] || metric;
  const currentLabel = current.period || "当期";
  const previousLabel = previous.period || "上期";
  const yoyLabel = samePeriodLastYear && samePeriodLastYear.period ? samePeriodLastYear.period : "去年同期";

  const formulaLines = [
    buildRateFormula({
      label: `${metricLabel}环比`,
      currentLabel,
      previousLabel,
      current: current.value,
      previous: previous.value,
      rate: mom
    })
  ];

  if (samePeriodLastYear) {
    formulaLines.push(
      buildRateFormula({
        label: `${metricLabel}同比`,
        currentLabel,
        previousLabel: yoyLabel,
        current: current.value,
        previous: samePeriodLastYear.value,
        rate: yoy
      })
    );
  }

  result.formulaLines = formulaLines;
  result.formulaText = formulaLines.join("\n");

  const calcRef = registerCalculation("环比计算 · " + metric, result.formulaText, {
    formula: "(current - previous) / previous",
    formulaLines,
    operator: "computePeriodCompare",
    inputs: params.inputRefs || [],
    result: {
      current: current.value,
      previous: previous.value,
      mom: result.mom,
      yoy: result.yoy
    },
    metric,
    periods: {
      current: current.period,
      previous: previous.period,
      samePeriodLastYear: samePeriodLastYear ? samePeriodLastYear.period : null
    }
  });

  result.refs = [calcRef.id, ...(params.inputRefs || [])];
  return result;
}

module.exports = {
  computePeriodCompare,
  safeRate,
  formatRate
};
