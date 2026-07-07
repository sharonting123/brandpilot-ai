/**
 * Agent 结论汇总文档（固定结构）
 */

const { getCitationRegistry, registerAgentStep } = require("./citation-registry");
const { collectDataQueryRefs } = require("./proposal-metrics");

const AGENT_ROLE_MAP = {
  "意图识别": "识别用户问题类型并路由到对应工作流",
  "年度提案 Agent": "拉取品牌数据、检索知识、生成经营提案",
  "推理Agent": "调用工具完成多步推理与数据分析",
  "工具调用": "执行数据查询、漏斗、RAG 等工具",
  "提案结构化Agent": "将分析结论整理为结构化提案",
  "加载经营上下文": "读取 Supabase 品牌/POI/漏斗/月度事实表",
  "事件持久化": "写入 Agent 事件与提案记录",
  "链路诊断 Agent": "计算转化漏斗并定位最大损耗点",
  "问数 Agent": "NL2SQL 与事实表查询",
  "竞对分析 Agent": "对比平台/品牌/城市竞对基准",
  "寒暄 Agent": "寒暄与身份介绍"
};

const INTERNAL_TOOL_MARKERS = new Set(["推理完成", "推理失败", "inference_done"]);

const TOOL_DISPLAY_NAMES = {
  runNl2Sql: "自然语言查数",
  aggregateMonthly: "月度经营数据",
  retrieveKnowledge: "经营手册检索",
  queryBrandData: "品牌数据查询",
  computeFunnel: "漏斗计算",
  getCompetitorBenchmark: "竞对基准",
  getBrandPeerBenchmark: "同业对标",
  getBrandAssets: "品牌资产",
  generateObject: "结构化提取",
  nl2sql_fallback: "自然语言查数（备用）"
};

function formatAgentTool(tool) {
  if (!tool) return "";
  return String(tool)
    .split(/\s*→\s*/)
    .map((part) => {
      const key = part.trim();
      if (!key || INTERNAL_TOOL_MARKERS.has(key)) return "";
      return TOOL_DISPLAY_NAMES[key] || key;
    })
    .filter(Boolean)
    .join(" → ");
}

function buildAgentDossier({
  workflow,
  workflowLabel,
  brandName,
  period,
  agentTrace = [],
  proposal = null,
  references = []
}) {
  const refs = references.length ? references : getCitationRegistry();
  const agents = agentTrace.map((step, index) => {
    const name = step.name || "Agent " + (index + 1);
    const ref = registerAgentStep(name, step.summary, "trace:" + index);

    return {
      id: "agent_" + (index + 1),
      name,
      role: AGENT_ROLE_MAP[name] || step.role || "工作流执行步骤",
      status: step.status || "completed",
      durationMs: step.durationMs || 0,
      summary: step.summary || "",
      tool: formatAgentTool(step.tool || ""),
      formulas: Array.isArray(step.formulas) ? step.formulas : [],
      conclusions: [],
      citation: ref.id,
      location: "#agent/" + encodeURIComponent(name)
    };
  });

  if (proposal) {
    appendProposalConclusions(agents, proposal, refs);
  }

  return {
    version: "1.0",
    format: "brandpilot-agent-dossier",
    title: (brandName || "品牌") + " " + (period || "") + " Agent 分析汇总",
    brand: brandName || "",
    period: period || "",
    workflow: workflow || "",
    workflowLabel: workflowLabel || "",
    generatedAt: new Date().toISOString(),
    agents,
    references: refs,
    document: renderDossierMarkdown({
      brandName,
      period,
      workflowLabel,
      agents,
      references: refs
    })
  };
}

function inferToolRefs(toolText, refs) {
  const text = String(toolText || "").toLowerCase();
  const matched = [];
  refs.forEach((ref) => {
    if (ref.type === "data" && text.includes(String(ref.source || "").replace(/fact_|dim_/g, ""))) {
      matched.push(ref.id);
    }
    if (ref.type === "knowledge" && text.includes("retrieve")) matched.push(ref.id);
    if (ref.type === "sql" && text.includes("nl2sql")) matched.push(ref.id);
  });
  return matched.slice(0, 4);
}

function appendProposalConclusions(agents, proposal, refs) {
  const block = {
    id: "proposal-summary",
    name: "提案包装 Agent",
    role: "汇总结构化提案结论并标注引用",
    status: "completed",
    durationMs: 0,
    summary: proposal.summary || "",
    tool: "generateObject",
    conclusions: [],
    citation: "P1",
    location: "#proposal"
  };

  collectCitedItems(proposal.insights, "洞察", block.conclusions, refs);
  collectCitedItems(proposal.actions, "动作", block.conclusions, refs);
  collectCitedItems(proposal.metrics, "指标", block.conclusions, refs);
  if (proposal.risks) {
    collectCitedItems(proposal.risks, "风险", block.conclusions, refs);
  }

  agents.push(block);
}

function collectCitedItems(items, labelPrefix, target, refs) {
  if (!Array.isArray(items)) return;
  items.forEach((item, index) => {
    if (typeof item === "string") {
      target.push({
        text: labelPrefix + "：" + item,
        refs: refs.slice(0, 2).map((r) => r.id)
      });
      return;
    }
    target.push({
      text: labelPrefix + "：" + (item.text || item.label || item.title || JSON.stringify(item)),
      refs: item.refs || refs.slice(0, 2).map((r) => r.id)
    });
  });
}

