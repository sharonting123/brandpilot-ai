/**
 * 统一数据口径与统计周期说明
 */

const METRIC_DEFINITIONS = {
  gmv: {
    name: "GMV",
    definition: "支付订单金额合计（券后实付，含套餐与团购）"
  },
  gtv: {
    name: "GTV",
    definition: "品牌销售流水（支付 GMV 汇总，经分月报口径）"
  },
  verifiedRate: {
    name: "核销率",
    definition: "已核销订单数 ÷ 支付订单数"
  },
  roi: {
    name: "ROI",
    definition: "广告 GMV ÷ 广告花费（城市月度投放回报）"
  },
  exposure: {
    name: "曝光",
    definition: "POI/门店在美团到餐可被看到的次数"
  },
  visits: {
    name: "访问",
    definition: "用户进入门店详情页的次数"
  },
  dealClickRate: {
    name: "套餐点击率",
    definition: "套餐详情点击数 ÷ 门店访问数"
  },
  funnel: {
    name: "转化漏斗",
    definition: "搜索曝光 → 门店访问 → 套餐点击 → 下单支付 → 核销，按链路事件归因"
  },
  marketShare: {
    name: "渠道份额",
    definition: "该渠道支付 GMV 占品牌同期总 GMV 的比例（方向性 demo）"
  },
  avgOrderValue: {
    name: "客单价",
    definition: "支付 GMV ÷ 支付订单数"
  },
  takeRate: {
    name: "变现率",
    definition: "平台商户收入 ÷ GTV（佣金 + 广告等）"
  }
};

const SOURCE_LABEL = "美团到餐品牌经分";

function parseMonthFromMessage(message) {
  const text = String(message || "");
  const cnMatch = text.match(/(?:^|[^\d])(1[0-2]|[1-9])月/);
  if (cnMatch) return Number(cnMatch[1]);
  const isoMatch = text.match(/2026-(\d{2})/);
  if (isoMatch) return Number(isoMatch[1]);
  return null;
}

function parseMonthFromPeriod(period) {
  if (!period) return null;
  const cnMatch = String(period).match(/(1[0-2]|[1-9])月/);
  if (cnMatch) return Number(cnMatch[1]);
  return null;
}

function isHalfYearScope(message, workflow, intentParams) {
  const text = String(message || "") + String(intentParams?.period || "");
  if (workflow === "annual_proposal") return true;
  return /上半年|下半年|H1|H2|h1|h2|1-6月|半年/.test(text);
}

function monthRangeLabel(monthNum, year = 2026) {
  const pad = String(monthNum).padStart(2, "0");
  const lastDay = new Date(year, monthNum, 0).getDate();
  return {
    label: `${year}年${monthNum}月`,
    range: `${year}-${pad}-01 至 ${year}-${pad}-${String(lastDay).padStart(2, "0")}`,
    grain: "自然月",
    monthKey: `${year}-${pad}`
  };
}

function fullAnalysisPeriod() {
  return {
    label: "2024年1月至2026年6月",
    range: "2024-01-01 至 2026-06-30",
    grain: "累计",
    monthKey: null
  };
}

function halfYearPeriod(year = 2026) {
  return {
    label: `${year}年上半年`,
    range: `${year}-01-01 至 ${year}-06-30`,
    grain: "半年度",
    monthKey: null
  };
}

function latestMonthFromContext(ctx) {
  const rows = [
    ...(ctx?.monthlyFacts || []),
    ...(ctx?.cityMonthlyFacts || [])
  ];
  const months = [...new Set(rows.map((r) => String(r.month)))].sort();
  if (!months.length) return monthRangeLabel(6);
  const latest = months[months.length - 1];
  const parts = latest.split("-");
  const monthNum = parts[1] ? parseInt(parts[1], 10) : 6;
  const year = parts[0] ? parseInt(parts[0], 10) : 2026;
  return monthRangeLabel(monthNum, year);
}

function metricsForWorkflow(workflow, message) {
  const text = String(message || "");
  const keys = [];

  if (workflow === "data_query") {
    if (/gmv|流水|营业额|交易额/i.test(text)) keys.push("gmv");
    if (/gtv/i.test(text)) keys.push("gtv");
    if (/核销/.test(text)) keys.push("verifiedRate");
    if (/roi|投放|广告/.test(text)) keys.push("roi");
    if (/客单/.test(text)) keys.push("avgOrderValue");
    if (!keys.length) keys.push("gmv", "verifiedRate");
  } else if (workflow === "funnel_diagnosis") {
    keys.push("funnel", "verifiedRate", "visits", "dealClickRate");
  } else if (workflow === "competitor_benchmark") {
    keys.push("marketShare", "verifiedRate", "avgOrderValue", "gmv");
  } else if (workflow === "annual_proposal") {
    keys.push("gtv", "verifiedRate", "takeRate", "avgOrderValue");
  } else {
    keys.push("gmv", "verifiedRate");
  }

  return keys.map((key) => METRIC_DEFINITIONS[key]).filter(Boolean);
}

function buildDataSpec(options = {}) {
  const {
    message = "",
    workflow = "",
    intentParams = {},
    context = null,
    dataMode = "fixture"
  } = options;

  const monthNum =
    parseMonthFromMessage(message) ??
    parseMonthFromPeriod(intentParams.period) ??
    null;

  let period;
  if (isHalfYearScope(message, workflow, intentParams) && !/2024|2025/.test(String(message || ""))) {
    period = halfYearPeriod();
  } else if (monthNum) {
    period = monthRangeLabel(monthNum);
  } else if (context && context.dateRange) {
    period = {
      label: context.dateRange.label || fullAnalysisPeriod().label,
      range: context.dateRange.range || fullAnalysisPeriod().range,
      grain: "累计",
      monthKey: null
    };
  } else if (context) {
    period = latestMonthFromContext(context);
  } else {
    period = fullAnalysisPeriod();
  }

  const metrics = metricsForWorkflow(workflow, message);
  const dataModeNote =
    dataMode === "fixture"
      ? "当前为演示数据集，口径与生产经分一致，数值仅供产品演示。"
      : "数据来自 Supabase 经营底表，以经分月报/日报同步为准。";

  const metricPart = metrics
    .slice(0, 3)
    .map((m) => `${m.name}=${m.definition.replace(/（.*?）/g, "")}`)
    .join("；");

  const footnote = `数据口径：${SOURCE_LABEL} · 统计周期：${period.label}（${period.range}） · ${metricPart}`;
  const shortLine = `${period.label} · ${SOURCE_LABEL}`;

  return {
    period,
    source: SOURCE_LABEL,
    dataMode,
    dataModeNote,
    metrics,
    footnote,
    shortLine
  };
}

function attachDataSpecToCharts(charts, dataSpec) {
  if (!Array.isArray(charts) || !dataSpec) return charts || [];
  return charts.map((chart) => ({
    ...chart,
    dataSpec: {
      shortLine: dataSpec.shortLine,
      footnote: dataSpec.footnote,
      period: dataSpec.period
    }
  }));
}

module.exports = {
  METRIC_DEFINITIONS,
  SOURCE_LABEL,
  buildDataSpec,
  attachDataSpecToCharts,
  fullAnalysisPeriod
};
