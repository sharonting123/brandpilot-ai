/**
 * 外部 Agent 侧车客户端
 * 支持两种对接模式：
 * 1. tool-service 直连 — 调用 /v1/tool/report 生成 HTML/PPT 报告（轻量，仅需 Python 工具服务）
 * 2. orchestrator — 调用 /AutoAgent 完整 Plan-Solve/ReAct 编排（需 Java 编排后端）
 */

const http = require("http");
const https = require("https");

function getSidecarConfig(env = process.env) {
  const toolBaseUrl = (env.SIDECAR_TOOL_URL || "http://127.0.0.1:1601").replace(/\/$/, "");
  const backendBaseUrl = (env.SIDECAR_BACKEND_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
  const enabled = env.SIDECAR_ENABLED === "true";
  const reportEnabled = env.SIDECAR_REPORT_ENABLED !== "false";
  const timeoutMs = clampNumber(env.SIDECAR_TIMEOUT_MS, 5000, 300000, 120000);

  return {
    enabled,
    reportEnabled,
    toolBaseUrl,
    backendBaseUrl,
    timeoutMs,
    reportFileType: env.SIDECAR_REPORT_FILE_TYPE || "html",
    templateType: env.SIDECAR_TEMPLATE_TYPE || "fix"
  };
}

async function probeSidecarHealth(config = getSidecarConfig()) {
  const [tool, backend] = await Promise.all([
    probeEndpoint(`${config.toolBaseUrl}/docs`, config.timeoutMs),
    probeEndpoint(`${config.backendBaseUrl}/`, config.timeoutMs)
  ]);

  return {
    enabled: config.enabled,
    tool: {
      url: config.toolBaseUrl,
      reachable: tool.ok,
      statusCode: tool.statusCode,
      error: tool.error || null
    },
    backend: {
      url: config.backendBaseUrl,
      reachable: backend.ok,
      statusCode: backend.statusCode,
      error: backend.error || null
    },
    readyForReport: tool.ok,
    readyForOrchestration: backend.ok && tool.ok
  };
}

async function requestToolReport({
  task,
  requestId,
  fileType = "html",
  templateType,
  config = getSidecarConfig()
}) {
  const resolvedTemplateType = templateType || config.templateType || "html";
  if (!task || !String(task).trim()) {
    throw new Error("侧车报告 task 不能为空。");
  }

  const payload = {
    requestId: requestId || makeRequestId("sc_rpt"),
    task: String(task).trim(),
    fileType,
    templateType: resolvedTemplateType,
    fileName: `brandpilot_${Date.now()}.${fileType === "ppt" ? "html" : fileType}`,
    stream: false,
    streamMode: { mode: "general" }
  };

  const response = await postJson(`${config.toolBaseUrl}/v1/tool/report`, payload, config.timeoutMs);
  if (!response || response.code !== 200) {
    throw new Error(`侧车报告生成失败：${JSON.stringify(response || {})}`);
  }

  return {
    ok: true,
    source: "tool-service",
    requestId: payload.requestId,
    fileType,
    html: fileType === "html" || fileType === "ppt" ? response.data : null,
    markdown: fileType === "markdown" ? response.data : null,
    fileInfo: response.fileInfo || [],
    contentLength: String(response.data || "").length
  };
}

async function runOrchestrator({
  query,
  requestId,
  outputStyle = "html",
  agentType = 5,
  config = getSidecarConfig()
}) {
  if (!query || !String(query).trim()) {
    throw new Error("侧车编排 query 不能为空。");
  }

  const payload = {
    requestId: requestId || makeRequestId("sc_orch"),
    query: String(query).trim(),
    agentType,
    outputStyle,
    isStream: true
  };

  const events = await postSse(`${config.backendBaseUrl}/AutoAgent`, payload, config.timeoutMs);
  const resultEvent = [...events].reverse().find((item) => item.messageType === "result");
  const htmlEvent = events.filter((item) => item.messageType === "html").pop();
  const fileEvents = events.filter((item) => item.messageType === "file");

  return {
    ok: true,
    source: "orchestrator",
    requestId: payload.requestId,
    agentType,
    outputStyle,
    result: (resultEvent && (resultEvent.result || resultEvent.message)) || null,
    html: (htmlEvent && (htmlEvent.result || htmlEvent.message)) || null,
    files: fileEvents.map((item) => item.result || item.message).filter(Boolean),
    eventCount: events.length,
    planSteps: events.filter((item) => item.messageType === "plan").length,
    toolRuns: events.filter((item) => ["tool_result", "deep_search", "code", "html", "file"].includes(item.messageType)).length
  };
}

function buildReportTaskFromWorkflowState(state) {
  const outputs = (state && state.outputs) || {};
  const brief = (outputs["brief-agent"] && outputs["brief-agent"].brief) || {};
  const analysis = outputs["business-analysis-agent"] || {};
  const strategy = outputs["strategy-agent"] || {};
  const attribution = outputs["funnel-attribution-agent"] || {};
  const quality = outputs["quality-agent"] || {};

  const lines = [
    `# ${brief.brandName || "海底捞"} ${brief.period || "2026 H1"} 半年度品牌经营提案`,
    "",
    "## 提案目标",
    brief.goal || "基于真实经营数据，输出可交付的半年度 KA 品牌提案。",
    "",
    "## 经营主矛盾",
    analysis.primaryTension || analysis.summary || "待补充",
    "",
    "## 关键指标",
    formatBulletList(analysis.metricCards || analysis.metrics || []),
    "",
    "## 深度洞察",
    formatBulletList(analysis.insights || []),
    "",
    "## 链路归因",
    attribution.summary || "搜索→POI→套餐→下单→支付→核销漏斗分析已完成。",
    attribution.bottleneck ? `- 最大漏损：${attribution.bottleneck.from} → ${attribution.bottleneck.to}（${formatPercent(attribution.bottleneck.conversion)}）` : "",
    "",
    "## 推荐动作",
    formatBulletList(strategy.actions || []),
    "",
    "## 推进时间线",
    formatTimeline(strategy.timeline || []),
    "",
    "## 质检结论",
    formatQualityGates(quality.gates || []),
    "",
    "## 输出要求",
    "- 生成一份面向 KA 客户的 HTML 经营提案报告",
    "- 保留数据口径限制，不编造外部事实",
    "- 突出 GTV 三因子、take rate、广告渗透、核销率与城市分层",
    "- 包含指标卡、洞察、策略动作、时间线和风险提示"
  ];

  return lines.filter(Boolean).join("\n");
}

function buildOrchestratorQueryFromWorkflowState(state) {
  const outputs = (state && state.outputs) || {};
  const brief = (outputs["brief-agent"] && outputs["brief-agent"].brief) || {};
  const brand = brief.brandName || "海底捞";
  const period = brief.period || "2026 H1";
  return [
    `请为${brand}制作${period}半年度品牌经营提案报告（HTML 格式）。`,
    "基于以下已完成的多 Agent 分析结果，生成完整、可交付的经营提案网页：",
    buildReportTaskFromWorkflowState(state)
  ].join("\n\n");
}

async function enrichWorkflowWithSidecarReport(state, env = process.env) {
  const config = getSidecarConfig(env);
  if (!config.enabled || !config.reportEnabled) {
    return { skipped: true, reason: "SIDECAR_ENABLED 未开启或 report 已禁用" };
  }

  const health = await probeSidecarHealth(config);
  const task = buildReportTaskFromWorkflowState(state);
  const requestId = state.requestId || makeRequestId("bp_sc");

  if (health.readyForReport) {
    const report = await requestToolReport({
      task,
      requestId,
      fileType: config.reportFileType,
      config
    });
    return {
      mode: "tool-report",
      health,
      report
    };
  }

  if (health.backend.reachable) {
    const orchestration = await runOrchestrator({
      query: buildOrchestratorQueryFromWorkflowState(state),
      requestId,
      outputStyle: config.reportFileType === "markdown" ? "docs" : "html",
      agentType: 3,
      config
    });
    return {
      mode: "orchestrator-run",
      health,
      orchestration
    };
  }

  throw new Error(
    `侧车服务不可用：tool=${health.tool.reachable ? "ok" : "down"}, backend=${health.backend.reachable ? "ok" : "down"}`
  );
}

function probeEndpoint(url, timeoutMs) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        timeout: timeoutMs
      },
      (res) => {
        res.resume();
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, statusCode: res.statusCode });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.end();
  });
}

