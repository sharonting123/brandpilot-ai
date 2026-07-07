/**
 * 搜索→核销漏斗聚合（供 computeFunnel / NL2SQL 共用）
 */

const { monthKeyToEndDate, monthMatches } = require("./period-utils");
const { buildTimeWhereClause } = require("./time-router");

function safeRatio(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function sumFields(rows, fields) {
  const totals = {};
  fields.forEach((field) => {
    totals[field] = 0;
  });
  (rows || []).forEach((row) => {
    fields.forEach((field) => {
      totals[field] += Number(row[field]) || 0;
    });
  });
  return totals;
}

function filterFactsByPeriod(facts, filters = {}) {
  const list = facts || [];
  if (!filters.month && !filters.monthNum && !filters.year) return list;

  return list.filter((row) => {
    const periodValue = String(row.month || row.date || "");
    if (filters.month) {
      return monthMatches(periodValue, String(filters.month).slice(0, 7));
    }
    if (filters.year && filters.monthNum) {
      return monthMatches(periodValue, `${filters.year}-${String(filters.monthNum).padStart(2, "0")}`);
    }
    if (filters.monthNum) {
      const padded = String(filters.monthNum).padStart(2, "0");
      return periodValue.includes(`-${padded}-`) || periodValue.includes(`-${padded}`);
    }
    return true;
  });
}

function buildFunnelMetrics(context, filters = {}) {
  const searchFacts = filterFactsByPeriod(
    context.dailyFacts ? context.dailyFacts.searchFacts || [] : [],
    filters
  );
  const poiFacts = filterFactsByPeriod(
    context.dailyFacts ? context.dailyFacts.poiFacts || [] : [],
    filters
  );
  const campaignFacts = filterFactsByPeriod(
    context.dailyFacts ? context.dailyFacts.campaignFacts || [] : [],
    filters
  );

  const searchAgg = sumFields(searchFacts, [
    "impressions", "clicks", "poi_clicks", "deal_clicks",
    "order_submits", "paid_orders", "verified_orders", "gmv"
  ]);
  const poiAgg = sumFields(poiFacts, [
    "exposure", "visits", "search_visits", "deal_clicks"
  ]);
  const campaignAgg = sumFields(campaignFacts, [
    "impressions", "detail_views", "buy_clicks", "order_submits",
    "paid_orders", "verified_orders", "pay_gmv",
    "coupon_reduce_amount", "refunds"
  ]);

  const impressions = searchAgg.impressions || 0;
  const clicks = searchAgg.clicks || 0;
  const poiClicks = searchAgg.poi_clicks || poiAgg.search_visits || 0;
  const dealClicks = searchAgg.deal_clicks || campaignAgg.detail_views || 0;
  const orderSubmits = searchAgg.order_submits || campaignAgg.order_submits || 0;
  const paidOrders = searchAgg.paid_orders || campaignAgg.paid_orders || 0;
  const verifiedOrders = searchAgg.verified_orders || campaignAgg.verified_orders || 0;
  const gmv = searchAgg.gmv || campaignAgg.pay_gmv || 0;

  const funnel = [
    { stage: "搜索曝光", count: impressions, rateFromPrevious: null, label: "起点" },
    { stage: "搜索点击", count: clicks, rateFromPrevious: safeRatio(clicks, impressions), label: "CTR" },
    { stage: "POI 点击", count: poiClicks, rateFromPrevious: safeRatio(poiClicks, clicks), label: "搜索→POI" },
    { stage: "套餐详情", count: dealClicks, rateFromPrevious: safeRatio(dealClicks, poiClicks), label: "POI→套餐" },
    { stage: "下单提交", count: orderSubmits, rateFromPrevious: safeRatio(orderSubmits, dealClicks), label: "套餐→下单" },
    { stage: "支付订单", count: paidOrders, rateFromPrevious: safeRatio(paidOrders, orderSubmits), label: "下单→支付" },
    { stage: "核销订单", count: verifiedOrders, rateFromPrevious: safeRatio(verifiedOrders, paidOrders), label: "支付→核销" }
  ];

  let maxLeakage = { from: funnel[0].stage, to: funnel[1].stage, rate: funnel[1].rateFromPrevious || 0 };
  for (let i = 1; i < funnel.length; i++) {
    const rate = funnel[i].rateFromPrevious;
    if (rate !== null && rate < maxLeakage.rate) {
      maxLeakage = { from: funnel[i - 1].stage, to: funnel[i].stage, rate };
    }
  }

  return {
    funnel,
    summary: {
      totalImpressions: impressions,
      totalPaidOrders: paidOrders,
      totalVerifiedOrders: verifiedOrders,
      totalGMV: gmv,
      overallConversionRate: safeRatio(verifiedOrders, impressions)
    },
    bottleneck: {
      from: maxLeakage.from,
      to: maxLeakage.to,
      conversionRate: maxLeakage.rate,
      label:
        "最大损耗在：" +
        maxLeakage.from +
        " -> " +
        maxLeakage.to +
        "，转化率仅 " +
        (maxLeakage.rate * 100).toFixed(2) +
        "%"
    },
    filters
  };
}

function funnelRowsForSql(funnel) {
  return (funnel || []).map((stage, index) => ({
    stage_order: index + 1,
    stage: stage.stage,
    user_count: stage.count,
    conversion_rate:
      stage.rateFromPrevious == null ? null : Number((stage.rateFromPrevious * 100).toFixed(2))
  }));
}

function buildFunnelSql(brandId, filters = {}) {
  const periodClause = buildTimeWhereClause(
    {
      semantics: {
        monthEnd: filters.month,
        from: filters.dateFrom,
        to: filters.dateTo,
        monthNum: filters.monthNum,
        year: filters.year ? Number(filters.year) : null
      },
      effectiveGrain: "month"
    },
    "month"
  );

  return (
    "-- 搜索到核销七阶段漏斗（聚合 search / poi / campaign 月表，月末口径）\n" +
    "WITH search_agg AS (\n" +
    "  SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(poi_clicks) poi_clicks,\n" +
    "         SUM(deal_clicks) deal_clicks, SUM(order_submits) order_submits,\n" +
    "         SUM(paid_orders) paid_orders, SUM(verified_orders) verified_orders\n" +
    "  FROM fact_search_keyword_monthly\n" +
    `  WHERE brand_id = '${brandId}'${periodClause}\n` +
    "), poi_agg AS (\n" +
    "  SELECT SUM(search_visits) search_visits FROM fact_poi_monthly\n" +
    `  WHERE brand_id = '${brandId}'${periodClause}\n` +
    "), campaign_agg AS (\n" +
    "  SELECT SUM(detail_views) detail_views, SUM(order_submits) order_submits,\n" +
    "         SUM(paid_orders) paid_orders, SUM(verified_orders) verified_orders\n" +
    "  FROM fact_deal_campaign_monthly\n" +
    `  WHERE brand_id = '${brandId}'${periodClause}\n` +
    ")\n" +
    "SELECT stage_order, stage, user_count, conversion_rate_pct\n" +
    "FROM funnel_stage_view\n" +
    "ORDER BY stage_order"
  );
}

module.exports = {
  buildFunnelMetrics,
  funnelRowsForSql,
  buildFunnelSql,
  filterFactsByPeriod,
  safeRatio
};
