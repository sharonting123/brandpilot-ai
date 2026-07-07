/**
 * 时间路由层
 * 用户时间表达 → 语义解析 → 目标粒度 → 指标粒度校验 → 选表 → SQL 时间条件
 */

const {
  monthEndIso,
  monthEndDates,
  normalizeMonthEnd,
  formatMonthLabel
} = require("./month-end");
const { monthKeyToEndDate } = require("./period-utils");
const {
  loadSemanticGraph,
  detectMetricFromGraph,
  getTableRegistry,
  getMetricGrainRegistry,
  getDomainDefaultTable,
  getGrainTablePriority
} = require("./semantic-graph");

/** 逻辑粒度 */
const GRAINS = ["day", "week", "month", "quarter", "half_year", "year", "range", "cumulative"];

/** 物理表类型（对用户/Agent 可见的路由标签） */
function getTableKindLabels() {
  return loadSemanticGraph().tableKind;
}

const TABLE_KIND = new Proxy(
  {},
  {
    get(_target, prop) {
      const kinds = getTableKindLabels();
      return kinds[prop];
    }
  }
);

function getTableRegistryResolved() {
  return getTableRegistry();
}

function getMetricGrainRegistryResolved() {
  return getMetricGrainRegistry();
}

function getDomainDefaultTableResolved() {
  return getDomainDefaultTable();
}

function getGrainTablePriorityResolved() {
  const fromGraph = getGrainTablePriority();
  if (Object.keys(fromGraph).length) return fromGraph;
  return {
    day: ["daily", "agg_daily", "weekly", "monthly"],
    week: ["weekly", "agg_daily", "monthly"],
    month: ["monthly", "agg_daily"],
    quarter: ["monthly"],
    half_year: ["monthly"],
    year: ["monthly"],
    range: ["monthly", "agg_daily"],
    cumulative: ["monthly"]
  };
}

const GRAIN_RANK = { day: 1, week: 2, month: 3, quarter: 4, half_year: 5, year: 6, range: 7, cumulative: 8 };

function detectMetricFromText(text) {
  return detectMetricFromGraph(text);
}

function detectRequestedGrain(text) {
  const t = String(text || "");
  if (/今天|昨日|昨天|前天|\d{1,2}日[^月]|按日|日报|日粒度|每日/.test(t)) return "day";
  if (/本周|上周|这周|周度|按周|周报|周粒度|第\d+周/.test(t)) return "week";
  if (/本月|上月|上个月|\d{1,2}\s*月|月度|月报|月粒度|环比|同比|mom|yoy/.test(t)) return "month";
  if (/Q[1-4]|季度|一季|二季|三季|四季/.test(t)) return "quarter";
  if (/上半年|下半年|H1|H2|h1|h2|半年/.test(t)) return "half_year";
  if (/全年|年度|\d{4}\s*年(?!.*\d{1,2}\s*月)/.test(t)) return "year";
  if (/累计|至今|以?来|到.*月|至/.test(t)) return "cumulative";
  if (/趋势|走势|近\d+个?月/.test(t)) return "range";
  return null;
}

