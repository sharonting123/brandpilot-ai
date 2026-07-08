/**
 * 工具名 → 业务口语标签（进度展示用）
 */

const TOOL_LABELS = {
  runNl2Sql: "自然语言查数",
  aggregateMonthly: "月度经营数据",
  retrieveKnowledge: "经营手册检索",
  queryBrandData: "品牌数据查询",
  computeFunnel: "漏斗计算",
  getCompetitorBenchmark: "竞对基准",
  getBrandPeerBenchmark: "同业对标",
  getBrandAssets: "品牌资产",
  generateObject: "结构化提取",
  nl2sql_fallback: "自然语言查数（备用）"
};

function friendlyToolLabel(toolName) {
  const key = String(toolName || "").trim();
  if (!key) return "数据处理";
  return TOOL_LABELS[key] || TOOL_LABELS[key.toLowerCase()] || key;
}

module.exports = {
  TOOL_LABELS,
  friendlyToolLabel
};
