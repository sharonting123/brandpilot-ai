/**
 * 引用解析：按文本中的数字与主题，将洞察/指标绑定到正确的 SQL/数据/计算/知识引用。
 */

const COMPETITOR_TABLE = "fact_competitor_benchmark_monthly";
const CITY_TABLE = "fact_city_brand_monthly";
const BRAND_TABLE = "fact_brand_monthly";

function extractClaimNumbers(text) {
  const source = String(text || "");
  const out = new Set();

  function add(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    out.add(n);
    out.add(Math.round(n * 10) / 10);
    out.add(Math.round(n * 100) / 100);
  }

  for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) add(match[1]);
  for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*pp/gi)) add(match[1]);
  for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*[万亿]/g)) add(match[1]);
  for (const match of source.matchAll(/(?<![\d.])(\d+\.\d+)(?![\d.%])/g)) add(match[1]);
  for (const match of source.matchAll(/(?<![\d.])(\d{2,})(?![\d])/g)) add(match[1]);

  return [...out].filter((n) => n >= 0);
}

function numericVariants(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return [];
  const variants = new Set([n, Math.round(n * 10) / 10, Math.round(n * 100) / 100]);
  if (n > 0 && n <= 1) {
    variants.add(Math.round(n * 1000) / 10);
    variants.add(Math.round(n * 100));
  }
  return [...variants];
}

function numbersClose(a, b, tolerance = 0.11) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function refTable(ref) {
  if (!ref) return "";
  return String((ref.details && ref.details.table) || ref.source || "");
}

function refBlob(ref) {
  if (!ref) return "";
  return [
    ref.source,
    ref.location,
    ref.title,
    refTable(ref),
    ref.details && ref.details.sql,
    ref.details && ref.details.operator
  ]
    .filter(Boolean)
    .join(" ");
}

function buildReferenceNumericIndex(refs) {
  const index = new Map();
  for (const ref of refs || []) {
    const numbers = new Set();
    const rows = (ref.details && ref.details.rows) || [];
    for (const row of rows) {
      for (const value of Object.values(row || {})) {
        if (value == null || value === "") continue;
        if (typeof value === "number" || /^-?\d/.test(String(value))) {
          for (const variant of numericVariants(Number(value))) numbers.add(variant);
        }
      }
    }
    if (ref.type === "calculation" && ref.details) {
      for (const value of Object.values(ref.details)) {
        if (typeof value === "number") {
          for (const variant of numericVariants(value)) numbers.add(variant);
        }
      }
    }
    index.set(ref.id, numbers);
  }
  return index;
}

function refContainsClaimNumbers(refId, claimNumbers, index, minHits = 1) {
  if (!claimNumbers.length) return false;
  const refNums = index.get(refId);
  if (!refNums || !refNums.size) return false;
  let hits = 0;
  for (const claim of claimNumbers) {
    for (const candidate of refNums) {
      if (numbersClose(claim, candidate)) {
        hits += 1;
        break;
      }
    }
  }
  return hits >= minHits;
}

function scoreRefForText(text, ref, index) {
  const claimNumbers = extractClaimNumbers(text);
  if (!claimNumbers.length) return 0;
  const refNums = index.get(ref.id);
  if (!refNums || !refNums.size) return 0;
  let hits = 0;
  for (const claim of claimNumbers) {
    for (const candidate of refNums) {
      if (numbersClose(claim, candidate)) {
        hits += 1;
        break;
      }
    }
  }
  return hits / claimNumbers.length;
}

function findRefByTopic(refs, matcher) {
  return (refs || []).find(matcher) || null;
}

function findTrafficFunnelRef(refs) {
  const hit = findRefByTopic(
    refs,
    (item) =>
      item.type === "calculation" &&
      ((item.details && item.details.operator === "trafficPathComparison") ||
        /双路径|搜索.*推荐.*漏斗/.test(String(item.title || "")))
  );
  return hit ? hit.id : null;
}

function findCompetitorBenchmarkRef(refs) {
  const hit = findRefByTopic(
    refs,
    (item) =>
      item.type === "sql"
        ? /competitor|fact_competitor_benchmark_monthly/i.test(refBlob(item))
        : item.type === "data" && refTable(item) === COMPETITOR_TABLE
  );
  return hit ? hit.id : null;
}

function findCityDataRef(refs) {
  const hit = findRefByTopic(
    refs,
    (item) =>
      (item.type === "sql" && /city_roi|fact_city_brand_monthly/i.test(refBlob(item))) ||
      (item.type === "data" && refTable(item) === CITY_TABLE)
  );
  return hit ? hit.id : null;
}

