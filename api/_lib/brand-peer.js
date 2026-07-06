/**
 * 平台对比（美团 vs 抖音）与品牌竞品对比（海底捞 vs 呷哺呷哺）
 */

const PEER_MAP = {
  haidilao: { peerId: "xiabuxiabu", peerName: "呷哺呷哺", brandName: "海底捞" }
};

const PLATFORM_NAMES = new Set(["美团", "抖音", "美团到餐", "抖音到店"]);

function normalizePlatformName(name) {
  if (name === "美团到餐") return "美团";
  if (name === "抖音到店") return "抖音";
  return name;
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
  return (rows || []).filter((r) => String(r.month) === monthKey);
}

function safeRatio(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  return d > 0 ? n / d : 0;
}

function buildPlatformBenchmarks(competitorBenchmarks = [], monthKey) {
  const month = monthKey || pickMonthKey(competitorBenchmarks);
  return rowsForMonth(competitorBenchmarks, month)
    .filter((row) => PLATFORM_NAMES.has(row.competitor))
    .map((row) => ({
      name: normalizePlatformName(row.competitor),
      month: row.month,
      marketShare: row.market_share || 0,
      avgOrderValue: row.avg_order_value || 0,
      verificationRate: row.verification_rate || 0,
      subsidyRate: row.subsidy_rate || 0,
      adTakeRate: row.ad_take_rate || 0,
      contentShare: row.content_share || 0
    }))
    .filter((row) => row.name === "美团" || row.name === "抖音");
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
    const peer = peerCities.find((item) => item.city === own.city) || {};
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
  });

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
  if (intentParams.compareType === "brand" || /呷哺|竞品|品牌对比|同行/.test(text)) {
    return "brand";
  }
  if (intentParams.compareType === "platform" || /美团|抖音|平台/.test(text)) {
    return "platform";
  }
  return "both";
}

module.exports = {
  PEER_MAP,
  normalizePlatformName,
  buildPlatformBenchmarks,
  buildBrandPeerBenchmarks,
  detectComparisonFocus
};
