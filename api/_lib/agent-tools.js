/**
 * Agent 工具层
 * 职责：把确定性数据查询包装成 AI SDK tool()，供 LLM 通过 function calling 自主调用。
 * 复用 supabase-context.js 的查询逻辑。
 */

const { loadSupabaseContext } = require("./supabase-context");
const { getSupabaseConfig } = require("./env");
const {
  registerDataTable,
  registerSqlQuery,
  getCitationRegistry
} = require("./citation-registry");
const { buildTableSql } = require("./table-sql-catalog");

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
  const tables = [
    "fact_brand_monthly",
    "fact_city_brand_monthly",
    "fact_search_keyword_monthly",
    "fact_poi_monthly",
    "fact_deal_campaign_monthly",
    "fact_competitor_benchmark_monthly"
  ];
  const { buildTableSql } = require("./table-sql-catalog");
  tables.forEach((table) =>
    registerDataTable(table, undefined, {
      brandId,
      sql: buildTableSql(table, brandId),
      dataMode: context.dataMode
    })
  );

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
    errors: context.errors,
    citationRefs: getCitationRegistry().filter((item) => item.type === "data").map((item) => item.id)
  });
}

/**
 * 工具：计算搜索→核销漏斗
 */
async function computeFunnel(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const { extractFilters } = require("./nl2sql");
  const { buildFunnelMetrics, buildFunnelSql } = require("./funnel-metrics");
  const { buildFunnelStageFormulas } = require("./calculation-format");

  const filters =
    params.filters ||
    extractFilters(params.question || params.query || "") ||
    (params.period ? extractFilters(String(params.period)) : {});

  const funnelSql = buildFunnelSql(brandId, filters);
  registerDataTable("fact_search_keyword_monthly", "搜索曝光/点击/下单/核销", {
    brandId,
    filters,
    sql: funnelSql,
    dataMode: context.dataMode
  });
  registerDataTable("fact_poi_monthly", "POI 访问与套餐点击", {
    brandId,
    filters,
    sql: buildTableSql("fact_poi_monthly", brandId, filters),
    dataMode: context.dataMode
  });
  registerDataTable("fact_deal_campaign_monthly", "套餐活动下单/支付/核销", {
    brandId,
    filters,
    sql: buildTableSql("fact_deal_campaign_monthly", brandId, filters),
    dataMode: context.dataMode
  });

  const metrics = buildFunnelMetrics(context, filters);
  const funnel = metrics.funnel;
  const formulaLines = buildFunnelStageFormulas(metrics);
  const { registerCalculation } = require("./citation-registry");
  const calcRef = registerCalculation("漏斗转化计算", formulaLines.join("\n"), {
    formula: "conversion_rate = current_stage / previous_stage",
    formulaLines,
    operator: "computeFunnel",
    result: {
      bottleneck: metrics.bottleneck,
      stageCount: funnel.length
    },
    filters
  });

  return JSON.stringify({
    funnel,
    summary: metrics.summary,
    bottleneck: metrics.bottleneck,
    filters,
    formulaLines,
    calculationRef: calcRef.id,
    citationRefs: [
      calcRef.id,
      ...getCitationRegistry().filter((item) => item.type === "data").map((item) => item.id)
    ]
  });
}

/**
 * 工具：月度经营数据聚合
 */
async function aggregateMonthly(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const { buildTableSql } = require("./table-sql-catalog");
  registerDataTable("fact_brand_monthly", "品牌月度 GTV/活跃用户/take rate", {
    brandId,
    sql: buildTableSql("fact_brand_monthly", brandId),
    dataMode: context.dataMode
  });
  registerDataTable("fact_city_brand_monthly", "城市月度 GMV/ROI", {
    brandId,
    sql: buildTableSql("fact_city_brand_monthly", brandId),
    dataMode: context.dataMode
  });
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
    dataMode: context.dataMode,
    citationRefs: getCitationRegistry().filter((item) => item.type === "data").map((item) => item.id)
  });
}

/**
 * 工具：竞对基准数据
 */
async function getCompetitorBenchmark(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const { buildPlatformBenchmarks } = require("./brand-peer");
  const platformBenchmarks = buildPlatformBenchmarks(context.competitorBenchmarks || []);

  return JSON.stringify({
    compareType: "platform",
    title: "平台对比 · 美团 vs 抖音",
    platformBenchmarks,
    benchmarks: platformBenchmarks.map((item) => ({
      competitor: item.name,
      month: item.month,
      marketShare: item.marketShare,
      avgOrderValue: item.avgOrderValue,
      verificationRate: item.verificationRate,
      subsidyRate: item.subsidyRate,
      adTakeRate: item.adTakeRate,
      contentShare: item.contentShare
    })),
    summary: {
      competitorCount: platformBenchmarks.length,
      dataConfidence: (context.competitorBenchmarks || [])[0]?.data_confidence || "unknown"
    }
  });
}

async function getBrandPeerBenchmark(params) {
  const brandId = params.brandId || "haidilao";
  const context = await getContext(brandId);
  const { buildBrandPeerBenchmarks } = require("./brand-peer");
  const peerData = buildBrandPeerBenchmarks(context);

  return JSON.stringify({
    compareType: "brand",
    title: "品牌竞品 · 海底捞 vs 呷哺呷哺",
    ...peerData
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
    description: "获取平台对比数据：美团 vs 抖音（渠道份额、核销率、客单价、补贴率）。",
    fn: getCompetitorBenchmark
  },
  getBrandPeerBenchmark: {
    name: "getBrandPeerBenchmark",
    description: "获取品牌竞品对比数据：海底捞 vs 呷哺呷哺（GTV、门店数、客单价、核销率、同城市 GMV）。",
    fn: getBrandPeerBenchmark
  },
  getBrandAssets: {
    name: "getBrandAssets",
    description: "查询品牌的分析框架、案例、预警线、话术模板等知识资产。",
    fn: getBrandAssets
  },
  runNl2Sql: {
    name: "runNl2Sql",
    description: "SQL 生成 Agent：把自然语言问题识别查询类型、生成只读 SQL 并返回行结果。适合 GMV/ROI/漏斗/竞对等各类问数。",
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
  getBrandPeerBenchmark,
  getBrandAssets,
  runNl2Sql,
  retrieveKnowledge,
  TOOL_REGISTRY
};
