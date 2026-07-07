/**
 * NL2SQL 统一前置查数流水线
 * 所有涉及数据的工作流在 LLM 推理前先走 NL2SQL。
 */

const { queryFromQuestion } = require("./data-query-engine");
const { tracePush } = require("./workflow-progress");

const TIME_ROUTE_STEP_NAMES = {
  validate: "指标粒度校验",
  route: "选表路由"
};

const { getDataWorkflows } = require("./semantic-graph");

const DATA_WORKFLOWS = new Set(getDataWorkflows());

function workflowRequiresNl2Sql(workflow) {
  return DATA_WORKFLOWS.has(workflow);
}

/**
 * 预执行 NL2SQL，返回解析结果与 trace 条目
 */
async function prefetchNl2Sql(params = {}) {
  const {
    message,
    brandId = "haidilao",
    modelConfig,
    onProgress,
    agentTrace = []
  } = params;

  const nlStart = Date.now();
  const nl = await queryFromQuestion({
    brandId,
    question: message,
    modelConfig,
    intentParams: params.intentParams || {}
  });

  if (nl.timeRoute && Array.isArray(nl.timeRoute.steps)) {
    nl.timeRoute.steps.forEach((step) => {
      tracePush(agentTrace, onProgress, {
        name: TIME_ROUTE_STEP_NAMES[step.stage] || step.label,
        tool: step.stage,
        summary: step.summary,
        durationMs: 0,
        group: "query"
      });
    });
  }

  tracePush(agentTrace, onProgress, {
    name: "Data Query Engine",
    tool:
      nl.generationMode === "agent"
        ? nl.queryType || nl.templateId || "sql_agent"
        : nl.templateId || nl.queryType || "template",
    summary:
      nl.generationMode === "agent"
        ? "Agent 生成 SQL：" + (nl.agentReasoning || nl.explanation || "完成")
        : nl.explanation || nl.message || "模板查数完成",
    durationMs: Date.now() - nlStart,
    group: "query"
  });

  if (nl.queryPlanRef) {
    tracePush(agentTrace, onProgress, {
      name: "QueryPlan",
      tool: "query_plan",
      summary:
        `图谱校验通过 [${nl.queryPlanRef}] · ${(nl.queryPlan && nl.queryPlan.metricLabel) || nl.queryPlan && nl.queryPlan.metric || "查数"}` +
        (nl.queryPlan && nl.queryPlan.estimation
          ? ` · 预估 ${nl.queryPlan.estimation.expectedRowCount} 行`
          : ""),
      durationMs: 0,
      group: "query"
    });
  }

  return { nl, nlRaw: JSON.stringify(nl) };
}

function buildNl2SqlContextBlock(nl) {
  if (!nl || nl.error) return "";
  return (
    "\n\n## 已预查询 NL2SQL 结果（优先使用，无需重复调用 runNl2Sql）\n" +
    "```json\n" +
    JSON.stringify(nl, null, 2) +
    "\n```"
  );
}

function finalizeAnswerWithNl2Sql(answer) {
  return answer || "";
}

module.exports = {
  DATA_WORKFLOWS,
  workflowRequiresNl2Sql,
  prefetchNl2Sql,
  buildNl2SqlContextBlock,
  finalizeAnswerWithNl2Sql
};
