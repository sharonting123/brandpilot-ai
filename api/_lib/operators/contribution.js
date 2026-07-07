/**
 * 贡献度 / 结构拆解算子
 */

const { registerCalculation } = require("../citation-registry");
const { buildDeltaFormula, buildRateFormula } = require("../calculation-format");

function computeContribution(params = {}) {
  const dimension = params.dimension || "city";
  const metric = params.metric || "gmv";
  const currentPeriod = params.currentPeriod || "";
  const previousPeriod = params.previousPeriod || "";
  const rows = params.rows || [];

  const grouped = {};
  rows.forEach((row) => {
    const key = row[dimension] || row.business_area || row.poi || row.city || "未知";
    if (!grouped[key]) grouped[key] = { current: 0, previous: 0 };
    const period = String(row.period || "");
    const value = Number(row.value || 0);
    if (period === currentPeriod) grouped[key].current += value;
    if (period === previousPeriod) grouped[key].previous += value;
  });

  const contributors = Object.keys(grouped)
    .map((key) => {
      const current = grouped[key].current;
      const previous = grouped[key].previous;
      const delta = current - previous;
      const mom = previous ? delta / previous : null;
      return {
        [dimension]: key,
        current,
        previous,
        delta,
        mom,
        momPct: mom == null ? null : Number((mom * 100).toFixed(2))
      };
    })
    .sort((a, b) => a.delta - b.delta);

  const largestDrag = contributors[0] || null;
  const largestGain = contributors.length ? contributors[contributors.length - 1] : null;

  const result = {
    operator: "computeContribution",
    dimension,
    metric,
    currentPeriod,
    previousPeriod,
    contributors,
    largestDrag,
    largestGain,
    warnings: []
  };

  if (!contributors.length) {
    const dimLabel =
      dimension === "business_area" ? "商圈" : dimension === "poi" ? "门店" : dimension === "city" ? "城市" : "维度";
    result.warnings.push({
      code: "LOW_SAMPLE_SIZE",
      message: `${dimLabel}拆解样本不足，贡献度结论仅供参考。`
    });
  }

  const formulaLines = [
    "变化量 = 当期值 - 上期值",
    "环比 = (当期值 - 上期值) / 上期值"
  ];

  if (largestDrag) {
    const dimKey = largestDrag[dimension] || largestDrag.city || "样本";
    formulaLines.push(
      buildDeltaFormula({
        label: `最大拖累 · ${dimKey}`,
        currentLabel: "当期",
        previousLabel: "上期",
        current: largestDrag.current,
        previous: largestDrag.previous,
        delta: largestDrag.delta
      })
    );
    if (largestDrag.previous) {
      formulaLines.push(
        buildRateFormula({
          label: `${dimKey}环比`,
          currentLabel: "当期",
          previousLabel: "上期",
          current: largestDrag.current,
          previous: largestDrag.previous,
          rate: largestDrag.mom
        })
      );
    }
  }

  if (largestGain && largestGain !== largestDrag) {
    const dimKey = largestGain[dimension] || largestGain.city || "样本";
    formulaLines.push(
      buildDeltaFormula({
        label: `最大拉动 · ${dimKey}`,
        currentLabel: "当期",
        previousLabel: "上期",
        current: largestGain.current,
        previous: largestGain.previous,
        delta: largestGain.delta
      })
    );
  }

  result.formulaLines = formulaLines;
  result.formulaText = formulaLines.join("\n");

  const calcRef = registerCalculation(
    "贡献度拆解 · " + dimension,
    result.formulaText,
    {
      formula: "delta = current - previous; mom = delta / previous",
      formulaLines,
      operator: "computeContribution",
      inputs: params.inputRefs || [],
      result: {
        contributorCount: contributors.length,
        largestDrag,
        largestGain
      },
      dimension,
      metric,
      periods: { currentPeriod, previousPeriod }
    }
  );

  result.refs = [calcRef.id, ...(params.inputRefs || [])];
  return result;
}

module.exports = {
  computeContribution
};
