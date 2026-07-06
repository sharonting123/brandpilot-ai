/**
 * BrandPilot AI — 前端应用
 * 左对话 + 右可视化面板，支持 Chart.js 图表和 html2pdf PDF 下载。
 */
(function () {
  "use strict";

  // ===== DOM 引用 =====
  var chatMessages = document.getElementById("chatMessages");
  var chatInput = document.getElementById("chatInput");
  var sendButton = document.getElementById("sendButton");
  var brandSelect = document.getElementById("brandSelect");
  var connectionDot = document.getElementById("connectionDot");
  var statusText = document.getElementById("statusText");
  var vizEmpty = document.getElementById("vizEmpty");
  var vizProposal = document.getElementById("vizProposal");
  var proposalTitle = document.getElementById("proposalTitle");
  var proposalBody = document.getElementById("proposalBody");
  var vizCharts = document.getElementById("vizCharts");
  var vizAnswer = document.getElementById("vizAnswer");
  var downloadPdfButton = document.getElementById("downloadPdfButton");
  var modeSwitch = document.getElementById("modeSwitch");
  var arStage = document.getElementById("arStage");
  var arMeta = document.getElementById("arMeta");
  var enterXrButton = document.getElementById("enterXrButton");
  var resetArButton = document.getElementById("resetArButton");
  var dhCanvas = document.getElementById("dhCanvas");
  var dhVideo = document.getElementById("dhVideo");
  var dhAudio = document.getElementById("dhAudio");
  var dhVideoShell = document.getElementById("dhVideoShell");
  var dhAnchorPreview = document.getElementById("dhAnchorPreview");
  var dhSubtitleOverlay = document.getElementById("dhSubtitleOverlay");
  var dhStatus = document.getElementById("dhStatus");
  var dhSubtitle = document.getElementById("dhSubtitle");
  var dhScriptPanel = document.getElementById("dhScriptPanel");
  var dhGenerateButton = document.getElementById("dhGenerateButton");
  var dhSpeakButton = document.getElementById("dhSpeakButton");
  var dhStopButton = document.getElementById("dhStopButton");
  var dhDownloadButton = document.getElementById("dhDownloadButton");

  // ===== 状态 =====
  var isProcessing = false;
  var chartInstances = [];
  var lastResponse = null;
  var currentMode = "analysis";
  var conversationHistory = [];
  var progressTimer = null;
  var progressMessageEl = null;

  var PROGRESS_STEPS = [
    "接收问题，准备路由…",
    "意图识别中…",
    "加载品牌数据 / RAG 知识库…",
    "执行 Agent 工具调用…",
    "生成分析结论与可视化…",
    "写入事件记录…"
  ];

  // ===== 初始化 =====
  function init() {
    checkConnection();
    sendButton.addEventListener("click", handleSend);
    chatInput.addEventListener("keydown", handleInputKey);
    brandSelect.addEventListener("change", handleBrandChange);
    downloadPdfButton.addEventListener("click", handleDownloadPdf);
    bindModeSwitch();
    bindArControls();
    bindDigitalHuman();

    var exampleBtns = document.querySelectorAll(".example-btn");
    exampleBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var prompt = btn.getAttribute("data-prompt");
        if (prompt) {
          chatInput.value = prompt;
          handleSend();
        }
      });
    });

    chatInput.addEventListener("input", autoResizeInput);
  }

  function bindModeSwitch() {
    if (!modeSwitch) return;
    modeSwitch.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchMode(btn.getAttribute("data-mode"));
      });
    });
  }

  function switchMode(mode) {
    currentMode = mode || "analysis";
    modeSwitch.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-mode") === currentMode);
    });
    document.querySelectorAll("[data-mode-panel]").forEach(function (panel) {
      panel.classList.toggle("active", panel.getAttribute("data-mode-panel") === currentMode);
    });

    if (currentMode === "ar") {
      ensureArReady();
      if (lastResponse && lastResponse.scene && window.BrandPilotAR) {
        window.BrandPilotAR.update(lastResponse.scene);
      }
      if (window.BrandPilotAR) window.BrandPilotAR.resize();
    }
  }

  function bindArControls() {
    if (enterXrButton) {
      enterXrButton.addEventListener("click", function () {
        ensureArReady();
        if (!window.BrandPilotAR) return;
        window.BrandPilotAR.enterXR().catch(function (err) {
          alert(err.message || "无法进入 WebXR");
        });
      });
    }
    if (resetArButton) {
      resetArButton.addEventListener("click", function () {
        ensureArReady();
        if (lastResponse && lastResponse.scene && window.BrandPilotAR) {
          window.BrandPilotAR.update(lastResponse.scene);
        }
      });
    }
  }

  function ensureArReady() {
    if (!window.BrandPilotAR || !arStage) return false;
    return window.BrandPilotAR.init(arStage);
  }

  function bindDigitalHuman() {
    if (window.BrandPilotDigitalHuman) {
      window.BrandPilotDigitalHuman.init({
        canvas: dhCanvas,
        videoEl: dhVideo,
        audioEl: dhAudio,
        videoShell: dhVideoShell,
        anchorPreview: dhAnchorPreview,
        subtitleOverlay: dhSubtitleOverlay,
        statusEl: dhStatus,
        subtitleEl: dhSubtitle,
        scriptEl: dhScriptPanel
      });
    }
    if (dhGenerateButton) dhGenerateButton.addEventListener("click", function () {
      if (window.BrandPilotDigitalHuman) window.BrandPilotDigitalHuman.generate();
    });
    if (dhSpeakButton) dhSpeakButton.addEventListener("click", function () {
      if (window.BrandPilotDigitalHuman) window.BrandPilotDigitalHuman.speak();
    });
    if (dhStopButton) dhStopButton.addEventListener("click", function () {
      if (window.BrandPilotDigitalHuman) window.BrandPilotDigitalHuman.stop();
    });
    if (dhDownloadButton) dhDownloadButton.addEventListener("click", function () {
      if (window.BrandPilotDigitalHuman) window.BrandPilotDigitalHuman.downloadVideo();
    });
  }

  // ===== 连接检查 =====
  function checkConnection() {
    fetch("/api/health")
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        if (data.status === "ok") {
          connectionDot.classList.add("connected");
          connectionDot.classList.remove("disconnected");
          statusText.textContent = "就绪";
        } else {
          connectionDot.classList.add("disconnected");
          connectionDot.classList.remove("connected");
          statusText.textContent = "降级";
        }
      })
      .catch(function () {
        connectionDot.classList.add("disconnected");
        connectionDot.classList.remove("connected");
        statusText.textContent = "离线";
      });
  }

  // ===== 发送消息 =====
  function handleSend() {
    if (isProcessing) return;

    var message = chatInput.value.trim();
    if (!message) return;

    // 添加用户消息
    addMessage("user", message);
    chatInput.value = "";
    autoResizeInput();

    conversationHistory.push({ role: "user", content: message });
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    isProcessing = true;
    sendButton.disabled = true;
    statusText.textContent = "分析中";

    var startTime = Date.now();
    var brandHint = brandSelect.value || "haidilao";
    var progressControl = startProgressMessage();

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        brandHint: brandHint,
        history: conversationHistory.slice(0, -1)
      })
    })
      .then(function (resp) {
        return resp.text().then(function (text) {
          var data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (parseError) {
              if (resp.status === 504 || resp.status === 502) {
                throw new Error("分析超时（服务器 " + resp.status + "），请稍后重试或换更短的问题。");
              }
              throw new Error((text.slice(0, 160) || "服务器返回异常") + "（非 JSON 响应）");
            }
          } else {
            data = {};
          }
          if (!resp.ok) {
            throw new Error((data && data.message) || "请求失败 (" + resp.status + ")");
          }
          return data;
        });
      })
      .then(function (data) {
        var latency = Date.now() - startTime;
        lastResponse = data;
        finishProgressMessage(latency, data);
        addAgentMessage(data, latency);
        renderVisualization(data);
        syncExtendedLayers(data);

        conversationHistory.push({
          role: "assistant",
          content: String(data.answer || "").slice(0, 800)
        });
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }
      })
      .catch(function (error) {
        removeProgressMessage();
        addErrorMessage(error.message);
        showEmpty("请求失败，请稍后重试。");
      })
      .finally(function () {
        isProcessing = false;
        sendButton.disabled = false;
        statusText.textContent = "就绪";
      });
  }

  function startProgressMessage() {
    removeProgressMessage();

    var div = document.createElement("div");
    div.className = "message assistant progress";
    div.id = "chatProgressMessage";

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "⏳";

    var body = document.createElement("div");
    body.className = "message-body";

    var content = document.createElement("div");
    content.className = "message-content progress-content";
    content.innerHTML =
      '<div class="progress-title">Agent 正在处理</div>' +
      '<ul class="progress-steps" id="progressSteps"></ul>';

    body.appendChild(content);
    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    progressMessageEl = div;
    scrollToBottom();

    var stepsEl = document.getElementById("progressSteps");
    var stepIndex = 0;

    function renderSteps(activeIndex) {
      if (!stepsEl) return;
      var html = "";
      PROGRESS_STEPS.forEach(function (step, index) {
        var state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
        html +=
          '<li class="progress-step ' + state + '">' +
          '<span class="progress-dot"></span>' +
          '<span class="progress-text">' + step + "</span>" +
          "</li>";
      });
      stepsEl.innerHTML = html;
    }

    renderSteps(0);
    progressTimer = window.setInterval(function () {
      stepIndex = Math.min(stepIndex + 1, PROGRESS_STEPS.length - 1);
      renderSteps(stepIndex);
      scrollToBottom();
    }, 1400);

    return {
      markAllDone: function () {
        renderSteps(PROGRESS_STEPS.length);
      }
    };
  }

  function finishProgressMessage(latencyMs, data) {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }

    if (!progressMessageEl) return;

    var stepsEl = progressMessageEl.querySelector(".progress-steps");
    var titleEl = progressMessageEl.querySelector(".progress-title");
    if (titleEl) {
      titleEl.textContent = "完成 · " + latencyMs + "ms";
    }

    if (stepsEl && data && data.agentTrace && data.agentTrace.length) {
      var html = "";
      data.agentTrace.forEach(function (trace, index) {
        var isLast = index === data.agentTrace.length - 1;
        html +=
          '<li class="progress-step done' + (isLast ? " active" : "") + '">' +
          '<span class="progress-dot"></span>' +
          '<span class="progress-text">' + trace.name +
          (trace.durationMs ? " · " + trace.durationMs + "ms" : "") +
          "</span>" +
          "</li>";
      });
      stepsEl.innerHTML = html;
    } else if (stepsEl) {
      var doneHtml = "";
      PROGRESS_STEPS.forEach(function (step) {
        doneHtml +=
          '<li class="progress-step done">' +
          '<span class="progress-dot"></span>' +
          '<span class="progress-text">' + step + "</span>" +
          "</li>";
      });
      stepsEl.innerHTML = doneHtml;
    }

    progressMessageEl.classList.add("completed");
    scrollToBottom();

    window.setTimeout(removeProgressMessage, 1200);
  }

  function removeProgressMessage() {
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    if (progressMessageEl && progressMessageEl.parentNode) {
      progressMessageEl.parentNode.removeChild(progressMessageEl);
    }
    progressMessageEl = null;
  }

  // ===== 消息渲染 =====
  function addMessage(role, text) {
    var div = document.createElement("div");
    div.className = "message " + role;

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "👤" : "🤖";

    var body = document.createElement("div");
    body.className = "message-body";

    var content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = renderMarkdown(text);

    body.appendChild(content);
    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function addAgentMessage(data, latencyMs) {
    var div = document.createElement("div");
    div.className = "message assistant";

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "🤖";

    var body = document.createElement("div");
    body.className = "message-body";

    // 意图识别标签
    var intentBadge = document.createElement("div");
    intentBadge.className = "intent-badge";
    var confPct = ((data.intent && data.intent.confidence ? data.intent.confidence : 0) * 100).toFixed(0);
    intentBadge.innerHTML =
      '<span class="workflow-tag">' + (data.workflowLabel || data.workflow) + '</span>' +
      '<span class="confidence-tag">置信度 ' + confPct + '%</span>' +
      '<span class="latency-tag">' + latencyMs + 'ms</span>';
    body.appendChild(intentBadge);

    // Agent 执行轨迹
    if (data.agentTrace && data.agentTrace.length > 0) {
      var trace = document.createElement("div");
      trace.className = "agent-trace";
      var traceHtml = "";
      data.agentTrace.forEach(function (t) {
        var toolInfo = t.tool ? ' <span class="trace-tool">🔧 ' + t.tool + '</span>' : "";
        var duration = t.durationMs ? ' <span class="trace-duration">' + t.durationMs + 'ms</span>' : "";
        traceHtml += '<div class="trace-item"><span class="trace-name">' + t.name + '</span>' + toolInfo + duration + '<span class="trace-summary">' + t.summary + '</span></div>';
      });
      trace.innerHTML = traceHtml;
      body.appendChild(trace);
    }

    // 数据模式提醒
    if (data.dataMode === "fixture") {
      var notice = document.createElement("div");
      notice.className = "data-notice";
      notice.textContent = "⚠️ 当前使用演示数据，正式环境请连接 Supabase。";
      body.appendChild(notice);
    }

    // 能力与持久化提示
    var capability = document.createElement("div");
    capability.className = "capability-badge";
    var caps = data.capabilities || {};
    var persist = data.persistence || {};
    capability.innerHTML =
      '<span>NL2SQL</span><span>RAG</span>' +
      (caps.arScene ? "<span>AR</span>" : "") +
      (caps.digitalHuman ? "<span>数字人</span>" : "") +
      '<span class="' + (persist.persisted ? "ok" : "warn") + '">' +
      (persist.persisted ? "事件已落库" : "事件内存缓存") +
      "</span>";
    body.appendChild(capability);

    // 简要回答摘要
    var content = document.createElement("div");
    content.className = "message-content";
    var summary = extractSummary(data.answer);
    content.innerHTML = renderMarkdown(summary);
    body.appendChild(content);

    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function addErrorMessage(errorText) {
    var div = document.createElement("div");
    div.className = "message assistant error";

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "⚠️";

    var body = document.createElement("div");
    body.className = "message-body";

    var content = document.createElement("div");
    content.className = "message-content";
    content.textContent = "出错了：" + errorText;

    body.appendChild(content);
    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  // ===== 可视化渲染 =====
  function renderVisualization(data) {
    destroyCharts();
    vizEmpty.style.display = "none";

    if (data.proposal) {
      vizProposal.style.display = "block";
      renderProposal(data.proposal);
    } else {
      vizProposal.style.display = "none";
    }

    if (!data.proposal && data.answer) {
      vizAnswer.style.display = "block";
      vizAnswer.innerHTML = renderMarkdown(data.answer);
    } else if (data.proposal) {
      vizAnswer.style.display = "none";
    }

    if (data.charts && data.charts.length > 0) {
      renderCharts(data.charts);
    }
  }

  function syncExtendedLayers(data) {
    if (data.scene) {
      ensureArReady();
      if (window.BrandPilotAR) {
        window.BrandPilotAR.update(data.scene);
        if (arMeta) {
          arMeta.textContent =
            (data.scene.brandName || "品牌") +
            " · " +
            ((data.scene.cities && data.scene.cities.length) || 0) +
            " 座城市柱 · 机会分 " +
            (data.scene.opportunityScore || "-");
        }
      }
    }

    if (window.BrandPilotDigitalHuman) {
      window.BrandPilotDigitalHuman.setScript(data.liveScript || null);
    }
  }

  function renderProposal(proposal) {
    proposalTitle.textContent = proposal.title || "经营提案";

    var html = "";

    // 机会评分
    if (proposal.opportunityScore) {
      html +=
        '<div class="score-block">' +
        '<span class="score-label">机会评分</span>' +
        '<strong class="score-value">' + proposal.opportunityScore + '</strong>' +
        '</div>';
    }

    // 摘要
    if (proposal.summary) {
      html += '<div class="proposal-summary">' + proposal.summary + '</div>';
    }

    // 指标卡
    if (proposal.metrics && proposal.metrics.length > 0) {
      html += '<div class="metric-cards">';
      proposal.metrics.forEach(function (m) {
        html +=
          '<div class="metric-card">' +
          '<span class="metric-label">' + m.label + '</span>' +
          '<strong class="metric-value">' + m.value + '</strong>' +
          (m.delta ? '<span class="metric-delta">' + m.delta + '</span>' : "") +
          '</div>';
      });
      html += '</div>';
    }

    // 洞察
    if (proposal.insights && proposal.insights.length > 0) {
      html += '<div class="proposal-section"><h3>📌 关键洞察</h3><ul class="insight-list">';
      proposal.insights.forEach(function (insight) {
        html += '<li>' + insight + '</li>';
      });
      html += '</ul></div>';
    }

    // 推荐动作
    if (proposal.actions && proposal.actions.length > 0) {
      html += '<div class="proposal-section"><h3>🎯 推荐动作</h3><div class="action-list">';
      proposal.actions.forEach(function (action, i) {
        html += '<div class="action-item"><span class="action-num">' + (i + 1) + '</span>' + action + '</div>';
      });
      html += '</div></div>';
    }

    // 时间线
    if (proposal.timeline && proposal.timeline.length > 0) {
      html += '<div class="proposal-section"><h3>📅 推进时间线</h3><div class="timeline">';
      proposal.timeline.forEach(function (t) {
        html +=
          '<div class="timeline-item">' +
          '<div class="timeline-dot"></div>' +
          '<div class="timeline-content"><strong>' + t.title + '</strong><p>' + t.body + '</p></div>' +
          '</div>';
      });
      html += '</div></div>';
    }

    // 风险提示
    if (proposal.risks && proposal.risks.length > 0) {
      html += '<div class="proposal-section"><h3>⚠️ 风险提示</h3><ul class="risk-list">';
      proposal.risks.forEach(function (risk) {
        html += '<li>' + risk + '</li>';
      });
      html += '</ul></div>';
    }

    // 资产清单
    if (proposal.assets && proposal.assets.length > 0) {
      html += '<div class="proposal-section"><h3>📦 提案资产</h3><div class="asset-list">';
      proposal.assets.forEach(function (asset) {
        html +=
          '<div class="asset-item">' +
          '<strong>' + asset.title + '</strong>' +
          '<p>' + asset.body + '</p>' +
          '</div>';
      });
      html += '</div></div>';
    }

    proposalBody.innerHTML = html;
  }

  function renderCharts(charts) {
    vizCharts.innerHTML = "";
    vizCharts.style.display = "block";

    charts.forEach(function (chartDef, index) {
      var wrapper = document.createElement("div");
      wrapper.className = "chart-wrapper";

      var title = document.createElement("h3");
      title.className = "chart-title";
      title.textContent = chartDef.title || "图表 " + (index + 1);
      wrapper.appendChild(title);

      var canvas = document.createElement("canvas");
      canvas.id = "chart-" + index;
      wrapper.appendChild(canvas);
      vizCharts.appendChild(wrapper);

      try {
        var ctx = canvas.getContext("2d");
        var config = buildChartConfig(chartDef);
        var chartInstance = new Chart(ctx, config);
        chartInstances.push(chartInstance);
      } catch (err) {
        console.warn("图表渲染失败:", err.message);
      }
    });
  }

  function buildChartConfig(chartDef) {
    var type = chartDef.type;
    var data = chartDef.data;

    var datasets = (data.datasets || []).map(function (ds) {
      return {
        label: ds.label,
        data: ds.data,
        borderWidth: 2,
        tension: type === "line" ? 0.3 : 0,
        fill: type === "line"
      };
    });

    // 根据类型选择 Chart.js 类型
    var chartType = "bar";
    if (type === "line") chartType = "line";
    else if (type === "funnel") chartType = "bar";
    else if (type === "comparison") chartType = "bar";
    else if (type === "bar") chartType = "bar";

    return {
      type: chartType,
      data: { labels: data.labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, padding: 20, font: { family: "'Microsoft YaHei', 'PingFang SC', sans-serif" } }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ": " + (ctx.parsed.y ? ctx.parsed.y.toLocaleString() : ctx.parsed.y);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return value >= 10000 ? (value / 10000).toFixed(0) + "万" : value.toLocaleString();
              }
            }
          }
        }
      }
    };
  }

  // ===== PDF 下载 =====
  function handleDownloadPdf() {
    if (!window.html2pdf) {
      alert("PDF 组件未加载，请刷新页面后重试。");
      return;
    }

    var element = document.getElementById("vizProposal");
    if (!element || element.style.display === "none") {
      alert("当前没有可下载的提案内容。");
      return;
    }

    showPdfStatus("正在生成 PDF…");

    try {
      var opt = {
        margin: [10, 10, 10, 10],
        filename: "BrandPilot_" + new Date().toISOString().slice(0, 10) + ".pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait"
        }
      };

      html2pdf().set(opt).from(element).save().then(function () {
        showPdfStatus("就绪");
      }).catch(function (error) {
        alert("PDF 生成失败：" + error.message);
        showPdfStatus("就绪");
      });
    } catch (error) {
      alert("PDF 生成失败：" + error.message);
      showPdfStatus("就绪");
    }
  }

  function showPdfStatus(text) {
    if (statusText) statusText.textContent = text || "就绪";
  }

  // ===== 辅助函数 =====
  function handleInputKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleBrandChange() {
    var sel = brandSelect.options[brandSelect.selectedIndex];
    addMessage("assistant", "已切换到「" + sel.text + "」品牌。目前仅支持海底捞的完整数据，其他品牌数据正在扩展中。");
  }

  function autoResizeInput() {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
  }

  function scrollToBottom() {
    if (!chatMessages) return;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showEmpty(text) {
    vizEmpty.style.display = "flex";
    vizEmpty.querySelector("p").textContent = text;
  }

  function destroyCharts() {
    chartInstances.forEach(function (chart) { chart.destroy(); });
    chartInstances = [];
  }

  function extractSummary(text) {
    if (!text) return "";
    var plain = text.replace(/[#*>\\-\\\`\\n\\r]/g, " ").replace(/\\s+/g, " ").trim();
    return plain.length > 500 ? plain.slice(0, 500) + "..." : plain;
  }

  function renderMarkdown(text) {
    if (!text) return "";
    var html = text;

    // 标题
    html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");

    // 粗体
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // 列表
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

    // 引用
    html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

    // 表格
    html = html.replace(/^\|(.+)\|$/gm, function (match) {
      var cells = match.split("|").filter(function (c) { return c.trim(); });
      var isHeader = match.indexOf("---") > -1;
      if (isHeader) return "";
      var tag = match.replace(/^\|/, "").replace(/\|$/, "").indexOf(":---") > -1 ? "" : "";
      return "<tr>" + cells.map(function (c) {
        return isHeader ? "<th>" + c.trim() + "</th>" : "<td>" + c.trim() + "</td>";
      }).join("") + "</tr>";
    });

    // 分隔线
    html = html.replace(/^---$/gm, "<hr>");

    // 换行
    html = html.replace(/\n\n/g, "<br><br>");
    html = html.replace(/\n/g, "<br>");

    // 行内代码
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    return html;
  }

  // ===== 启动 =====
  document.addEventListener("DOMContentLoaded", init);
})();
