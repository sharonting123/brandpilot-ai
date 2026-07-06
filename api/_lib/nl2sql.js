/**
 * NL2SQL 引擎
 * 自然语言 → 安全查询计划 → 只读 SQL 文本 + 行结果。
 * 不向数据库执行任意 SQL，只对内存中的品牌上下文跑模板查询，避免注入风险。
 */

const SCHEMA_CATALOG = [
  {
    table: "fact_brand_monthly",
    description: "品牌月度经分：GTV、活跃用户、客单价、take_rate、补贴率",
    columns: ["month", "gtv", "active_users", "avg_order_value", "paid_orders", "verified_orders", "take_rate", "subsidy_rate"]
  },
  {
    table: "fact_city_brand_monthly",
    description: "城市月度经营：GMV、ROI、核销、门店数",
    columns: ["month", "city", "gmv", "roi", "paid_orders", "verified_orders", "store_count"]
  },
  {
    table: "fact_search_keyword_daily",
    description: "搜索词日粒度：曝光、点击、下单、核销、GMV",
    columns: ["date", "search_word", "impressions", "clicks", "paid_orders", "verified_orders", "gmv"]
  },
  {
    table: "fact_poi_daily",
    description: "POI 日粒度：曝光、访问、套餐点击",
    columns: ["date", "poi_id", "exposure", "visits", "deal_clicks"]
  },
  {
    table: "fact_deal_campaign_daily",
    description: "套餐/活动日粒度：曝光、下单、支付、核销、GMV、补贴",
    columns: ["date", "deal_id", "impressions", "paid_orders", "verified_orders", "pay_gmv", "coupon_reduce_amount"]
  },
  {
    table: "fact_competitor_benchmark_monthly",
    description: "竞对基准：核销率、补贴率、内容占比",
    columns: ["month", "competitor", "verification_rate", "subsidy_rate", "content_share", "avg_order_value"]
  },
  {
    table: "dim_poi",
    description: "门店维表",
    columns: ["poi_id", "poi_name", "city", "district", "business_area"]
  }
];

const QUERY_TEMPLATES = [
  {
    id: "monthly_gtv",
    keywords: ["gmv", "gtv", "营业额", "交易额", "月度"],
    table: "fact_brand_monthly",
    sql: (brandId, filters) =>
      `SELECT month, gtv, paid_orders, verified_orders, take_rate, subsidy_rate\n` +
      `FROM fact_brand_monthly\n` +
      `WHERE brand_id = '${brandId}'${filters.month ? ` AND month = '${filters.month}'` : ""}\n` +
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
        rows = rows.filter((r) => String(r.month).includes(filters.month.replace("-01", "").slice(0, 7)) || String(r.month).includes(filters.month));
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
    table: "fact_search_keyword_daily",
    sql: (brandId) =>
      `SELECT date, search_word, impressions, clicks, paid_orders, verified_orders, gmv\n` +
      `FROM fact_search_keyword_daily\n` +
      `WHERE brand_id = '${brandId}'\n` +
      `ORDER BY impressions DESC\nLIMIT 20`,
    run: (ctx) => {
      const facts = (ctx.dailyFacts && ctx.dailyFacts.searchFacts) || [];
      return facts
        .map((f) => ({
          date: f.date,
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
      `ORDER BY month DESC`,
    run: (ctx) =>
      (ctx.competitorBenchmarks || []).map((b) => ({
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
    table: "fact_deal_campaign_daily",
    sql: () =>
      `SELECT date, deal_id, impressions, paid_orders, verified_orders, pay_gmv, coupon_reduce_amount\n` +
      `FROM fact_deal_campaign_daily\nORDER BY pay_gmv DESC\nLIMIT 20`,
    run: (ctx) => {
      const facts = (ctx.dailyFacts && ctx.dailyFacts.campaignFacts) || [];
      return facts
        .map((f) => ({
          date: f.date,
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

function extractFilters(question) {
  const text = String(question || "");
  const filters = {};

  const monthMatch = text.match(/(\d{1,2})\s*月/);
  if (monthMatch) filters.monthNum = Number(monthMatch[1]);

  const isoMonth = text.match(/(20\d{2})[-/](\d{1,2})/);
  if (isoMonth) {
    filters.month = `${isoMonth[1]}-${String(isoMonth[2]).padStart(2, "0")}-01`;
    filters.monthNum = Number(isoMonth[2]);
  }

  const cities = ["上海", "北京", "深圳", "广州", "成都", "杭州", "南京", "武汉", "重庆", "西安"];
  for (const city of cities) {
    if (text.includes(city)) {
      filters.city = city;
      break;
    }
  }

  return filters;
}

function pickTemplate(question) {
  const text = String(question || "").toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const template of QUERY_TEMPLATES) {
    let score = 0;
    for (const kw of template.keywords) {
      if (text.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = template;
    }
  }

  return best || QUERY_TEMPLATES[0];
}

/**
 * 主入口：自然语言转 SQL 并返回结果
 */
async function runNl2Sql(params = {}) {
  const { getContext } = require("./agent-tools");
  const brandId = params.brandId || "haidilao";
  const question = String(params.question || params.query || "").trim();
  if (!question) {
    return JSON.stringify({ error: "question 不能为空", schema: SCHEMA_CATALOG });
  }

  const context = await getContext(brandId);
  const filters = extractFilters(question);
  const template = pickTemplate(question);
  const sql = template.sql(brandId, filters);
  const rows = template.run(context, filters);

  return JSON.stringify({
    question,
    templateId: template.id,
    table: template.table,
    sql,
    filters,
    rowCount: rows.length,
    rows: rows.slice(0, 50),
    dataMode: context.dataMode,
    schemaHint: SCHEMA_CATALOG.find((s) => s.table === template.table) || null,
    explanation:
      `已将问题映射到只读模板「${template.id}」，查询表 ${template.table}` +
      (filters.city ? `，城市=${filters.city}` : "") +
      (filters.monthNum ? `，月份=${filters.monthNum}` : "") +
      `，返回 ${rows.length} 行。`
  });
}

function getSchemaCatalog() {
  return SCHEMA_CATALOG;
}

module.exports = {
  runNl2Sql,
  getSchemaCatalog,
  SCHEMA_CATALOG,
  pickTemplate,
  extractFilters
};
