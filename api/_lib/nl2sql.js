const { monthKeyToEndDate, monthMatches } = require("./period-utils");
const { normalizeMonthEnd } = require("./month-end");
const { routeTimeQuery, semanticsToFilters } = require("./time-router");
const { getSchemaCatalog: getGraphSchemaCatalog, getCities } = require("./semantic-graph");

function getSchemaCatalogResolved() {
  return getGraphSchemaCatalog();
}

const SCHEMA_CATALOG = new Proxy([], {
  get(target, prop) {
    const catalog = getSchemaCatalogResolved();
    if (prop === "find" || prop === "filter" || prop === "map" || prop === "slice" || prop === "length") {
      return catalog[prop].bind(catalog);
    }
    if (typeof prop === "string" && /^\d+$/.test(prop)) {
      return catalog[Number(prop)];
    }
    return target[prop];
  }
});

const QUERY_TEMPLATES = [
  {
    id: "funnel_conversion",
    keywords: ["漏斗", "链路", "损耗", "断点", "流失", "转化链", "搜索到核销", "搜索到", "核销", "转化"],
    table: "fact_search_keyword_monthly",
    sql: (brandId, filters) => {
      const { buildFunnelSql } = require("./funnel-metrics");
      return buildFunnelSql(brandId, filters);
    },
    run: (ctx, filters) => {
      const { buildFunnelMetrics, funnelRowsForSql } = require("./funnel-metrics");
      const metrics = buildFunnelMetrics(ctx, filters);
      return funnelRowsForSql(metrics.funnel);
    }
  },
  {
    id: "monthly_gtv",
    keywords: ["gmv", "gtv", "营业额", "交易额", "月度"],
    table: "fact_brand_monthly",
    sql: (brandId, filters) =>
      `SELECT month, gtv, paid_orders, verified_orders, take_rate, subsidy_rate\n` +
      `FROM fact_brand_monthly\n` +
      `WHERE brand_id = '${brandId}'${filters.month ? ` AND month = '${monthKeyToEndDate(String(filters.month).slice(0, 7))}'` : ""}\n` +
      `ORDER BY month DESC`,
    run: (ctx, filters) => {
      let rows = (ctx.monthlyFacts || []).map((m) => ({
        month: m.month,
        gtv: m.gtv,
        paid_orders: m.paid_orders,
        verified_orders: m.verified_orders,
        take_rate: m.take_rate,
        subsidy_rate: m.subsidy_rate,
        avg_order_value: m.avg_order_value,
        active_users: m.active_users
      }));
      if (filters.month) {
        rows = rows.filter((r) => monthMatches(r.month, String(filters.month).slice(0, 7)));
      }
      if (filters.monthNum) {
        rows = rows.filter((r) => {
          const m = String(r.month);
          return m.includes(`-${String(filters.monthNum).padStart(2, "0")}`) || m.includes(`${filters.monthNum}月`);
        });
      }
      return rows.sort((a, b) => String(b.month).localeCompare(String(a.month)));
    }
  },
  {
    id: "city_roi",
    keywords: ["城市", "roi", "上海", "北京", "深圳", "成都", "杭州"],
    table: "fact_city_brand_monthly",
    sql: (brandId, filters) =>
      `SELECT month, city, gmv, roi, paid_orders, verified_orders, store_count\n` +
      `FROM fact_city_brand_monthly\n` +
      `WHERE brand_id = '${brandId}'${filters.city ? ` AND city = '${filters.city}'` : ""}\n` +
      `ORDER BY gmv DESC`,
    run: (ctx, filters) => {
      let rows = (ctx.cityMonthlyFacts || []).map((c) => ({
        month: c.month,
        city: c.city,
        gmv: c.gmv,
        roi: c.roi,
        paid_orders: c.paid_orders,
        verified_orders: c.verified_orders,
        store_count: c.store_count
      }));
      if (filters.city) rows = rows.filter((r) => r.city === filters.city);
      if (filters.monthNum) {
        rows = rows.filter((r) => String(r.month).includes(`-${String(filters.monthNum).padStart(2, "0")}`));
      }
      return rows.sort((a, b) => (b.gmv || 0) - (a.gmv || 0));
    }
  },
  {
    id: "search_keywords",
    keywords: ["搜索", "关键词", "曝光", "点击率", "ctr"],
    table: "fact_search_keyword_monthly",
    sql: (brandId) =>
      `SELECT month, search_word, impressions, clicks, paid_orders, verified_orders, gmv\n` +
      `FROM fact_search_keyword_monthly\n` +
      `WHERE brand_id = '${brandId}'\n` +
      `ORDER BY impressions DESC\nLIMIT 20`,
    run: (ctx) => {
      const facts = (ctx.dailyFacts && ctx.dailyFacts.searchFacts) || [];
      return facts
        .map((f) => ({
          month: normalizeMonthEnd(f.month || f.date),
          search_word: f.search_word,
          impressions: f.impressions,
          clicks: f.clicks,
          paid_orders: f.paid_orders,
          verified_orders: f.verified_orders,
          gmv: f.gmv
        }))
        .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
        .slice(0, 20);
    }
  },
  {
    id: "competitor",
    keywords: ["竞对", "抖音", "美团", "私域", "对比", "核销率"],
    table: "fact_competitor_benchmark_monthly",
    sql: (brandId) =>
      `SELECT month, competitor, verification_rate, subsidy_rate, content_share, avg_order_value\n` +
      `FROM fact_competitor_benchmark_monthly\n` +
      `WHERE brand_id = '${brandId}'\n` +
      `  AND competitor NOT IN ('美团', '抖音')\n` +
      `ORDER BY month DESC`,
    run: (ctx) =>
      require("./column-aliases")
        .filterCompetitorRows(ctx.competitorBenchmarks || [])
        .map((b) => ({
        month: b.month,
        competitor: b.competitor,
        verification_rate: b.verification_rate,
        subsidy_rate: b.subsidy_rate,
        content_share: b.content_share,
        avg_order_value: b.avg_order_value
      }))
  },
  {
    id: "poi_list",
    keywords: ["门店", "poi", "门店列表", "分店"],
    table: "dim_poi",
    sql: (brandId) =>
      `SELECT poi_id, poi_name, city, district, business_area\n` +
      `FROM dim_poi\n` +
      `WHERE brand_id = '${brandId}'\n` +
      `ORDER BY city`,
    run: (ctx) =>
      (ctx.pois || []).map((p) => ({
        poi_id: p.poi_id,
        poi_name: p.poi_name,
        city: p.city,
        district: p.district,
        business_area: p.business_area
      }))
  },
  {
    id: "campaign",
    keywords: ["套餐", "活动", "补贴", "券", "核销"],
    table: "fact_deal_campaign_monthly",
    sql: () =>
      `SELECT month, deal_id, impressions, paid_orders, verified_orders, pay_gmv, coupon_reduce_amount\n` +
      `FROM fact_deal_campaign_monthly\nORDER BY pay_gmv DESC\nLIMIT 20`,
    run: (ctx) => {
      const facts = (ctx.dailyFacts && ctx.dailyFacts.campaignFacts) || [];
      return facts
        .map((f) => ({
          month: normalizeMonthEnd(f.month || f.date),
          deal_id: f.deal_id,
          impressions: f.impressions,
          paid_orders: f.paid_orders,
          verified_orders: f.verified_orders,
          pay_gmv: f.pay_gmv,
          coupon_reduce_amount: f.coupon_reduce_amount
        }))
        .sort((a, b) => (b.pay_gmv || 0) - (a.pay_gmv || 0))
        .slice(0, 20);
    }
  }
];

