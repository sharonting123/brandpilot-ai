/**
 * Intent Router 分析槽位提取
 * 场景识别后统一解析：时间范围、目标粒度、指标、维度、下钻层级
 */

const {
  parseTimeSemantics,
  judgeTargetGrain,
  detectMetricFromText
} = require("./time-router");
const {
  resolveDrillScope,
  inferBreakdownDimension,
  detectExplicitDimension,
  formatDrillPath,
  dimensionLabel,
  validateDrillQuestion
} = require("./drill-knowledge-graph");
const { getQueryTypeMap, getScenario, detectTrafficPathFromText, trafficPathLabel } = require("./semantic-graph");

const WORKFLOW_QUERY_TYPE_FALLBACK = {
  funnel_diagnosis: "funnel_conversion",
  period_compare: "period_compare",
  competitor_benchmark: "competitor_benchmark",
  data_query: "data_query"
};

function workflowToQueryType(workflow) {
  const map = getQueryTypeMap();
  return map[workflow] || WORKFLOW_QUERY_TYPE_FALLBACK[workflow] || "";
}

function detectDimensionFromText(text, intentParams = {}) {
  const scope = resolveDrillScope(text, intentParams);
  return inferBreakdownDimension(scope, text) || detectExplicitDimension(text);
}

function workflowLabel(workflow) {
  const scenario = getScenario(workflow);
  if (scenario && scenario.label) return scenario.label;
  return workflow;
}

/**
 * 从用户消息 + 已识别 workflow 提取完整分析槽位
 */
function extractAnalysisSlots(message, options = {}) {
  const text = String(message || "").trim();
  const workflow = options.workflow || "data_query";
  const intentParams = options.intentParams || {};
  const queryType = options.queryType || workflowToQueryType(workflow);

  const semantics = parseTimeSemantics(text, intentParams);
  const grainDecision = judgeTargetGrain(semantics, { queryType });
  const metric = intentParams.metric || detectMetricFromText(text);
  const drillScope = resolveDrillScope(text, intentParams);
  const dimension = intentParams.dimension || inferBreakdownDimension(drillScope, text) || detectExplicitDimension(text);
  const trafficPath =
    intentParams.trafficPath ||
    (intentParams.filters && intentParams.filters.trafficPath) ||
    detectTrafficPathFromText(text);
  const drillWarnings = validateDrillQuestion(drillScope, dimension, text);

  const time = {
    expressionType: semantics.expressionType,
    periodLabel: semantics.periodLabel || semantics.rangeLabel || null,
    monthKey: semantics.monthKey || null,
    monthEnd: semantics.monthEnd || null,
    from: semantics.from || null,
    to: semantics.to || null,
    year: semantics.year || null,
    monthNum: semantics.monthNum || null
  };

  const grain = {
    requested: semantics.requestedGrain || "month",
    target: grainDecision.targetGrain,
    reason: grainDecision.reason
  };

  const filters = {};
  if (time.year) filters.year = String(time.year);
  if (time.monthNum) filters.monthNum = time.monthNum;
  if (time.monthEnd) filters.month = time.monthEnd;
  if (time.from) filters.dateFrom = time.from;
  if (time.to) filters.dateTo = time.to;
  if (time.periodLabel) filters.periodLabel = time.periodLabel;
  if (drillScope.city) filters.city = drillScope.city;
  if (drillScope.businessArea) filters.businessArea = drillScope.businessArea;
  if (dimension) filters.dimension = dimension;
  if (trafficPath) {
    filters.trafficPath = trafficPath;
    filters.trafficPathLabel = trafficPathLabel(trafficPath);
  }

  const drillSummary = [
    formatDrillPath(drillScope),
    dimension ? `拆解维度 ${dimensionLabel(dimension)}` : null
  ]
    .filter(Boolean)
    .join(" · ");

  const steps = [
    {
      stage: "scenario",
      label: "识别场景",
      summary: workflowLabel(workflow)
    },
    {
      stage: "time",
      label: "识别时间范围",
      summary: time.periodLabel || semantics.rangeLabel || `${grain.requested} 粒度时间表达`
    },
    {
      stage: "grain",
      label: "识别目标粒度",
      summary: grain.reason || `${grain.requested} → ${grain.target}`
    },
    {
      stage: "metric",
      label: "识别指标 / 维度",
      summary: [
        `指标 ${metric}`,
        trafficPath ? `流量来源 ${trafficPathLabel(trafficPath)}` : null,
        drillSummary,
        drillWarnings.length ? drillWarnings[0].message : null
      ]
        .filter(Boolean)
        .join(" · ")
    }
  ];

  return {
    workflow,
    queryType,
    metric,
    dimension,
    trafficPath: trafficPath || null,
    drillScope,
    drillWarnings,
    time,
    grain,
    semantics,
    filters,
    steps
  };
}

function mergeSlotsIntoIntentParams(params, slots) {
  return {
    ...params,
    metric: slots.metric,
    dimension: slots.dimension || params.dimension,
    grain: slots.grain.target,
    requestedGrain: slots.grain.requested,
    periodLabel: slots.time.periodLabel,
    month: slots.time.monthEnd,
    dateFrom: slots.time.from,
    dateTo: slots.time.to,
    city: slots.drillScope.city || params.city,
    businessArea: slots.drillScope.businessArea || params.businessArea,
    trafficPath: slots.trafficPath || params.trafficPath,
    drillScope: slots.drillScope,
    filters: { ...(params.filters || {}), ...slots.filters },
    analysisSlots: slots
  };
}

module.exports = {
  extractAnalysisSlots,
  detectDimensionFromText,
  workflowToQueryType,
  mergeSlotsIntoIntentParams,
  WORKFLOW_QUERY_TYPE: WORKFLOW_QUERY_TYPE_FALLBACK
};
