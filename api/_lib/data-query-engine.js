/**
 * 统一数据查询引擎
 * 优先级：固定模板 SQL > SQL 生成 Agent > 无法回答
 */

const { getContext } = require("./agent-tools");
const { registerDataTable, registerSqlQuery, registerQueryPlan } = require("./citation-registry");
const { getModelConfig } = require("./env");
const {
  SCHEMA_CATALOG,
  extractFilters,
  pickTemplate,
  getQueryTemplate
} = require("./nl2sql");
const { executeSqlPlan } = require("./sql-executor");
const { monthMatches, periodKey, parsePeriodLabel, monthKeyToEndDate } = require("./period-utils");
const { routeTimeQuery, detectMetricFromText } = require("./time-router");
const { compileQueryPlan } = require("./query-plan");
const { getMetricFieldMap } = require("./semantic-graph");
const { resolveQueryPeriodFilters, ensurePeriodInSql } = require("./sql-period");

function getMetricField(metric) {
  const map = getMetricFieldMap();
  return map[metric] || map.gmv;
}

function buildQueryResult(payload) {
  return {
    queryId: payload.citationRef || null,
    queryPlanRef: payload.queryPlanRef || null,
    queryPlan: payload.queryPlan || null,
    table: payload.table || "",
    sql: payload.sql || "",
    filters: payload.filters || {},
    rows: payload.rows || [],
    rowCount: payload.rowCount || 0,
    dataMode: payload.dataMode || "empty",
    citationRef: payload.citationRef || null,
    generationMode: payload.generationMode || "template",
    queryType: payload.queryType || "",
    agentReasoning: payload.agentReasoning || "",
    explanation: payload.explanation || "",
    timeRoute: payload.timeRoute || null
  };
}

function registerQueryResult(templateId, sql, rows, context, filters, meta = {}) {
  const resultRows = (rows || []).slice(0, 50);
  const resultTable = meta.table || "";
  const schemaHint = SCHEMA_CATALOG.find((s) => s.table === resultTable) || null;
  const brandId = meta.brandId || filters.brandId || "haidilao";
  const metric = meta.metric || filters.metric || detectMetricFromText(meta.question || "");
  const dateColumn =
    (meta.timeRoute && meta.timeRoute.dateColumn) ||
    (schemaHint && schemaHint.dateColumn) ||
    "month";

  const finalSql = ensurePeriodInSql(sql, filters, {
    table: resultTable,
    dateColumn,
    timeRoute: meta.timeRoute || null,
    skipPeriod: meta.skipPeriod === true
  });

  const compiled = compileQueryPlan({
    source: meta.generationMode || "template",
    queryType: meta.queryType || templateId,
    templateId,
    metric,
    table: resultTable,
    dimension: meta.dimension || filters.dimension || null,
    brandId,
    filters,
    timeRoute: meta.timeRoute || null,
    sql: finalSql
  });

  if (!compiled.validation.valid) {
    throw new Error("QueryPlan 校验失败：" + compiled.validation.errors.join("; "));
  }

  const planRef = registerQueryPlan(compiled.plan);
  registerDataTable(resultTable, (schemaHint || {}).description || resultTable, {
    brandId,
    sql: finalSql,
    filters,
    dataMode: context.dataMode,
    rowCount: rows.length,
    rows: resultRows
  });
  const sqlRef = registerSqlQuery(templateId, finalSql, `返回 ${rows.length} 行`, {
    table: resultTable,
    sql: finalSql,
    filters,
    rowCount: rows.length,
    rows: resultRows,
    dataMode: context.dataMode,
    schemaHint,
    generationMode: meta.generationMode || "template",
    queryPlan: compiled.plan,
    queryPlanRef: planRef.id
  });
  return buildQueryResult({
    table: resultTable,
    sql: finalSql,
    filters,
    rows: resultRows,
    rowCount: rows.length,
    dataMode: context.dataMode,
    citationRef: sqlRef.id,
    queryPlanRef: planRef.id,
    queryPlan: compiled.plan,
    generationMode: meta.generationMode,
    queryType: meta.queryType || templateId,
    agentReasoning: meta.agentReasoning || "",
    explanation: meta.explanation || "",
    timeRoute: meta.timeRoute || null
  });
}

