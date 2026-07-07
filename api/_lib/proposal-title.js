/**
 * 分析类提案标题：先复盘上一段周期，再规划下一段周期
 * 例：海底捞 2026 H1 复盘・H2 经营提案
 */

function extractYear(text, params = {}) {
  const filters = params.filters || {};
  const fromParams = params.year || filters.year;
  if (fromParams) return Number(fromParams);
  const match = String(text || "").match(/(20\d{2})/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function collectPeriodText(params = {}, message = "") {
  const slots = params.analysisSlots || {};
  const time = slots.time || {};
  return [
    message,
    params.period,
    params.periodLabel,
    time.periodLabel,
    filtersPeriodLabel(params)
  ]
    .filter(Boolean)
    .join(" ");
}

function filtersPeriodLabel(params = {}) {
  const filters = params.filters || {};
  return filters.periodLabel || "";
}

/**
 * 推导复盘周期与规划周期
 */
function buildReviewPlanPeriods(params = {}, message = "") {
  const periodText = collectPeriodText(params, message);
  const year = extractYear(periodText, params);

  if (/上半年|H1\b|h1\b|上半/.test(periodText)) {
    return {
      year,
      reviewPeriod: `${year} H1`,
      planPeriod: `${year} H2`,
      reviewLabel: `${year} H1`,
      planLabel: "H2",
      title: `${year} H1 复盘・H2 经营提案`,
      framing: `先复盘 ${year} 上半年（H1）经营表现与问题，再输出下半年（H2）经营提案与可执行动作。`
    };
  }

  if (/下半年|H2\b|h2\b|下半/.test(periodText)) {
    const nextYear = year + 1;
    return {
      year,
      reviewPeriod: `${year} H2`,
      planPeriod: `${nextYear} H1`,
      reviewLabel: `${year} H2`,
      planLabel: `${nextYear} H1`,
      title: `${year} H2 复盘・${nextYear} H1 经营提案`,
      framing: `先复盘 ${year} 下半年（H2）经营表现与问题，再输出 ${nextYear} 上半年（H1）经营提案与动作。`
    };
  }

  const quarterMatch = periodText.match(/(?:第)?([1-4])\s*季度|Q([1-4])\b/i);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1] || quarterMatch[2]);
    const nextQuarter = quarter === 4 ? 1 : quarter + 1;
    const planYear = quarter === 4 ? year + 1 : year;
    const reviewLabel = `${year} Q${quarter}`;
    const planLabel = quarter === 4 ? `${planYear} Q1` : `Q${nextQuarter}`;
    const planPeriod = quarter === 4 ? `${planYear} Q1` : `${year} Q${nextQuarter}`;
    return {
      year,
      reviewPeriod: reviewLabel,
      planPeriod,
      reviewLabel,
      planLabel,
      title: `${reviewLabel} 复盘・${planLabel} 经营提案`,
      framing: `先复盘 ${reviewLabel} 经营表现，再输出 ${planLabel} 经营提案。`
    };
  }

  const monthMatch = periodText.match(/(20\d{2})\s*年?\s*(\d{1,2})\s*月/);
  if (monthMatch) {
    const monthYear = Number(monthMatch[1]);
    const monthNum = Number(monthMatch[2]);
    const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;
    const planYear = monthNum === 12 ? monthYear + 1 : monthYear;
    const reviewLabel = `${monthYear}年${monthNum}月`;
    const planLabel = monthNum === 12 ? `${planYear}年1月` : `${monthYear}年${nextMonthNum}月`;
    return {
      year: monthYear,
      reviewPeriod: reviewLabel,
      planPeriod: planLabel,
      reviewLabel,
      planLabel,
      title: `${reviewLabel} 复盘・${planLabel} 经营提案`,
      framing: `先复盘 ${reviewLabel} 经营表现，再输出 ${planLabel} 经营规划。`
    };
  }

  if (/全年|整年|20\d{2}\s*年(?!\s*\d)/.test(periodText)) {
    const nextYear = year + 1;
    return {
      year,
      reviewPeriod: `${year} 全年`,
      planPeriod: `${nextYear} H1`,
      reviewLabel: `${year} 全年`,
      planLabel: `${nextYear} H1`,
      title: `${year} 全年 复盘・${nextYear} H1 经营提案`,
      framing: `先复盘 ${year} 全年经营表现，再输出 ${nextYear} H1 经营提案。`
    };
  }

  return {
    year,
    reviewPeriod: `${year} H1`,
    planPeriod: `${year} H2`,
    reviewLabel: `${year} H1`,
    planLabel: "H2",
    title: `${year} H1 复盘・H2 经营提案`,
    framing: `先复盘 ${year} H1 经营表现与问题，再输出 H2 经营提案与可执行动作。`
  };
}

function buildProposalTitle(brandName, params = {}, message = "") {
  const brand = String(brandName || "品牌").trim();
  const periods = buildReviewPlanPeriods(params, message);
  return `${brand} ${periods.title}`;
}

function normalizeProposalTitle(rawTitle, brandName, params = {}, message = "") {
  const expected = buildProposalTitle(brandName, params, message);
  const raw = String(rawTitle || "").trim();
  if (!raw) return expected;
  if (/经营提案/.test(raw) && !/复盘/.test(raw)) return expected;
  return raw;
}

module.exports = {
  buildReviewPlanPeriods,
  buildProposalTitle,
  normalizeProposalTitle
};