function postJson(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(new Error(`JSON 解析失败: ${text.slice(0, 500)}`));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`请求超时 (${timeoutMs}ms): ${url}`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function postSse(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const transport = parsed.protocol === "https:" ? https : http;
    const events = [];
    let buffer = "";

    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: timeoutMs
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => reject(new Error(`SSE HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString("utf8").slice(0, 500)}`)));
          return;
        }

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          buffer += chunk;
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const dataLine = part
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (!dataLine) continue;
            const data = dataLine.slice(5).trim();
            if (!data || data === "[DONE]" || data === "heartbeat") continue;
            try {
              events.push(JSON.parse(data));
            } catch (_error) {
              events.push({ raw: data });
            }
          }
        });
        res.on("end", () => resolve(events));
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`SSE 超时 (${timeoutMs}ms): ${url}`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function formatBulletList(items) {
  if (!Array.isArray(items) || !items.length) return "- 暂无";
  return items
    .map((item) => {
      if (typeof item === "string") return `- ${item}`;
      const label = item.label || item.title || item.name || item.metric || "项";
      const value = item.value || item.text || item.description || item.summary || "";
      return value ? `- ${label}：${value}` : `- ${label}`;
    })
    .join("\n");
}

function formatTimeline(items) {
  if (!Array.isArray(items) || !items.length) return "- 暂无";
  return items
    .map((item) => {
      const phase = item.phase || item.title || item.name || "阶段";
      const focus = item.focus || item.summary || item.description || "";
      return focus ? `- ${phase}：${focus}` : `- ${phase}`;
    })
    .join("\n");
}

