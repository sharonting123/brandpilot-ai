/**
 * 搜索 / 推荐 双路径流量拆分（Demo 种子数据与漏斗聚合共用）
 */

const SOURCE_SEARCH = "mt_search_poi";
const SOURCE_SEARCH_DEAL = "mt_search_deal";
const SOURCE_RECOMMEND = "mt_feed_poi";

/** 搜索路径占支付订单的比例（按月微调，58%–62%） */
function searchShareForMonth(month) {
  const key = String(month || "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return 0.58 + (Math.abs(hash) % 400) / 10000;
}

function splitInteger(total, share, partIndex) {
  const first = Math.round(Number(total) * share);
  if (partIndex === 0) return first;
  return Number(total) - first;
}

function splitAmount(total, share, partIndex, decimals = 2) {
  const first = Number((Number(total) * share).toFixed(decimals));
  if (partIndex === 0) return first;
  return Number((Number(total) - first).toFixed(decimals));
}

/** 按 verified_rate 拆分 paid / verified / gmv，保证 search + recommend = total */
function splitTrafficTotals(totals, month, options = {}) {
  const share = options.searchShare != null ? options.searchShare : searchShareForMonth(month);
  const paid = Number(totals.paid_orders || 0);
  const verified = Number(totals.verified_orders || 0);
  const gmv = Number(totals.gmv || totals.pay_gmv || 0);
  const rate = paid ? verified / paid : 0.8548;

  const searchPaid = splitInteger(paid, share, 0);
  const recommendPaid = splitInteger(paid, share, 1);
  const searchVerified = rate
    ? Math.min(searchPaid, Math.round(searchPaid * rate))
    : splitInteger(verified, share, 0);
  const recommendVerified = verified - searchVerified;

  return {
    searchShare: share,
    recommendShare: 1 - share,
    search: {
      paid_orders: searchPaid,
      verified_orders: searchVerified,
      gmv: splitAmount(gmv, share, 0)
    },
    recommend: {
      paid_orders: recommendPaid,
      verified_orders: recommendVerified,
      gmv: splitAmount(gmv, share, 1)
    }
  };
}

/** 从支付订单反推漏斗各阶段（保持 Demo 转化率链） */
function buildFunnelStagesFromPaid(paidOrders, verifiedOrders, gmv, path = "search") {
  const paid = Math.max(0, Math.round(Number(paidOrders) || 0));
  const verified = Math.max(0, Math.round(Number(verifiedOrders) || 0));
  const rates =
    path === "recommend"
      ? { pay: 0.62, submit: 0.33, deal: 0.44, poi: 0.38, ctr: 0.06 }
      : { pay: 0.64, submit: 0.358, deal: 0.462, poi: 0.421, ctr: 0.095 };

  const orderSubmits = paid ? Math.max(paid, Math.ceil(paid / rates.pay)) : 0;
  const dealClicks = orderSubmits ? Math.max(orderSubmits, Math.ceil(orderSubmits / rates.submit)) : 0;
  const poiClicks = dealClicks ? Math.max(dealClicks, Math.ceil(dealClicks / rates.deal)) : 0;
  const clicks = poiClicks ? Math.max(poiClicks, Math.ceil(poiClicks / rates.poi)) : 0;
  const impressions = clicks ? Math.max(clicks, Math.ceil(clicks / rates.ctr)) : 0;

  return {
    impressions,
    clicks,
    poi_clicks: poiClicks,
    deal_clicks: dealClicks,
    order_submits: orderSubmits,
    paid_orders: paid,
    verified_orders: verified,
    gmv: Number(gmv || 0)
  };
}

const SEARCH_WORDS_BY_MONTH = {
  "2026-01": "haidilao",
  "2026-02": "海底捞",
  "2026-03": "海底捞火锅",
  "2026-04": "海底捞团购",
  "2026-05": "海底捞生日",
  "2026-06": "haidilao"
};

function searchWordForMonth(month) {
  const prefix = String(month || "").slice(0, 7);
  return SEARCH_WORDS_BY_MONTH[prefix] || "haidilao";
}

function searchSourceForMonth(month) {
  const prefix = String(month || "").slice(0, 7);
  return prefix === "2026-04" ? SOURCE_SEARCH_DEAL : SOURCE_SEARCH;
}

const RECOMMEND_WORD = "__feed__";

const CAMPAIGN_DEALS = [
  { deal_id: "hdl-family-499", campaign_id: "hdl-2026h1-family", weight: 0.42 },
  { deal_id: "hdl-weekday-199", campaign_id: "hdl-2026h1-weekday", weight: 0.35 },
  { deal_id: "hdl-member-299", campaign_id: "hdl-2026h1-member", weight: 0.23 }
];

function buildSearchKeywordFactsFromBrandRows(monthlyFacts, options = {}) {
  const fromMonth = options.fromMonth || "2026-01-31";
  const rows = [];
  (monthlyFacts || [])
    .filter((row) => String(row.month) >= fromMonth)
    .forEach((brandRow) => {
      const month = brandRow.month;
      const split = splitTrafficTotals(
        {
          paid_orders: brandRow.paid_orders,
          verified_orders: brandRow.verified_orders,
          gmv: Math.round(Number(brandRow.gtv || 0) / 8.6)
        },
        month
      );
      const tag = String(month).slice(0, 7).replace("-", "");
      rows.push({
        month,
        brand_id: brandRow.brand_id || "haidilao",
        search_word: searchWordForMonth(month),
        source: searchSourceForMonth(month),
        query_id: "demo-query-hdl-" + tag,
        global_id: "demo-global-hdl-" + tag,
        ...buildFunnelStagesFromPaid(split.search.paid_orders, split.search.verified_orders, split.search.gmv, "search")
      });
      rows.push({
        month,
        brand_id: brandRow.brand_id || "haidilao",
        search_word: RECOMMEND_WORD,
        source: SOURCE_RECOMMEND,
        query_id: "demo-feed-hdl-" + tag,
        global_id: "demo-global-feed-" + tag,
        ...buildFunnelStagesFromPaid(
          split.recommend.paid_orders,
          split.recommend.verified_orders,
          split.recommend.gmv,
          "recommend"
        )
      });
    });
  return rows;
}

function buildCampaignFactsFromBrandRows(monthlyFacts, options = {}) {
  const fromMonth = options.fromMonth || "2026-05-31";
  const rows = [];
  (monthlyFacts || [])
    .filter((row) => String(row.month) >= fromMonth)
    .forEach((brandRow) => {
      const month = brandRow.month;
      const split = splitTrafficTotals(
        {
          paid_orders: brandRow.paid_orders,
          verified_orders: brandRow.verified_orders,
          gmv: Math.round(Number(brandRow.gtv || 0) / 8.6)
        },
        month
      );
      CAMPAIGN_DEALS.forEach((deal) => {
        ["search", "recommend"].forEach((path) => {
          const part = split[path];
          const source = path === "search" ? SOURCE_SEARCH : SOURCE_RECOMMEND;
          const paid = Math.round(part.paid_orders * deal.weight);
          const verified = Math.round(part.verified_orders * deal.weight);
          const payGmv = Number((part.gmv * deal.weight).toFixed(2));
          const detailViews = Math.max(paid, Math.round(paid / 0.64 / 0.358));
          rows.push({
            month,
            deal_id: deal.deal_id,
            campaign_id: deal.campaign_id,
            source,
            impressions: Math.round(detailViews * 60),
            detail_views: detailViews,
            buy_clicks: Math.round(detailViews * 0.62),
            order_submits: Math.max(paid, Math.round(paid / 0.64)),
            paid_orders: paid,
            verified_orders: verified,
            pay_gmv: payGmv,
            coupon_reduce_amount: Number((payGmv * 0.138).toFixed(2)),
            refunds: Math.max(1, Math.round(paid * 0.028))
          });
        });
      });
    });
  return rows;
}

module.exports = {
  SOURCE_SEARCH,
  SOURCE_SEARCH_DEAL,
  SOURCE_RECOMMEND,
  RECOMMEND_WORD,
  CAMPAIGN_DEALS,
  searchShareForMonth,
  splitInteger,
  splitAmount,
  splitTrafficTotals,
  buildFunnelStagesFromPaid,
  searchWordForMonth,
  searchSourceForMonth,
  buildSearchKeywordFactsFromBrandRows,
  buildCampaignFactsFromBrandRows
};
