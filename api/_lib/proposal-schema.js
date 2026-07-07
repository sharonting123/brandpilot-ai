/**
 * 年度提案结构化 schema + LongCat/DeepSeek 输出归一化
 */

function clampScore(value, fallback = 82) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function toString(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function toCitedText(item) {
  if (item == null) return null;
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { text, refs: [] } : null;
  }
  if (typeof item !== "object") return null;
  const text = toString(
    item.text ||
      item.content ||
      item.summary ||
      item.description ||
      item.title ||
      item.body ||
      item.insight ||
      item.action ||
      item.risk ||
      item.point
  );
  if (!text) return null;
  const refs = Array.isArray(item.refs)
    ? item.refs.map(String)
    : Array.isArray(item.ref)
      ? item.ref.map(String)
      : item.ref
        ? [String(item.ref)]
        : [];
  return { text, refs };
}

function toMetric(item) {
  if (item == null) return null;
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { label: text.slice(0, 24), value: text } : null;
  }
  if (typeof item !== "object") return null;
  const label = toString(item.label || item.name || item.metric || item.title);
  const value = toString(item.value ?? item.val ?? item.amount ?? item.data, "-");
  if (!label) return null;
  const out = { label, value };
  if (item.delta != null) out.delta = toString(item.delta);
  if (Array.isArray(item.refs)) out.refs = item.refs.map(String);
  return out;
}

function toTimeline(item) {
  if (item == null) return null;
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { title: text.slice(0, 40), body: text } : null;
  }
  if (typeof item !== "object") return null;
  const title = toString(item.title || item.name || item.phase || item.stage);
  const body = toString(item.body || item.content || item.description || item.summary);
  if (!title && !body) return null;
  const out = { title: title || body.slice(0, 40), body: body || title };
  if (Array.isArray(item.refs)) out.refs = item.refs.map(String);
  return out;
}

function toAsset(item) {
  if (item == null) return null;
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { title: text.slice(0, 40), body: text } : null;
  }
  if (typeof item !== "object") return null;
  const title = toString(item.title || item.name);
  const body = toString(item.body || item.content || item.description || item.summary);
  if (!title && !body) return null;
  return { title: title || body.slice(0, 40), body: body || title };
}

function toChart(item) {
  if (!item || typeof item !== "object") return null;
  const type = toString(item.type, "bar");
  const allowed = ["funnel", "bar", "line", "comparison"];
  const title = toString(item.title, "图表");
  return {
    type: allowed.includes(type) ? type : "bar",
    title,
    data: item.data != null ? item.data : item.chartData || {}
  };
}

function pickArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source[key]) && source[key].length) return source[key];
  }
  return [];
}

