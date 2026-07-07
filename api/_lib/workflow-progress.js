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

function buildStepStart(name, summary) {
  return {
    phase: "start",
    name,
    summary: summary || `正在${name}…`
  };
}

function buildStepUpdate(name, summary, tool) {
  return {
    phase: "update",
    name,
    summary: summary || `正在${name}…`,
    tool: tool || undefined
  };
}

module.exports = {
  reportProgress,
  tracePush,
  buildStepStart,
  buildStepUpdate
};