function parseTimeSemantics(question, intentParams = {}) {
  const text = String(question || "") + " " + String(intentParams.period || "");
  const semantics = {
    rawText: text.trim(),
    expressionType: "implicit",
    requestedGrain: detectRequestedGrain(text),
    year: null,
    monthNum: null,
    monthKey: null,
    monthEnd: null,
    quarter: null,
    from: null,
    to: null,
    periodLabel: null,
    rangeLabel: null
  };

  const cnMonth = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (cnMonth) {
    semantics.expressionType = "month_explicit";
    semantics.year = Number(cnMonth[1]);
    semantics.monthNum = Number(cnMonth[2]);
    semantics.monthKey = `${cnMonth[1]}-${String(cnMonth[2]).padStart(2, "0")}`;
    semantics.monthEnd = monthKeyToEndDate(semantics.monthKey);
    semantics.periodLabel = formatMonthLabel(semantics.monthEnd);
    if (!semantics.requestedGrain) semantics.requestedGrain = "month";
  }

  const monthOnly = text.match(/(?:^|[^\d])(1[0-2]|[1-9])\s*月/);
  if (monthOnly && !semantics.monthNum) {
    semantics.expressionType = "month_only";
    semantics.year = 2026;
    semantics.monthNum = Number(monthOnly[1]);
    semantics.monthKey = `2026-${String(semantics.monthNum).padStart(2, "0")}`;
    semantics.monthEnd = monthKeyToEndDate(semantics.monthKey);
    semantics.periodLabel = formatMonthLabel(semantics.monthEnd);
    if (!semantics.requestedGrain) semantics.requestedGrain = "month";
  }

  const isoMonth = text.match(/(20\d{2})[-/](\d{1,2})/);
  if (isoMonth && !semantics.monthKey) {
    semantics.expressionType = "iso_month";
    semantics.year = Number(isoMonth[1]);
    semantics.monthNum = Number(isoMonth[2]);
    semantics.monthKey = `${isoMonth[1]}-${String(isoMonth[2]).padStart(2, "0")}`;
    semantics.monthEnd = monthKeyToEndDate(semantics.monthKey);
    semantics.periodLabel = formatMonthLabel(semantics.monthEnd);
    if (!semantics.requestedGrain) semantics.requestedGrain = "month";
  }

  if (/上半年|H1|h1/.test(text)) {
    semantics.expressionType = "half_year";
    semantics.year = semantics.year || 2026;
    semantics.from = `${semantics.year}-01-31`;
    semantics.to = `${semantics.year}-06-30`;
    semantics.periodLabel = `${semantics.year}年上半年`;
    semantics.rangeLabel = `${semantics.from} 至 ${semantics.to}`;
    semantics.requestedGrain = "half_year";
  } else if (/下半年|H2|h2/.test(text)) {
    semantics.expressionType = "half_year";
    semantics.year = semantics.year || 2026;
    semantics.from = `${semantics.year}-07-31`;
    semantics.to = `${semantics.year}-12-31`;
    semantics.periodLabel = `${semantics.year}年下半年`;
    semantics.rangeLabel = `${semantics.from} 至 ${semantics.to}`;
    semantics.requestedGrain = "half_year";
  }

  const rangeMatch = text.match(/(20\d{2})[-/年](\d{1,2}).{0,6}(至|到|~|-).{0,6}(20\d{2})[-/年]?(\d{1,2})?/);
  if (rangeMatch) {
    semantics.expressionType = "range";
    const y1 = rangeMatch[1];
    const m1 = rangeMatch[2];
    const y2 = rangeMatch[4];
    const m2 = rangeMatch[5] || m1;
    semantics.from = monthKeyToEndDate(`${y1}-${String(m1).padStart(2, "0")}`);
    semantics.to = monthKeyToEndDate(`${y2}-${String(m2).padStart(2, "0")}`);
    semantics.periodLabel = `${y1}年${Number(m1)}月至${y2}年${Number(m2)}月`;
    semantics.rangeLabel = `${semantics.from} 至 ${semantics.to}`;
    semantics.requestedGrain = "range";
  }

  if (/近(\d+)个?月/.test(text)) {
    const n = Number(text.match(/近(\d+)个?月/)[1]);
    semantics.expressionType = "recent_months";
    semantics.to = "2026-06-30";
    const ends = monthEndDates("2024-01-01", semantics.to);
    semantics.from = ends[Math.max(0, ends.length - n)] || ends[0];
    semantics.periodLabel = `近${n}个月`;
    semantics.rangeLabel = `${semantics.from} 至 ${semantics.to}`;
    semantics.requestedGrain = "range";
  }

  if (intentParams.period && !semantics.monthKey) {
    const fromIntent = parseTimeSemantics(String(intentParams.period), {});
    if (fromIntent.monthKey) {
      Object.assign(semantics, { ...fromIntent, rawText: text.trim() });
    }
  }

  if (!semantics.requestedGrain) semantics.requestedGrain = "month";
  return semantics;
}

function judgeTargetGrain(semantics, options = {}) {
  const queryType = options.queryType || "";
  const requested = semantics.requestedGrain || "month";
  let grain = requested;
  const explicitFineGrain = requested === "day" || requested === "week";

  if (queryType === "funnel_conversion" || queryType === "funnel") {
    grain = explicitFineGrain ? requested : "month";
  } else if (queryType === "period_compare" || /环比|同比/.test(semantics.rawText)) {
    grain = "month";
  } else if (queryType === "queryTrend" || /趋势|走势/.test(semantics.rawText)) {
    if (explicitFineGrain) {
      grain = requested;
    } else if (semantics.from && semantics.to) {
      grain = "range";
    } else if (semantics.expressionType === "recent_months" || /近\d+个?月/.test(semantics.rawText)) {
      grain = "range";
    } else {
      grain = "month";
    }
  }

  return {
    targetGrain: grain,
    reason:
      grain === requested
        ? `用户表达匹配 ${grain} 粒度`
        : `场景 ${queryType || "通用"} 将粒度 ${requested} 规范为 ${grain}`
  };
}

