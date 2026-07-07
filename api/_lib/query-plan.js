/**
 * QueryPlan：SQL 执行前的标准查询计划
 * 流程：build → validate（语义图谱合法性）→ generateSql → 写入 citation-registry
 */

const { monthKeyToEndDate } = require("./period-utils");
const { normalizeMonthEnd } = require("./month-end");
const {
  getMetricSpec,
  getTableMeta,
  getJoin,
  getDrillJoinPath,
  getMetricFieldMap,
  getTableRegistry,
  normalizeMetricId
} = require("./semantic-graph");

const GRAIN_RANK = { day: 1, week: 2, month: 3, quarter: 4, half_year: 5, year: 6, range: 7, cumulative: 8 };

function countPeriods(filters = {}) {
  if (filters.dateFrom && filters.dateTo) return 12;
  if (filters.month || (filters.year && filters.monthNum)) return 1;
  return 1;
}

function estimateRowCount(plan) {
  const metricSpec = plan.metricSpec || {};
  const cardinality = metricSpec.cardinality || {};
  const periods = countPeriods(plan.filters);
  let base = 1;

  if (plan.dimension === "city") base = cardinality.city || 15;
  else if (plan.dimension === "business_area") base = cardinality.business_area || 40;
  else if (plan.dimension === "poi") base = cardinality.poi || 31;
  else if (plan.dimension === "platform") base = cardinality.platform || 3;
  else if (plan.dimension === "keyword") base = cardinality.keyword || 20;
  else base = cardinality.brand || cardinality.city || 1;

  let multiplier = 1;
  (plan.joins || []).forEach((join) => {
    multiplier *= join.fanout && join.fanout.multiplier ? join.fanout.multiplier : 1;
  });
  if (metricSpec.fanout && metricSpec.fanout.multiplier) {
    multiplier = Math.max(multiplier, metricSpec.fanout.multiplier);
  }

  return Math.max(1, Math.round(base * periods * multiplier));
}

function resolveJoinsForPlan(params = {}) {
  const joins = [];
  const dimension = params.dimension || null;
  const table = params.primaryTable || params.table;

  if (dimension === "business_area" || dimension === "poi") {
    const join = getJoin("poi_fact_to_dim");
    if (join) joins.push(join);
  }

  if (params.queryType === "funnel_conversion" || params.metric === "funnel") {
    const poiJoin = getJoin("poi_fact_to_dim");
    const dealJoin = getJoin("deal_fact_to_dim");
    if (poiJoin && !joins.find((j) => j.id === poiJoin.id)) joins.push(poiJoin);
    if (dealJoin) joins.push(dealJoin);
  }

  if (table === "fact_city_brand_monthly") {
    const join = getJoin("city_fact_to_brand");
    if (join && params.includeBrandJoin) joins.push(join);
  }

  return joins;
}

function resolveGroupBy(dimension, metricSpec) {
  const groupBy = ["month"];
  if (dimension === "city") groupBy.push("city");
  else if (dimension === "business_area") groupBy.push("city", "business_area");
  else if (dimension === "poi") groupBy.push("city", "business_area", "poi_name");
  else if (dimension === "platform") groupBy.push("competitor");
  else if (dimension === "keyword") groupBy.push("search_word");
  else if (dimension && (metricSpec.drillLevels || []).includes(dimension)) groupBy.push(dimension);
  return groupBy;
}

