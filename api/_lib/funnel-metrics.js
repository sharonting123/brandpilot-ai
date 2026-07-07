/**
 * 搜索→核销漏斗聚合（供 computeFunnel / NL2SQL 共用）
 * 支持搜索 + 推荐双路径；默认聚合两路径之和
 */

const { monthKeyToEndDate, monthMatches } = require("./period-utils");
const { buildTimeWhereClause } = require("./time-router");
const { SOURCE_SEARCH, SOURCE_RECOMMEND } = require("./traffic-split");

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

function filterFactsBySource(facts, filters = {}) {
  const path = filters.trafficPath || filters.sourcePath || "all";
  if (path === "all") return facts || [];
  if (path === "search") {
    return (facts || []).filter((row) => String(row.source || "").startsWith("mt_search"));
  }
  if (path === "recommend") {
    return (facts || []).filter((row) => row.source === SOURCE_RECOMMEND);
  }
  return (facts || []).filter((row) => row.source === path);
}

function pickFunnelValue(primary, fallback, poiExtra = 0) {
  if (primary > 0) return primary;
  if (fallback > 0) return fallback;
  return poiExtra;
}

function buildFunnelMetrics(context, filters = {}) {
  const searchFacts = filterFactsBySource(
    filterFactsByPeriod(context.dailyFacts ? context.dailyFacts.searchFacts || [] : [], filters),
    filters
  );
  const poiFacts = filterFactsByPeriod(
    context.dailyFacts ? context.dailyFacts.poiFacts || [] : [],
    filters
  );
  const campaignFacts = filterFactsBySource(
    filterFactsByPeriod(context.dailyFacts ? context.dailyFacts.campaignFacts || [] : [], filters),
    filters
  );

  const searchAgg = sumFields(searchFacts, [
    "impressions", "clicks", "poi_clicks", "deal_clicks",
    "order_submits", "paid_orders", "verified_orders", "gmv"
  ]);
  const poiAgg = sumFields(poiFacts, [
    "exposure", "visits", "search_visits", "recommend_visits", "deal_clicks"
  ]);
  const campaignAgg = sumFields(campaignFacts, [
    "impressions", "detail_views", "buy_clicks", "order_submits",
    "paid_orders", "verified_orders", "pay_gmv",
    "coupon_reduce_amount", "refunds"
  ]);

  const path = filters.trafficPath || filters.sourcePath || "all";
  const poiVisitsForPath =
    path === "recommend"
      ? poiAgg.recommend_visits
      : path === "search"
        ? poiAgg.search_visits
        : poiAgg.search_visits + poiAgg.recommend_visits;

  const impressions = searchAgg.impressions || 0;
  const clicks = searchAgg.clicks || 0;
  const poiClicks = pickFunnelValue(searchAgg.poi_clicks, poiVisitsForPath);
  const dealClicks = pickFunnelValue(searchAgg.deal_clicks, campaignAgg.detail_views);
  const orderSubmits = pickFunnelValue(searchAgg.order_submits, campaignAgg.order_submits);
  const paidOrders = searchAgg.paid_orders > 0 ? searchAgg.paid_orders : campaignAgg.paid_orders;
  const verifiedOrders = searchAgg.verified_orders > 0 ? searchAgg.verified_orders : campaignAgg.verified_orders;
  const gmv = searchAgg.gmv > 0 ? searchAgg.gmv : campaignAgg.pay_gmv;

  const exposureLabel =
    path === "recommend" ? "推荐曝光" : path === "search" ? "搜索曝光" : "流量曝光";
  const clickLabel =
    path === "recommend" ? "推荐点击" : path === "search" ? "搜索点击" : "流量点击";

  const funnel = [
    { stage: exposureLabel, count: impressions, rateFromPrevious: null, label: "起点" },
    { stage: clickLabel, count: clicks, rateFromPrevious: safeRatio(clicks, impressions), label: "CTR" },
    { stage: "POI 点击", count: poiClicks, rateFromPrevious: safeRatio(poiClicks, clicks), label: "流量→POI" },
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
      overallConversionRate: safeRatio(verifiedOrders, impressions),
      trafficPath: path,
      verificationRate: safeRatio(verifiedOrders, paidOrders)
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

function buildTrafficPathComparison(context, filters = {}) {
  const paths = ["search", "recommend", "all"];
  const comparison = {};
  for (const path of paths) {
    const metrics = buildFunnelMetrics(context, { ...filters, trafficPath: path });
    comparison[path] = {
      trafficPath: path,
      funnel: metrics.funnel,
      summary: metrics.summary,
      bottleneck: metrics.bottleneck
    };
  }

  const searchPaid = comparison.search.summary.totalPaidOrders || 0;
  const recommendPaid = comparison.recommend.summary.totalPaidOrders || 0;
  const allPaid = comparison.all.summary.totalPaidOrders || 0;
  comparison.split = {
    searchPaidOrders: searchPaid,
    recommendPaidOrders: recommendPaid,
    allPaidOrders: allPaid,
    searchShare: allPaid ? Number((searchPaid / allPaid).toFixed(4)) : null,
    recommendShare: allPaid ? Number((recommendPaid / allPaid).toFixed(4)) : null,
    note:
      "搜索路径 source=mt_search_*；推荐路径 source=mt_feed_poi；all=两路径之和，标签为「流量曝光/流量点击」，不可称作搜索。"
  };
  return comparison;
}

function buildTrafficFunnelPromptBlock(comparison) {
  if (!comparison) return "";
  return (
    "\n\n## 搜索 / 推荐双路径漏斗（系统预聚合，分析流量转化时必须分别引用）\n" +
    "```json\n" +
    JSON.stringify(comparison, null, 2) +
    "\n```\n" +
    "要求：复盘流量转化时分别写清搜索链路与推荐链路的曝光、点击、损耗点；汇总口径仅用于总量，不得把汇总流量称作搜索。"
  );
}

function funnelChartFromMetrics(metrics, title) {
  const funnel = metrics && metrics.funnel ? metrics.funnel : [];
  return {
    type: "funnel",
    title,
    data: {
      labels: funnel.map((stage) => stage.stage),
      datasets: [{ label: "用户数", data: funnel.map((stage) => stage.count) }]
    }
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

  const sourceClause =
    filters.trafficPath === "search"
      ? " AND source LIKE 'mt_search%'"
      : filters.trafficPath === "recommend"
        ? ` AND source = '${SOURCE_RECOMMEND}'`
        : "";

  return (
    "-- 搜索+推荐双路径七阶段漏斗（fact_search_keyword_monthly 按 source 聚合，总和=品牌月度）\n" +
    "WITH search_agg AS (\n" +
    "  SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(poi_clicks) poi_clicks,\n" +
    "         SUM(deal_clicks) deal_clicks, SUM(order_submits) order_submits,\n" +
    "         SUM(paid_orders) paid_orders, SUM(verified_orders) verified_orders\n" +
    "  FROM fact_search_keyword_monthly\n" +
    `  WHERE brand_id = '${brandId}'${periodClause}${sourceClause}\n` +
    ")\n" +
    "SELECT stage_order, stage, user_count, conversion_rate_pct\n" +
    "FROM funnel_stage_view\n" +
    "ORDER BY stage_order"
  );
}

module.exports = {
  buildFunnelMetrics,
  buildTrafficPathComparison,
  buildTrafficFunnelPromptBlock,
  funnelChartFromMetrics,
  funnelRowsForSql,
  buildFunnelSql,
  filterFactsByPeriod,
  filterFactsBySource,
  safeRatio
};
