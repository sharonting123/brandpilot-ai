/**
 * 底表默认只读 SQL（供 D* 数据表引用展示）
 * 表描述与 dateColumn 来自 semantic-graph
 */

const { buildFunnelSql } = require("./funnel-metrics");
const { attachRowPresentation, tableLabel } = require("./column-aliases");
const { monthKeyToEndDate } = require("./period-utils");
const { normalizeMonthEnd } = require("./month-end");
const { getTableRegistry, getTableDescriptions } = require("./semantic-graph");

function getTableDescriptionsResolved() {
  return getTableDescriptions();
}

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

function buildTableSql(table, brandId = "haidilao", filters = {}) {
  const cityClause = filters.city ? ` AND city = '${filters.city}'` : "";
  const TABLE_REGISTRY = getTableRegistry();
  const meta = TABLE_REGISTRY[table] || { dateColumn: "month" };
  const period = periodClause(filters, meta.dateColumn || "month");

  switch (table) {
    case "fact_brand_monthly":
      return (
        `SELECT month, gtv, active_users, avg_order_value, paid_orders, verified_orders, take_rate, subsidy_rate\n` +
        `FROM fact_brand_monthly\n` +
        `WHERE brand_id = '${brandId}'${period}\n` +
        `ORDER BY month DESC`
      );
    case "fact_city_brand_monthly":
      return (
        `SELECT month, city, gmv, roi, paid_orders, verified_orders, store_count\n` +
        `FROM fact_city_brand_monthly\n` +
        `WHERE brand_id = '${brandId}'${cityClause}${period}\n` +
        `ORDER BY gmv DESC`
      );
    case "fact_search_keyword_monthly":
      if (filters.funnel) return buildFunnelSql(brandId, filters);
      return (
        `SELECT month, search_word, impressions, clicks, paid_orders, verified_orders, gmv\n` +
        `FROM fact_search_keyword_monthly\n` +
        `WHERE brand_id = '${brandId}'${period}\n` +
        `ORDER BY month DESC\n` +
        `LIMIT 500`
      );
    case "fact_poi_monthly":
      return (
        `SELECT month, poi_id, exposure, visits, deal_clicks, search_visits\n` +
        `FROM fact_poi_monthly\n` +
        `WHERE brand_id = '${brandId}'${period}\n` +
        `ORDER BY month DESC\n` +
        `LIMIT 500`
      );
    case "fact_deal_campaign_monthly":
      return (
        `SELECT month, deal_id, impressions, paid_orders, verified_orders, pay_gmv, coupon_reduce_amount\n` +
        `FROM fact_deal_campaign_monthly\n` +
        `WHERE brand_id = '${brandId}'${period}\n` +
        `ORDER BY pay_gmv DESC\n` +
        `LIMIT 500`
      );
    case "fact_competitor_benchmark_monthly":
      return (
        `SELECT month, competitor, verification_rate, subsidy_rate, content_share, avg_order_value\n` +
        `FROM fact_competitor_benchmark_monthly\n` +
        `WHERE brand_id = '${brandId}'${period}\n` +
        `  AND competitor NOT IN ('美团', '抖音')\n` +
        `ORDER BY month DESC`
      );
    case "dim_poi":
      return (
        `SELECT poi_id, poi_name, city, district, business_area\n` +
        `FROM dim_poi\n` +
        `WHERE brand_id = '${brandId}'${cityClause}\n` +
        `ORDER BY city, poi_name`
      );
    case "dim_brand":
      return `SELECT * FROM dim_brand WHERE brand_id = '${brandId}' LIMIT 1`;
    case "dim_deal":
      return (
        `SELECT deal_id, deal_name, price, original_price, status\n` +
        `FROM dim_deal\n` +
        `WHERE brand_id = '${brandId}'\n` +
        `ORDER BY deal_id`
      );
    default:
      return `SELECT * FROM ${table} WHERE brand_id = '${brandId}' LIMIT 100`;
  }
}

function getTableDescription(table) {
  const descriptions = getTableDescriptionsResolved();
  return descriptions[table] || "Supabase 事实表 " + table;
}

/**
 * 为所有 D* 引用补全 SQL（若缺失）
 */
function enrichDataReferencesWithSql(refs, brandId = "haidilao") {
  return (refs || []).map((ref) => {
    if (ref.type !== "data" && ref.type !== "sql") return ref;
    const table = (ref.details && ref.details.table) || ref.source || ref.title;
    let details = { ...(ref.details || {}), table: (ref.details && ref.details.table) || table };
    if (!details.sql && table && ref.type === "data") {
      details.sql = buildTableSql(table, brandId, details.filters || {});
    }
    if (!details.table) details.table = table;
    details = attachRowPresentation(details);
    if (!details.tableLabel && table) details.tableLabel = tableLabel(table);
    return { ...ref, details };
  });
}

module.exports = {
  get TABLE_DESCRIPTIONS() {
    return getTableDescriptionsResolved();
  },
  buildTableSql,
  getTableDescription,
  enrichDataReferencesWithSql
};