function buildQueryPlan(params = {}) {
  const metric = normalizeMetricId(params.metric || "gmv");
  const metricSpec = getMetricSpec(metric) || getMetricSpec("gmv");
  const fieldMap = getMetricFieldMap();
  const fieldInfo = fieldMap[metric] || fieldMap.gmv;
  const timeRoute = params.timeRoute || {};
  const dimension = params.dimension || timeRoute.dimension || null;
  const primaryTable =
    params.table ||
    timeRoute.table ||
    fieldInfo.table ||
    metricSpec.primaryTable ||
    "fact_brand_monthly";
  const tableMeta = getTableMeta(primaryTable) || {};
  const joins = resolveJoinsForPlan({
    ...params,
    metric,
    dimension,
    primaryTable
  });
  const drillPath = dimension ? getDrillJoinPath(dimension) : null;

  const plan = {
    version: "1.0",
    source: params.source || "template",
    queryType: params.queryType || params.templateId || "data_query",
    metric,
    metricLabel: metricSpec.label || metric,
    metricSpec: {
      domain: metricSpec.domain,
      column: metricSpec.column || fieldInfo.field,
      derived: Boolean(metricSpec.derived),
      storageGrain: metricSpec.storageGrain,
      supportedGrains: metricSpec.supportedGrains,
      drillLevels: metricSpec.drillLevels,
      cardinality: metricSpec.cardinality,
      fanout: metricSpec.fanout,
      estimation: metricSpec.estimation
    },
    targetGrain: params.targetGrain || timeRoute.targetGrain || "month",
    effectiveGrain: params.effectiveGrain || timeRoute.effectiveGrain || "month",
    primaryTable,
    tableMeta: {
      domain: tableMeta.domain || metricSpec.domain,
      dateColumn: tableMeta.dateColumn || timeRoute.dateColumn || "month",
      kind: tableMeta.kind || timeRoute.tableKind
    },
    joins: joins.map((j) => ({
      id: j.id,
      from: j.from,
      to: j.to,
      type: j.type,
      cardinality: j.cardinality,
      fanout: j.fanout,
      estimation: j.estimation
    })),
    drillPath: drillPath
      ? {
          drillLevel: drillPath.drill_level,
          join: drillPath.join || null,
          estimation: drillPath.estimation,
          fanout: drillPath.fanout
        }
      : null,
    dimension,
    groupBy: resolveGroupBy(dimension, metricSpec),
    filters: {
      brandId: params.brandId || "haidilao",
      ...(params.filters || {})
    },
    aggregation: {
      field: fieldInfo.field || metricSpec.column || metric,
      method: metricSpec.estimation && metricSpec.estimation.method === "ratio" ? "ratio" : "sum",
      formula: (metricSpec.estimation && metricSpec.estimation.formula) || null
    },
    estimation: {
      expectedRowCount: null,
      fanoutRisk: "low",
      method: (metricSpec.estimation && metricSpec.estimation.method) || "direct_sum"
    },
    timeRoute: timeRoute.steps
      ? {
          targetGrain: timeRoute.targetGrain,
          effectiveGrain: timeRoute.effectiveGrain,
          table: timeRoute.table,
          tableKind: timeRoute.tableKind,
          sqlTimeClause: timeRoute.sqlTimeClause,
          periodLabel: timeRoute.periodLabel
        }
      : null,
    sql: params.sql || null,
    validation: { valid: true, errors: [], warnings: [] }
  };

  plan.estimation.expectedRowCount = estimateRowCount(plan);
  const fanoutLevels = [
    metricSpec.fanout && metricSpec.fanout.level,
    ...joins.map((j) => j.fanout && j.fanout.level)
  ].filter(Boolean);
  if (fanoutLevels.includes("high")) plan.estimation.fanoutRisk = "high";
  else if (fanoutLevels.includes("medium")) plan.estimation.fanoutRisk = "medium";

  return plan;
}