function findBrandMonthlyRef(refs) {
  const hit = findRefByTopic(
    refs,
    (item) =>
      (item.type === "sql" && /monthly_gtv|fact_brand_monthly/i.test(refBlob(item))) ||
      (item.type === "data" && refTable(item) === BRAND_TABLE)
  );
  return hit ? hit.id : null;
}

function findKnowledgeRef(refs, text) {
  const blob = String(text || "");
  const rules = [
    { test: /2\s*%|预警线|补贴率|take rate|变现率|广告商户/i, match: /补贴|变现|take|预警/i },
    { test: /美团|抖音|双平台|平台对比|竞对/i, match: /竞对|平台|美团|抖音/i },
    { test: /城市|roi|分层/i, match: /城市|roi|分层/i },
    { test: /漏斗|转化|承接|poi|套餐/i, match: /漏斗|转化|poi|套餐/i }
  ];
  for (const rule of rules) {
    if (!rule.test.test(blob)) continue;
    const hit = (refs || []).find(
      (item) => item.type === "knowledge" && rule.match.test(String(item.title || "") + String(item.excerpt || ""))
    );
    if (hit) return hit.id;
  }
  return null;
}

function isTrafficInsightText(text) {
  return /搜索|推荐|CTR|双路径|流量曝光|流量点击|曝光→点击|曝光.{0,2}点击|转化链路|链路.*损耗|流量利用|mt_feed|mt_search/i.test(
    String(text || "")
  );
}

function isCompetitorInsightText(text) {
  return /美团|抖音|双平台|平台对比|竞对|补贴效率|核销率差|到店消费|薅羊毛/i.test(String(text || ""));
}

function isCityInsightText(text) {
  return /城市分层|城市.{0,4}roi|上海|北京|深圳|成都|杭州|低roi城市|高roi/i.test(String(text || ""));
}

function isBrandKpiText(text) {
  return /gtv|gmv|活跃用户|客单价|take rate|综合变现|广告商户渗透/i.test(String(text || ""));
}

function refSupportsTrafficTopic(refId, refs) {
  const ref = (refs || []).find((item) => item.id === refId);
  if (!ref) return false;
  if (ref.type === "calculation") {
    return (
      (ref.details && ref.details.operator === "trafficPathComparison") ||
      /漏斗|双路径|CTR/i.test(String(ref.title || ""))
    );
  }
  if (ref.type === "data") {
    return /search_keyword|poi_monthly|deal_campaign/i.test(refTable(ref));
  }
  if (ref.type === "sql") {
    return /funnel|search_keyword|feed_poi|mt_search/i.test(refBlob(ref));
  }
  return false;
}

function pickBestDataRef(text, refs, index, topicRefId) {
  const claimNumbers = extractClaimNumbers(text);
  const candidates = (refs || []).filter((item) => item.type === "sql" || item.type === "data");
  let best = null;
  let bestScore = 0;

  for (const ref of candidates) {
    let score = scoreRefForText(text, ref, index);
    if (topicRefId && ref.id === topicRefId) score += 0.35;
    if (claimNumbers.length && !refContainsClaimNumbers(ref.id, claimNumbers, index)) score *= 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = ref;
    }
  }

  if (best && bestScore >= 0.34) return best.id;
  if (topicRefId && claimNumbers.length && refContainsClaimNumbers(topicRefId, claimNumbers, index)) {
    return topicRefId;
  }
  if (topicRefId && !claimNumbers.length) return topicRefId;
  return best && bestScore > 0 ? best.id : null;
}

function sanitizeProposedRefs(proposed, text, refs, index) {
  const claimNumbers = extractClaimNumbers(text);
  if (!claimNumbers.length) return proposed;
  return proposed.filter((refId) => {
    const ref = (refs || []).find((item) => item.id === refId);
    if (!ref) return false;
    if (ref.type === "knowledge" || ref.type === "calculation") return true;
    return refContainsClaimNumbers(refId, claimNumbers, index);
  });
}