function validateMetricGrain(metric, targetGrain) {
  const METRIC_GRAIN_REGISTRY = getMetricGrainRegistryResolved();
  const spec = METRIC_GRAIN_REGISTRY[metric] || METRIC_GRAIN_REGISTRY.gmv;
  const supported = spec.supportedGrains || ["month"];
  let effectiveGrain = targetGrain;
  let valid = supported.includes(targetGrain);
  let fallbackReason = null;

  if (!valid) {
    const targetRank = GRAIN_RANK[targetGrain] || 99;
    const sorted = [...supported].sort((a, b) => (GRAIN_RANK[a] || 99) - (GRAIN_RANK[b] || 99));
    effectiveGrain =
      sorted.find((g) => (GRAIN_RANK[g] || 99) >= targetRank) ||
      spec.preferredGrain ||
      "month";
    fallbackReason = `指标 ${metric} 不支持 ${targetGrain} 粒度，降级为 ${effectiveGrain}`;
    valid = false;
  }

  return {
    metric,
    requestedGrain: targetGrain,
    effectiveGrain,
    valid,
    supportedGrains: supported,
    preferredGrain: spec.preferredGrain || "month",
    domain: spec.domain,
    fallbackReason
  };
}

function listTablesForDomain(domain) {
  const TABLE_REGISTRY = getTableRegistryResolved();
  return Object.entries(TABLE_REGISTRY)
    .filter(([, meta]) => meta.domain === domain || (domain === "funnel" && ["search", "poi", "campaign"].includes(meta.domain)))
    .map(([name, meta]) => ({ table: name, ...meta }));
}

function selectTableRoute(metricValidation, options = {}) {
  const domain = options.domain || metricValidation.domain || "brand";
  const grain = metricValidation.effectiveGrain;
  const GRAIN_TABLE_PRIORITY = getGrainTablePriorityResolved();
  const tableKinds = getTableKindLabels();
  const priorities = GRAIN_TABLE_PRIORITY[grain] || GRAIN_TABLE_PRIORITY.month;
  const candidates = listTablesForDomain(domain);

  for (const kindKey of priorities) {
    const kindLabel = tableKinds[kindKey] || kindKey;
    const hit = candidates.find((c) => c.kindKey === kindKey || c.kind === kindLabel);
    if (hit) {
      return {
        table: hit.table || getDomainDefaultTableResolved()[domain],
        tableKind: hit.kind || kindLabel,
        physicalGrain: hit.physicalGrain,
        dateColumn: hit.dateColumn,
        domain: hit.domain,
        grainFallback: hit.physicalGrain !== grain || kindKey !== priorities[0],
        routeLabel: `${hit.kind || kindLabel} → ${hit.table}`
      };
    }
  }

  const DOMAIN_DEFAULT_TABLE = getDomainDefaultTableResolved();
  const fallbackTable = DOMAIN_DEFAULT_TABLE[domain] || "fact_brand_monthly";
  const TABLE_REGISTRY = getTableRegistryResolved();
  const meta = TABLE_REGISTRY[fallbackTable];
  return {
    table: fallbackTable,
    tableKind: meta ? meta.kind : TABLE_KIND.monthly,
    physicalGrain: "month",
    dateColumn: "month",
    domain,
    grainFallback: true,
    routeLabel: `默认月表 → ${fallbackTable}`
  };
}

function buildTimeWhereClause(timePlan, dateColumn = "month") {
  const col = dateColumn || "month";
  const s = timePlan.semantics || {};

  if (s.monthEnd && (timePlan.effectiveGrain === "month" || !s.from)) {
    return ` AND ${col} = '${normalizeMonthEnd(s.monthEnd)}'`;
  }
  if (s.from && s.to) {
    return ` AND ${col} >= '${normalizeMonthEnd(s.from)}' AND ${col} <= '${normalizeMonthEnd(s.to)}'`;
  }
  if (s.monthNum && s.year) {
    const end = monthKeyToEndDate(`${s.year}-${String(s.monthNum).padStart(2, "0")}`);
    return end ? ` AND ${col} = '${end}'` : "";
  }
  if (s.monthNum) {
    return ` AND EXTRACT(MONTH FROM ${col}) = ${s.monthNum}`;
  }
  return "";
}

function semanticsToFilters(semantics) {
  const filters = {};
  if (semantics.year) filters.year = String(semantics.year);
  if (semantics.monthNum) filters.monthNum = semantics.monthNum;
  if (semantics.monthEnd) filters.month = semantics.monthEnd;
  else if (semantics.monthKey) filters.month = monthKeyToEndDate(semantics.monthKey);
  if (semantics.from) filters.dateFrom = semantics.from;
  if (semantics.to) filters.dateTo = semantics.to;
  if (semantics.periodLabel) filters.periodLabel = semantics.periodLabel;
  return filters;
}

