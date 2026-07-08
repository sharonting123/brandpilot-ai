/**
 * 提案指标卡：必须带 label，且 refs 绑定查数引用（S* / D*）
 */

const { resolveMetricRefs } = require("./citation-resolver");

function compactCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2).replace(/\.00$/, "") + "亿";
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  return String(Math.round(n));
}

function formatPercent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const pct = n <= 1 && n >= 0 ? n * 100 : n;
  return pct.toFixed(digits).replace(/\.0$/, "") + "%";
}

function collectDataQueryRefs(references = []) {
  const ids = [];
  for (const ref of references || []) {
    if (!ref || !ref.id) continue;
    if (ref.type === "sql" || ref.type === "data") ids.push(String(ref.id));
  }
  return [...new Set(ids)];
}

function primaryDataQueryRef(references = []) {
  const refs = collectDataQueryRefs(references);
  const sql = refs.find((id) => /^S\d+$/i.test(id));
  return sql || refs[0] || "";
}

function periodLabelFromNl(nlPayload = {}, params = {}) {
  if (params.period) return String(params.period);
  const filters = nlPayload.filters || {};
  if (filters.periodLabel) return String(filters.periodLabel);
  if (filters.year && filters.monthNum) return `${filters.year}年${filters.monthNum}月`;
  return "当期";
}

function metricFromRow(row, spec, dataQueryRefs) {
  if (!row || spec.field == null) return null;
  const raw = row[spec.field];
  if (raw == null || raw === "") return null;
  const refs = spec.refs && spec.refs.length ? spec.refs : dataQueryRefs.slice(0, 2);
  if (!refs.length) return null;
  return {
    label: spec.label,
    value: spec.format(raw),
    ...(spec.delta ? { delta: spec.delta } : {}),
    refs
  };
}

function buildMetricsFromNlPayload(nlPayload = {}, params = {}, references = []) {
  const dataQueryRefs = collectDataQueryRefs(references);
  const bindRef = primaryDataQueryRef(references);
  const refs = bindRef
    ? [bindRef, ...dataQueryRefs.filter((id) => id !== bindRef)].slice(0, 2)
    : dataQueryRefs.slice(0, 2);
  if (!refs.length) return [];

  const rows = Array.isArray(nlPayload.rows) ? nlPayload.rows : [];
  const row = rows[0];
  if (!row) return [];

  const period = periodLabelFromNl(nlPayload, params);
  const specs = [];

  if (row.gtv != null) {
    specs.push({
      label: period.includes("H1") || period.includes("半年") ? "H1 GTV" : `${period} GTV`,
      field: "gtv",
      format: (v) => "约" + compactCurrency(v),
      delta: "品牌月表"
    });
  }
  if (row.gmv != null && row.gtv == null) {
    specs.push({
      label: `${period} GMV`,
      field: "gmv",
      format: (v) => "约" + compactCurrency(v),
      delta: "城市月表"
    });
  }
  if (row.verified_rate_pct != null) {
    specs.push({
      label: "核销率",
      field: "verified_rate_pct",
      format: (v) => formatPercent(v),
      delta: "支付→核销"
    });
  } else if (row.verified_orders != null && row.paid_orders != null) {
    specs.push({
      label: "核销率",
      field: "__verified_rate__",
      format: () =>
        formatPercent(Number(row.verified_orders) / Math.max(Number(row.paid_orders), 1)),
      delta: "支付→核销"
    });
  }
  if (row.take_rate != null) {
    specs.push({
      label: "综合变现率",
      field: "take_rate",
      format: (v) => formatPercent(v),
      delta: "take rate"
    });
  }
  if (row.impressions != null) {
    specs.push({
      label: "搜索曝光",
      field: "impressions",
      format: (v) => compactCurrency(v) + "+",
      delta: "品牌心智"
    });
  }

  const metrics = [];
  for (const spec of specs) {
    if (spec.field === "__verified_rate__") {
      metrics.push({ label: spec.label, value: spec.format(), delta: spec.delta, refs });
      continue;
    }
    const item = metricFromRow(row, { ...spec, refs }, refs);
    if (item) metrics.push(item);
  }
  return metrics.slice(0, 5);
}

function inferMetricLabel(item = {}) {
  const label = String(item.label || item.name || item.metric || item.title || "").trim();
  if (label) return label;
  return "";
}

function normalizeMetric(item, dataQueryRefs, references = []) {
  if (item == null) return null;
  if (typeof item === "string") {
    const text = item.trim();
    if (!text || !dataQueryRefs.length) return null;
    return { label: text.slice(0, 24), value: text, refs: [dataQueryRefs[0]] };
  }
  if (typeof item !== "object") return null;

  const label = inferMetricLabel(item);
  const value = String(item.value ?? item.val ?? item.amount ?? item.data ?? "").trim();
  if (!label || !value) return null;

  let refs = Array.isArray(item.refs) ? item.refs.map(String).filter(Boolean) : [];
  refs = refs.filter((id) => /^[SDKC]\d+$/i.test(id));
  if (!refs.length) refs = dataQueryRefs.slice(0, 2);
  if (!refs.length) return null;

  const resolvedRefs = resolveMetricRefs({ label, value, delta: item.delta, refs }, references);
  const out = { label, value, refs: [...new Set(resolvedRefs.length ? resolvedRefs : refs)] };
  if (item.delta != null && String(item.delta).trim()) out.delta = String(item.delta).trim();
  return out;
}

function finalizeProposalMetrics(proposal, options = {}) {
  if (!proposal || typeof proposal !== "object") return proposal;
  const references = options.references || [];
  const nlPayload = options.nlPayload || null;
  const params = options.params || {};
  const dataQueryRefs = collectDataQueryRefs(references);
  const fromNl = buildMetricsFromNlPayload(nlPayload, params, references);

  const incoming = Array.isArray(proposal.metrics) ? proposal.metrics : [];
  const normalized = incoming.map((item) => normalizeMetric(item, dataQueryRefs, references)).filter(Boolean);

  let metrics = normalized.length ? normalized : fromNl;
  if (!metrics.length && fromNl.length) metrics = fromNl;

  metrics = metrics.map((metric) => normalizeMetric(metric, dataQueryRefs, references)).filter(Boolean);

  if (!metrics.length && dataQueryRefs.length) {
    metrics = fromNl.length
      ? fromNl
      : [
          {
            label: "查数结果",
            value: "见引用明细",
            delta: periodLabelFromNl(nlPayload || {}, params),
            refs: [dataQueryRefs[0]]
          }
        ];
  }

  return { ...proposal, metrics };
}

module.exports = {
  compactCurrency,
  formatPercent,
  collectDataQueryRefs,
  primaryDataQueryRef,
  buildMetricsFromNlPayload,
  normalizeMetric,
  finalizeProposalMetrics
};