async function queryFromQuestion(params = {}) {
  const brandId = params.brandId || "haidilao";
  const question = String(params.question || params.query || "").trim();
  if (!question) {
    return { error: "question 不能为空", question };
  }

  const context = await getContext(brandId);
  const analysisSlots = params.analysisSlots || (params.intentParams && params.intentParams.analysisSlots) || null;
  const metric = (analysisSlots && analysisSlots.metric) || detectMetricFromText(question);
  let template = pickTemplate(question);
  const timeRoute = routeTimeQuery({
    question,
    metric,
    queryType: template ? template.id : (analysisSlots && analysisSlots.queryType) || "",
    intentParams: params.intentParams || {},
    analysisSlots,
    dimension: analysisSlots && analysisSlots.dimension
  });
  const mergedFilters = {
    ...(analysisSlots ? analysisSlots.filters : {}),
    ...timeRoute.filters,
    ...extractFilters(question, params.intentParams || {}, { skipTimeRoute: true }),
    ...(params.filters || {})
  };
  const filters = resolveQueryPeriodFilters(mergedFilters, context, {
    question,
    queryType: template ? template.id : (analysisSlots && analysisSlots.queryType) || "",
    table: timeRoute.table || (template && template.table),
    targetGrain: timeRoute.targetGrain,
    requestedGrain: timeRoute.semantics && timeRoute.semantics.requestedGrain
  });
  if (filters._periodDefaulted && !timeRoute.sqlTimeClause && filters.month) {
    timeRoute.sqlTimeClause = ` AND month = '${filters.month}'`;
    timeRoute.periodLabel = timeRoute.periodLabel || `${filters.year || 2026}年${filters.monthNum || ""}月`;
  }
  const modelConfig = params.modelConfig || getModelConfig();

  let generationMode = "template";
  let agentReasoning = "";
  let queryType = "";

  if (template) {
    const sql = template.sql(brandId, filters);
    const rows = template.run(context, filters);
    queryType = template.id;
    return {
      question,
      ...registerQueryResult(template.id, sql, rows, context, filters, {
        table: template.table,
        brandId,
        generationMode,
        queryType,
        timeRoute,
        metric,
        dimension: analysisSlots && analysisSlots.dimension,
        question
      }),
      templateId: template.id,
      timeRoute
    };
  }

  if (modelConfig && modelConfig.configured) {
    try {
      const { generateSqlPlan } = require("./sql-generation-agent");
      const plan = await generateSqlPlan({ question, brandId, filters, modelConfig, timeRoute });
      const executed = executeSqlPlan(context, plan, brandId, filters, {
        timeRoute,
        dateColumn: timeRoute.dateColumn
      });
      generationMode = "agent";
      agentReasoning = plan.reasoning || "";
      queryType = plan.queryType;
      Object.assign(filters, executed.filters || {});
      return {
        question,
        ...registerQueryResult(queryType, executed.sql, executed.rows, context, filters, {
          table: timeRoute.table || executed.template.table,
          brandId,
          generationMode,
          queryType,
          agentReasoning,
          explanation: `SQL 生成 Agent 识别为「${queryType}」`,
          timeRoute,
          metric,
          question
        }),
        templateId: executed.template.id,
        timeRoute
      };
    } catch {
      // fall through
    }
  }

  return {
    question,
    error: "NO_MATCHING_TEMPLATE",
    message: "没有此类数据：未匹配到查询模板，且 SQL Agent 未能生成有效查询。",
    filters,
    dataMode: context.dataMode,
    timeRoute,
    availableTemplates: require("./nl2sql").QUERY_TEMPLATES.map((t) => t.id)
  };
}

function readBrandMetric(context, metric, period) {
  const parsed = typeof period === "object" && period.key ? period : parsePeriodLabel(period);
  if (!parsed) return null;
  const field = metric === "gmv" ? "gtv" : metric;
  const row = (context.monthlyFacts || []).find((item) => monthMatches(item.month, parsed.key));
  if (!row) return { period: parsed.key, value: 0, raw: null };
  const value = Number(row[field] ?? row.gtv ?? 0) || 0;
  return { period: parsed.key, value, raw: row };
}

