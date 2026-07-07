/**
 * 周期解析工具
 */

const {
  monthEndIso,
  normalizeMonthEnd,
  monthEndDates,
  formatMonthLabel,
  monthMatches: monthEndMatches
} = require("./month-end");

function padMonth(monthNum) {
  return String(monthNum).padStart(2, "0");
}

function periodKey(year, monthNum) {
  return `${year}-${padMonth(monthNum)}`;
}

function monthKeyToEndDate(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return normalizeMonthEnd(key);
  return monthEndIso(Number(match[1]), Number(match[2]));
}

function parsePeriodLabel(period) {
  const text = String(period || "");
  const cn = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (cn) {
    return { year: Number(cn[1]), monthNum: Number(cn[2]), key: periodKey(cn[1], cn[2]) };
  }
  const iso = text.match(/(20\d{2})[-/](\d{1,2})/);
  if (iso) {
    return { year: Number(iso[1]), monthNum: Number(iso[2]), key: periodKey(iso[1], iso[2]) };
  }
  const monthOnly = text.match(/(\d{1,2})\s*月/);
  if (monthOnly) {
    const year = 2026;
    const monthNum = Number(monthOnly[1]);
    return { year, monthNum, key: periodKey(year, monthNum) };
  }
  return null;
}

function shiftMonth(year, monthNum, delta) {
  let y = year;
  let m = monthNum + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, monthNum: m, key: periodKey(y, m) };
}

function previousPeriod(year, monthNum) {
  return shiftMonth(year, monthNum, -1);
}

function samePeriodLastYear(year, monthNum) {
  return { year: year - 1, monthNum, key: periodKey(year - 1, monthNum) };
}

function monthMatches(rowMonth, periodKeyStr) {
  return monthEndMatches(rowMonth, periodKeyStr);
}

function detectMetricFromText(text) {
  const t = String(text || "").toLowerCase();
  if (/gtv/.test(t)) return "gtv";
  if (/核销/.test(t)) return "verified_orders";
  if (/roi|投放/.test(t)) return "roi";
  if (/客单/.test(t)) return "avg_order_value";
  return "gmv";
}

module.exports = {
  padMonth,
  periodKey,
  monthKeyToEndDate,
  parsePeriodLabel,
  previousPeriod,
  samePeriodLastYear,
  monthMatches,
  detectMetricFromText,
  normalizeMonthEnd,
  monthEndIso,
  monthEndDates,
  formatMonthLabel
};
