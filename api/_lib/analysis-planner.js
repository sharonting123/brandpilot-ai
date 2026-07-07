/**
 * 分析计划器：把用户问题拆成 query / calculate 步骤
 */

const { extractFilters } = require("./nl2sql");
const {
  parsePeriodLabel,
  previousPeriod,
  samePeriodLastYear,
  detectMetricFromText
} = require("./period-utils");
const { inferBreakdownDimension, getMetricQueryLevel, dimensionLabel } = require("./drill-knowledge-graph");

function buildPeriodComparePlan(message, intentParams = {}) {
  const text = String(message || "");
  const slots = intentParams.analysisSlots;
  const filters = slots ? { ...slots.filters } : extractFilters(text, intentParams);
  const drillScope = (slots && slots.drillScope) || intentParams.drillScope || { scopeLevel: "brand" };
  const parsed =
    (filters.year && filters.monthNum
      ? {
          year: Number(filters.year),
          monthNum: Number(filters.monthNum),
          key: `${filters.year}-${String(filters.monthNum).padStart(2, "0")}`
        }
      : null) || parsePeriodLabel(intentParams.periodLabel || intentParams.period || text);

  if (!parsed) {
    return {
      scenario: "period_compare",
      error: "PERIOD_NOT_FOUND",
      message: "未能从问题中识别分析周期，请说明具体月份（如 2026年6月）。"
    };
  }

  const metric = intentParams.metric || detectMetricFromText(text);
  const dimension =
    intentParams.dimension ||
    (slots && slots.dimension) ||
    inferBreakdownDimension(drillScope, text);
  const metricLevel = getMetricQueryLevel(drillScope);
  const prev = previousPeriod(parsed.year, parsed.monthNum);
  const yoy = samePeriodLastYear(parsed.year, parsed.monthNum);
  const wantsBreakdown = Boolean(dimension) || /拖累|贡献|拆解|哪里|哪个/.test(text);

  const metricParams = {
    metric,
    period: parsed.key,
    level: metricLevel.level,
    ...(metricLevel.city ? { city: metricLevel.city } : {})
  };

  const steps = [
    {
      id: "q_current",
      type: "query",
      tool: "queryMetric",
      params: { ...metricParams, period: parsed.key }
    },
    {
      id: "q_previous",
      type: "query",
      tool: "queryMetric",
      params: { ...metricParams, period: prev.key }
    },
    {
      id: "c_mom",
      type: "calculate",
      operator: "computePeriodCompare",
      inputs: ["q_current", "q_previous"]
    }
  ];

  if (/同比|去年/.test(text)) {
    steps.splice(2, 0, {
      id: "q_yoy",
      type: "query",
      tool: "queryMetric",
      params: { ...metricParams, period: yoy.key }
    });
    steps[steps.length - 1].inputs = ["q_current", "q_previous", "q_yoy"];
  }

  if (wantsBreakdown && dimension) {
    steps.push({
      id: "q_breakdown",
      type: "query",
      tool: "queryBreakdown",
      params: {
        metric,
        dimension,
        periods: [parsed.key, prev.key],
        ...(drillScope.city ? { city: drillScope.city } : {}),
        ...(drillScope.businessArea ? { businessArea: drillScope.businessArea } : {})
      }
    });
    steps.push({
      id: "c_contrib",
      type: "calculate",
      operator: "computeContribution",
      inputs: ["q_breakdown"],
      params: { dimension }
    });
  }

  return {
    scenario: "period_compare",
    metric,
    dimension,
    drillScope,
    metricLevel,
    period: parsed,
    previous: prev,
    samePeriodLastYear: yoy,
    steps,
    planSummary: wantsBreakdown && dimension
      ? `${metricLevel.city || "品牌"}${dimensionLabel(dimension)}贡献拆解`
      : `${metricLevel.city || "品牌"}${metric}同环比`
  };
}

function buildAnalysisPlan(scenario, message, intentParams = {}) {
  if (scenario === "period_compare") {
    return buildPeriodComparePlan(message, intentParams);
  }
  return { scenario, steps: [] };
}

module.exports = {
  buildAnalysisPlan,
  buildPeriodComparePlan
};
