/**
 * 执行步骤状态推断（done / warn / error / running）
 */

function inferStepStatus(step = {}) {
  const explicit = String(step.status || "").toLowerCase();
  if (explicit === "running" || explicit === "done" || explicit === "warn" || explicit === "error") {
    return explicit;
  }

  const tool = String(step.tool || "").toLowerCase();
  const summary = String(step.summary || "");

  if (tool === "error") return "error";
  if (tool === "fallback" || tool === "nl2sql_fallback" || tool === "skipped" || tool === "failed") {
    return "warn";
  }
  if (/失败|降级|兜底|fallback|未配置|无可用|暂存本地|对话保存失败|结构化提取失败/.test(summary)) {
    return "warn";
  }
  if (/当前无可用经营数据/.test(summary)) return "warn";

  return "done";
}

module.exports = {
  inferStepStatus
};
