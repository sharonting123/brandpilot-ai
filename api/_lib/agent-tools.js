/**
 * Agent 工具层
 * 职责：把确定性数据查询包装成 AI SDK tool()，供 LLM 通过 function calling 自主调用。
 * 复用 supabase-context.js 的查询逻辑。
 */

const { loadSupabaseContext } = require("./supabase-context");
const { getSupabaseConfig } = require("./env");

// 全局上下文缓存（请求级别，每个 HTTP 请求创建一个新实例）
let _contextCache = null;

/**
 * 获取 Supabase 上下文（带缓存）
 */
async function getContext(brandId = "haidilao") {
  if (_contextCache) return _contextCache;
  _contextCache = await loadSupabaseContext(getSupabaseConfig(process.env), { brandId });
  return _contextCache;
}

/**
 * 重置上下文缓存（每次请求开始时调用）
 */
function resetContextCache() {
  _contextCache = null;
}

/**
 * 工具：查询品牌综合数据
 * LLM 可通过此工具获取品牌全量数据
 */
async function queryBrandData(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);

  return JSON.stringify({
    brandProfile: context.brandProfile,
    sourceCounts: {
      pois: context.pois ? context.pois.length : 0,
      deals: context.deals ? context.deals.length : 0,
      funnelEvents: context.funnelEvents ? context.funnelEvents.length : 0,
      searchFacts: context.dailyFacts ? context.dailyFacts.searchFacts ? context.dailyFacts.searchFacts.length : 0 : 0,
      poiFacts: context.dailyFacts ? context.dailyFacts.poiFacts ? context.dailyFacts.poiFacts.length : 0 : 0,
      campaignFacts: context.dailyFacts ? context.dailyFacts.campaignFacts ? context.dailyFacts.campaignFacts.length : 0 : 0,
      monthlyFacts: context.monthlyFacts ? context.monthlyFacts.length : 0,
      cityMonthlyFacts: context.cityMonthlyFacts ? context.cityMonthlyFacts.length : 0,
      competitorBenchmarks: context.competitorBenchmarks ? context.competitorBenchmarks.length : 0,
      assets: context.assets ? context.assets.length : 0
    },
    dataMode: context.dataMode,
    warnings: context.warnings,
    errors: context.errors
  });
}

/**
 * 工具：计算搜索→核销漏斗
 */
