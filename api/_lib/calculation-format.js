/**
 * 双指标计算公式展示（分析过程可追溯）
 */

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const n = Number(value);
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + "亿";
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + "万";
  if (Number.isInteger(n)) return n.toLocaleString("zh-CN");
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function formatPct(rate) {
  if (rate == null || !Number.isFinite(rate)) return null;
  return (rate * 100).toFixed(2) + "%";
}

function buildDeltaFormula({ label, currentLabel, previousLabel, current, previous, delta }) {
  const d = delta != null ? delta : Number(current) - Number(previous);
  return (
    `${label} = ${currentLabel} - ${previousLabel} = ${formatNumber(current)} - ${formatNumber(previous)} = ${formatNumber(d)}`
  );
}

function buildRateFormula({ label, currentLabel, previousLabel, current, previous, rate }) {
  const prev = Number(previous);
  const curr = Number(current);
  if (!prev) {
    return `${label} = (${currentLabel} - ${previousLabel}) / ${previousLabel}（${previousLabel}为 0，无法计算）`;
  }
  const r = rate != null ? rate : (curr - prev) / prev;
  return (
    `${label} = (${currentLabel} - ${previousLabel}) / ${previousLabel}` +
    ` = (${formatNumber(curr)} - ${formatNumber(prev)}) / ${formatNumber(prev)}` +
    ` = ${formatPct(r)}`
  );
}

function buildRatioFormula({ label, numeratorLabel, denominatorLabel, numerator, denominator, rate }) {
  const denom = Number(denominator);
  const num = Number(numerator);
  if (!denom) {
    return `${label} = ${numeratorLabel} / ${denominatorLabel}（${denominatorLabel}为 0，无法计算）`;
  }
  const r = rate != null ? rate : num / denom;
  return (
    `${label} = ${numeratorLabel} / ${denominatorLabel}` +
    ` = ${formatNumber(num)} / ${formatNumber(denom)}` +
    ` = ${formatPct(r)}`
  );
}

function buildFunnelStageFormulas(funnel) {
  const stages = (funnel && funnel.funnel) || [];
  const lines = [];
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const curr = stages[i];
    lines.push(
      buildRatioFormula({
        label: `转化率（${prev.stage}→${curr.stage}）`,
        numeratorLabel: curr.stage,
        denominatorLabel: prev.stage,
        numerator: curr.count,
        denominator: prev.count,
        rate: curr.rateFromPrevious
      })
    );
  }
  return lines;
}

module.exports = {
  formatNumber,
  formatPct,
  buildDeltaFormula,
  buildRateFormula,
  buildRatioFormula,
  buildFunnelStageFormulas
};