function extractFilters(question, intentParams = {}, options = {}) {
  const text = String(question || "");
  let filters = {};

  if (!options.skipTimeRoute) {
    const timeRoute = routeTimeQuery({ question: text, intentParams });
    filters = { ...semanticsToFilters(timeRoute.semantics), ...timeRoute.filters };
    filters._timeRoute = {
      targetGrain: timeRoute.targetGrain,
      effectiveGrain: timeRoute.effectiveGrain,
      table: timeRoute.table,
      tableKind: timeRoute.tableKind,
      periodLabel: timeRoute.periodLabel
    };
  } else if (intentParams.analysisSlots) {
    filters = { ...intentParams.analysisSlots.filters };
  } else if (intentParams.filters) {
    filters = { ...intentParams.filters };
  }

  const monthMatch = text.match(/(\d{1,2})\s*月/);
  if (monthMatch && !filters.monthNum) filters.monthNum = Number(monthMatch[1]);

  const cities = getCities().length ? getCities() : ["上海", "北京", "深圳", "广州", "成都", "杭州", "南京", "武汉", "重庆", "西安"];
  for (const city of cities) {
    if (text.includes(city)) {
      filters.city = city;
      break;
    }
  }

  if (intentParams.city && !filters.city) filters.city = intentParams.city;
  if (intentParams.dimension && !filters.dimension) filters.dimension = intentParams.dimension;

  return filters;
}