async function queryMetric(params = {}) {
  const brandId = params.brandId || "haidilao";
  const metric = params.metric || "gmv";
  const level = params.level || "brand";
  const city = params.city || null;
  const context = await getContext(brandId);
  const period =
    params.period ||
    (params.filters && params.filters.year && params.filters.monthNum
      ? periodKey(params.filters.year, params.filters.monthNum)
      : null);

  if (level === "city" && city) {
    const parsed = typeof period === "object" && period.key ? period : parsePeriodLabel(period);
    const fieldInfo = getMetricField(metric);
    const field = fieldInfo.field || metric;
    const row = (context.cityMonthlyFacts || []).find(
      (item) => item.city === city && monthMatches(item.month, parsed && parsed.key)
    );
    const value = row ? Number(row[field] || 0) : 0;
    const periodKeyStr = parsed ? parsed.key : String(period || "");
    const sql =
      `SELECT month, city, ${field} AS value\n` +
      `FROM fact_city_brand_monthly\n` +
      `WHERE brand_id = '${brandId}' AND city = '${city}'` +
      (periodKeyStr ? ` AND month LIKE '${periodKeyStr}%'` : "") +
      `\nLIMIT 1`;
    const rows = row ? [{ month: row.month, city, value }] : [];
    const result = registerQueryResult(
      "queryMetric",
      sql,
      rows,
      context,
      { brandId, metric, period: periodKeyStr, level, city },
      { table: "fact_city_brand_monthly", queryType: "queryMetric", brandId, metric, dimension: "city" }
    );
    return {
      ...result,
      metric,
      level,
      city,
      current: { period: periodKeyStr, value, raw: row }
    };
  }

  const current = readBrandMetric(context, metric, period || params.filters);
  const fieldInfo = getMetricField(metric);
  const selectField =
    metric === "gmv" && fieldInfo.brandField ? fieldInfo.brandField : fieldInfo.field || metric;
  const sql =
    `SELECT month, ${selectField} AS value\n` +
    `FROM fact_brand_monthly\n` +
    `WHERE brand_id = '${brandId}'` +
    (current ? ` AND month LIKE '${current.period}%'` : "") +
    `\nLIMIT 1`;
  const rows = current ? [{ month: current.period, value: current.value }] : [];
  const result = registerQueryResult(
    "queryMetric",
    sql,
    rows,
    context,
    { brandId, metric, period: current ? current.period : period },
    { table: "fact_brand_monthly", queryType: "queryMetric", brandId, metric }
  );
  return { ...result, metric, current };
}

