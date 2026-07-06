/**
 * 汇总 LLM Token 用量（兼容 AI SDK 不同字段名）
 */

function emptyTokenUsage() {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function normalizeTokenUsage(usage) {
  if (!usage || typeof usage !== "object") return emptyTokenUsage();
  const promptTokens = Number(
    usage.promptTokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? 0
  );
  const completionTokens = Number(
    usage.completionTokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.output_tokens ?? 0
  );
  const totalTokens = Number(
    usage.totalTokens ?? usage.total_tokens ?? promptTokens + completionTokens
  );
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : promptTokens + completionTokens
  };
}

function mergeTokenUsage(base, extra) {
  const a = normalizeTokenUsage(base);
  const b = normalizeTokenUsage(extra);
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

function extractUsageFromGenerateResult(result) {
  if (!result) return emptyTokenUsage();
  if (result.totalUsage) return normalizeTokenUsage(result.totalUsage);
  if (Array.isArray(result.steps) && result.steps.length) {
    return result.steps.reduce(
      (acc, step) => mergeTokenUsage(acc, step.usage),
      normalizeTokenUsage(result.usage)
    );
  }
  return normalizeTokenUsage(result.usage);
}

function formatTokenUsageLabel(usage) {
  const u = normalizeTokenUsage(usage);
  if (!u.promptTokens && !u.completionTokens && !u.totalTokens) return "";
  const parts = [];
  if (u.promptTokens) parts.push("输入 " + u.promptTokens.toLocaleString("zh-CN"));
  if (u.completionTokens) parts.push("输出 " + u.completionTokens.toLocaleString("zh-CN"));
  if (u.totalTokens) parts.push("合计 " + u.totalTokens.toLocaleString("zh-CN"));
  return parts.join(" · ");
}

module.exports = {
  emptyTokenUsage,
  normalizeTokenUsage,
  mergeTokenUsage,
  extractUsageFromGenerateResult,
  formatTokenUsageLabel
};