function formatQualityGates(gates) {
  if (!Array.isArray(gates) || !gates.length) return "- 暂无质检门控";
  return gates
    .map((gate) => `- ${gate.name || gate.id}：${gate.passed ? "通过" : "未通过"}${gate.detail ? `（${gate.detail}）` : ""}`)
    .join("\n");
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return `${(number * 100).toFixed(1)}%`;
}

function makeRequestId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function buildTaskFromClientPayload(body) {
  const brand = (body.brand && body.brand.name) || body.brandName || "海底捞";
  const period = body.period || "2026 H1";
  const proposal = body.proposal || {};
  const lines = [
    `# ${brand} ${period} 半年度品牌经营提案`,
    "",
    "## 经营摘要",
    proposal.summary || body.summary || "基于 BrandPilot 分析结果生成正式 HTML 报告。",
    ""
  ];

  if (Array.isArray(proposal.metrics) && proposal.metrics.length) {
    lines.push("## 关键指标");
    proposal.metrics.forEach((item) => {
      lines.push(`- ${item.label || item.name || "指标"}：${item.value || "-"}${item.delta ? "（" + item.delta + "）" : ""}`);
    });
    lines.push("");
  }

  if (Array.isArray(proposal.insights) && proposal.insights.length) {
    lines.push("## 深度洞察");
    proposal.insights.forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push("");
  }

  if (Array.isArray(proposal.actions) && proposal.actions.length) {
    lines.push("## 推荐动作");
    proposal.actions.forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push("");
  }

  const analysisText = String(body.summary || "").trim();
  if (analysisText && analysisText !== (proposal.summary || "").trim()) {
    lines.push("## 完整分析");
    lines.push(analysisText);
    lines.push("");
  }

  if (Array.isArray(body.charts) && body.charts.length) {
    lines.push("## 图表数据（放在完整分析文字之后渲染）");
    body.charts.forEach((chart) => {
      const labels = (chart.data && chart.data.labels) || [];
      const values = (chart.data && chart.data.datasets && chart.data.datasets[0] && chart.data.datasets[0].data) || [];
      lines.push(`### ${chart.title || "图表"}`);
      labels.forEach((label, index) => {
        lines.push(`- ${label}：${values[index] != null ? values[index] : "-"}`);
      });
      lines.push("");
    });
  }

  lines.push(
    "## 输出要求",
    "- 生成面向 KA 客户的 HTML 经营提案报告（固定骨架模板）",
    "- 只使用上文提供的真实数据，禁止编造外部事实",
    "- 页面顺序：指标卡与文字分析在前，ECharts 图表章节放在完整分析文字之后",
    "- 包含指标卡、ECharts 图表、策略动作与风险提示"
  );

  return lines.join("\n");
}

module.exports = {
  buildOrchestratorQueryFromWorkflowState,
  buildReportTaskFromWorkflowState,
  buildTaskFromClientPayload,
  enrichWorkflowWithSidecarReport,
  getSidecarConfig,
  probeSidecarHealth,
  requestToolReport,
  runOrchestrator
};
