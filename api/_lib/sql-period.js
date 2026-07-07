/**
 * SQL 时间条件：解析 filters → period 子句 → 注入最终 SQL
 */

const { normalizeMonthEnd } = require("./month-end");
const { monthKeyToEndDate } = require("./period-utils");

const NO_PERIOD_TABLES = new Set(["dim_poi", "dim_brand", "dim_deal"]);
const NO_PERIOD_QUERY_TYPES = new Set(["queryTrend", "poi_list"]);

function periodClause(filters = {}, dateColumn = "month") {
  if (filters.dateFrom && filters.dateTo) {
    return (
      ` AND ${dateColumn} >= '${normalizeMonthEnd(filters.dateFrom)}'` +
      ` AND ${dateColumn} <= '${normalizeMonthEnd(filters.dateTo)}'`
    );
  }
  if (filters.month) {
    const end = normalizeMonthEnd(filters.month);
    return end ? ` AND ${dateColumn} = '${end}'` : "";
  }
  if (filters.year && filters.monthNum) {
    const end = monthKeyToEndDate(`${filters.year}-${String(filters.monthNum).padStart(2, "0")}`);
    return end ? ` AND ${dateColumn} = '${end}'` : "";
  }
  if (filters.monthNum) {
    return ` AND EXTRACT(MONTH FROM ${dateColumn}) = ${filters.monthNum}`;
  }
  return "";
}

function hasPeriodFilter(filters = {}) {
  return Boolean(
    filters.month ||
    (filters.dateFrom && filters.dateTo) ||
    filters.monthNum
  );
}

function hasPeriodPredicate(sql, dateColumn = "month") {
  const text = String(sql || "");
  const col = String(dateColumn || "month").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\b${col}\\s*=`, "i"),
    new RegExp(`\\b${col}\\s*>=`, "i"),
    new RegExp(`\\b${col}\\s*<=`, "i"),
    new RegExp(`\\b${col}\\s*<`, "i"),
    new RegExp(`\\b${col}\\s*>`, "i"),
    new RegExp(`\\b${col}\\s+LIKE`, "i"),
    new RegExp(`\\b${col}\\s+IN\\s*\\(`, "i"),
    new RegExp(`\\bf\\.${col}\\s*=`, "i"),
    new RegExp(`EXTRACT\\(\\s*MONTH\\s+FROM\\s+(?:f\\.)?${col}`, "i")
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function defaultPeriodFilters(context) {
  const rows = [
    ...(context?.monthlyFacts || []),
    ...(context?.cityMonthlyFacts || []),
    ...(context?.competitorBenchmarks || [])
  ];
  const months = [...new Set(rows.map((r) => normalizeMonthEnd(r.month)).filter(Boolean))].sort();
  if (!months.length) {
    return { year: 2026, monthNum: 6, month: monthKeyToEndDate("2026-06") };
  }
  const latest = months[months.length - 1];
  const match = String(latest).match(/^(\d{4})-(\d{2})/);
  if (!match) return { month: latest };
  return {
    year: Number(match[1]),
    monthNum: Number(match[2]),
    month: latest
  };
}

function shouldApplyDefaultPeriod(filters, options = {}) {
  if (hasPeriodFilter(filters)) return false;
  const queryType = options.queryType || "";
  if (NO_PERIOD_QUERY_TYPES.has(queryType)) return false;
  if (options.table && NO_PERIOD_TABLES.has(options.table)) return false;
  const grain = options.targetGrain || options.requestedGrain || "month";
  if (grain === "range" || grain === "cumulative" || grain === "year") return false;
  const question = String(options.question || "");
  if (/趋势|走势|累计|全年|近\d+个?月|上半年|下半年|H1|H2|h1|h2/.test(question)) return false;
  return true;
}

function resolveQueryPeriodFilters(filters, context, options = {}) {
  const merged = { ...(filters || {}) };
  if (shouldApplyDefaultPeriod(merged, options)) {
    Object.assign(merged, defaultPeriodFilters(context));
    merged._periodDefaulted = true;
  }
  return merged;
}

function buildPeriodClause(filters, dateColumn = "month", timeRoute = null) {
  if (timeRoute && timeRoute.sqlTimeClause) {
    const clause = String(timeRoute.sqlTimeClause).trim();
    return clause.startsWith("AND") ? ` ${clause}` : clause ? ` AND ${clause.replace(/^AND\s*/, "")}` : "";
  }
  return periodClause(filters, dateColumn);
}

function ensurePeriodInSql(sql, filters, options = {}) {
  const raw = String(sql || "").trim();
  if (!raw) return raw;

  const table = options.table || "";
  if (NO_PERIOD_TABLES.has(table)) return raw;
  if (options.skipPeriod) return raw;

  const dateColumn = options.dateColumn || "month";
  if (hasPeriodPredicate(raw, dateColumn)) return raw;

  const clause = buildPeriodClause(filters, dateColumn, options.timeRoute);
  if (!clause) return raw;

  const tailMatch = raw.match(/\n(\s*(?:ORDER\s+BY|GROUP\s+BY|LIMIT)\b[\s\S]*)$/i);
  if (tailMatch && tailMatch.index != null) {
    return raw.slice(0, tailMatch.index) + clause + raw.slice(tailMatch.index);
  }
  return raw + clause;
}

module.exports = {
  NO_PERIOD_TABLES,
  NO_PERIOD_QUERY_TYPES,
  periodClause,
  hasPeriodFilter,
  hasPeriodPredicate,
  defaultPeriodFilters,
  shouldApplyDefaultPeriod,
  resolveQueryPeriodFilters,
  buildPeriodClause,
  ensurePeriodInSql
};