function pickTemplate(question) {
  const text = String(question || "").toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const template of QUERY_TEMPLATES) {
    let score = 0;
    for (const kw of template.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += kw.length >= 4 ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = template;
    }
  }

  return bestScore > 0 ? best : null;
}

function getQueryTemplate(id) {
  return QUERY_TEMPLATES.find((item) => item.id === id) || null;
}

/**
 * 主入口：自然语言转 SQL 并返回结果
 * 委托统一 Data Query Engine（模板 > Agent）
 */
async function runNl2Sql(params = {}) {
  const { queryFromQuestion } = require("./data-query-engine");
  const question = String(params.question || params.query || "").trim();
  const result = await queryFromQuestion(params);

  if (result.error) {
    return JSON.stringify({
      question,
      error: result.error,
      message: result.message,
      filters: result.filters,
      dataMode: result.dataMode,
      availableTemplates: result.availableTemplates
    });
  }

  const modeLabel =
    result.generationMode === "agent"
      ? `SQL 生成 Agent 识别为「${result.queryType}」`
      : `模板匹配「${result.templateId || result.queryType}」`;

  return JSON.stringify({
    question: result.question || question,
    templateId: result.templateId || result.queryType,
    queryType: result.queryType,
    table: result.table,
    sql: result.sql,
    filters: result.filters,
    rowCount: result.rowCount,
    rows: result.rows,
    dataMode: result.dataMode,
    generationMode: result.generationMode,
    agentReasoning: result.agentReasoning || "",
    citationRefs: result.citationRef ? [result.citationRef] : [],
    queryPlanRef: result.queryPlanRef || null,
    citationLink: result.citationRef ? `[${result.citationRef}](#ref-${result.citationRef})` : "",
    explanation:
      (result.explanation || modeLabel) +
      `，查询表 ${result.table}` +
      (result.filters && result.filters.city ? `，城市=${result.filters.city}` : "") +
      (result.filters && result.filters.year && result.filters.monthNum
        ? `，周期=${result.filters.year}年${result.filters.monthNum}月`
        : result.filters && result.filters.monthNum
          ? `，月份=${result.filters.monthNum}`
          : "") +
      `，返回 ${result.rowCount} 行。`
  });
}

function getSchemaCatalog() {
  return getSchemaCatalogResolved();
}

module.exports = {
  runNl2Sql,
  getSchemaCatalog,
  SCHEMA_CATALOG,
  QUERY_TEMPLATES,
  pickTemplate,
  extractFilters,
  getQueryTemplate
};
