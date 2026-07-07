#!/usr/bin/env node
/**
 * 生成 supabase/04_seed_daily_facts.sql
 * 搜索 + 推荐 双路径；品牌月度 paid/verified/gmv = 两路径之和
 */
const fs = require("fs");
const path = require("path");
const { generateHaidilaoDrillFixture } = require("../api/_lib/drill-data");
const {
  SOURCE_SEARCH,
  SOURCE_RECOMMEND,
  RECOMMEND_WORD,
  buildSearchKeywordFactsFromBrandRows,
  buildCampaignFactsFromBrandRows
} = require("../api/_lib/traffic-split");

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function buildPoiRows(fixture) {
  const rows = fixture.dailyFacts.poiFacts
    .filter((row) => row.month >= "2026-05-31")
    .map((row) => ({
      month: row.month,
      poi_id: row.poi_id,
      exposure: row.exposure,
      visits: row.visits,
      search_visits: row.search_visits,
      recommend_visits: row.recommend_visits,
      deal_clicks: row.deal_clicks,
      favorite_count: row.favorite_count,
      navigate_clicks: row.navigate_clicks,
      phone_clicks: row.phone_clicks,
      avg_stay_seconds: row.avg_stay_seconds
    }));

  rows.push({
    month: "CURRENT_DATE",
    poi_id: "1287671875",
    exposure: 18600,
    visits: 2410,
    search_visits: 436,
    recommend_visits: 1974,
    deal_clicks: 172,
    favorite_count: 83,
    navigate_clicks: 46,
    phone_clicks: 18,
    avg_stay_seconds: 89
  });
  return rows;
}

function formatSearchInsert(rows) {
  const lines = [
    "insert into public.fact_search_keyword_monthly (",
    "  month, brand_id, search_word, source, query_id, global_id,",
    "  impressions, clicks, poi_clicks, deal_clicks, order_submits, paid_orders, verified_orders, gmv",
    ")",
    "values"
  ];
  rows.forEach((row, index) => {
    const monthVal = row.month === "CURRENT_DATE" ? "current_date" : sqlStr(row.month);
    lines.push(
      "  (" +
        [
          monthVal,
          sqlStr(row.brand_id),
          sqlStr(row.search_word),
          sqlStr(row.source),
          sqlStr(row.query_id),
          sqlStr(row.global_id),
          row.impressions,
          row.clicks,
          row.poi_clicks,
          row.deal_clicks,
          row.order_submits,
          row.paid_orders,
          row.verified_orders,
          row.gmv
        ].join(", ") +
        ")" +
        (index < rows.length - 1 ? "," : "")
    );
  });
  lines.push("on conflict (month, brand_id, search_word, source) do update set");
  lines.push("  query_id = excluded.query_id, global_id = excluded.global_id,");
  lines.push("  impressions = excluded.impressions, clicks = excluded.clicks,");
  lines.push("  poi_clicks = excluded.poi_clicks, deal_clicks = excluded.deal_clicks,");
  lines.push("  order_submits = excluded.order_submits, paid_orders = excluded.paid_orders,");
  lines.push("  verified_orders = excluded.verified_orders, gmv = excluded.gmv;");
  return lines.join("\n");
}

function formatPoiInsert(rows) {
  const lines = [
    "insert into public.fact_poi_monthly (",
    "  month, poi_id, exposure, visits, search_visits, recommend_visits,",
    "  deal_clicks, favorite_count, navigate_clicks, phone_clicks, avg_stay_seconds",
    ")",
    "values"
  ];
  rows.forEach((row, index) => {
    const monthVal = row.month === "CURRENT_DATE" ? "current_date" : sqlStr(row.month);
    lines.push(
      "  (" +
        [
          monthVal,
          sqlStr(row.poi_id),
          row.exposure,
          row.visits,
          row.search_visits,
          row.recommend_visits,
          row.deal_clicks,
          row.favorite_count,
          row.navigate_clicks,
          row.phone_clicks,
          row.avg_stay_seconds
        ].join(", ") +
        ")" +
        (index < rows.length - 1 ? "," : "")
    );
  });
  lines.push("on conflict (month, poi_id) do update set");
  lines.push("  exposure = excluded.exposure, visits = excluded.visits,");
  lines.push("  search_visits = excluded.search_visits, recommend_visits = excluded.recommend_visits,");
  lines.push("  deal_clicks = excluded.deal_clicks, favorite_count = excluded.favorite_count,");
  lines.push("  navigate_clicks = excluded.navigate_clicks, phone_clicks = excluded.phone_clicks,");
  lines.push("  avg_stay_seconds = excluded.avg_stay_seconds;");
  return lines.join("\n");
}

