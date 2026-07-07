/**
 * NL2SQL few-shot 示例库
 * 供 SQL 生成 Agent 识别查询类型并快速生成只读 SQL。
 */

const SQL_FEW_SHOTS = [
  {
    queryType: "monthly_gtv",
    table: "fact_brand_monthly",
    question: "海底捞2026年6月GMV是多少？",
    sql:
      "SELECT month, gtv, paid_orders, verified_orders, take_rate, subsidy_rate, avg_order_value\n" +
      "FROM fact_brand_monthly\n" +
      "WHERE brand_id = 'haidilao' AND month >= '2026-06-01' AND month < '2026-07-01'\n" +
      "ORDER BY month DESC",
    reasoning: "用户问品牌月度 GMV/GTV，查 fact_brand_monthly，按年月过滤。"
  },
  {
    queryType: "monthly_gtv",
    table: "fact_brand_monthly",
    question: "海底捞上半年营业额趋势？",
    sql:
      "SELECT month, gtv, active_users, avg_order_value, take_rate\n" +
      "FROM fact_brand_monthly\n" +
      "WHERE brand_id = 'haidilao'\n" +
      "ORDER BY month ASC",
    reasoning: "用户问营业额趋势，查品牌月度表全量按月排序。"
  },
  {
    queryType: "city_roi",
    table: "fact_city_brand_monthly",
    question: "上海6月ROI多少？",
    sql:
      "SELECT month, city, gmv, roi, paid_orders, verified_orders, store_count\n" +
      "FROM fact_city_brand_monthly\n" +
      "WHERE brand_id = 'haidilao' AND city = '上海'\n" +
      "ORDER BY month DESC",
    reasoning: "用户问城市 ROI，查 fact_city_brand_monthly 并按城市过滤。"
  },
  {
    queryType: "city_roi",
    table: "fact_city_brand_monthly",
    question: "各城市GMV排名？",
    sql:
      "SELECT month, city, gmv, roi, store_count\n" +
      "FROM fact_city_brand_monthly\n" +
      "WHERE brand_id = 'haidilao'\n" +
      "ORDER BY gmv DESC",
    reasoning: "用户问城市 GMV 排名，查城市月度表按 GMV 降序。"
  },
  {
    queryType: "funnel_conversion",
    table: "fact_search_keyword_monthly",
    question: "海底捞2026年6月从搜索到核销的转化链路哪里损耗最大？",
    sql:
      "-- 搜索到核销七阶段漏斗\n" +
      "WITH search_agg AS (\n" +
      "  SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(poi_clicks) poi_clicks,\n" +
      "         SUM(deal_clicks) deal_clicks, SUM(order_submits) order_submits,\n" +
      "         SUM(paid_orders) paid_orders, SUM(verified_orders) verified_orders\n" +
      "  FROM fact_search_keyword_monthly\n" +
      "  WHERE brand_id = 'haidilao' AND month = '2026-06-30'\n" +
      ")\n" +
      "SELECT stage_order, stage, user_count, conversion_rate_pct FROM funnel_stage_view ORDER BY stage_order",
    reasoning: "用户问转化链路损耗，查漏斗七阶段聚合，需按月份过滤日表。"
  },
  {
    queryType: "funnel_conversion",
    table: "fact_search_keyword_monthly",
    question: "海底捞2026年6月推荐链路的转化哪里损耗最大？",
    sql:
      "-- 推荐路径七阶段漏斗（source=mt_feed_poi）\n" +
      "WITH search_agg AS (\n" +
      "  SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(poi_clicks) poi_clicks,\n" +
      "         SUM(deal_clicks) deal_clicks, SUM(order_submits) order_submits,\n" +
      "         SUM(paid_orders) paid_orders, SUM(verified_orders) verified_orders\n" +
      "  FROM fact_search_keyword_monthly\n" +
      "  WHERE brand_id = 'haidilao' AND month = '2026-06-30' AND source = 'mt_feed_poi'\n" +
      ")\n" +
      "SELECT stage_order, stage, user_count, conversion_rate_pct FROM funnel_stage_view ORDER BY stage_order",
    reasoning: "用户问推荐链路损耗，漏斗需加 source=mt_feed_poi 过滤，仅统计推荐流量。"
  },
  {
    queryType: "search_keywords",
    table: "fact_search_keyword_monthly",
    question: "搜索曝光最高的关键词有哪些？",
    sql:
      "SELECT month, search_word, impressions, clicks, paid_orders, verified_orders, gmv\n" +
      "FROM fact_search_keyword_monthly\n" +
      "WHERE brand_id = 'haidilao'\n" +
      "ORDER BY impressions DESC\n" +
      "LIMIT 20",
    reasoning: "用户问搜索关键词曝光，查搜索词日表按曝光降序取 Top N。"
  },
  {
    queryType: "competitor",
    table: "fact_competitor_benchmark_monthly",
    question: "美团和抖音核销率对比？",
    sql:
      "SELECT month, competitor, verification_rate, subsidy_rate, content_share, avg_order_value\n" +
      "FROM fact_competitor_benchmark_monthly\n" +
      "WHERE brand_id = 'haidilao'\n" +
      "ORDER BY month DESC",
    reasoning: "用户问平台竞对核销率，查竞对基准月表。"
  },
  {
    queryType: "poi_list",
    table: "dim_poi",
    question: "海底捞上海有哪些门店？",
    sql:
      "SELECT poi_id, poi_name, city, district, business_area\n" +
      "FROM dim_poi\n" +
      "WHERE brand_id = 'haidilao' AND city = '上海'\n" +
      "ORDER BY poi_name",
    reasoning: "用户问门店列表，查 POI 维表并按城市过滤。"
  },
  {
    queryType: "campaign",
    table: "fact_deal_campaign_monthly",
    question: "哪个套餐活动核销GMV最高？",
    sql:
      "SELECT month, deal_id, impressions, paid_orders, verified_orders, pay_gmv, coupon_reduce_amount\n" +
      "FROM fact_deal_campaign_monthly\n" +
      "WHERE brand_id = 'haidilao'\n" +
      "ORDER BY pay_gmv DESC\n" +
      "LIMIT 20",
    reasoning: "用户问套餐/活动表现，查活动日表按支付 GMV 排序。"
  },
  {
    queryType: "monthly_gtv",
    table: "fact_brand_monthly",
    question: "海底捞核销率是多少？",
    sql:
      "SELECT month, paid_orders, verified_orders,\n" +
      "       ROUND(verified_orders::numeric / NULLIF(paid_orders, 0), 4) AS verification_rate\n" +
      "FROM fact_brand_monthly\n" +
      "WHERE brand_id = 'haidilao'\n" +
      "ORDER BY month DESC",
    reasoning: "用户问核销率，从品牌月度表取支付/核销订单计算比率。"
  }
];

const QUERY_TYPE_LABELS = {
  monthly_gtv: "品牌月度经营（GMV/GTV/核销率）",
  city_roi: "城市经营（GMV/ROI）",
  funnel_conversion: "搜索到核销转化漏斗",
  search_keywords: "搜索关键词曝光点击",
  competitor: "竞对/平台基准对比",
  poi_list: "门店 POI 列表",
  campaign: "套餐活动表现"
};

function formatFewShotsForPrompt(limit = 8) {
  return SQL_FEW_SHOTS.slice(0, limit)
    .map(
      (shot, index) =>
        `示例 ${index + 1}:\n` +
        `问题: ${shot.question}\n` +
        `queryType: ${shot.queryType}\n` +
        `table: ${shot.table}\n` +
        `reasoning: ${shot.reasoning}\n` +
        `sql:\n${shot.sql}`
    )
    .join("\n\n");
}

function getFewShotsByType(queryType) {
  return SQL_FEW_SHOTS.filter((shot) => shot.queryType === queryType);
}

module.exports = {
  SQL_FEW_SHOTS,
  QUERY_TYPE_LABELS,
  formatFewShotsForPrompt,
  getFewShotsByType
};
