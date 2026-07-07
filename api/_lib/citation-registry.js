/**
 * 请求级引用注册表：为数据表、RAG 知识、SQL、Agent 步骤分配稳定引用 ID。
 */

const { buildTableSql, getTableDescription, enrichDataReferencesWithSql } = require("./table-sql-catalog");
const { labelsForRows, tableLabel, filterCompetitorRows, attachRowPresentation } = require("./column-aliases");

let _seq = { data: 0, knowledge: 0, sql: 0, agent: 0, calculation: 0, plan: 0 };
let _refs = [];

function resetCitationRegistry() {
  _seq = { data: 0, knowledge: 0, sql: 0, agent: 0, calculation: 0, plan: 0 };
  _refs = [];
}

function typeToPrefix(type) {
  if (type === "knowledge") return "K";
  if (type === "sql") return "S";
  if (type === "agent") return "A";
  if (type === "calculation") return "C";
  if (type === "plan") return "P";
  return "D";
}

function typeToSeqKey(type) {
  if (type === "knowledge") return "knowledge";
  if (type === "sql") return "sql";
  if (type === "agent") return "agent";
  if (type === "calculation") return "calculation";
  if (type === "plan") return "plan";
  return "data";
}

function registerReference(entry) {
  const type = entry.type || "data";
  const prefix = typeToPrefix(type);
  const seqKey = typeToSeqKey(type);
  _seq[seqKey] += 1;
  const id = prefix + _seq[seqKey];
  const ref = {
    id,
    type,
    title: entry.title || id,
    href: entry.href || "#ref-" + id,
    excerpt: entry.excerpt || "",
    source: entry.source || "",
    location: entry.location || entry.title || ""
  };
  if (entry.details !== undefined) ref.details = entry.details;
  if (entry.meta !== undefined) ref.meta = entry.meta;
  _refs.push(ref);
  return ref;
}

function attachRowMetadata(details, table, rows) {
  let safeRows = Array.isArray(rows) ? rows : [];
  if (table === "fact_competitor_benchmark_monthly") {
    safeRows = filterCompetitorRows(safeRows);
  }
  details.rows = safeRows;
  details.columnLabels = labelsForRows(safeRows, table);
  if (table) details.tableLabel = tableLabel(table);
  return details;
}

function registerDataTable(table, excerpt, options = {}) {
  const brandId = options.brandId || "haidilao";
  const filters = options.filters || {};
  const sql = options.sql || buildTableSql(table, brandId, filters);
  const description = excerpt || getTableDescription(table);

  const existing = _refs.find((item) => item.type === "data" && item.source === table);
  if (existing) {
    if (!existing.details) existing.details = { table };
    if (!existing.details.sql) existing.details.sql = sql;
    if (options.rows) attachRowMetadata(existing.details, table, options.rows);
    if (options.rowCount != null) existing.details.rowCount = options.rowCount;
    if (options.dataMode) existing.details.dataMode = options.dataMode;
    if (Object.keys(filters).length) existing.details.filters = { ...(existing.details.filters || {}), ...filters };
    return existing;
  }

  const details = attachRowMetadata(
    {
      table,
      sql,
      filters,
      dataMode: options.dataMode,
      rowCount: options.rowCount,
      description
    },
    table,
    options.rows
  );

  return registerReference({
    type: "data",
    title: table,
    href: "#source/" + table,
    excerpt: description,
    source: table,
    location: "supabase:" + table,
    details
  });
}

function registerQueryPlan(plan) {
  const metric = (plan && plan.metric) || "query";
  const table = (plan && plan.primaryTable) || "";
  const title = `QueryPlan · ${plan.queryType || metric}`;
  const excerpt =
    `指标 ${plan.metricLabel || metric} @ ${table}` +
    (plan.dimension ? `，维度 ${plan.dimension}` : "") +
    (plan.estimation && plan.estimation.expectedRowCount
      ? `，预估 ${plan.estimation.expectedRowCount} 行`
      : "");

  return registerReference({
    type: "plan",
    title,
    href: "#plan/" + encodeURIComponent(String(plan.queryType || metric)),
    excerpt,
    source: plan.queryType || "query_plan",
    location: "query-plan:" + (plan.queryType || metric),
    details: {
      ...plan,
      planVersion: plan.version || "1.0"
    }
  });
}

function registerSqlQuery(templateId, sql, excerpt, details) {
  const table = (details && details.table) || "";
  const payload = attachRowPresentation({ ...(details || {}), table });
  if (details && details.queryPlan) {
    payload.queryPlan = details.queryPlan;
    if (details.queryPlanRef) payload.queryPlanRef = details.queryPlanRef;
  }
  return registerReference({
    type: "sql",
    title: "NL2SQL · " + templateId,
    href: "#source/sql/" + templateId,
    excerpt: excerpt || sql,
    source: templateId,
    location: "nl2sql:" + templateId,
    details: payload
  });
}

function registerKnowledgePassage(passage) {
  const existing = _refs.find((item) => item.type === "knowledge" && item.source === passage.id);
  if (existing) return existing;
  return registerReference({
    type: "knowledge",
    title: passage.title || passage.id,
    href: "#ref/" + (passage.id || "knowledge"),
    excerpt: passage.content || "",
    source: passage.id || "",
    location: "rag:" + (passage.id || "chunk")
  });
}

function registerAgentStep(name, summary, location) {
  return registerReference({
    type: "agent",
    title: name,
    href: "#agent/" + encodeURIComponent(String(name || "agent")),
    excerpt: summary || "",
    source: name || "",
    location: location || "agent:" + (name || "step")
  });
}

function registerCalculation(title, formula, details) {
  return registerReference({
    type: "calculation",
    title: title || "计算",
    href: "#calc/" + encodeURIComponent(String(title || "calculation")),
    excerpt: formula || "",
    source: (details && details.operator) || "calculation",
    location: "operator:" + ((details && details.operator) || "calculation"),
    details: {
      formula,
      ...(details || {})
    }
  });
}

function getCitationRegistry() {
  return _refs.slice();
}

function getEnrichedCitationRegistry(brandId = "haidilao") {
  return enrichDataReferencesWithSql(_refs.slice(), brandId);
}

function findReference(id) {
  return _refs.find((item) => item.id === id) || null;
}

function formatCitationLink(id) {
  const ref = findReference(id);
  if (!ref) return "[" + id + "](#ref-" + id + ")";
  return "[" + id + "](" + ref.href + ")";
}

module.exports = {
  resetCitationRegistry,
  registerReference,
  registerDataTable,
  registerQueryPlan,
  registerSqlQuery,
  registerKnowledgePassage,
  registerAgentStep,
  registerCalculation,
  getCitationRegistry,
  getEnrichedCitationRegistry,
  enrichDataReferencesWithSql,
  findReference,
  formatCitationLink
};
