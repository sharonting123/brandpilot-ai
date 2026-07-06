/**
 * 商圈 AR 场景召回：仅当用户明确提及商圈/门店地理相关问题时加载地图数据。
 */

const AR_RECALL_KEYWORDS = [
  "商圈",
  "商圈地图",
  "门店地图",
  "门店分布",
  "门店点位",
  "门店选址",
  "选址",
  "开店",
  "网点",
  "店铺分布",
  "附近门店",
  "区域分析",
  "地图",
  "点位",
  "POI",
  "poi"
];

function mentionsBusinessDistrict(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return AR_RECALL_KEYWORDS.some((keyword) => value.includes(keyword));
}

module.exports = {
  AR_RECALL_KEYWORDS,
  mentionsBusinessDistrict
};
