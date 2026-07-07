/**
 * 月度统计周期：所有 month 字段统一为当月最后一天（如 2026-06-30、2024-02-29）
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthEndIso(year, monthNum) {
  const y = Number(year);
  const m = Number(monthNum);
  if (!y || !m || m < 1 || m > 12) return "";
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(lastDay)}`;
}

function normalizeMonthEnd(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  const match = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!match) return text;
  return monthEndIso(Number(match[1]), Number(match[2]));
}

function monthEndDates(from, to) {
  const fromText = String(from || "").slice(0, 10);
  const toText = String(to || "").slice(0, 10);
  if (!fromText || !toText) return [];

  const dates = [];
  let year = parseInt(fromText.slice(0, 4), 10);
  let month = parseInt(fromText.slice(5, 7), 10);
  const endYear = parseInt(toText.slice(0, 4), 10);
  const endMonth = parseInt(toText.slice(5, 7), 10);

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const iso = monthEndIso(year, month);
    if (iso >= fromText && iso <= toText) dates.push(iso);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

function formatMonthLabel(value) {
  const normalized = normalizeMonthEnd(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return String(value || "当前周期");
  return `${match[1]}年${Number(match[2])}月`;
}

function monthMatches(rowMonth, periodKeyStr) {
  const normalized = normalizeMonthEnd(rowMonth);
  const key = String(periodKeyStr || "");
  return normalized.startsWith(key) || normalized.slice(0, 7) === key.slice(0, 7);
}

function normalizeRowsMonthField(rows, field = "month") {
  return (rows || []).map((row) => {
    if (!row || row[field] == null) return row;
    return { ...row, [field]: normalizeMonthEnd(row[field]) };
  });
}

module.exports = {
  pad2,
  monthEndIso,
  normalizeMonthEnd,
  monthEndDates,
  formatMonthLabel,
  monthMatches,
  normalizeRowsMonthField
};
