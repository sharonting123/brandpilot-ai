/**
 * Agent 事件持久化
 * 将提案与 agentTrace 写入 Supabase brand_proposals / agent_events。
 * Supabase 不可用时降级为内存缓冲，保证主流程不失败。
 */

const { getSupabaseConfig } = require("./env");

const memoryBuffer = [];
const MAX_MEMORY = 200;

async function persistWorkflowRun(payload = {}) {
  const {
    requestId,
    brandId = "haidilao",
    brandName = "海底捞",
    workflow,
    message,
    intent,
    agentTrace = [],
    proposal = null,
    answer = "",
    dataMode = "fixture",
    warnings = [],
    totalDurationMs = 0
  } = payload;

  const eventRecord = {
    requestId,
    brandId,
    brandName,
    workflow,
    message,
    intent,
    agentTrace,
    proposal,
    answerSummary: String(answer || "").slice(0, 500),
    dataMode,
    warnings,
    totalDurationMs,
    createdAt: new Date().toISOString(),
    persisted: false,
    proposalId: null,
    eventIds: [],
    mode: "memory"
  };

  const config = getSupabaseConfig(process.env);
  if (!config.configured) {
    pushMemory(eventRecord);
    return {
      ...eventRecord,
      warning: "Supabase 未配置，Agent 事件仅缓存在内存中。"
    };
  }

  try {
    const endpoint = config.url.replace(/\/$/, "");
    const headers = {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };

    let proposalId = null;
    if (proposal) {
      const proposalRows = await supabaseInsert(
        `${endpoint}/rest/v1/brand_proposals`,
        headers,
        {
          brand_id: brandId,
          brand_name: brandName,
          title: proposal.title || `${brandName} ${workflow} 提案`,
          opportunity_score: clampScore(proposal.opportunityScore),
          summary: proposal.summary || String(answer || "").slice(0, 300),
          payload: {
            requestId,
            workflow,
            intent,
            proposal,
            charts: payload.charts || [],
            dataMode,
            warnings,
            totalDurationMs
          }
        },
        config.timeoutMs
      );
      proposalId = proposalRows[0] && proposalRows[0].id ? proposalRows[0].id : null;
    }

    const eventIds = [];
    const events = [
      {
        proposal_id: proposalId,
        agent_name: "intent-router",
        event_type: "intent_recognized",
        event_payload: {
          requestId,
          workflow,
          intent,
          message,
          dataMode
        }
      },
      ...agentTrace.map((trace) => ({
        proposal_id: proposalId,
        agent_name: trace.name || "agent",
        event_type: "agent_step",
        event_payload: {
          requestId,
          workflow,
          tool: trace.tool || null,
          summary: trace.summary || "",
          durationMs: trace.durationMs || 0
        }
      })),
      {
        proposal_id: proposalId,
        agent_name: "chat-orchestrator",
        event_type: "workflow_completed",
        event_payload: {
          requestId,
          workflow,
          totalDurationMs,
          answerSummary: String(answer || "").slice(0, 500),
          warningCount: warnings.length
        }
      }
    ];

    for (const event of events) {
      const rows = await supabaseInsert(`${endpoint}/rest/v1/agent_events`, headers, event, config.timeoutMs);
      if (rows[0] && rows[0].id) eventIds.push(rows[0].id);
    }

    eventRecord.persisted = true;
    eventRecord.proposalId = proposalId;
    eventRecord.eventIds = eventIds;
    eventRecord.mode = "supabase";
    pushMemory(eventRecord);
    return eventRecord;
  } catch (error) {
    eventRecord.warning = `事件持久化失败，已降级内存：${error.message}`;
    pushMemory(eventRecord);
    return eventRecord;
  }
}

async function listRecentEvents(limit = 20) {
  const config = getSupabaseConfig(process.env);
  if (!config.configured) {
    return {
      mode: "memory",
      events: memoryBuffer.slice(0, limit)
    };
  }

  try {
    const endpoint = config.url.replace(/\/$/, "");
    const headers = {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`
    };
    const url =
      `${endpoint}/rest/v1/agent_events?select=id,proposal_id,agent_name,event_type,event_payload,created_at` +
      `&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 100))}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(config.timeoutMs)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rows = await response.json();
    return {
      mode: "supabase",
      events: Array.isArray(rows) ? rows : []
    };
  } catch (error) {
    return {
      mode: "memory",
      warning: error.message,
      events: memoryBuffer.slice(0, limit)
    };
  }
}

async function supabaseInsert(url, headers, body, timeoutMs) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`insert failed HTTP ${response.status} ${text.slice(0, 120)}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function pushMemory(record) {
  memoryBuffer.unshift(record);
  if (memoryBuffer.length > MAX_MEMORY) memoryBuffer.length = MAX_MEMORY;
}

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

module.exports = {
  persistWorkflowRun,
  listRecentEvents,
  memoryBuffer
};
