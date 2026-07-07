/**
 * 语义图谱加载器（唯一事实源）
 * 运行时读取 semantic-graph/*.yaml
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const GRAPH_DIR = path.join(__dirname);
const FILES = [
  "metrics",
  "dimensions",
  "tables",
  "joins",
  "scenarios",
  "operators",
  "glossary"
];

const TABLE_KIND = {
  daily: "日表",
  weekly: "周表",
  monthly: "月表",
  agg_daily: "聚合日表"
};

const METRIC_ALIASES = {
  verifiedRate: "verified_rate",
  marketShare: "market_share"
};

let cached = null;

function readYaml(name) {
  const filePath = path.join(GRAPH_DIR, `${name}.yaml`);
  const raw = fs.readFileSync(filePath, "utf8");
  return yaml.load(raw);
}

function normalizeMetricId(id) {
  return METRIC_ALIASES[id] || id;
}

function buildTableRegistry(tablesDoc) {
  const registry = {};
  const kinds = tablesDoc.table_kinds || TABLE_KIND;

  Object.entries(tablesDoc.tables || {}).forEach(([name, meta]) => {
    if (meta.type !== "fact") return;
    const kindKey = meta.kind || "monthly";
    registry[name] = {
      kind: kinds[kindKey] || kinds.monthly || TABLE_KIND.monthly,
      kindKey,
      physicalGrain: meta.physical_grain || "month",
      dateColumn: meta.date_column || "month",
      domain: meta.domain,
      metrics: meta.metrics || [],
      label: meta.label || name,
      drillLevels: meta.drill_levels || [],
      primaryKey: meta.primary_key || []
    };
  });

  return registry;
}

function buildMetricGrainRegistry(metricsDoc) {
  const registry = {};
  Object.entries(metricsDoc.metrics || {}).forEach(([id, meta]) => {
    const canonical = normalizeMetricId(id);
    const entry = {
      id: canonical,
      supportedGrains: meta.supported_grains || ["month"],
      preferredGrain: meta.preferred_grain || meta.storage_grain || "month",
      storageGrain: meta.storage_grain || "month",
      domain: meta.domain || "brand",
      label: meta.label || id,
      aliases: meta.aliases || [],
      primaryTable: meta.primary_table || null,
      primaryTables: meta.primary_tables || (meta.primary_table ? [meta.primary_table] : []),
      column: meta.column || canonical,
      brandProxyColumn: meta.brand_proxy_column || null,
      derived: Boolean(meta.derived),
      drillLevels: meta.drill_levels || [],
      cardinality: meta.cardinality || {},
      fanout: meta.fanout || { level: "none", multiplier: 1 },
      estimation: meta.estimation || {}
    };
    registry[canonical] = entry;
    if (id !== canonical) registry[id] = entry;
  });
  return registry;
}

function buildMetricFieldMap(metricsDoc, tableRegistry) {
  const map = {};
  Object.entries(metricsDoc.metrics || {}).forEach(([id, meta]) => {
    const canonical = normalizeMetricId(id);
    const table = meta.primary_table || (meta.primary_tables && meta.primary_tables[0]) || null;
    if (!table) return;
    map[canonical] = {
      table,
      field: meta.column || canonical,
      brandField: meta.brand_proxy_column || null,
      derived: Boolean(meta.derived),
      domain: meta.domain || "brand"
    };
  });

  if (!map.gmv && tableRegistry.fact_city_brand_monthly) {
    map.gmv = { table: "fact_city_brand_monthly", field: "gmv", brandField: "gtv", domain: "city" };
  }
  if (!map.gtv && tableRegistry.fact_brand_monthly) {
    map.gtv = { table: "fact_brand_monthly", field: "gtv", domain: "brand" };
  }
  return map;
}

function buildSchemaCatalog(tablesDoc) {
  const catalog = [];
  Object.entries(tablesDoc.tables || {}).forEach(([name, meta]) => {
    const columns = (meta.columns || []).map((col) =>
      typeof col === "string" ? col : col.name
    );
    if (!columns.length && meta.metrics) {
      columns.push(meta.date_column || "month", ...(meta.dimensions || []), ...meta.metrics);
    }
    catalog.push({
      table: name,
      type: meta.type || "fact",
      description: meta.label || meta.note || name,
      domain: meta.domain || null,
      columns: [...new Set(columns.filter(Boolean))]
    });
  });
  return catalog;
}

function buildTableDescriptions(tablesDoc) {
  const descriptions = {};
  Object.entries(tablesDoc.tables || {}).forEach(([name, meta]) => {
    descriptions[name] = meta.label || meta.note || `Supabase 表 ${name}`;
  });
  return descriptions;
}

function buildAllowedTables(tablesDoc) {
  const tables = Object.keys(tablesDoc.tables || {});
  if (!tables.includes("vw_meituan_funnel_demo")) {
    tables.push("vw_meituan_funnel_demo");
  }
  return tables;
}

function buildJoinIndex(joinsDoc) {
  const index = {};
  (joinsDoc.joins || []).forEach((join) => {
    index[join.id] = join;
  });
  return index;
}

function buildDrillJoinPaths(joinsDoc) {
  return joinsDoc.drill_join_paths || [];
}

function buildDimensionLabels(dimensionsDoc) {
  const labels = {};
  (dimensionsDoc.drill_hierarchy && dimensionsDoc.drill_hierarchy.levels || []).forEach((level) => {
    labels[level.id] = level.label;
  });
  Object.entries(dimensionsDoc.dimensions || {}).forEach(([id, meta]) => {
    labels[id] = meta.label || id;
  });
  return labels;
}

function buildChildLevel(dimensionsDoc) {
  const child = {};
  (dimensionsDoc.drill_hierarchy && dimensionsDoc.drill_hierarchy.levels || []).forEach((level) => {
    if (level.child) child[level.id] = level.child;
  });
  return child;
}

function buildLevelTable(dimensionsDoc) {
  const map = {};
  (dimensionsDoc.drill_hierarchy && dimensionsDoc.drill_hierarchy.levels || []).forEach((level) => {
    if (level.join_table) map[level.id] = level.join_table;
    else if (level.table && level.table.startsWith("fact_")) map[level.id] = level.table;
  });
  return map;
}

function getCityValues(dimensionsDoc) {
  const cityLevel = (dimensionsDoc.drill_hierarchy && dimensionsDoc.drill_hierarchy.levels || []).find(
    (l) => l.id === "city"
  );
  return (cityLevel && cityLevel.values) || [];
}

function buildMetricAliasIndex(metricsDoc, glossaryDoc) {
  const index = [];

  Object.entries(metricsDoc.metrics || {}).forEach(([id, meta]) => {
    const canonical = normalizeMetricId(id);
    index.push({
      metric: canonical,
      terms: [canonical, id, meta.label, ...(meta.aliases || [])].filter(Boolean)
    });
  });

  Object.entries(glossaryDoc.terms || {}).forEach(([term, meta]) => {
    const mapsTo = String(meta.maps_to || "");
    if (!mapsTo.startsWith("metric.")) return;
    const metric = normalizeMetricId(mapsTo.replace("metric.", ""));
    const existing = index.find((item) => item.metric === metric);
    const aliases = [term, ...(meta.aliases || [])];
    if (existing) {
      existing.terms.push(...aliases);
    } else {
      index.push({ metric, terms: aliases });
    }
  });

  index.forEach((item) => {
    item.terms = [...new Set(item.terms.map((t) => String(t).toLowerCase()))];
  });

  return index;
}

function loadSemanticGraph(forceReload = false) {
  if (cached && !forceReload) return cached;

  const docs = {};
  for (const name of FILES) {
    docs[name] = readYaml(name);
  }

  const tableRegistry = buildTableRegistry(docs.tables);
  const metricGrainRegistry = buildMetricGrainRegistry(docs.metrics);
  const metricFieldMap = buildMetricFieldMap(docs.metrics, tableRegistry);
  const schemaCatalog = buildSchemaCatalog(docs.tables);
  const tableDescriptions = buildTableDescriptions(docs.tables);
  const allowedTables = buildAllowedTables(docs.tables);
  const joinIndex = buildJoinIndex(docs.joins);
  const drillJoinPaths = buildDrillJoinPaths(docs.joins);
  const dimensionLabels = buildDimensionLabels(docs.dimensions);
  const childLevel = buildChildLevel(docs.dimensions);
  const levelTable = buildLevelTable(docs.dimensions);
  const cities = getCityValues(docs.dimensions);
  const workflows = Object.keys(docs.scenarios.scenarios || {});
  const dataWorkflows = workflows.filter(
    (id) => docs.scenarios.scenarios[id] && docs.scenarios.scenarios[id].query_data !== false && id !== "greeting"
  );
  const queryTypeMap = docs.scenarios.query_type_map || {};
  const metricAliasIndex = buildMetricAliasIndex(docs.metrics, docs.glossary);
  const grainTablePriority = docs.tables.grain_table_priority || {};

  cached = {
    version: docs.metrics.version || "1.0",
    docs,
    tableRegistry,
    metricGrainRegistry,
    metricFieldMap,
    schemaCatalog,
    tableDescriptions,
    allowedTables,
    joinIndex,
    drillJoinPaths,
    dimensionLabels,
    childLevel,
    levelTable,
    cities,
    workflows,
    dataWorkflows,
    queryTypeMap,
    metricAliasIndex,
    grainTablePriority,
    tableKind: docs.tables.table_kinds || TABLE_KIND,
    domainDefaultTable: docs.tables.domain_default_table || {}
  };

  return cached;
}

function getMetricSpec(metricId) {
  const graph = loadSemanticGraph();
  const id = normalizeMetricId(metricId);
  return graph.metricGrainRegistry[id] || graph.metricGrainRegistry.gmv || null;
}

function getTableMeta(tableName) {
  const graph = loadSemanticGraph();
  return graph.tableRegistry[tableName] || graph.docs.tables.tables[tableName] || null;
}

function detectMetricFromGraph(text) {
  const graph = loadSemanticGraph();
  const t = String(text || "").toLowerCase();

  const priorityPatterns = [
    { metric: "funnel", re: /漏斗|链路|转化链|ctr|曝光.*点击/ },
    { metric: "gtv", re: /gtv|流水/ },
    { metric: "gmv", re: /gmv|营业额/ },
    { metric: "verified_rate", re: /核销率/ },
    { metric: "verified_orders", re: /核销/ },
    { metric: "roi", re: /roi|投放/ },
    { metric: "avg_order_value", re: /客单/ },
    { metric: "take_rate", re: /take.?rate|变现率/ },
    { metric: "impressions", re: /曝光/ },
    { metric: "market_share", re: /竞对|份额|美团|抖音/ }
  ];

  for (const item of priorityPatterns) {
    if (item.re.test(t)) return item.metric;
  }

  for (const item of graph.metricAliasIndex) {
    for (const term of item.terms) {
      if (term.length >= 2 && t.includes(term)) return item.metric;
    }
  }

  return "gmv";
}

function getBreakdownRules() {
  const graph = loadSemanticGraph();
  return (graph.docs.dimensions.drill_hierarchy && graph.docs.dimensions.drill_hierarchy.breakdown_rules) || [];
}

function getDisambiguationHints() {
  return loadSemanticGraph().docs.glossary.disambiguation || [];
}

function getScenario(id) {
  return loadSemanticGraph().docs.scenarios.scenarios[id] || null;
}

function getOperator(id) {
  return loadSemanticGraph().docs.operators.operators[id] || null;
}

function getJoin(id) {
  return loadSemanticGraph().joinIndex[id] || null;
}

function getDrillJoinPath(drillLevel) {
  return loadSemanticGraph().drillJoinPaths.find((p) => p.drill_level === drillLevel) || null;
}

function dimensionLabel(dimension) {
  const graph = loadSemanticGraph();
  return graph.dimensionLabels[dimension] || dimension || "未知";
}

function inferNextDrillDimension(scopeLevel, text) {
  const graph = loadSemanticGraph();
  const t = String(text || "");
  const rules = getBreakdownRules();

  for (const rule of rules) {
    if (rule.scope !== scopeLevel) continue;
    if (rule.question_pattern && new RegExp(rule.question_pattern).test(t)) {
      return rule.next_dimension;
    }
  }

  return graph.childLevel[scopeLevel] || "city";
}

function validateDrillFromGraph(scope, dimension, text) {
  const warnings = [];
  const rules = getBreakdownRules();
  const rule = rules.find((r) => r.scope === scope.scopeLevel && r.invalid_dimension === dimension);
  if (rule && new RegExp(rule.question_pattern || "拖累|拆解").test(String(text || ""))) {
    warnings.push({
      code: "DRILL_LEVEL_MISMATCH",
      message:
        rule.invalid_reason ||
        `当前层级不应使用 ${dimension} 拆解，建议使用 ${rule.next_dimension}`
    });
  }
  if (scope.city && dimension === "city" && /哪个城市|哪座城市|城市拖累/.test(String(text || ""))) {
    warnings.push({
      code: "DRILL_LEVEL_MISMATCH",
      message: `已锁定城市「${scope.city}」，不应再按城市拆解；应下钻到${dimensionLabel("business_area")}或${dimensionLabel("poi")}。`
    });
  }
  return warnings;
}

module.exports = {
  GRAPH_DIR,
  TABLE_KIND,
  METRIC_ALIASES,
  loadSemanticGraph,
  normalizeMetricId,
  getMetricSpec,
  getTableMeta,
  detectMetricFromGraph,
  getBreakdownRules,
  getDisambiguationHints,
  getScenario,
  getOperator,
  getJoin,
  getDrillJoinPath,
  dimensionLabel,
  inferNextDrillDimension,
  validateDrillFromGraph
};