function extractSummaryFromAnswer(agentAnswer) {
  const text = String(agentAnswer || "");
  const match =
    text.match(/【经营摘要】([\s\S]*?)(=【|$)/) ||
    text.match(/##\s*经营摘要\s*\n([\s\S]*?)(\n##|\n【|$)/);
  if (match && match[1]) return match[1].trim().slice(0, 800);
  return text.trim().slice(0, 500);
}

function coerceProposalRaw(raw, brandName, params = {}, agentAnswer = "") {
  const period = params.period || "2026 H1";
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const nested =
    root.proposal && typeof root.proposal === "object" && !Array.isArray(root.proposal)
      ? root.proposal
      : {};
  const extra =
    (root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : null) ||
    (root.result && typeof root.result === "object" && !Array.isArray(root.result)
      ? root.result
      : null);
  const source = { ...root, ...nested, ...(extra || {}) };

  const metrics = pickArray(source, ["metrics", "metricCards", "keyMetrics"])
    .map(toMetric)
    .filter(Boolean);
  const insights = pickArray(source, ["insights", "keyInsights", "findings"])
    .map(toCitedText)
    .filter(Boolean);
  const actions = pickArray(source, ["actions", "recommendations", "strategies"])
    .map(toCitedText)
    .filter(Boolean);
  const timeline = pickArray(source, ["timeline", "milestones", "phases"])
    .map(toTimeline)
    .filter(Boolean);
  const risks = pickArray(source, ["risks", "riskPoints", "warnings"])
    .map(toCitedText)
    .filter(Boolean);
  const assets = pickArray(source, ["assets", "deliverables", "materials"])
    .map(toAsset)
    .filter(Boolean);
  const charts = pickArray(source, ["charts", "visualizations"])
    .map(toChart)
    .filter(Boolean);

  let summary = toString(source.summary || source.executiveSummary || source.abstract);
  if (!summary) summary = extractSummaryFromAnswer(agentAnswer);

  return {
    title: toString(source.title || source.proposalTitle, `${brandName} ${period} 经营提案`),
    opportunityScore: clampScore(source.opportunityScore ?? source.score ?? source.opportunity),
    summary,
    summaryRefs: Array.isArray(source.summaryRefs) ? source.summaryRefs.map(String) : [],
    metrics: metrics.length ? metrics : [{ label: "经营机会", value: "待结合数据补充", delta: "" }],
    insights: insights.length ? insights : [{ text: summary || "请结合上方分析查看关键洞察。", refs: [] }],
    actions: actions.length ? actions : [{ text: "结合分析结果制定可执行策略。", refs: [] }],
    timeline: timeline.length
      ? timeline
      : [
          { title: "阶段一：复盘", body: "补齐周期数据并形成基线。" },
          { title: "阶段二：优化", body: "针对主矛盾推进试点。" },
          { title: "阶段三：放大", body: "复制有效动作并跟踪指标。" }
        ],
    risks: risks.length ? risks : [{ text: "需持续校验数据口径与统计周期。", refs: [] }],
    assets: assets.length ? assets : [{ title: "经营诊断摘要", body: "包含指标、洞察与动作建议。" }],
    charts
  };
}

function buildProposalSchema(z, brandName, params, agentAnswer) {
  const CitedText = z.object({
    text: z.string(),
    refs: z.array(z.string()).default([])
  });

  return z.preprocess(
    (val) => coerceProposalRaw(val, brandName, params, agentAnswer),
    z.object({
      title: z.string(),
      opportunityScore: z.number().min(0).max(100),
      summary: z.string(),
      summaryRefs: z.array(z.string()).optional(),
      metrics: z.array(
        z.object({
          label: z.string(),
          value: z.string(),
          delta: z.string().optional(),
          refs: z.array(z.string()).optional()
        })
      ),
      insights: z.array(CitedText),
      actions: z.array(CitedText),
      timeline: z.array(
        z.object({
          title: z.string(),
          body: z.string(),
          refs: z.array(z.string()).optional()
        })
      ),
      risks: z.array(CitedText),
      assets: z.array(
        z.object({
          title: z.string(),
          body: z.string()
        })
      ),
      charts: z.array(
        z.object({
          type: z.enum(["funnel", "bar", "line", "comparison"]),
          title: z.string(),
          data: z.any()
        })
      ).default([])
    })
  );
}

const PROPOSAL_JSON_EXAMPLE = {
  title: "海底捞 2026 H1 经营提案",
  opportunityScore: 82,
  summary: "一段话经营摘要",
  metrics: [{ label: "H1 GTV", value: "1.1亿", delta: "环比+8%" }],
  insights: [{ text: "洞察内容", refs: ["S1", "K1"] }],
  actions: [{ text: "动作内容", refs: ["D1"] }],
  timeline: [{ title: "Q3 承接", body: "推进门店页套餐组实验" }],
  risks: [{ text: "风险内容", refs: [] }],
  assets: [{ title: "诊断页", body: "漏斗与指标看板" }],
  charts: [{ type: "funnel", title: "搜索到核销漏斗", data: { labels: [], datasets: [] } }]
};

function buildProposalStructuredPrompt(brandName, params) {
  return [
    "你从 agent 的分析文本中提取结构化提案 JSON。",
    "品牌：「" + brandName + "」，周期：「" + (params.period || "2026 H1") + "」。",
    "",
    "必须输出以下字段（英文 key，不要用中文 key）：",
    "title, opportunityScore, summary, metrics, insights, actions, timeline, risks, assets, charts",
    "",
    "格式要求：",
    "- insights/actions/risks 必须是对象数组，每项含 text(string) 和 refs(string[])",
    "- metrics 每项含 label, value，可选 delta",
    "- timeline/assets 每项含 title, body",
    "- 不要输出 Markdown，只输出 JSON",
    "",
    "示例：",
    JSON.stringify(PROPOSAL_JSON_EXAMPLE, null, 2)
  ].join("\n");
}

module.exports = {
  coerceProposalRaw,
  buildProposalSchema,
  buildProposalStructuredPrompt,
  PROPOSAL_JSON_EXAMPLE
};