async function computeFunnel(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const searchFacts = context.dailyFacts ? context.dailyFacts.searchFacts || [] : [];
  const poiFacts = context.dailyFacts ? context.dailyFacts.poiFacts || [] : [];
  const campaignFacts = context.dailyFacts ? context.dailyFacts.campaignFacts || [] : [];

  // 聚合数据
  const searchAgg = sumFields(searchFacts, [
    "impressions", "clicks", "poi_clicks", "deal_clicks",
    "order_submits", "paid_orders", "verified_orders", "gmv"
  ]);
  const poiAgg = sumFields(poiFacts, [
    "exposure", "visits", "search_visits", "deal_clicks",
    "favorite_count", "navigate_clicks", "phone_clicks"
  ]);
  const campaignAgg = sumFields(campaignFacts, [
    "impressions", "detail_views", "buy_clicks", "order_submits",
    "paid_orders", "verified_orders", "pay_gmv",
    "coupon_reduce_amount", "refunds"
  ]);

  // 合并数据源
  const impressions = searchAgg.impressions || 0;
  const clicks = searchAgg.clicks || 0;
  const poiClicks = searchAgg.poi_clicks || poiAgg.search_visits || 0;
  const dealClicks = searchAgg.deal_clicks || campaignAgg.detail_views || 0;
  const orderSubmits = searchAgg.order_submits || campaignAgg.order_submits || 0;
  const paidOrders = searchAgg.paid_orders || campaignAgg.paid_orders || 0;
  const verifiedOrders = searchAgg.verified_orders || campaignAgg.verified_orders || 0;
  const gmv = searchAgg.gmv || campaignAgg.pay_gmv || 0;
  const subsidy = campaignAgg.coupon_reduce_amount || 0;
  const refunds = campaignAgg.refunds || 0;

  // 计算7阶段漏斗
  const funnel = [
    { stage: "搜索曝光", count: impressions, rateFromPrevious: null, label: "起点" },
    { stage: "搜索点击", count: clicks, rateFromPrevious: safeRatio(clicks, impressions), label: "CTR" },
    { stage: "POI 点击", count: poiClicks, rateFromPrevious: safeRatio(poiClicks, clicks), label: "搜索→POI" },
    { stage: "套餐详情", count: dealClicks, rateFromPrevious: safeRatio(dealClicks, poiClicks), label: "POI→套餐" },
    { stage: "下单提交", count: orderSubmits, rateFromPrevious: safeRatio(orderSubmits, dealClicks), label: "套餐→下单" },
    { stage: "支付订单", count: paidOrders, rateFromPrevious: safeRatio(paidOrders, orderSubmits), label: "下单→支付" },
    { stage: "核销订单", count: verifiedOrders, rateFromPrevious: safeRatio(verifiedOrders, paidOrders), label: "支付→核销" }
  ];

  // 找出最大损耗点
  let maxLeakage = { from: funnel[0].stage, to: funnel[1].stage, rate: funnel[1].rateFromPrevious || 0 };
  for (let i = 1; i < funnel.length; i++) {
    const rate = funnel[i].rateFromPrevious;
    if (rate !== null && rate < maxLeakage.rate) {
      maxLeakage = { from: funnel[i - 1].stage, to: funnel[i].stage, rate };
    }
  }

  return JSON.stringify({
    funnel,
    summary: {
      totalImpressions: impressions,
      totalPaidOrders: paidOrders,
      totalVerifiedOrders: verifiedOrders,
      totalGMV: gmv,
      overallConversionRate: safeRatio(verifiedOrders, impressions),
      searchCTR: safeRatio(clicks, impressions),
      poiToDealRate: safeRatio(dealClicks, poiClicks),
      submitToPaidRate: safeRatio(paidOrders, orderSubmits),
      paidToVerifiedRate: safeRatio(verifiedOrders, paidOrders),
      avgOrderValue: paidOrders > 0 ? gmv / paidOrders : 0,
      subsidyRate: safeRatio(subsidy, gmv),
      refundRate: safeRatio(refunds, paidOrders)
    },
    bottleneck: {
      from: maxLeakage.from,
      to: maxLeakage.to,
      conversionRate: maxLeakage.rate,
      label: "最大损耗在：" + maxLeakage.from + " -> " + maxLeakage.to + "，转化率仅 " + fmtPercent(maxLeakage.rate)
    }
  });
}

/**
 * 工具：月度经营数据聚合
 */
async function aggregateMonthly(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const monthlyFacts = context.monthlyFacts || [];
  const cityMonthlyFacts = context.cityMonthlyFacts || [];

  // 聚合月度经分
  const sorted = [...monthlyFacts].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const totalGtv = sumField(sorted, "gtv");
  const totalPaidOrders = sumField(sorted, "paid_orders");
  const totalVerifiedOrders = sumField(sorted, "verified_orders");
  const latestMonth = sorted.length > 0 ? sorted[sorted.length - 1] : {};

  // 城市分层
  const latestMonthStr = String(latestMonth.month || "");
  const latestCities = cityMonthlyFacts
    .filter((c) => String(c.month) === latestMonthStr)
    .sort((a, b) => (b.gmv || 0) - (a.gmv || 0));

  return JSON.stringify({
    period: (sorted[0] ? sorted[0].month : "?") + " ~ " + (sorted[sorted.length - 1] ? sorted[sorted.length - 1].month : "?"),
    months: sorted.length,
    totals: {
      gtv: totalGtv,
      paidOrders: totalPaidOrders,
      verifiedOrders: totalVerifiedOrders,
      verifiedRate: safeRatio(totalVerifiedOrders, totalPaidOrders)
    },
    latest: {
      month: latestMonth.month,
      activeUsers: latestMonth.active_users,
      purchaseFrequency: latestMonth.purchase_frequency,
      avgOrderValue: latestMonth.avg_order_value,
      gtv: latestMonth.gtv,
      takeRate: latestMonth.take_rate,
      subsidyRate: latestMonth.subsidy_rate,
      adMerchantPenetration: latestMonth.ad_merchant_penetration,
      repeatPurchaseRate: latestMonth.repeat_purchase_rate
    },
    monthlyTrend: sorted.map((m) => ({
      month: m.month,
      gtv: m.gtv,
      activeUsers: m.active_users,
      avgOrderValue: m.avg_order_value,
      verifiedRate: safeRatio(m.verified_orders, m.paid_orders),
      takeRate: m.take_rate
    })),
    cityTiers: latestCities.map((c) => ({
      city: c.city,
      storeCount: c.store_count,
      gmv: c.gmv,
      roi: c.roi,
      verifiedRate: safeRatio(c.verified_orders, c.paid_orders)
    })),
    dataMode: context.dataMode
  });
}