function resolveCitedRefs(text, refs, fallbackRefs) {
  const allRefs = refs || [];
  const index = buildReferenceNumericIndex(allRefs);
  const proposed = sanitizeProposedRefs(
    Array.isArray(fallbackRefs) ? fallbackRefs.map(String).filter(Boolean) : [],
    text,
    allRefs,
    index
  );
  const claimNumbers = extractClaimNumbers(text);
  const knowledgeRef = findKnowledgeRef(allRefs, text);
  const bound = [];

  if (isTrafficInsightText(text)) {
    const trafficRef = findTrafficFunnelRef(allRefs);
    if (trafficRef) bound.push(trafficRef);
    const keywordRef = allRefs.find(
      (item) => item.type === "data" && refTable(item) === "fact_search_keyword_monthly"
    );
    if (keywordRef && keywordRef.id !== trafficRef) bound.push(keywordRef.id);
    if (proposed.some((id) => !refSupportsTrafficTopic(id, allRefs)) && trafficRef) {
      return [...new Set(bound.length ? bound : [trafficRef])];
    }
  }

  let topicRefId = null;
  if (isCompetitorInsightText(text)) topicRefId = findCompetitorBenchmarkRef(allRefs);
  else if (isCityInsightText(text)) topicRefId = findCityDataRef(allRefs);
  else if (isBrandKpiText(text)) topicRefId = findBrandMonthlyRef(allRefs);

  const dataRef = pickBestDataRef(text, allRefs, index, topicRefId);
  if (dataRef) bound.push(dataRef);
  else if (topicRefId) bound.push(topicRefId);

  for (const refId of proposed) {
    if (/^K\d+$/i.test(refId)) bound.push(refId);
  }
  if (knowledgeRef && !bound.includes(knowledgeRef)) bound.push(knowledgeRef);

  const unique = [...new Set(bound.filter(Boolean))];
  if (unique.length) return unique;
  if (proposed.length) return proposed;
  return fallbackRefs || [];
}

function resolveMetricRefs(metric, refs) {
  if (!metric || typeof metric !== "object") return [];
  const text = [metric.label, metric.value, metric.delta].filter(Boolean).join(" ");
  return resolveCitedRefs(text, refs, metric.refs || []);
}

function auditCitationBinding(text, refIds, refs) {
  const issues = [];
  const claimNumbers = extractClaimNumbers(text);
  if (!claimNumbers.length || !refIds.length) return issues;

  const index = buildReferenceNumericIndex(refs || []);
  const dataRefIds = refIds.filter((id) => /^[SD]\d+$/i.test(id));
  if (!dataRefIds.length) return issues;

  const supported = dataRefIds.some((refId) => refContainsClaimNumbers(refId, claimNumbers, index, 1));
  if (!supported) {
    issues.push({
      level: "warning",
      code: "CITATION_NUMBER_MISMATCH",
      message: "引用未覆盖文本中的关键数字：" + claimNumbers.slice(0, 4).join("、")
    });
  }

  if (isCompetitorInsightText(text)) {
    const competitorRef = findCompetitorBenchmarkRef(refs || []);
    if (competitorRef && !refIds.includes(competitorRef)) {
      issues.push({
        level: "warning",
        code: "COMPETITOR_CITATION_MISSING",
        message: "平台/竞对类结论应引用竞对基准表，而非城市或品牌月表。"
      });
    }
  }

  return issues;
}

function auditProposalReferences(proposal, refs) {
  const issues = [];
  if (!proposal || typeof proposal !== "object") return issues;

  const sections = [
    ["summary", proposal.summary, proposal.summaryRefs || []],
    ...(Array.isArray(proposal.metrics)
      ? proposal.metrics.map((item) => ["metric", `${item.label} ${item.value}`, item.refs || []])
      : []),
    ...(Array.isArray(proposal.insights)
      ? proposal.insights.map((item) => ["insight", item.text || "", item.refs || []])
      : []),
    ...(Array.isArray(proposal.actions)
      ? proposal.actions.map((item) => ["action", item.text || "", item.refs || []])
      : []),
    ...(Array.isArray(proposal.risks)
      ? proposal.risks.map((item) => ["risk", item.text || "", item.refs || []])
      : [])
  ];

  for (const [, text, refIds] of sections) {
    issues.push(...auditCitationBinding(text, refIds, refs));
  }
  return issues;
}

module.exports = {
  extractClaimNumbers,
  buildReferenceNumericIndex,
  findTrafficFunnelRef,
  findCompetitorBenchmarkRef,
  findCityDataRef,
  findBrandMonthlyRef,
  resolveCitedRefs,
  resolveMetricRefs,
  auditCitationBinding,
  auditProposalReferences,
  isCompetitorInsightText,
  isTrafficInsightText
};