/**
 * Data Query Engine 查数路由：指标粒度校验 → 选表 → SQL 时间条件
 * 时间/粒度/指标/维度语义由 Intent Router（intent-slots）预先识别
 */
function resolveQueryRoute(params = {}) {
  const metric = params.metric || "gmv";
  const targetGrain = params.targetGrain || params.grain || "month";
  const semantics = params.semantics || {};
  const queryType = params.queryType || "";
  const dimension = params.dimension || null;

  const metricValidation = validateMetricGrain(metric, targetGrain);
  const domain = params.domain || metricValidation.domain || inferDomainFromDimension(dimension, metric);
  const tableRoute = selectTableRoute(metricValidation, { domain, queryType });
  const sqlTimeClause = buildTimeWhereClause(
    { semantics, effectiveGrain: metricValidation.effectiveGrain },
    tableRoute.dateColumn
  );

  const steps = [
    {
      stage: "validate",
      label: "指标支持粒度校验",
      summary:
        metricValidation.fallbackReason ||
        `指标 ${metric} 支持 ${metricValidation.effectiveGrain} 粒度`
    },
    {
      stage: "route",
      label: "选表路由",
      summary: tableRoute.routeLabel + (tableRoute.grainFallback ? "（粒度降级）" : "")
    }
  ];

  return {
    metric,
    queryType,
    semantics,
    dimension,
    targetGrain,
    effectiveGrain: metricValidation.effectiveGrain,
    metricValidation,
    table: tableRoute.table,
    tableKind: tableRoute.tableKind,
    dateColumn: tableRoute.dateColumn,
    domain: tableRoute.domain,
    sqlTimeClause,
    grainFallback: tableRoute.grainFallback || Boolean(metricValidation.fallbackReason),
    steps
  };
}

function inferDomainFromDimension(dimension, metric) {
  if (dimension === "city") return "city";
  if (dimension === "business_area" || dimension === "poi") return "poi";
  if (dimension === "platform") return "competitor";
  if (dimension === "keyword") return "search";
  if (dimension === "campaign") return "campaign";
  const spec = getMetricGrainRegistryResolved()[metric];
  return (spec && spec.domain) || "brand";
}

/**
 * 完整时间路由（兼容旧调用；优先使用 analysisSlots）
 */
function routeTimeQuery(params = {}) {
  const question = String(params.question || params.query || "");
  const intentParams = params.intentParams || {};
  const slots = params.analysisSlots || intentParams.analysisSlots || null;

  const metric = params.metric || (slots && slots.metric) || detectMetricFromText(question);
  const queryType = params.queryType || (slots && slots.queryType) || "";
  const dimension = params.dimension || (slots && slots.dimension) || intentParams.dimension || null;

  const semantics = slots ? slots.semantics : parseTimeSemantics(question, intentParams);
  const targetGrain = slots
    ? slots.grain.target
    : judgeTargetGrain(semantics, { queryType }).targetGrain;

  const resolved = resolveQueryRoute({
    metric,
    targetGrain,
    semantics,
    queryType,
    dimension,
    domain: params.domain
  });
  const filters = slots ? { ...slots.filters } : semanticsToFilters(semantics);

  const steps = slots
    ? resolved.steps
    : [
        {
          stage: "parse",
          label: "时间语义解析",
          summary:
            semantics.periodLabel ||
            semantics.rangeLabel ||
            `识别为 ${semantics.requestedGrain} 粒度表达`
        },
        {
          stage: "grain",
          label: "目标粒度判断",
          summary: judgeTargetGrain(semantics, { queryType }).reason
        },
        ...resolved.steps
      ];

  return {
    ...resolved,
    filters,
    steps,
    periodLabel:
      (slots && slots.time && slots.time.periodLabel) ||
      semantics.periodLabel ||
      semantics.rangeLabel ||
      formatMonthLabel(filters.month)
  };
}

module.exports = {
  GRAINS,
  TABLE_KIND,
  get TABLE_REGISTRY() {
    return getTableRegistryResolved();
  },
  get METRIC_GRAIN_REGISTRY() {
    return getMetricGrainRegistryResolved();
  },
  get DOMAIN_DEFAULT_TABLE() {
    return getDomainDefaultTableResolved();
  },
  loadSemanticGraph,
  detectMetricFromText,
  parseTimeSemantics,
  judgeTargetGrain,
  validateMetricGrain,
  selectTableRoute,
  buildTimeWhereClause,
  semanticsToFilters,
  resolveQueryRoute,
  routeTimeQuery
};
