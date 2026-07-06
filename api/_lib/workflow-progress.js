/**
 * 工作流执行进度上报
 */

function reportProgress(onProgress, step) {
  if (typeof onProgress === "function") onProgress(step);
}

function tracePush(agentTrace, onProgress, step) {
  agentTrace.push(step);
  reportProgress(onProgress, step);
}

function buildStepStart(name, summary) {
  return {
    phase: "start",
    name,
    summary: summary || `正在${name}…`
  };
}

module.exports = {
  reportProgress,
  tracePush,
  buildStepStart
};
