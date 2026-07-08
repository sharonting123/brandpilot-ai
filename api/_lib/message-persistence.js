/**
 * 对话消息持久化：统一用户/助手消息的 content 与 metadata 结构
 */

function sanitizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map(function (item) {
      if (!item || typeof item !== "object") return null;
      return {
        filename: item.filename || item.name || "",
        name: item.name || item.filename || "",
        type: item.type || item.mimeType || "",
        size: item.size != null ? Number(item.size) : null
      };
    })
    .filter(function (item) {
      return item && (item.filename || item.name);
    });
}

function compactAgentTrace(trace = []) {
  if (!Array.isArray(trace)) return [];
  return trace.slice(0, 100).map(function (step) {
    if (!step || typeof step !== "object") return null;
    return {
      name: step.name || "",
      tool: step.tool || "",
      summary: String(step.summary || "").slice(0, 600),
      durationMs: step.durationMs != null ? Number(step.durationMs) : null,
      status: step.status || null,
      group: step.group || null,
      workflow: step.workflow || null,
      routeReason: step.routeReason ? String(step.routeReason).slice(0, 300) : null,
      formulas: Array.isArray(step.formulas)
        ? step.formulas.slice(0, 10).map(function (line) {
            return String(line || "").slice(0, 500);
          })
        : undefined
    };
  }).filter(Boolean);
}

function compactCalculations(calculations = []) {
  if (!Array.isArray(calculations)) return [];
  return calculations.slice(0, 20).map(function (item) {
    if (!item || typeof item !== "object") return null;
    return {
      operator: item.operator,
      metric: item.metric,
      dimension: item.dimension,
      momPct: item.momPct,
      yoyPct: item.yoyPct,
      formulaText: item.formulaText ? String(item.formulaText).slice(0, 1200) : undefined,
      refs: Array.isArray(item.refs) ? item.refs.slice(0, 12) : undefined
    };
  }).filter(Boolean);
}

function buildModelSnapshot(modelConfig = {}) {
  return {
    provider: modelConfig.provider || "openai-compatible",
    model: modelConfig.model || "",
    structuredModel: modelConfig.structuredModel || modelConfig.structured?.model || "",
    maxTokens: modelConfig.maxTokens || null
  };
}

function buildAssistantMessageContent(response = {}) {
  const answer = String(response.answer || "").trim();
  if (answer) return answer;
  const summary =
    response.proposal && response.proposal.summary ? String(response.proposal.summary).trim() : "";
  if (summary) return summary;
  if (response.workflow === "greeting") return "你好！";
  return "分析完成，请查看右侧面板。";
}

function buildUserMessageRecord({ message, attachments = [], brandId, requestId }) {
  const sanitized = sanitizeAttachments(attachments);
  return {
    role: "user",
    content: String(message || "").trim(),
    metadata: {
      persistVersion: 2,
      requestId: requestId || null,
      brandId: brandId || null,
      attachments: sanitized,
      attachmentCount: sanitized.length,
      askedAt: new Date().toISOString()
    }
  };
}

function buildAssistantMessageRecord(response = {}, extras = {}) {
  const {
    requestId,
    brandId,
    userMessage,
    modelConfig,
    messageSavedAt
  } = extras;

  return {
    role: "assistant",
    content: buildAssistantMessageContent(response),
    metadata: {
      persistVersion: 2,
      requestId: requestId || response.requestId || null,
      brandId: brandId || null,
      userMessage: userMessage ? String(userMessage).slice(0, 4000) : null,
      workflow: response.workflow,
      workflowLabel: response.workflowLabel,
      intent: response.intent || null,
      model: buildModelSnapshot(modelConfig || {}),
      tokenUsage: response.tokenUsage || null,
      agentTrace: compactAgentTrace(response.agentTrace),
      proposal: response.proposal || null,
      charts: response.charts || [],
      references: response.references || [],
      dossier: response.dossier || null,
      dataSpec: response.dataSpec || null,
      quality: response.quality || null,
      calculations: compactCalculations(response.calculations),
      warnings: Array.isArray(response.warnings)
        ? response.warnings.slice(0, 20).map(function (item) {
            return String(item || "").slice(0, 500);
          })
        : [],
      dataMode: response.dataMode || null,
      persistence: response.persistence || null,
      capabilities: response.capabilities || null,
      totalDurationMs: response.totalDurationMs != null ? Number(response.totalDurationMs) : null,
      messageSavedAt: messageSavedAt || new Date().toISOString(),
      answerLength: String(response.answer || "").length,
      hasProposal: Boolean(response.proposal),
      chartCount: Array.isArray(response.charts) ? response.charts.length : 0
    }
  };
}

module.exports = {
  buildAssistantMessageContent,
  buildUserMessageRecord,
  buildAssistantMessageRecord,
  buildModelSnapshot,
  sanitizeAttachments,
  compactAgentTrace
};