function validateQueryPlan(plan) {
  const errors = [];
  const warnings = [];
  const metricSpec = getMetricSpec(plan.metric);
  const tableRegistry = getTableRegistry();

  if (!metricSpec) {
    errors.push(`未知指标：${plan.metric}`);
  }

  if (plan.primaryTable && !tableRegistry[plan.primaryTable] && !plan.primaryTable.startsWith("dim_")) {
    const tableDoc = getTableMeta(plan.primaryTable);
    if (!tableDoc) errors.push(`未知事实表：${plan.primaryTable}`);
  }

  if (metricSpec && plan.effectiveGrain) {
    const supported = metricSpec.supportedGrains || ["month"];
    if (!supported.includes(plan.effectiveGrain)) {
      warnings.push({
        code: "GRAIN_DEGRADED",
        message: `指标 ${plan.metric} 不支持 ${plan.effectiveGrain}，计划使用 ${metricSpec.preferredGrain}`
      });
    }
  }

  if (metricSpec && plan.dimension) {
    const drillLevels = metricSpec.drillLevels || [];
    if (drillLevels.length && !drillLevels.includes(plan.dimension)) {
      warnings.push({
        code: "DIMENSION_NOT_IN_DRILL_LEVELS",
        message: `指标 ${plan.metric} 通常不在 ${plan.dimension} 维度拆解，将尝试 JOIN 路径`
      });
    }
  }

  if (plan.primaryTable && metricSpec) {
    const tables = metricSpec.primaryTables || (metricSpec.primaryTable ? [metricSpec.primaryTable] : []);
    if (tables.length && !tables.includes(plan.primaryTable) && plan.metric !== "funnel") {
      const tableMetrics = (tableRegistry[plan.primaryTable] && tableRegistry[plan.primaryTable].metrics) || [];
      if (!tableMetrics.includes(plan.metric) && !metricSpec.derived) {
        warnings.push({
          code: "TABLE_METRIC_MISMATCH",
          message: `表 ${plan.primaryTable} 未声明指标 ${plan.metric}，可能为代理字段或 JOIN 估算`
        });
      }
    }
  }

  (plan.joins || []).forEach((join) => {
    const spec = getJoin(join.id);
    if (!spec) {
      errors.push(`未知 JOIN：${join.id}`);
      return;
    }
    if (spec.fanout && spec.fanout.level === "high") {
      warnings.push({
        code: "JOIN_FANOUT_HIGH",
        message: `JOIN ${join.id} fanout 较高，结果行数可能膨胀`
      });
    }
  });

  if (plan.estimation.fanoutRisk === "high") {
    warnings.push({
      code: "PLAN_FANOUT_HIGH",
      message: `预估 fanout 风险：high，预计 ${plan.estimation.expectedRowCount} 行`
    });
  }

  if (!plan.filters.brandId) {
    errors.push("QueryPlan 缺少 brandId 过滤");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function buildPeriodClause(filters, dateColumn = "month") {
  const col = dateColumn || "month";
  if (filters.dateFrom && filters.dateTo) {
    return (
      ` AND ${col} >= '${normalizeMonthEnd(filters.dateFrom)}'` +
      ` AND ${col} <= '${normalizeMonthEnd(filters.dateTo)}'`
    );
  }
  if (filters.month) {
    const end = normalizeMonthEnd(filters.month);
    return end ? ` AND ${col} = '${end}'` : "";
  }
  if (filters.year && filters.monthNum) {
    const end = monthKeyToEndDate(`${filters.year}-${String(filters.monthNum).padStart(2, "0")}`);
    return end ? ` AND ${col} = '${end}'` : "";
  }
  return "";
}

function generateSqlFromPlan(plan) {
  if (plan.sql) return plan.sql;

  const brandId = plan.filters.brandId || "haidilao";
  const dateColumn = plan.tableMeta.dateColumn || "month";
  const period = buildPeriodClause(plan.filters, dateColumn);
  const field = plan.aggregation.field;
  const table = plan.primaryTable;

  if (plan.dimension === "business_area" || plan.dimension === "poi") {
    const dimCol = plan.dimension === "poi" ? "poi_name" : "business_area";
    const cityClause = plan.filters.city ? ` AND p.city = '${plan.filters.city}'` : "";
    return (
      `SELECT f.${dateColumn}, p.city, p.${dimCol}, SUM(f.visits) AS visits\n` +
      `FROM fact_poi_monthly f\n` +
      `JOIN dim_poi p ON f.poi_id = p.poi_id\n` +
      `WHERE p.brand_id = '${brandId}'${cityClause}${period.replace(/month/g, `f.${dateColumn}`)}\n` +
      `GROUP BY f.${dateColumn}, p.city, p.${dimCol}\n` +
      `ORDER BY visits DESC`
    );
  }

  if (table === "fact_city_brand_monthly") {
    const cityClause = plan.filters.city ? ` AND city = '${plan.filters.city}'` : "";
    const groupSuffix = plan.dimension === "city" ? ", city" : "";
    return (
      `SELECT ${dateColumn}${groupSuffix ? ", city" : ""}, ${field} AS value\n` +
      `FROM ${table}\n` +
      `WHERE brand_id = '${brandId}'${cityClause}${period}\n` +
      (groupSuffix ? `GROUP BY ${dateColumn}, city\n` : "") +
      `ORDER BY value DESC`
    );
  }

  if (table === "fact_brand_monthly") {
    const selectField = plan.metric === "gmv" && field === "gmv" ? "gtv" : field;
    return (
      `SELECT ${dateColumn}, ${selectField} AS value\n` +
      `FROM ${table}\n` +
      `WHERE brand_id = '${brandId}'${period}\n` +
      `ORDER BY ${dateColumn} DESC\n` +
      `LIMIT 50`
    );
  }

  return (
    `SELECT ${dateColumn}, ${field}\n` +
    `FROM ${table}\n` +
    `WHERE brand_id = '${brandId}'${period}\n` +
    `LIMIT 100`
  );
}

function compileQueryPlan(params = {}) {
  const plan = buildQueryPlan(params);
  const validation = validateQueryPlan(plan);
  plan.validation = validation;

  if (!validation.valid) {
    return { plan, validation, error: validation.errors.join("; ") };
  }

  plan.sql = params.sql || generateSqlFromPlan(plan);
  return { plan, validation };
}

module.exports = {
  buildQueryPlan,
  validateQueryPlan,
  generateSqlFromPlan,
  compileQueryPlan,
  estimateRowCount
};
