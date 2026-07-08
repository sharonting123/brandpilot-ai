/**
 * 工作流执行进度上报
 */

const { inferStepStatus } = require("./step-status");

function reportProgress(onProgress, step) {
  if (typeof onProgress === "function") onProgress(step);
}

function tracePush(agentTrace, onProgress, step) {
  const enriched = { ...step, status: inferStepStatus(step) };
  agentTrace.push(enriched);
  reportProgress(onProgress, enriched);
}

function buildStepStart(name, summary, meta = {}) {
  return {
    phase: "start",
    name,
    summary: summary || `正在${name}…`,
    ...meta
  };
}

function buildStepUpdate(name, summary, tool, meta = {}) {
  return {
    phase: "update",
    name,
    summary: summary || `正在${name}…`,
    tool: tool || undefined,
    ...meta
  };
}

function buildStepDone(name, summary, tool, meta = {}) {
  return {
    phase: "done",
    name,
    summary: summary || "完成",
    tool: tool || undefined,
    ...meta
  };
}

function traceOnlyPush(agentTrace, step) {
  agentTrace.push({ ...step, status: inferStepStatus(step) });
}

module.exports = {
  reportProgress,
  tracePush,
  traceOnlyPush,
  buildStepStart,
  buildStepUpdate,
  buildStepDone
};