function renderDossierMarkdown({ brandName, period, workflowLabel, agents, references }) {
  const lines = [
    "# " + (brandName || "品牌") + " " + (period || "") + " Agent 分析汇总",
    "",
    "- 工作流：" + (workflowLabel || "分析"),
    "- 生成时间：" + new Date().toLocaleString("zh-CN"),
    ""
  ];

  agents.forEach((agent) => {
    lines.push("## " + agent.name);
    lines.push("- 角色：" + agent.role);
    if (agent.summary) lines.push("- 摘要：" + agent.summary);
    if (agent.tool) lines.push("- 工具：" + agent.tool);
    if (agent.formulas && agent.formulas.length) {
      lines.push("- 计算公式：");
      agent.formulas.forEach((formula) => lines.push("  - " + formula));
    }
    if (agent.durationMs) lines.push("- 耗时：" + agent.durationMs + "ms");
    lines.push("- 引用位置：[" + (agent.citation || agent.id) + "](" + (agent.location || "#") + ")");
    lines.push("");
    if (agent.conclusions && agent.conclusions.length) {
      lines.push("### 结论");
      agent.conclusions.forEach((item) => {
        const refLinks = (item.refs || []).map((id) => "[" + id + "](#ref-" + id + ")").join(" ");
        lines.push("- " + item.text + (refLinks ? " " + refLinks : ""));
      });
      lines.push("");
    }
  });

  if (references.length) {
    lines.push("## 引用索引");
    references.forEach((ref) => {
      lines.push(
        "- **" + ref.id + "** [" + ref.title + "](" + ref.href + ") — " + (ref.location || ref.source)
      );
    });
  }

  return lines.join("\n");
}

function findTrafficFunnelRef(refs) {
  const hit = (refs || []).find(
    (item) =>
      item.type === "calculation" &&
      ((item.details && item.details.operator === "trafficPathComparison") ||
        /双路径|搜索.*推荐.*漏斗/.test(String(item.title || "")))
  );
  return hit ? hit.id : null;
}

function isTrafficInsightText(text) {
  return /搜索|推荐|CTR|双路径|流量曝光|流量点击|曝光→点击|曝光.{0,2}点击|转化链路|链路.*损耗|流量利用|mt_feed|mt_search/i.test(
    String(text || "")
  );
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
    return /search_keyword|poi_monthly|deal_campaign/i.test(String(ref.source || ""));
  }
  if (ref.type === "sql") {
    const blob = String(ref.source || "") + String((ref.details && ref.details.sql) || "");
    return /funnel|search_keyword|feed_poi|mt_search/i.test(blob);
  }
  return false;
}

function resolveCitedRefs(text, refs, fallbackRefs) {
  const trafficRef = findTrafficFunnelRef(refs);
  const proposed = Array.isArray(fallbackRefs) ? fallbackRefs.map(String).filter(Boolean) : [];

  if (isTrafficInsightText(text) && trafficRef) {
    const keywordRef = (refs || []).find(
      (item) => item.type === "data" && item.source === "fact_search_keyword_monthly"
    );
    const bound = [trafficRef];
    if (keywordRef && keywordRef.id !== trafficRef) bound.push(keywordRef.id);
    return bound;
  }

  if (isTrafficInsightText(text) && proposed.some((id) => !refSupportsTrafficTopic(id, refs))) {
    return trafficRef ? [trafficRef] : proposed;
  }

  return proposed.length ? proposed : fallbackRefs || [];
}

function enrichProposalWithReferences(proposal, references) {
  if (!proposal || typeof proposal !== "object") return proposal;
  const refs = references || getCitationRegistry();
  const defaultRefs = refs.slice(0, 3).map((item) => item.id);
  const dataQueryRefs = collectDataQueryRefs(refs);

  function enrichMetrics(items) {
    if (!Array.isArray(items)) return items;
    return items.map((item, index) => {
      if (typeof item === "string") {
        const bind = dataQueryRefs[index % dataQueryRefs.length] || dataQueryRefs[0];
        return { label: item.slice(0, 24), value: item, refs: bind ? [bind] : [] };
      }
      let itemRefs = Array.isArray(item.refs)
        ? item.refs.map(String).filter((id) => /^[SD]\d+$/i.test(id))
        : [];
      if (!itemRefs.length) itemRefs = dataQueryRefs.slice(0, 2);
      return {
        label: String(item.label || item.text || "经营指标").trim(),
        value: item.value,
        delta: item.delta,
        refs: itemRefs
      };
    });
  }

  function enrichList(items) {
    if (!Array.isArray(items)) return items;
    return items.map((item, index) => {
      if (typeof item === "string") {
        const fallback = defaultRefs.length ? [defaultRefs[index % defaultRefs.length]] : [];
        return {
          text: item,
          refs: resolveCitedRefs(item, refs, fallback)
        };
      }
      const text = item.text || item.label || "";
      const fallback =
        item.refs && item.refs.length
          ? item.refs
          : defaultRefs.length
            ? [defaultRefs[index % defaultRefs.length]]
            : [];
      return {
        text,
        value: item.value,
        delta: item.delta,
        refs: resolveCitedRefs(text, refs, fallback)
      };
    });
  }

  const summaryText = String(proposal.summary || "");
  const summaryRefs = resolveCitedRefs(
    summaryText,
    refs,
    proposal.summaryRefs || defaultRefs.slice(0, 2)
  );

  return {
    ...proposal,
    summaryRefs,
    metrics: enrichMetrics(proposal.metrics),
    insights: enrichList(proposal.insights),
    actions: enrichList(proposal.actions),
    risks: enrichList(proposal.risks),
    references: refs
  };
}

module.exports = {
  buildAgentDossier,
  enrichProposalWithReferences,
  renderDossierMarkdown
};
