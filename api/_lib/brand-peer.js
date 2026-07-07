/**
 * 平台对比（美团到餐 vs 抖音到店）与品牌竞品对比（海底捞 vs 呷哺呷哺）
 */

const { DEPRECATED_COMPETITOR_NAMES } = require("./column-aliases");

const PEER_MAP = {
  haidilao: { peerId: "xiabuxiabu", peerName: "呷哺呷哺", brandName: "海底捞" }
};

/** 竞对基准表 canonical 平台名（不含废弃短名 美团/抖音） */
const PLATFORM_NAMES = new Set(["美团到餐", "抖音到店", "私域会员"]);

function isCanonicalPlatformRow(row) {
  return row && PLATFORM_NAMES.has(row.competitor) && !DEPRECATED_COMPETITOR_NAMES.has(row.competitor);
}

function pickMonthKey(rows, monthNum) {
  const months = [...new Set((rows || []).map((r) => String(r.month)))].sort();
  if (!months.length) return null;
  if (monthNum) {
    const pad = String(monthNum).padStart(2, "0");
    const match = months.find((m) => m.includes(`-${pad}`));
    if (match) return match;
  }
  return months[months.length - 1];
}

function rowsForMonth(rows, monthKey) {
  if (!monthKey) return rows || [];
  const exact = (rows || []).filter((r) => String(r.month) === monthKey);
  if (exact.length) return exact;
  const prefix = monthPrefix(monthKey);
  return (rows || []).filter((r) => monthPrefix(r.month) === prefix);
}

function monthPrefix(value) {
  return String(value || "").slice(0, 7);
}

function safeRatio(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  return d > 0 ? n / d : 0;
}

function buildPlatformBenchmarks(competitorBenchmarks = [], monthKey) {
  const month = monthKey || pickMonthKey(competitorBenchmarks);
  return rowsForMonth(competitorBenchmarks, month)
    .filter(isCanonicalPlatformRow)
    .filter((row) => row.competitor === "美团到餐" || row.competitor === "抖音到店")
    .map((row) => ({
      name: row.competitor,
      shortName: row.competitor === "美团到餐" ? "美团" : row.competitor === "抖音到店" ? "抖音" : row.competitor,
      month: row.month,
      marketShare: row.market_share || 0,
      avgOrderValue: row.avg_order_value || 0,
      verificationRate: row.verification_rate || 0,
      subsidyRate: row.subsidy_rate || 0,
      adTakeRate: row.ad_take_rate || 0,
      contentShare: row.content_share || 0
    }));
}

function buildBrandPeerBenchmarks(ctx = {}, monthKey) {
  const peerMeta = PEER_MAP.haidilao;
  const month =
    monthKey ||
    pickMonthKey(ctx.cityMonthlyFacts) ||
    pickMonthKey(ctx.peerCityMonthlyFacts);

  const ownMonthly = rowsForMonth(ctx.monthlyFacts, month)[0] || {};
  const peerMonthly = rowsForMonth(ctx.peerBrandMonthlyFacts, month)[0] || {};

  const ownCities = rowsForMonth(ctx.cityMonthlyFacts, month);
  const peerCities = rowsForMonth(ctx.peerCityMonthlyFacts, month);

  const cityComparisons = ownCities.map((own) => {
    const peer = peerCities.find((item) => item.city === own.city);
    if (!peer) return null;
    return {
      city: own.city,
      own: {
        brandName: peerMeta.brandName,
        gmv: own.gmv || 0,
        storeCount: own.store_count || 0,
        verifiedRate: safeRatio(own.verified_orders, own.paid_orders),
        avgOrderValue: own.avg_order_value || 0,
        roi: own.roi || 0
      },
      peer: {
        brandName: peerMeta.peerName,
        gmv: peer.gmv || 0,
        storeCount: peer.store_count || 0,
        verifiedRate: safeRatio(peer.verified_orders, peer.paid_orders),
        avgOrderValue: peer.avg_order_value || 0,
        roi: peer.roi || 0
      }
    };
  }).filter(Boolean);

  return {
    month,
    ownBrand: {
      id: "haidilao",
      name: peerMeta.brandName,
      gtv: ownMonthly.gtv || 0,
      avgOrderValue: ownMonthly.avg_order_value || 0,
      verifiedRate: safeRatio(ownMonthly.verified_orders, ownMonthly.paid_orders),
      storeCount: ctx.brandProfile?.store_count || 0
    },
    peerBrand: {
      id: peerMeta.peerId,
      name: peerMeta.peerName,
      gtv: peerMonthly.gtv || 0,
      avgOrderValue: peerMonthly.avg_order_value || 0,
      verifiedRate: safeRatio(peerMonthly.verified_orders, peerMonthly.paid_orders),
      storeCount: ctx.peerBrandProfile?.store_count || 0
    },
    cities: cityComparisons
  };
}

function detectComparisonFocus(message = "", intentParams = {}) {
  const text = String(message || "");
  if (intentParams.compareType === "brand" || intentParams.compareFocus === "brand") {
    return "brand";
  }
  if (intentParams.compareType === "platform" || intentParams.compareFocus === "platform") {
    return "platform";
  }
  const hasPeer = /呷哺|竞品|品牌对比|同行|vs\s*呷哺/i.test(text);
  const hasMeituan = /美团/.test(text);
  const hasDouyin = /抖音/.test(text);
  const hasPlatform = hasMeituan || hasDouyin || /平台/.test(text);
  if (hasPlatform && hasPeer) return "both";
  if (hasPeer) return "brand";
  if (hasPlatform) return "platform";
  return "both";
}

function enrichCompetitorParams(message, params = {}) {
  const next = { ...(params || {}) };
  const focus = detectComparisonFocus(message, next);
  next.compareFocus = focus;
  if (focus === "platform") next.compareType = "platform";
  else if (focus === "brand") next.compareType = "brand";
  else if (!next.compareType) next.compareType = "both";
  return next;
}

module.exports = {
  PEER_MAP,
  PLATFORM_NAMES,
  buildPlatformBenchmarks,
  buildBrandPeerBenchmarks,
  detectComparisonFocus,
  enrichCompetitorParams
};
