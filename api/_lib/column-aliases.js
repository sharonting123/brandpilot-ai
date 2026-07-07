const { normalizeMonthEnd, normalizeRowsMonthField } = require("./month-end");

const GLOBAL_COLUMNS = {
  month: "统计月份",
  date: "统计月份",
  brand_id: "品牌 ID",
  city: "城市",
  district: "区县",
  business_area: "商圈",
  competitor: "竞对/平台",
  poi_id: "门店 ID",
  poi_name: "门店名称",
  deal_id: "套餐 ID",
  deal_name: "套餐名称",
  search_word: "搜索词",
  stage: "漏斗阶段",
  stage_order: "阶段序号",
  user_count: "用户数",
  conversion_rate: "转化率",
  value: "数值",
  period: "统计周期",
  dimension: "维度",
  gmv: "GMV（元）",
  gtv: "GTV（元）",
  pay_gmv: "支付 GMV（元）",
  impressions: "曝光量",
  clicks: "点击量",
  exposure: "曝光量",
  visits: "访问量",
  deal_clicks: "套餐点击",
  search_visits: "搜索访问",
  paid_orders: "支付订单数",
  verified_orders: "核销订单数",
  order_submits: "下单提交数",
  poi_clicks: "POI 点击",
  active_users: "活跃用户数",
  purchase_frequency: "购买频次",
  avg_order_value: "客单价（元）",
  take_rate: "Take Rate",
  subsidy_rate: "补贴率",
  verification_rate: "核销率",
  market_share: "渠道份额",
  content_share: "内容占比",
  ad_take_rate: "广告 Take Rate",
  ad_spend: "广告花费（元）",
  roi: "ROI",
  store_count: "门店数",
  coupon_reduce_amount: "券补贴金额（元）",
  repeat_purchase_rate: "复购率",
  commission_revenue: "佣金收入（元）",
  ad_revenue: "广告收入（元）",
  merchant_revenue: "商户收入（元）",
  subsidy_amount: "补贴金额（元）",
  operating_cost: "运营成本（元）",
  ad_merchant_penetration: "广告商户渗透率",
  data_confidence: "数据置信度",
  category: "品类",
  brand_level: "品牌层级",
  headquarter_city: "总部城市",
  ka_owner: "KA 负责人",
  cooperation_status: "合作状态",
  address: "地址",
  poi_status: "门店状态",
  price: "售价（元）",
  original_price: "原价（元）",
  status: "状态",
  detail_views: "详情页浏览",
  buy_clicks: "购买点击"
};

const TABLE_COLUMNS = {
  fact_brand_monthly: {
    gtv: "GTV（元）",
    active_users: "活跃用户数",
    avg_order_value: "客单价（元）",
    take_rate: "Take Rate",
    subsidy_rate: "补贴率"
  },
  fact_city_brand_monthly: {
    gmv: "城市 GMV（元）",
    roi: "ROI",
    store_count: "门店数"
  },
  fact_competitor_benchmark_monthly: {
    competitor: "竞对平台",
    verification_rate: "核销率",
    subsidy_rate: "补贴率",
    content_share: "内容占比",
    avg_order_value: "客单价（元）",
    market_share: "渠道份额",
    ad_take_rate: "广告 Take Rate"
  },
  fact_search_keyword_monthly: {
    search_word: "搜索词",
    impressions: "曝光量",
    clicks: "点击量"
  },
  fact_poi_monthly: {
    exposure: "曝光量",
    visits: "访问量",
    deal_clicks: "套餐点击"
  },
  fact_deal_campaign_monthly: {
    pay_gmv: "支付 GMV（元）",
    coupon_reduce_amount: "券补贴（元）"
  },
  dim_poi: {
    poi_name: "门店名称",
    business_area: "商圈"
  }
};

const TABLE_LABELS = {
  fact_brand_monthly: "品牌月度经分",
  fact_city_brand_monthly: "城市月度经营",
  fact_search_keyword_monthly: "搜索词月表",
  fact_poi_monthly: "POI 月表",
  fact_deal_campaign_monthly: "套餐活动月表",
  fact_competitor_benchmark_monthly: "竞对月度基准",
  dim_poi: "门店维表",
  dim_brand: "品牌维表",
  dim_deal: "套餐维表"
};

/** 竞对表废弃的短名（与 美团到餐 / 抖音到店 重复） */
const DEPRECATED_COMPETITOR_NAMES = new Set(["美团", "抖音"]);

function labelForColumn(key, table) {
  const column = String(key || "");
  if (table && TABLE_COLUMNS[table] && TABLE_COLUMNS[table][column]) {
    return TABLE_COLUMNS[table][column];
  }
  return GLOBAL_COLUMNS[column] || column;
}

function labelsForKeys(keys, table) {
  const labels = {};
  (keys || []).forEach((key) => {
    labels[key] = labelForColumn(key, table);
  });
  return labels;
}

function labelsForRows(rows, table) {
  const keys = [];
  (rows || []).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });
  return labelsForKeys(keys, table);
}

function tableLabel(table) {
  return TABLE_LABELS[table] || table || "";
}

function filterCompetitorRows(rows) {
  return (rows || []).filter((row) => !DEPRECATED_COMPETITOR_NAMES.has(row.competitor));
}

function filterCompetitorBenchmarks(rows) {
  return filterCompetitorRows(rows);
}

function attachRowPresentation(details = {}) {
  const table = details.table || "";
  let rows = Array.isArray(details.rows) ? details.rows : [];
  if (table === "fact_competitor_benchmark_monthly") {
    rows = filterCompetitorRows(rows);
  }
  rows = normalizeRowsMonthField(rows, "month");
  rows = rows.map((row) => {
    if (!row || row.date == null || row.month != null) return row;
    return { ...row, month: normalizeMonthEnd(row.date), date: normalizeMonthEnd(row.date) };
  });
  const next = { ...details, rows };
  if (rows.length) {
    next.columnLabels = labelsForRows(rows, table);
    next.tableLabel = tableLabel(table);
  }
  return next;
}

module.exports = {
  GLOBAL_COLUMNS,
  TABLE_COLUMNS,
  TABLE_LABELS,
  DEPRECATED_COMPETITOR_NAMES,
  labelForColumn,
  labelsForKeys,
  labelsForRows,
  tableLabel,
  filterCompetitorRows,
  filterCompetitorBenchmarks,
  attachRowPresentation
};