/**
 * 工具：竞对基准数据
 */
async function getCompetitorBenchmark(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const benchmarks = context.competitorBenchmarks || [];

  return JSON.stringify({
    benchmarks: benchmarks.map((b) => ({
      competitor: b.competitor,
      month: b.month,
      marketShare: b.market_share,
      avgOrderValue: b.avg_order_value,
      verificationRate: b.verification_rate,
      subsidyRate: b.subsidy_rate,
      adTakeRate: b.ad_take_rate,
      contentShare: b.content_share,
      dataConfidence: b.data_confidence
    })),
    summary: {
      competitorCount: benchmarks.length,
      dataConfidence: benchmarks[0] ? benchmarks[0].data_confidence : "unknown"
    }
  });
}

/**
 * 工具：查询品牌资产（案例、框架、话术等）
 */
async function getBrandAssets(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const assets = context.assets || [];

  return JSON.stringify({
    assets: assets.map((a) => ({
      type: a.asset_type,
      title: a.title,
      content: a.content
    })),
    count: assets.length
  });
}

/**
 * 工具：NL2SQL 自然语言查数
 */
async function runNl2Sql(params) {
  const nl2sql = require("./nl2sql");
  return nl2sql.runNl2Sql(params);
}

/**
 * 工具：RAG 知识检索
 */
async function retrieveKnowledge(params) {
  const rag = require("./rag");
  return rag.retrieveKnowledge(params);
}

// ===== 辅助函数 =====

function sumFields(rows, fields) {
  return rows.reduce((acc, row) => {
    for (const field of fields) {
      acc[field] = (acc[field] || 0) + (Number(row ? row[field] : null) || 0);
    }
    return acc;
  }, {});
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + (Number(row ? row[field] : null) || 0), 0);
}

function safeRatio(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  return d > 0 ? n / d : 0;
}

function fmtPercent(value) {
  return ((Number(value) || 0) * 100).toFixed(1) + "%";
}

// 工具注册表（供 workflow 使用）
const TOOL_REGISTRY = {
  queryBrandData: {
    name: "queryBrandData",
    description: "查询品牌全量数据，包括品牌信息、POI、套餐、搜索事实、活动事实、月度经分、城市分群、竞对基准和品牌资产。",
    fn: queryBrandData
  },
  computeFunnel: {
    name: "computeFunnel",
    description: "计算搜索曝光→搜索点击→POI点击→套餐详情→下单提交→支付订单→核销订单的7阶段转化漏斗，找最大损耗点。",
    fn: computeFunnel
  },
  aggregateMonthly: {
    name: "aggregateMonthly",
    description: "聚合月度经营数据：GTV、活跃用户、购买频次、客单价、take_rate、补贴率、广告渗透率、城市分层等。",
    fn: aggregateMonthly
  },
  getCompetitorBenchmark: {
    name: "getCompetitorBenchmark",
    description: "获取品牌在各平台（美团到餐、抖音到店、私域会员等）的竞对基准数据。",
    fn: getCompetitorBenchmark
  },
  getBrandAssets: {
    name: "getBrandAssets",
    description: "查询品牌的分析框架、案例、预警线、话术模板等知识资产。",
    fn: getBrandAssets
  },
  runNl2Sql: {
    name: "runNl2Sql",
    description: "把自然语言问题转成只读 SQL 查询计划并返回行结果。适合「6月GMV多少」「上海ROI」这类精确问数。",
    fn: runNl2Sql
  },
  retrieveKnowledge: {
    name: "retrieveKnowledge",
    description: "从经营分析知识库与品牌资产中检索相关证据片段（RAG），回答需引用 citations。",
    fn: retrieveKnowledge
  }
};

module.exports = {
  getContext,
  resetContextCache,
  queryBrandData,
  computeFunnel,
  aggregateMonthly,
  getCompetitorBenchmark,
  getBrandAssets,
  runNl2Sql,
  retrieveKnowledge,
  TOOL_REGISTRY
};
