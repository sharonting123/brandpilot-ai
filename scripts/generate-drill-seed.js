#!/usr/bin/env node
/**
 * 生成 supabase/09_drill_granular_seed.sql
 * 统计周期 2024-01-01 至 2026-06-30，城市→商圈→门店粒度
 */
const fs = require("fs");
const path = require("path");
const { generateHaidilaoDrillFixture, DATE_RANGE } = require("../api/_lib/drill-data");

function sqlStr(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function buildSql() {
  const fixture = generateHaidilaoDrillFixture();
  const lines = [];
  lines.push("-- 沙盘下钻全量种子数据");
  lines.push("-- 统计周期: " + DATE_RANGE.range);
  lines.push("-- 粒度: 品牌 → 城市 → 商圈(business_area) → 门店");
  lines.push("");

  lines.push("insert into public.dim_brand (brand_id, brand_name, category, brand_level, headquarter_city, store_count, ka_owner, cooperation_status)");
  lines.push("values (" + [
    sqlStr(fixture.brandProfile.brand_id),
    sqlStr(fixture.brandProfile.brand_name),
    sqlStr(fixture.brandProfile.category),
    sqlStr(fixture.brandProfile.brand_level),
    sqlStr(fixture.brandProfile.headquarter_city),
    fixture.brandProfile.store_count,
    sqlStr(fixture.brandProfile.ka_owner),
    sqlStr(fixture.brandProfile.cooperation_status)
  ].join(", ") + ")");
  lines.push("on conflict (brand_id) do update set store_count = excluded.store_count;");
  lines.push("");

  lines.push("insert into public.dim_poi (poi_id, brand_id, poi_name, city, district, business_area, category, address, poi_status)");
  lines.push("values");
  fixture.pois.forEach((poi, index) => {
    const row = "(" + [
      sqlStr(poi.poi_id),
      sqlStr(poi.brand_id),
      sqlStr(poi.poi_name),
      sqlStr(poi.city),
      sqlStr(poi.district),
      sqlStr(poi.business_area),
      sqlStr(poi.category),
      sqlStr(poi.address),
      sqlStr(poi.poi_status)
    ].join(", ") + ")";
    lines.push(row + (index < fixture.pois.length - 1 ? "," : ""));
  });
  lines.push("on conflict (poi_id) do update set");
  lines.push("  poi_name = excluded.poi_name, city = excluded.city, district = excluded.district, business_area = excluded.business_area;");
  lines.push("");

  lines.push("delete from public.fact_city_brand_monthly where brand_id = 'haidilao' and month >= '2024-01-01' and month <= '2026-06-30';");
  lines.push("insert into public.fact_city_brand_monthly (month, brand_id, city, store_count, search_impressions, recommend_impressions, poi_visits, paid_orders, verified_orders, gmv, coupon_reduce_amount, ad_spend, roi, avg_order_value)");
  lines.push("values");
  fixture.cityMonthlyFacts.forEach((row, index) => {
    const vals = "(" + [
      sqlStr(row.month),
      sqlStr(row.brand_id),
      sqlStr(row.city),
      row.store_count,
      row.search_impressions,
      row.recommend_impressions,
      row.poi_visits,
      row.paid_orders,
      row.verified_orders,
      row.gmv,
      row.coupon_reduce_amount,
      row.ad_spend,
      row.roi,
      row.avg_order_value
    ].join(", ") + ")";
    lines.push(vals + (index < fixture.cityMonthlyFacts.length - 1 ? "," : ""));
  });
  lines.push("on conflict (month, brand_id, city) do update set gmv = excluded.gmv, paid_orders = excluded.paid_orders, verified_orders = excluded.verified_orders;");
  lines.push("");

  lines.push("delete from public.fact_brand_monthly where brand_id = 'haidilao' and month >= '2024-01-01' and month <= '2026-06-30';");
  lines.push("insert into public.fact_brand_monthly (month, brand_id, active_users, purchase_frequency, avg_order_value, gtv, paid_orders, verified_orders, repeat_purchase_rate, commission_revenue, ad_revenue, merchant_revenue, subsidy_amount, operating_cost, ad_merchant_penetration, take_rate, subsidy_rate, data_confidence)");
  lines.push("values");
  fixture.monthlyFacts.forEach((row, index) => {
    const vals = "(" + [
      sqlStr(row.month),
      sqlStr(row.brand_id),
      row.active_users,
      row.purchase_frequency,
      row.avg_order_value,
      row.gtv,
      row.paid_orders,
      row.verified_orders,
      row.repeat_purchase_rate,
      row.commission_revenue,
      row.ad_revenue,
      row.merchant_revenue,
      row.subsidy_amount,
      row.operating_cost,
      row.ad_merchant_penetration,
      row.take_rate,
      row.subsidy_rate,
      sqlStr(row.data_confidence)
    ].join(", ") + ")";
    lines.push(vals + (index < fixture.monthlyFacts.length - 1 ? "," : ""));
  });
  lines.push("on conflict (month, brand_id) do update set gtv = excluded.gtv, paid_orders = excluded.paid_orders;");
  lines.push("");

  lines.push("delete from public.fact_poi_monthly where month >= '2024-01-31' and month <= '2026-06-30' and poi_id like 'hdl-%';");
  lines.push("insert into public.fact_poi_monthly (month, poi_id, exposure, visits, search_visits, recommend_visits, deal_clicks, favorite_count, navigate_clicks, phone_clicks, avg_stay_seconds)");
  lines.push("values");
  const poiFacts = fixture.dailyFacts.poiFacts;
  poiFacts.forEach((row, index) => {
    const vals = "(" + [
      sqlStr(row.month),
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
    ].join(", ") + ")";
    lines.push(vals + (index < poiFacts.length - 1 ? "," : ""));
  });
  lines.push("on conflict (month, poi_id) do update set exposure = excluded.exposure, visits = excluded.visits;");
  lines.push("");

  return lines.join("\n");
}

const outPath = path.join(__dirname, "..", "supabase", "09_drill_granular_seed.sql");
const sql = buildSql();
fs.writeFileSync(outPath, sql, "utf8");
console.log("Wrote " + outPath);
console.log("Rows: pois=" + generateHaidilaoDrillFixture().pois.length);
