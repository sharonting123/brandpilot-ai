/**
 * 图表附带策略：避免与问题无关的「月度 GTV 趋势」反复出现。
 */

const GTV_TREND_RE = /GTV|gtv|月度.*趋势|月.*趋势|H1.*趋势|半年.*趋势/;

const GTV_QUESTION_RE =
  /GTV|gtv|月度|月趋势|半年|H1|经分|三因子|take\s*rate|补贴率|活跃用户|购买频次|客单价|月环比|月增长|趋势/;

function isGtvTrendChart(chart) {
  const title = String((chart && chart.title) || "");
  return GTV_TREND_RE.test(title);
}

function extractToolsFromTrace(agentTrace) {
  const tools = new Set();
  (agentTrace || []).forEach((step) => {
    const toolField = String(step.tool || "");
    toolField.split("→").forEach((part) => {
      const name = part.trim();
      if (name) tools.add(name);
    });
    if (step.toolName) tools.add(step.toolName);
  });
  return [...tools];
}

function shouldShowGtvTrendChart({ message, workflow, toolsUsed }) {
  const tools = toolsUsed || [];
  const text = String(message || "");
  const monthlyToolUsed = tools.some((tool) => /aggregateMonthly/i.test(tool));

  if (workflow === "funnel_diagnosis" || workflow === "competitor_benchmark") {
    return false;
  }

  if (workflow === "data_query") {
    return monthlyToolUsed && GTV_QUESTION_RE.test(text);
  }

  if (workflow === "annual_proposal") {
    return monthlyToolUsed || GTV_QUESTION_RE.test(text);
  }

  return monthlyToolUsed && GTV_QUESTION_RE.test(text);
}

function filterWorkflowCharts(charts, context) {
  const list = Array.isArray(charts) ? charts : [];
  if (!list.length) return [];

  const showGtv = shouldShowGtvTrendChart({
    message: context.message,
    workflow: context.workflow,
    toolsUsed: context.toolsUsed || extractToolsFromTrace(context.agentTrace)
  });

  if (showGtv) return list;
  return list.filter((chart) => !isGtvTrendChart(chart));
}

module.exports = {
  isGtvTrendChart,
  extractToolsFromTrace,
  shouldShowGtvTrendChart,
  filterWorkflowCharts
};