async function queryBreakdown(params = {}) {
  const brandId = params.brandId || "haidilao";
  const metric = params.metric || "gmv";
  const dimension = params.dimension || "city";
  const periods = params.periods || [];
  const cityFilter = params.city || null;
  const businessAreaFilter = params.businessArea || null;
  const context = await getContext(brandId);
  const fieldInfo = getMetricField(metric);
  const field = fieldInfo.field || metric;
  const periodKeys = periods.map((p) => (typeof p === "string" ? p : p.key)).filter(Boolean);

  if (dimension === "city") {
    const rows = [];
    (context.cityMonthlyFacts || []).forEach((row) => {
      const key = String(row.month || "").slice(0, 7);
      if (!periodKeys.includes(key)) return;
      rows.push({
        period: key,
        city: row.city,
        value: Number(row[field] || 0)
      });
    });

    const sql =
      `SELECT month, city, ${field} AS value\n` +
      `FROM fact_city_brand_monthly\n` +
      `WHERE brand_id = '${brandId}'` +
      (periodKeys.length
        ? ` AND month IN (${periodKeys.map((p) => `'${monthKeyToEndDate(p)}'`).join(", ")})`
        : "") +
      `\nORDER BY ${field} DESC`;

    const result = registerQueryResult(
      "queryBreakdown",
      sql,
      rows,
      context,
      { brandId, metric, dimension, periods: periodKeys },
      { table: "fact_city_brand_monthly", queryType: "queryBreakdown", brandId, metric, dimension }
    );
    return { ...result, metric, dimension, periods: periodKeys, breakdownRows: rows };
  }

  if (dimension === "business_area" || dimension === "poi") {
    const pois = (context.pois || []).filter((poi) => {
      if (cityFilter && poi.city !== cityFilter) return false;
      if (businessAreaFilter && poi.business_area !== businessAreaFilter) return false;
      return true;
    });
    const poiFacts = context.dailyFacts && context.dailyFacts.poiFacts ? context.dailyFacts.poiFacts : [];
    const cityFacts = context.cityMonthlyFacts || [];
    const rows = [];

    periodKeys.forEach((periodKey) => {
      const monthEnd = monthKeyToEndDate(periodKey);
      const scopedPois = pois;
      const factRows = poiFacts.filter((row) => String(row.month).slice(0, 7) === periodKey);
      const weightByPoi = {};
      let totalWeight = 0;
      scopedPois.forEach((poi) => {
        const fact = factRows.find((row) => row.poi_id === poi.poi_id);
        const weight = Number((fact && (fact.visits || fact.deal_clicks)) || 0) || 1;
        weightByPoi[poi.poi_id] = weight;
        totalWeight += weight;
      });

      const cityRows = cityFilter
        ? cityFacts.filter(
            (row) => row.city === cityFilter && String(row.month).slice(0, 7) === periodKey
          )
        : cityFacts.filter((row) => String(row.month).slice(0, 7) === periodKey);
      const cityGmvTotal = cityRows.reduce((sum, row) => sum + Number(row.gmv || 0), 0);

      const grouped = {};
      scopedPois.forEach((poi) => {
        const dimKey =
          dimension === "poi"
            ? poi.poi_name || poi.poi_id
            : poi.business_area || "未知商圈";
        const share = totalWeight ? (weightByPoi[poi.poi_id] || 0) / totalWeight : 0;
        const cityGmv = cityFilter
          ? Number((cityRows[0] && cityRows[0].gmv) || 0)
          : cityGmvTotal / Math.max(cityRows.length, 1);
        const value = Math.round(cityGmv * share);
        if (!grouped[dimKey]) grouped[dimKey] = 0;
        grouped[dimKey] += value;
      });

      Object.keys(grouped).forEach((dimKey) => {
        const row = {
          period: periodKey,
          value: grouped[dimKey]
        };
        row[dimension] = dimKey;
        if (cityFilter) row.city = cityFilter;
        rows.push(row);
      });
    });

    const dimCol = dimension === "poi" ? "poi_name" : "business_area";
    const sql =
      `SELECT f.month, p.city, p.${dimCol}, SUM(f.visits) AS visits\n` +
      `FROM fact_poi_monthly f\n` +
      `JOIN dim_poi p ON f.poi_id = p.poi_id\n` +
      `WHERE p.brand_id = '${brandId}'` +
      (cityFilter ? ` AND p.city = '${cityFilter}'` : "") +
      (businessAreaFilter ? ` AND p.business_area = '${businessAreaFilter}'` : "") +
      (periodKeys.length
        ? ` AND f.month IN (${periodKeys.map((p) => `'${monthKeyToEndDate(p)}'`).join(", ")})`
        : "") +
      `\nGROUP BY f.month, p.city, p.${dimCol}\n` +
      `ORDER BY visits DESC`;

    const result = registerQueryResult(
      "queryBreakdown",
      sql,
      rows,
      context,
      { brandId, metric, dimension, periods: periodKeys, city: cityFilter, businessArea: businessAreaFilter },
      { table: "fact_poi_monthly", queryType: "queryBreakdown", brandId, metric, dimension }
    );
    return { ...result, metric, dimension, periods: periodKeys, breakdownRows: rows };
  }

  return { error: "UNSUPPORTED_DIMENSION", dimension };
}

async function queryTrend(params = {}) {
  const brandId = params.brandId || "haidilao";
  const metric = params.metric || "gtv";
  const context = await getContext(brandId);
  const field = metric === "gmv" ? "gtv" : metric;
  const rows = [...(context.monthlyFacts || [])]
    .sort((a, b) => String(a.month).localeCompare(String(b.month)))
    .map((row) => ({
      month: String(row.month).slice(0, 7),
      value: Number(row[field] || 0)
    }));
  const sql =
    `SELECT month, ${field} AS value\n` +
    `FROM fact_brand_monthly\n` +
    `WHERE brand_id = '${brandId}'\n` +
    `ORDER BY month ASC`;
  return registerQueryResult("queryTrend", sql, rows, context, { brandId, metric }, {
    table: "fact_brand_monthly",
    queryType: "queryTrend",
    brandId,
    skipPeriod: true
  });
}

async function queryFunnelBase(params = {}) {
  const template = getQueryTemplate("funnel_conversion");
  if (!template) return { error: "FUNNEL_TEMPLATE_MISSING" };
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const filters = params.filters || extractFilters(params.question || "");
  const sql = template.sql(brandId, filters);
  const rows = template.run(context, filters);
  return {
    ...registerQueryResult("funnel_conversion", sql, rows, context, filters, {
      table: template.table,
      queryType: "funnel_conversion",
      brandId
    }),
    filters
  };
}

module.exports = {
  queryFromQuestion,
  queryMetric,
  queryBreakdown,
  queryTrend,
  queryFunnelBase,
  buildQueryResult,
  registerQueryResult
};