function formatCampaignInsert(rows) {
  const lines = [
    "insert into public.fact_deal_campaign_monthly (",
    "  month, deal_id, campaign_id, source, impressions, detail_views, buy_clicks,",
    "  order_submits, paid_orders, verified_orders, pay_gmv, coupon_reduce_amount, refunds",
    ")",
    "values"
  ];
  rows.forEach((row, index) => {
    const monthVal = row.month === "CURRENT_DATE" ? "current_date" : sqlStr(row.month);
    lines.push(
      "  (" +
        [
          monthVal,
          sqlStr(row.deal_id),
          sqlStr(row.campaign_id),
          sqlStr(row.source),
          row.impressions,
          row.detail_views,
          row.buy_clicks,
          row.order_submits,
          row.paid_orders,
          row.verified_orders,
          row.pay_gmv,
          row.coupon_reduce_amount,
          row.refunds
        ].join(", ") +
        ")" +
        (index < rows.length - 1 ? "," : "")
    );
  });
  lines.push("on conflict (month, deal_id, campaign_id, source) do update set");
  lines.push("  impressions = excluded.impressions, detail_views = excluded.detail_views,");
  lines.push("  buy_clicks = excluded.buy_clicks, order_submits = excluded.order_submits,");
  lines.push("  paid_orders = excluded.paid_orders, verified_orders = excluded.verified_orders,");
  lines.push("  pay_gmv = excluded.pay_gmv, coupon_reduce_amount = excluded.coupon_reduce_amount,");
  lines.push("  refunds = excluded.refunds;");
  return lines.join("\n");
}

function buildSql() {
  const fixture = generateHaidilaoDrillFixture();
  const h1Months = fixture.monthlyFacts.filter((row) => row.month >= "2026-01-31" && row.month <= "2026-06-30");
  const searchRows = buildSearchKeywordFactsFromBrandRows(h1Months);
  searchRows.push(
    {
      month: "CURRENT_DATE",
      brand_id: "haidilao",
      search_word: "haidilao",
      source: SOURCE_SEARCH,
      query_id: "demo-query-hdl",
      global_id: "demo-global-hdl",
      impressions: 12800,
      clicks: 1140,
      poi_clicks: 436,
      deal_clicks: 172,
      order_submits: 64,
      paid_orders: 41,
      verified_orders: 35,
      gmv: 14690.3
    },
    {
      month: "CURRENT_DATE",
      brand_id: "haidilao",
      search_word: RECOMMEND_WORD,
      source: SOURCE_RECOMMEND,
      query_id: "demo-feed-hdl",
      global_id: "demo-global-feed",
      impressions: 18600,
      clicks: 980,
      poi_clicks: 352,
      deal_clicks: 128,
      order_submits: 46,
      paid_orders: 29,
      verified_orders: 25,
      gmv: 10240.5
    }
  );

  const campaignRows = buildCampaignFactsFromBrandRows(h1Months, { fromMonth: "2026-05-31" });
  campaignRows.push(
    {
      month: "CURRENT_DATE",
      deal_id: "1651151438",
      campaign_id: "1151457400",
      source: SOURCE_SEARCH,
      impressions: 3220,
      detail_views: 172,
      buy_clicks: 91,
      order_submits: 64,
      paid_orders: 41,
      verified_orders: 35,
      pay_gmv: 14690.3,
      coupon_reduce_amount: 1258.7,
      refunds: 2
    },
    {
      month: "CURRENT_DATE",
      deal_id: "1651151438",
      campaign_id: "1151457400",
      source: SOURCE_RECOMMEND,
      impressions: 4100,
      detail_views: 128,
      buy_clicks: 68,
      order_submits: 46,
      paid_orders: 29,
      verified_orders: 25,
      pay_gmv: 10240.5,
      coupon_reduce_amount: 880.2,
      refunds: 1
    }
  );

  const poiRows = buildPoiRows(fixture);

  return [
    "-- 搜索 + 推荐 双路径流量种子（paid/verified/gmv 两路径之和 = 品牌月度汇总）",
    "-- 生成: node scripts/generate-traffic-seed.js",
    "",
    formatSearchInsert(searchRows),
    "",
    formatPoiInsert(poiRows),
    "",
    formatCampaignInsert(campaignRows),
    ""
  ].join("\n");
}

function verifyTotals() {
  const fixture = generateHaidilaoDrillFixture();
  const june = fixture.monthlyFacts.find((r) => r.month === "2026-06-30");
  const searchRows = fixture.dailyFacts.searchFacts.filter((r) => r.month === "2026-06-30");
  const paidSum = searchRows.reduce((s, r) => s + r.paid_orders, 0);
  const verifiedSum = searchRows.reduce((s, r) => s + r.verified_orders, 0);
  console.log("June brand paid:", june.paid_orders, "search+recommend paid:", paidSum);
  console.log("June brand verified:", june.verified_orders, "search+recommend verified:", verifiedSum);
}

const outPath = path.join(__dirname, "..", "supabase", "04_seed_daily_facts.sql");
fs.writeFileSync(outPath, buildSql(), "utf8");
verifyTotals();
console.log("Wrote " + outPath);
