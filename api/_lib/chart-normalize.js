/**
 * 规范化 Chart.js 图表结构，修复 LLM 输出缺失 labels 或轴标签显示为 0/1 的问题。
 */

function asStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item == null) return "";
      if (typeof item === "object") {
        return String(item.label || item.name || item.title || item.month || item.city || item.stage || "");
      }
      return String(item);
    }).filter(Boolean);
  }
  if (typeof value === "object") {
    return Object.keys(value);
  }
  return [];
}

function asNumberArray(value, expectedLength) {
  if (!Array.isArray(value)) return [];
  const numbers = value.map((item) => {
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "object" && item != null) {
      const raw = item.value ?? item.count ?? item.amount ?? item.gmv ?? item.gtv;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }
    const num = Number(item);
    return Number.isFinite(num) ? num : null;
  }).filter((item) => item != null);

  if (expectedLength && numbers.length !== expectedLength && numbers.length === 1 && expectedLength > 1) {
    return [];
  }
  return numbers;
}

function normalizeChartDef(chart) {
  if (!chart || typeof chart !== "object") return chart;
  const next = { ...chart };
  const data = chart.data && typeof chart.data === "object" ? { ...chart.data } : {};
  let labels = asStringArray(data.labels);

  const datasets = Array.isArray(data.datasets) ? data.datasets.map((ds, index) => {
    const copy = { ...(ds || {}) };
    if (!copy.label) copy.label = copy.name || "系列" + (index + 1);
    copy.data = asNumberArray(copy.data, labels.length || undefined);
    return copy;
  }) : [];

  if (!labels.length && datasets.length && datasets[0].data && datasets[0].data.length) {
    labels = datasets[0].data.map((_, index) => "项" + (index + 1));
  }

  if (labels.length && datasets.length) {
    const targetLen = labels.length;
    datasets.forEach((ds) => {
      if (Array.isArray(ds.data) && ds.data.length > targetLen) {
        ds.data = ds.data.slice(0, targetLen);
      }
    });
  }

  next.data = {
    ...data,
    labels,
    datasets
  };

  return next;
}

function isFunnelLikeTitle(title) {
  return /漏斗|链路|转化链|搜索到核销|曝光.*核销/i.test(String(title || ""));
}

function isConversionRateBar(chart) {
  const title = String(chart && chart.title || "");
  return chart && chart.type === "bar" && /转化率|转化链|各阶段/i.test(title);
}

function coerceFunnelChart(chart) {
  if (!chart || typeof chart !== "object") return chart;
  const next = normalizeChartDef(chart);
  const title = String(next.title || "");

  if (next.type === "funnel" || isFunnelLikeTitle(title)) {
    next.type = "funnel";
    return next;
  }

  if (isConversionRateBar(next)) {
    return null;
  }

  return next;
}

function forceFunnelChartPolicy(charts) {
  if (!Array.isArray(charts)) return [];
  const normalized = charts.map(coerceFunnelChart).filter(Boolean);
  const hasFunnel = normalized.some((chart) => chart.type === "funnel");
  if (!hasFunnel) return normalized;
  return normalized.filter((chart) => {
    if (chart.type === "funnel") return true;
    if (isConversionRateBar(chart)) return false;
    if (isFunnelLikeTitle(chart.title) && chart.type !== "funnel") return false;
    return true;
  });
}

function normalizeCharts(charts) {
  if (!Array.isArray(charts)) return [];
  return forceFunnelChartPolicy(charts).filter((chart) => {
    const labels = chart && chart.data && chart.data.labels;
    const datasets = chart && chart.data && chart.data.datasets;
    return Array.isArray(labels) && labels.length > 0 && Array.isArray(datasets) && datasets.length > 0;
  });
}

module.exports = {
  normalizeChartDef,
  coerceFunnelChart,
  forceFunnelChartPolicy,
  normalizeCharts
};
