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
  var vizToolbar = document.getElementById("vizToolbar");
  var vizToolbarTitle = document.getElementById("vizToolbarTitle");
  var vizToolbarSubtitle = document.getElementById("vizToolbarSubtitle");
  var vizLivePanel = document.getElementById("vizLivePanel");
  var vizLiveFilter = document.getElementById("vizLiveFilter");
  var vizLiveScope = document.getElementById("vizLiveScope");
  var vizLiveCities = document.getElementById("vizLiveCities");
  var vizProposal = document.getElementById("vizProposal");
  var proposalTitle = document.getElementById("proposalTitle");
  var proposalBody = document.getElementById("proposalBody");
  var vizCharts = document.getElementById("vizCharts");
  var vizAnswer = document.getElementById("vizAnswer");
  var downloadPdfButton = document.getElementById("downloadPdfButton");
  var downloadWordButton = document.getElementById("downloadWordButton");
  var downloadMarkdownButton = document.getElementById("downloadMarkdownButton");
  var modeSwitch = document.getElementById("modeSwitch");
  var arStage = document.getElementById("arStage");
  var arMeta = document.getElementById("arMeta");
  var enterXrButton = document.getElementById("enterXrButton");
  var resetArButton = document.getElementById("resetArButton");
  var authGuest = document.getElementById("authGuest");
  var authUser = document.getElementById("authUser");
  var authUserName = document.getElementById("authUserName");
  var logoutButton = document.getElementById("logoutButton");
  var sessionSidebar = document.getElementById("sessionSidebar");
  var sessionList = document.getElementById("sessionList");
  var newSessionButton = document.getElementById("newSessionButton");
  var appContainer = document.getElementById("appContainer");

  // ===== 状态 =====
  var isProcessing = false;
  var resultPanelsEnabled = false;
  var chartInstances = [];
  var chartExports = [];
  var currentDataSpec = null;
  var lastResponse = null;
  var lastChartDefs = [];
  var currentMode = "analysis";
  var conversationHistory = [];
  var progressMessageEl = null;
  var streamAnswerText = "";
  var currentSessionId = null;

  function assistant() {
    return window.BrandPilotAssistant || null;
  }

  function assistantName() {
    var a = assistant();
    return (a && a.name) || "悦悦";
  }

  function createAssistantAvatar() {
    var a = assistant();
    if (a && a.createAvatarElement) return a.createAvatarElement();
    var el = document.createElement("div");
    el.className = "message-avatar";
    el.textContent = "悦";
    return el;
  }

  function friendlyStepName(name) {
    var a = assistant();
    return a ? a.friendlyStepName(name) : String(name || "处理中");
  }

  function friendlyStepSummary(step) {
    var a = assistant();
    return a ? a.friendlyStepSummary(step) : String((step && step.summary) || "");
  }

  function friendlyModeLabel(modeOrLabel) {
    var a = assistant();
    return a ? a.friendlyModeLabel(modeOrLabel) : String(modeOrLabel || "");
  }

  function friendlyDuration(ms) {
    var a = assistant();
    return a ? a.friendlyDuration(ms) : "";
  }

  function formatTokenUsageLabel(usage) {
    if (!usage || typeof usage !== "object") return "";
    var promptTokens = Number(usage.promptTokens || usage.inputTokens || 0);
    var completionTokens = Number(usage.completionTokens || usage.outputTokens || 0);
    var totalTokens = Number(usage.totalTokens || promptTokens + completionTokens);
    if (!promptTokens && !completionTokens && !totalTokens) return "";
    var parts = [];
    if (promptTokens) parts.push("输入 " + promptTokens.toLocaleString("zh-CN"));
    if (completionTokens) parts.push("输出 " + completionTokens.toLocaleString("zh-CN"));
    if (totalTokens) parts.push("合计 " + totalTokens.toLocaleString("zh-CN"));
    return parts.join(" · ");
  }

  function renderTraceStepsHtml(traces, options) {
    if (!traces || !traces.length) return "";
    var compact = options && options.compact;
    var html = "";
    traces.forEach(function (t, index) {
      var isLast = index === traces.length - 1;
      var stepName = friendlyStepName(t.name);
      var stepSummary = friendlyStepSummary(t);
      var duration = t.durationMs
        ? '<span class="trace-duration">' + escapeHtml(friendlyDuration(t.durationMs)) + "</span>"
        : "";
      var summary = stepSummary
        ? '<span class="trace-summary">' + escapeHtml(stepSummary) + "</span>"
        : "";

      if (compact) {
        html +=
          '<li class="progress-step done' + (isLast ? " active" : "") + '">' +
          '<span class="progress-dot"></span>' +
          '<span class="progress-text">' +
          '<strong>' + escapeHtml(stepName) + "</strong> " +
          duration +
          (summary ? "<br>" + summary : "") +
          "</span></li>";
      } else {
        html +=
          '<div class="trace-item">' +
          '<span class="trace-name">' + escapeHtml(stepName) + "</span> " +
          duration + summary +
          "</div>";
      }
    });
    return html;
  }

  // ===== 初始化 =====
  function init() {
    checkConnection();
    bindAuth();
    sendButton.addEventListener("click", handleSend);
    chatInput.addEventListener("keydown", handleInputKey);
    brandSelect.addEventListener("change", handleBrandChange);
    if (downloadPdfButton) downloadPdfButton.addEventListener("click", handleDownloadPdf);
    if (downloadWordButton) downloadWordButton.addEventListener("click", handleDownloadWord);
    if (downloadMarkdownButton) downloadMarkdownButton.addEventListener("click", handleDownloadMarkdown);
    bindModeSwitch();
    bindArControls();
    bindExampleButtons();
    chatInput.addEventListener("input", autoResizeInput);

    if (window.BrandPilotAuth) {
      window.BrandPilotAuth.loadMe().then(function () {
        if (!window.BrandPilotAuth.isLoggedIn()) {
          redirectToLogin();
          return;
        }
        document.body.classList.remove("auth-pending");
        refreshAuthUI();
        return createNewSession().then(function () {
          setResultPanelsEnabled(false);
        });
      });
    } else {
      redirectToLogin();
    }
  }

  function loginPageUrl(options) {
    options = options || {};
    var params = new URLSearchParams();
    if (options.tab) params.set("tab", options.tab);
    params.set("next", options.next || window.location.pathname + window.location.search);
    var qs = params.toString();
    return "/login" + (qs ? "?" + qs : "");
  }

  function redirectToLogin(tab) {
    window.location.href = loginPageUrl({ tab: tab });
  }

  function bindAuth() {
    if (logoutButton) {
      logoutButton.addEventListener("click", function () {
        if (window.BrandPilotAuth) window.BrandPilotAuth.logout();
        currentSessionId = null;
        conversationHistory = [];
        window.location.href = "/login";
      });
    }

    if (newSessionButton) {
      newSessionButton.addEventListener("click", function () {
        createNewSession();
      });
    }
  }

  function refreshAuthUI() {
    var loggedIn = window.BrandPilotAuth && window.BrandPilotAuth.isLoggedIn();
    if (authGuest) authGuest.hidden = loggedIn;
    if (authUser) authUser.hidden = !loggedIn;
    if (sessionSidebar) sessionSidebar.hidden = !loggedIn;
    if (appContainer) {
      appContainer.classList.toggle("app-container--no-history", !loggedIn);
    }
    if (loggedIn && authUserName) {
      var user = window.BrandPilotAuth.getUser();
      authUserName.textContent = (user && user.username) || "已登录";
    }
  }

  function refreshSessionList() {
    if (!sessionList || !window.BrandPilotAuth || !window.BrandPilotAuth.isLoggedIn()) {
      if (sessionList) sessionList.innerHTML = '<p class="session-empty">登录后查看历史</p>';
      return Promise.resolve();
    }
    return window.BrandPilotAuth.listSessions(40).then(function (data) {
      var sessions = data.sessions || [];
      if (!sessions.length) {
        sessionList.innerHTML = '<p class="session-empty">暂无历史会话</p>';
        return;
      }
      var html = "";
      sessions.forEach(function (session) {
        var active = session.id === currentSessionId ? " active" : "";
        var time = session.updatedAt ? new Date(session.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        html +=
          '<button type="button" class="session-item' + active + '" data-session-id="' + session.id + '">' +
          '<span class="session-item-title">' + escapeHtml(session.title || "新对话") + "</span>" +
          '<span class="session-item-time">' + time + "</span></button>";
      });
      sessionList.innerHTML = html;
      sessionList.querySelectorAll(".session-item").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-session-id");
          if (id) selectSession(id);
        });
      });
    }).catch(function () {
      sessionList.innerHTML = '<p class="session-empty">加载失败</p>';
    });
  }

  function createNewSession(skipReset) {
    if (!window.BrandPilotAuth || !window.BrandPilotAuth.isLoggedIn()) {
      redirectToLogin();
      return Promise.resolve();
    }
    var brandId = brandSelect.value || "haidilao";
    return window.BrandPilotAuth.createSession(brandId, "新对话").then(function (data) {
      currentSessionId = data.session && data.session.id;
      if (!skipReset) {
        conversationHistory = [];
        lastResponse = null;
        resetChatToWelcome();
        destroyCharts();
        vizEmpty.style.display = "flex";
        updateExportToolbar(null);
        vizProposal.style.display = "none";
        vizAnswer.style.display = "none";
        vizAnswer.innerHTML = "";
        vizCharts.innerHTML = "";
        vizCharts.style.display = "none";
        setResultPanelsEnabled(false);
        if (arMeta) {
          arMeta.textContent = "发送问题后，3D 展示城市 → 商圈 → 门店，支持下钻查看指标。";
        }
      }
      return refreshSessionList();
    });
  }

  function selectSession(sessionId) {
    if (!window.BrandPilotAuth || !sessionId) return;
    currentSessionId = sessionId;
    conversationHistory = [];
    lastResponse = null;
    resetChatToWelcome(false);
    return window.BrandPilotAuth.loadMessages(sessionId).then(function (data) {
      var messages = data.messages || [];
      messages.forEach(function (msg) {
        if (msg.role === "user") {
          addMessage("user", msg.content);
          conversationHistory.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          if (msg.metadata && msg.metadata.workflow) {
            addAgentMessage({
              workflow: msg.metadata.workflow,
              workflowLabel: msg.metadata.workflowLabel,
              intent: msg.metadata.intent,
              tokenUsage: msg.metadata.tokenUsage,
              agentTrace: [],
              answer: msg.content,
              proposal: msg.metadata.proposal,
              dataSpec: msg.metadata.dataSpec,
              dataMode: "supabase",
              persistence: { persisted: true }
            }, 0);
            lastResponse = {
              answer: msg.content,
              proposal: msg.metadata.proposal,
              charts: msg.metadata.charts,
              scene: msg.metadata.scene,
              dataSpec: msg.metadata.dataSpec,
              workflow: msg.metadata.workflow,
              workflowLabel: msg.metadata.workflowLabel,
              capabilities: msg.metadata.capabilities
            };
          } else {
            addMessage("assistant", msg.content);
          }
          conversationHistory.push({ role: "assistant", content: msg.content });
        }
      });
      if (lastResponse) {
        var restoreAr = shouldUseArExperience(lastResponse);
        setResultPanelsEnabled(true, { hasAr: restoreAr });
        renderVisualization(lastResponse);
        if (restoreAr) syncExtendedLayers(lastResponse);
        switchMode(restoreAr ? "ar" : "analysis");
      } else {
        setResultPanelsEnabled(false);
      }
      refreshSessionList();
      scrollToBottom();
    });
  }

  function resetChatToWelcome(showWelcome) {
    if (!chatMessages) return;
    if (showWelcome === false) {
      chatMessages.innerHTML = "";
      return;
    }
    chatMessages.innerHTML =
      '<div class="message assistant">' +
      createAssistantAvatar().outerHTML +
      '<div class="message-body">' +
      '<div class="message-content"><p>你好！我是 <strong>' + escapeHtml(assistantName()) + '</strong>，你的专属品牌经营顾问。登录后对话会自动保存到左侧「历史对话」。</p>' +
      '<p class="chat-hint">先输入问题并发送；提交后右侧默认展示<strong>分析报告</strong>。涉及<strong>城市/竞品/经营分析</strong>时可切换 <strong>AR 展厅</strong> 下钻，顶部<strong>联动分析条</strong>随选中城市实时刷新指标。</p>' +
      '<div class="example-prompts">' +
      '<button class="example-btn" data-prompt="海底捞2026年6月从搜索到核销的转化链路哪里损耗最大？">🔍 6月搜索流量链路诊断</button>' +
      '<button class="example-btn" data-prompt="海底捞2026年6月在美团和抖音的表现对比一下">📊 6月竞对平台对比</button>' +
      '<button class="example-btn" data-prompt="海底捞和呷哺呷哺2026年6月经营表现对比一下">🏷️ 品牌竞品对比</button>' +
      '<button class="example-btn" data-prompt="海底捞2026年6月的GMV和核销率是多少？">📈 6月数据查询</button>' +
      '<button class="example-btn" data-prompt="帮海底捞做一份2026年上半年的经营分析">📋 2026上半年经营分析</button>' +
      "</div></div></div></div>";
    bindExampleButtons();
  }

  function bindExampleButtons() {
    document.querySelectorAll(".example-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var prompt = btn.getAttribute("data-prompt");
        if (prompt) {
          chatInput.value = prompt;
          handleSend();
        }
      });
    });
  }

  function bindModeSwitch() {
    if (!modeSwitch) return;
    modeSwitch.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!resultPanelsEnabled) return;
        switchMode(btn.getAttribute("data-mode"));
      });
    });
  }

  function setResultPanelsEnabled(enabled, options) {
    options = options || {};
    resultPanelsEnabled = Boolean(enabled);

    if (appContainer) {
      appContainer.classList.toggle("app-container--chat-only", !resultPanelsEnabled);
    }
    if (modeSwitch) {
      modeSwitch.hidden = !resultPanelsEnabled;
    }

    if (!resultPanelsEnabled) {
      currentMode = "analysis";
      return;
    }

    updateExtendedModeTabs(Boolean(options.hasAr));
  }

  function shouldUseArExperience(data) {
    if (!data) return false;
    if (data.scene && data.scene.cities && data.scene.cities.length > 0) return true;
    var caps = data.capabilities || {};
    if (caps.regionAnalysis === false) return false;
    if (caps.regionAnalysis === true) return Boolean(data.scene);
    if (data.scene && data.scene.regionRelevant) return true;
    if (data.scene && data.scene.focusCity) return true;
    return false;
  }

  function updateExtendedModeTabs(hasAr) {
    if (!modeSwitch) return;
    var arBtn = modeSwitch.querySelector('[data-mode="ar"]');
    if (arBtn) arBtn.hidden = !hasAr;
    if (!hasAr && currentMode === "ar") {
      switchMode("analysis");
    }
  }

  function revealResultExperience(data) {
    if (!data) return;

    var useAr = shouldUseArExperience(data);
    setResultPanelsEnabled(true, { hasAr: useAr });
    renderVisualization(data);
    if (useAr) {
      syncExtendedLayers(data);
      switchMode("ar");
    } else {
      switchMode("analysis");
      if (vizLivePanel) vizLivePanel.hidden = true;
    }
  }

  function switchMode(mode) {
    if (!resultPanelsEnabled && mode !== "analysis") return;
    if (mode === "ar" && lastResponse && !shouldUseArExperience(lastResponse)) {
      mode = "analysis";
    }
    currentMode = mode || "analysis";
    modeSwitch.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-mode") === currentMode);
    });
    document.querySelectorAll("[data-mode-panel]").forEach(function (panel) {
      panel.classList.toggle("active", panel.getAttribute("data-mode-panel") === currentMode);
    });

    if (vizLivePanel) {
      // AR 展厅自带指标与筛选，避免顶部联动条挤占地图高度
      vizLivePanel.hidden = currentMode === "ar" || !lastResponse || !shouldUseArExperience(lastResponse);
    }

    if (currentMode === "ar") {
      ensureArReady();
      if (lastResponse && lastResponse.scene && window.BrandPilotAR) {
        window.BrandPilotAR.update(lastResponse.scene);
        setTimeout(function () {
          if (window.BrandPilotAR) {
            if (typeof window.BrandPilotAR.showCityMap === "function") {
              window.BrandPilotAR.showCityMap(false);
            }
            window.BrandPilotAR.resize();
          }
          if (window.BrandPilotEchartsMap && typeof window.BrandPilotEchartsMap.resize === "function") {
            window.BrandPilotEchartsMap.resize();
          }
        }, 120);
      }
      if (window.BrandPilotAR) window.BrandPilotAR.resize();
    }

    if (currentMode === "analysis" && lastResponse && shouldUseArExperience(lastResponse)) {
      syncAnalysisFromScene();
    }
  }

  function bindArControls() {
    if (enterXrButton && navigator.xr) {
      navigator.xr.isSessionSupported("immersive-vr").then(function (supported) {
        enterXrButton.hidden = !supported;
      }).catch(function () {
        enterXrButton.hidden = true;
      });
    }
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
        if (window.BrandPilotAR && typeof window.BrandPilotAR.resetSelection === "function") {
          window.BrandPilotAR.resetSelection();
        } else if (lastResponse && lastResponse.scene && window.BrandPilotAR) {
          window.BrandPilotAR.update(lastResponse.scene);
        }
      });
    }
  }

  function ensureArReady() {
    if (!window.BrandPilotAR || !arStage) return false;
    var ready = window.BrandPilotAR.init(arStage);
    if (ready && typeof window.BrandPilotAR.setSelectionHandler === "function") {
      window.BrandPilotAR.setSelectionHandler(handleArSelectionChange);
    }
    return ready;
  }

  function handleArSelectionChange(payload) {
    if (!payload || !payload.scope) return;
    if (currentMode === "analysis") {
      syncAnalysisLivePanel(payload);
    }
  }

  function formatLiveCompact(value) {
    var number = Number(value || 0);
    if (number >= 10000) return (number / 10000).toFixed(number >= 100000 ? 0 : 1) + "万";
    return Math.round(number).toLocaleString("zh-CN");
  }

  function formatLivePercent(value) {
    var number = Number(value || 0);
    return (number * 100).toFixed(number >= 0.1 ? 1 : 2) + "%";
  }

  function formatLiveNumber(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number)) return "0";
    return number >= 100 ? Math.round(number).toLocaleString("zh-CN") : number.toFixed(1).replace(/\.0$/, "");
  }

  function buildScopeMetricCards(scope) {
    if (!scope || !scope.metrics) return "";
    var m = scope.metrics;
    var cards = [];
    if (scope.level === "brand" || scope.level === "city") {
      if (m.gtv != null) cards.push({ label: "GTV", value: formatLiveCompact(m.gtv) });
      if (m.gmv != null) cards.push({ label: "GMV", value: formatLiveCompact(m.gmv) });
      if (m.verifiedRate != null) cards.push({ label: "核销率", value: formatLivePercent(m.verifiedRate) });
      if (m.roi != null) cards.push({ label: "ROI", value: formatLiveNumber(m.roi) });
      if (m.avgOrderValue != null) cards.push({ label: "客单价", value: formatLiveNumber(m.avgOrderValue) + "元" });
      if (m.storeCount != null) cards.push({ label: "门店数", value: String(m.storeCount) });
    } else if (scope.level === "district") {
      cards.push({ label: "门店数", value: String(m.storeCount || 0) });
      cards.push({ label: "曝光", value: formatLiveCompact(m.exposure || 0) });
      cards.push({ label: "访问", value: formatLiveCompact(m.visits || 0) });
      cards.push({ label: "进店率", value: formatLivePercent(m.visitRate || 0) });
    } else {
      cards.push({ label: "曝光", value: formatLiveCompact(m.exposure || 0) });
      cards.push({ label: "访问", value: formatLiveCompact(m.visits || 0) });
      cards.push({ label: "套餐点击", value: formatLiveCompact(m.dealClicks || 0) });
      cards.push({ label: "停留", value: formatLiveNumber(m.avgStaySeconds || 0) + "s" });
    }
    return cards.map(function (card) {
      return (
        '<div class="viz-metric-card">' +
        '<span class="viz-metric-label">' + escapeHtml(card.label) + "</span>" +
        '<strong class="viz-metric-value">' + escapeHtml(card.value) + "</strong>" +
        "</div>"
      );
    }).join("");
  }

  function renderVizLiveFilter(scene, timeFilter) {
    if (!vizLiveFilter || !scene) return "";
    if (!scene.drillSource || !window.BrandPilotDrillMetrics) {
      var label = (scene.dateRange && scene.dateRange.label) || "统计周期";
      return (
        '<div class="viz-live-filter-inner">' +
        '<span class="viz-live-filter-label">统计周期</span>' +
        '<span class="viz-live-sync-hint">' + escapeHtml(label) + " · 与 AR 沙盘同步加载中</span>" +
        "</div>"
      );
    }
    var months = window.BrandPilotDrillMetrics.listMonthOptions(scene.drillSource);
    var filter = timeFilter || window.BrandPilotAR.getTimeFilter();
    var monthMode = filter.mode !== "range";
    var monthOptions = months.map(function (item) {
      var selected = item.value === filter.monthKey ? " selected" : "";
      return '<option value="' + escapeHtml(item.value) + '"' + selected + ">" + escapeHtml(item.label) + "</option>";
    }).join("");
    var presets = [
      { id: "h1-2026", label: "2026年上半年" },
      { id: "y2026", label: "2026年至今" },
      { id: "full", label: "全量累计" }
    ];
    var presetOptions = presets.map(function (item) {
      var selected = filter.preset === item.id ? " selected" : "";
      return '<option value="' + escapeHtml(item.id) + '"' + selected + ">" + escapeHtml(item.label) + "</option>";
    }).join("");
    return (
      '<div class="viz-live-filter-inner">' +
      '<span class="viz-live-filter-label">统计周期</span>' +
      '<div class="viz-live-mode">' +
      '<button type="button" class="viz-live-mode-btn' + (monthMode ? " active" : "") + '" data-viz-time-mode="month">按月</button>' +
      '<button type="button" class="viz-live-mode-btn' + (!monthMode ? " active" : "") + '" data-viz-time-mode="range">区间</button>' +
      "</div>" +
      '<select class="viz-live-select viz-live-month"' + (monthMode ? "" : ' hidden') + ' data-viz-month-select aria-label="选择月份">' +
      monthOptions +
      "</select>" +
      '<select class="viz-live-select viz-live-range"' + (monthMode ? ' hidden' : "") + ' data-viz-range-preset aria-label="区间预设">' +
      presetOptions +
      "</select>" +
      '<span class="viz-live-sync-hint">与 AR 沙盘同步</span>' +
      "</div>"
    );
  }

  function readVizTimeFilterFromDom() {
    if (!vizLiveFilter) return null;
    var modeBtn = vizLiveFilter.querySelector(".viz-live-mode-btn.active");
    var mode = modeBtn ? modeBtn.getAttribute("data-viz-time-mode") : "month";
    if (mode === "month") {
      var monthSelect = vizLiveFilter.querySelector("[data-viz-month-select]");
      return { mode: "month", monthKey: monthSelect ? monthSelect.value : "", from: "", to: "", preset: "" };
    }
    var presetSelect = vizLiveFilter.querySelector("[data-viz-range-preset]");
    return {
      mode: "range",
      monthKey: "",
      from: "",
      to: "",
      preset: presetSelect ? presetSelect.value : "h1-2026"
    };
  }

  function bindVizLivePanelEvents() {
    if (!vizLivePanel || vizLivePanel.dataset.bound) return;
    vizLivePanel.dataset.bound = "1";

    vizLivePanel.addEventListener("click", function (event) {
      var modeBtn = event.target.closest("[data-viz-time-mode]");
      if (modeBtn) {
        vizLiveFilter.querySelectorAll(".viz-live-mode-btn").forEach(function (btn) {
          btn.classList.toggle("active", btn === modeBtn);
        });
        var isMonth = modeBtn.getAttribute("data-viz-time-mode") === "month";
        var monthEl = vizLiveFilter.querySelector(".viz-live-month");
        var rangeEl = vizLiveFilter.querySelector(".viz-live-range");
        if (monthEl) monthEl.hidden = !isMonth;
        if (rangeEl) rangeEl.hidden = isMonth;
        var filter = readVizTimeFilterFromDom();
        if (filter && window.BrandPilotAR) window.BrandPilotAR.applyTimeFilter(filter);
        return;
      }
      var cityBtn = event.target.closest("[data-viz-city]");
      if (cityBtn && window.BrandPilotAR) {
        window.BrandPilotAR.selectCity(cityBtn.getAttribute("data-viz-city"), false);
      }
    });

    vizLivePanel.addEventListener("change", function (event) {
      if (!event.target.closest(".viz-live-filter-inner")) return;
      var filter = readVizTimeFilterFromDom();
      if (filter && window.BrandPilotAR) window.BrandPilotAR.applyTimeFilter(filter);
    });
  }

  function renderVizLiveCities(scene, selectedCity) {
    if (!scene || !scene.drillMetrics) return "";
    var cities = (scene.drillMetrics.cities || []).slice().sort(function (a, b) {
      return (b.gmv || 0) - (a.gmv || 0);
    });
    if (!cities.length) return "";
    var chips = cities.map(function (city) {
      var active = city.name === selectedCity ? " active" : "";
      return (
        '<button type="button" class="viz-city-chip' + active + '" data-viz-city="' + escapeHtml(city.name) + '">' +
        "<strong>" + escapeHtml(city.name) + "</strong>" +
        "<span>GMV " + formatLiveCompact(city.gmv || 0) + "</span>" +
        "<span>核销 " + formatLivePercent(city.verifiedRate || 0) + "</span>" +
        "</button>"
      );
    }).join("");
    return (
      '<div class="viz-live-cities-head">' +
      "<h4>城市对比 · 点击联动沙盘</h4>" +
      "<p>选中城市后，上方指标与图表按该城市刷新</p>" +
      "</div>" +
      '<div class="viz-city-strip">' + chips + "</div>"
    );
  }

  function syncAnalysisLivePanel(payload) {
    var scope = payload.scope;
    var scene = payload.scene || (window.BrandPilotAR && window.BrandPilotAR.getSceneData());
    var timeFilter = payload.timeFilter || (window.BrandPilotAR && window.BrandPilotAR.getTimeFilter());

    if (!scope || !scene || (!scene.drillSource && !scene.drillMetrics)) {
      if (vizLivePanel) vizLivePanel.hidden = true;
      return;
    }

    if (vizLivePanel) vizLivePanel.hidden = false;
    if (vizLiveFilter) vizLiveFilter.innerHTML = renderVizLiveFilter(scene, timeFilter);
    bindVizLivePanelEvents();

    var periodLabel = scope.dateRange && scope.dateRange.label ? scope.dateRange.label : "";
    if (vizLiveScope) {
      vizLiveScope.innerHTML =
        '<div class="viz-live-scope-head">' +
        "<strong>" + escapeHtml(scope.breadcrumb || scope.label || "经营指标") + "</strong>" +
        (periodLabel ? '<span class="viz-live-period">' + escapeHtml(periodLabel) + "</span>" : "") +
        "</div>" +
        '<div class="viz-live-metrics">' + buildScopeMetricCards(scope) + "</div>";
    }

    if (vizLiveCities) {
      var selectedCity = payload.selectedCity || (window.BrandPilotAR && window.BrandPilotAR.getSelection().selectedCity);
      vizLiveCities.innerHTML = renderVizLiveCities(scene, selectedCity);
    }

    if (arMeta) {
      var metaParts = [];
      if (scope.breadcrumb) metaParts.push(scope.breadcrumb);
      if (periodLabel) metaParts.push(periodLabel);
      arMeta.textContent = metaParts.join(" · ");
    }
    if (vizToolbarSubtitle && lastResponse) {
      var subtitle = [];
      if (lastResponse.workflowLabel) subtitle.push(lastResponse.workflowLabel);
      if (scope.breadcrumb) subtitle.push(scope.breadcrumb);
      if (periodLabel) subtitle.push(periodLabel);
      vizToolbarSubtitle.textContent = subtitle.join(" · ");
    }
    if (vizToolbarTitle && scope.label) {
      vizToolbarTitle.textContent = scope.label + " · 经营指标";
    }

    updateScopeLinkedCharts(scope, scene);
  }

  function syncAnalysisFromScene() {
    if (!window.BrandPilotAR) return;
    var selection = window.BrandPilotAR.getSelection();
    if (!selection || !selection.scope) return;
    syncAnalysisLivePanel({
      scope: selection.scope,
      scene: window.BrandPilotAR.getSceneData(),
      timeFilter: selection.timeFilter,
      selectedCity: selection.selectedCity
    });
  }

  function scaleChartForScope(chartDef, scope, scene) {
    var copy = JSON.parse(JSON.stringify(chartDef));
    var dm = scene.drillMetrics || {};
    var periodLabel = scene.dateRange && scene.dateRange.label ? scene.dateRange.label : "";

    if (copy.type === "funnel") {
      var ratio = scope.level === "brand" ? 1 : scope.level === "city" ? 0.18 : scope.level === "district" ? 0.06 : 0.02;
      if (copy.data && copy.data.datasets && copy.data.datasets[0]) {
        copy.data.datasets[0].data = (copy.data.datasets[0].data || []).map(function (val) {
          return Math.round(Number(val || 0) * ratio);
        });
      }
      if (scope.level !== "brand" && scope.label) {
        copy.title = scope.label + " · " + (copy.title || "转化漏斗");
      }
      return copy;
    }

    if (/城市.*GMV|GMV.*城市/.test(copy.title || "") && dm.cities && dm.cities.length) {
      var cities = dm.cities.slice().sort(function (a, b) { return (b.gmv || 0) - (a.gmv || 0); });
      copy.data.labels = cities.map(function (c) { return c.name; });
      copy.data.datasets[0].data = cities.map(function (c) { return Math.round((c.gmv || 0) / 10000); });
      copy.title = "城市 GMV 分布" + (periodLabel ? "（" + periodLabel + "）" : "");
      return copy;
    }

    if (/品牌竞品/.test(copy.title || "") && scene.brandPeerBenchmarks) {
      var peer = scene.brandPeerBenchmarks;
      copy.data.labels = [peer.ownBrand.name, peer.peerBrand.name];
      copy.data.datasets = [
        { label: "GTV（万元）", data: [peer.ownBrand.gtv / 10000, peer.peerBrand.gtv / 10000] },
        { label: "客单价（元）", data: [peer.ownBrand.avgOrderValue, peer.peerBrand.avgOrderValue] },
        { label: "核销率 (%)", data: [peer.ownBrand.verifiedRate * 100, peer.peerBrand.verifiedRate * 100] }
      ];
      if (periodLabel) copy.title = "品牌竞品 · " + periodLabel;
      return copy;
    }

    if (/同城市 GMV/.test(copy.title || "")) {
      var peerBundle = scene.brandPeerBenchmarks;
      if (peerBundle && peerBundle.cities && peerBundle.cities.length) {
        copy.data.labels = peerBundle.cities.map(function (item) { return item.city; });
        copy.data.datasets = [
          { label: peerBundle.ownBrand.name, data: peerBundle.cities.map(function (item) { return (item.own.gmv || 0) / 10000; }) },
          { label: peerBundle.peerBrand.name, data: peerBundle.cities.map(function (item) { return (item.peer.gmv || 0) / 10000; }) }
        ];
      } else if (dm.cities && dm.cities.length) {
        var ownCities = dm.cities.slice().sort(function (a, b) { return (b.gmv || 0) - (a.gmv || 0); });
        copy.data.labels = ownCities.map(function (c) { return c.name; });
        copy.data.datasets = [
          { label: scene.brandName || "海底捞", data: ownCities.map(function (c) { return (c.gmv || 0) / 10000; }) }
        ];
      }
      if (periodLabel) copy.title = "同城市 GMV 对比（" + periodLabel + "）";
      return copy;
    }

    if (/平台对比/.test(copy.title || "") && scene.competitors && scene.competitors.length) {
      var platforms = scene.competitors;
      copy.data.labels = platforms.map(function (item) { return item.name; });
      copy.data.datasets = [
        { label: "渠道份额 (%)", data: platforms.map(function (item) { return (item.marketShare || 0) * 100; }) },
        { label: "核销率 (%)", data: platforms.map(function (item) { return (item.verificationRate || 0) * 100; }) }
      ];
      if (periodLabel) copy.title = "平台对比 · " + periodLabel;
      return copy;
    }

    if (/平台客单价/.test(copy.title || "") && scene.competitors && scene.competitors.length) {
      copy.data.labels = scene.competitors.map(function (item) { return item.name; });
      copy.data.datasets[0].data = scene.competitors.map(function (item) { return item.avgOrderValue || 0; });
      return copy;
    }

    return copy;
  }

  function updateScopeLinkedCharts(scope, scene) {
    if (!lastChartDefs || !lastChartDefs.length || !scope || !scene) return;
    var updated = lastChartDefs.map(function (chartDef) {
      return scaleChartForScope(chartDef, scope, scene);
    });
    lastChartDefs = updated;
    renderCharts(updated);
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

    if (!window.BrandPilotAuth || !window.BrandPilotAuth.isLoggedIn()) {
      redirectToLogin();
      return;
    }

    var message = chatInput.value.trim();
    if (!message) return;

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
    startProgressMessage();

    function runChat() {
      return runChatStream({
        message: message,
        brandHint: brandHint,
        history: conversationHistory.slice(0, -1),
        sessionId: currentSessionId
      });
    }

    var chatPromise = currentSessionId
      ? runChat()
      : createNewSession(true).then(function () { return runChat(); });

    chatPromise
      .then(function (data) {
        var latency = Date.now() - startTime;
        lastResponse = data;
        finalizeStreamMessage(latency, data);
        revealResultExperience(data);

        conversationHistory.push({
          role: "assistant",
          content: String(data.answer || "")
        });
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }
        refreshSessionList();
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

  function runChatStream(payload) {
    return fetch("/api/chat", {
      method: "POST",
      headers: window.BrandPilotAuth.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(Object.assign({}, payload, { stream: true }))
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { message: text }; }
          if (resp.status === 401) {
            redirectToLogin();
          }
          throw new Error((data && data.message) || "请求失败 (" + resp.status + ")");
        });
      }
      if (!resp.body || !resp.body.getReader) {
        throw new Error("当前浏览器不支持流式响应");
      }

      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var finalData = null;

      function handleBlock(block) {
        if (!block.trim()) return;
        var eventName = "message";
        var dataLines = [];
        block.split("\n").forEach(function (line) {
          if (line.indexOf("event:") === 0) eventName = line.slice(6).trim();
          else if (line.indexOf("data:") === 0) dataLines.push(line.slice(5).trim());
        });
        if (!dataLines.length) return;
        var data = JSON.parse(dataLines.join("\n"));
        if (eventName === "done") {
          finalData = data;
          return;
        }
        if (eventName === "error") {
          throw new Error(data.message || "流式请求失败");
        }
        handleStreamEvent(eventName, data);
      }

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            if (!finalData) throw new Error("流式响应提前结束");
            return finalData;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          chunks.forEach(handleBlock);
          return pump();
        });
      }

      return pump();
    });
  }

  function handleStreamEvent(eventName, data) {
    if (!progressMessageEl) return;
    if (eventName === "step_start") {
      upsertProgressStep(data.id, {
        name: data.name,
        summary: data.summary,
        status: "active"
      });
      return;
    }
    if (eventName === "step") {
      upsertProgressStep(data.id || ("run_" + Date.now()), {
        name: data.name,
        tool: data.tool,
        summary: data.summary,
        durationMs: data.durationMs,
        status: data.status === "done" ? "done" : "active"
      });
      return;
    }
    if (eventName === "answer_delta" && data.text) {
      appendStreamAnswer(data.text);
    }
  }

  function upsertProgressStep(stepId, step) {
    if (!progressMessageEl) return;
    var stepsEl = progressMessageEl.querySelector(".progress-steps");
    var waitingEl = progressMessageEl.querySelector(".progress-waiting");
    if (!stepsEl) return;
    stepsEl.hidden = false;
    if (waitingEl) waitingEl.hidden = true;

    var li = stepsEl.querySelector('[data-step-id="' + stepId + '"]');
    if (!li) {
      li = document.createElement("li");
      li.className = "progress-step";
      li.setAttribute("data-step-id", stepId);
      stepsEl.appendChild(li);
    }

    li.classList.toggle("active", step.status === "active");
    li.classList.toggle("done", step.status === "done");
    li.classList.toggle("running", step.status === "running");

    var stepName = friendlyStepName(step.name);
    var stepSummary = friendlyStepSummary(step);
    var duration = step.durationMs && step.status === "done"
      ? '<span class="trace-duration">' + escapeHtml(friendlyDuration(step.durationMs)) + "</span> "
      : "";
    var summary = stepSummary
      ? '<span class="trace-summary">' + escapeHtml(stepSummary) + "</span>"
      : "";

    li.innerHTML =
      '<span class="progress-dot"></span>' +
      '<span class="progress-text">' +
      "<strong>" + escapeHtml(stepName) + "</strong> " +
      duration + summary +
      "</span>";
    scrollToBottom();
  }

  function appendStreamAnswer(text) {
    streamAnswerText += text;
    if (!progressMessageEl) return;
    var answerEl = progressMessageEl.querySelector(".stream-answer");
    var waitingEl = progressMessageEl.querySelector(".progress-waiting");
    if (waitingEl) waitingEl.hidden = true;
    if (!answerEl) return;
    answerEl.hidden = false;
    answerEl.textContent = streamAnswerText;
    scrollToBottom();
  }

  function startProgressMessage() {
    removeProgressMessage();
    streamAnswerText = "";

    var div = document.createElement("div");
    div.className = "message assistant progress streaming";
    div.id = "chatProgressMessage";

    var avatar = createAssistantAvatar();

    var body = document.createElement("div");
    body.className = "message-body";

    var content = document.createElement("div");
    content.className = "message-content progress-content";
    content.innerHTML =
      '<div class="progress-title">' + escapeHtml(assistantName()) + " 正在帮你分析</div>" +
      '<div class="progress-waiting">' +
      '<span class="progress-spinner" aria-hidden="true"></span>' +
      "<span>稍等，我这就开始…</span>" +
      "</div>" +
      '<ul class="progress-steps" hidden></ul>' +
      '<div class="stream-answer" hidden></div>';

    body.appendChild(content);
    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    progressMessageEl = div;
    scrollToBottom();
  }

  function finalizeStreamMessage(latencyMs, data) {
    if (progressMessageEl) {
      var titleEl = progressMessageEl.querySelector(".progress-title");
      if (titleEl) titleEl.textContent = "执行完成 · " + latencyMs + "ms";
      removeProgressMessage();
    }
    addAgentMessage(data, latencyMs);
  }

  function removeProgressMessage() {
    if (progressMessageEl && progressMessageEl.parentNode) {
      progressMessageEl.parentNode.removeChild(progressMessageEl);
    }
    progressMessageEl = null;
    streamAnswerText = "";
  }

  // ===== 消息渲染 =====
  function addMessage(role, text) {
    var div = document.createElement("div");
    div.className = "message " + role;

    var avatar;
    if (role === "user") {
      avatar = document.createElement("div");
      avatar.className = "message-avatar";
      avatar.textContent = "👤";
    } else {
      avatar = createAssistantAvatar();
    }

    var body = document.createElement("div");
    body.className = "message-body";

    var content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = window.BrandPilotMarkdown
      ? window.BrandPilotMarkdown.renderMarkdown(text)
      : renderMarkdown(text);

    body.appendChild(content);
    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function addAgentMessage(data, latencyMs) {
    var div = document.createElement("div");
    div.className = "message assistant";

    var avatar = createAssistantAvatar();

    var body = document.createElement("div");
    body.className = "message-body";

    // 意图识别标签
    var intentBadge = document.createElement("div");
    intentBadge.className = "intent-badge";
    var intent = data.intent || {};
    var confidenceMeta = intent.confidenceMeta || null;
    var confPct = confidenceMeta && confidenceMeta.percent != null
      ? String(confidenceMeta.percent)
      : ((intent.confidence || 0) * 100).toFixed(0);
    var confSource = confidenceMeta && confidenceMeta.sourceLabel ? confidenceMeta.sourceLabel : "";
    var confExplanation = confidenceMeta && confidenceMeta.explanation ? confidenceMeta.explanation : "";
    var modeLabel = friendlyModeLabel(intent.recognitionModeLabel || intent.recognitionMode || "");
    var latencyLabel = friendlyDuration(latencyMs) || "";
    var tokenLabel = formatTokenUsageLabel(data.tokenUsage);
    intentBadge.innerHTML =
      '<span class="workflow-tag">' + escapeHtml(data.workflowLabel || data.workflow) + "</span>" +
      (modeLabel ? '<span class="mode-tag">' + escapeHtml(modeLabel) + "</span>" : "") +
      '<span class="confidence-tag"' +
      (confExplanation ? ' title="' + escapeHtml(confExplanation) + '"' : "") +
      ">把握 " + escapeHtml(confPct) + "%" +
      (confSource ? " · " + escapeHtml(confSource) : "") +
      "</span>" +
      (tokenLabel ? '<span class="token-tag" title="本次请求 LLM Token 用量">' + escapeHtml(tokenLabel) + "</span>" : "") +
      (latencyLabel ? '<span class="latency-tag">' + escapeHtml(latencyLabel) + "</span>" : "");
    body.appendChild(intentBadge);

    if (data.dataSpec) {
      var specBlock = document.createElement("div");
      specBlock.className = "data-spec-inline";
      specBlock.innerHTML = renderDataSpecHtml(data.dataSpec);
      body.appendChild(specBlock);
    }

    // Agent 执行轨迹
    if (data.agentTrace && data.agentTrace.length > 0) {
      var trace = document.createElement("div");
      trace.className = "agent-trace";
      trace.innerHTML = renderTraceStepsHtml(data.agentTrace);
      body.appendChild(trace);
    }

    // 数据模式提醒
    if (data.dataMode === "fixture") {
      var notice = document.createElement("div");
      notice.className = "data-notice";
      notice.textContent = "⚠️ 当前使用演示数据，正式环境会接入真实经营数据。";
      body.appendChild(notice);
    }

    // 能力与持久化提示
    var capability = document.createElement("div");
    capability.className = "capability-badge";
    var caps = data.capabilities || {};
    var persist = data.persistence || {};
    capability.innerHTML =
      "<span>智能查数</span><span>经营手册</span>" +
      (caps.regionAnalysis && caps.arScene ? "<span>AR 展厅</span>" : "") +
      '<span class="' + (persist.persisted ? "ok" : "warn") + '">' +
      (persist.persisted ? "分析已保存" : "分析暂存本地") +
      "</span>";
    body.appendChild(capability);

    // 完整回答（不截断）
    var content = document.createElement("div");
    content.className = "message-content message-full";
    var answerText = data.answer || "";
    if (!answerText && data.proposal && data.proposal.summary) {
      answerText = data.proposal.summary;
    }
    content.innerHTML = window.BrandPilotMarkdown
      ? window.BrandPilotMarkdown.renderMarkdown(answerText)
      : renderMarkdown(answerText);
    body.appendChild(content);

    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function addErrorMessage(errorText) {
    var div = document.createElement("div");
    div.className = "message assistant error";

    var avatar = createAssistantAvatar();
    avatar.innerHTML = "";
    avatar.textContent = "!";
    avatar.classList.add("message-avatar--error");

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

  // ===== 数据口径 =====
  function renderDataSpecHtml(spec, options) {
    options = options || {};
    if (!spec) return "";
    if (options.compact) {
      return (
        '<p class="data-spec-line">' +
        escapeHtml(spec.footnote || spec.shortLine || "") +
        "</p>"
      );
    }
    var html = '<div class="data-spec-block">';
    if (spec.period) {
      html +=
        '<p class="data-spec-period"><strong>统计周期</strong> ' +
        escapeHtml(spec.period.label) +
        (spec.period.range ? "（" + escapeHtml(spec.period.range) + "）" : "") +
        "</p>";
    }
    if (spec.source) {
      html +=
        '<p class="data-spec-source"><strong>数据来源</strong> ' +
        escapeHtml(spec.source) +
        "</p>";
    }
    if (spec.metrics && spec.metrics.length) {
      html += '<ul class="data-spec-metrics">';
      spec.metrics.forEach(function (metric) {
        html +=
          "<li><strong>" +
          escapeHtml(metric.name) +
          "</strong>：" +
          escapeHtml(metric.definition) +
          "</li>";
      });
      html += "</ul>";
    }
    if (spec.dataModeNote) {
      html += '<p class="data-spec-note">' + escapeHtml(spec.dataModeNote) + "</p>";
    }
    html += "</div>";
    return html;
  }

  function appendDataSpecElement(container, spec) {
    spec = spec || currentDataSpec;
    if (!container || !spec) return;
    var foot = document.createElement("p");
    foot.className = "data-spec-footnote";
    foot.textContent = spec.footnote || spec.shortLine || "";
    container.appendChild(foot);
  }

  // ===== 可视化渲染 =====
  function renderVisualization(data) {
    destroyCharts();
    currentDataSpec = data.dataSpec || (data.scene && data.scene.dataSpec) || null;
    vizEmpty.style.display = "none";

    if (data.proposal) {
      vizProposal.style.display = "block";
      renderProposal(data.proposal, currentDataSpec);
    } else {
      vizProposal.style.display = "none";
    }

    if (data.answer) {
      vizAnswer.style.display = "block";
      var answerHtml = "";
      if (data.proposal) {
        answerHtml +=
          '<div class="viz-answer-heading">' +
          "<h3>完整分析</h3>" +
          "<p class=\"viz-answer-hint\">上方为结构化提案，以下为 AI 完整回答。</p>" +
          "</div>";
      }
      answerHtml += window.BrandPilotMarkdown
        ? window.BrandPilotMarkdown.renderMarkdown(data.answer)
        : renderMarkdown(data.answer);
      if (currentDataSpec) {
        answerHtml += renderDataSpecHtml(currentDataSpec, { compact: true });
      }
      vizAnswer.innerHTML = answerHtml;
    } else {
      vizAnswer.style.display = "none";
      vizAnswer.innerHTML = "";
    }

    if (data.charts && data.charts.length > 0) {
      lastChartDefs = data.charts.map(function (chart) {
        return JSON.parse(JSON.stringify(chart));
      });
      renderCharts(data.charts);
    } else {
      lastChartDefs = [];
      vizCharts.innerHTML = "";
      vizCharts.style.display = "none";
    }

    updateExportToolbar(data);
    bindVizLivePanelEvents();
    setTimeout(syncAnalysisFromScene, 0);
  }

  function updateExportToolbar(data) {
    var exportable = Boolean(
      data && (data.proposal || data.answer || (data.charts && data.charts.length))
    );
    if (vizToolbar) vizToolbar.hidden = !exportable;
    if (!exportable) return;
    if (vizToolbarTitle) {
      vizToolbarTitle.textContent = data.proposal
        ? (data.proposal.title || "经营提案")
        : (data.workflowLabel || "分析结果");
    }
    if (vizToolbarSubtitle) {
      var parts = [];
      if (data.workflowLabel) parts.push(data.workflowLabel);
      if (data.dataSpec && data.dataSpec.shortLine) parts.push(data.dataSpec.shortLine);
      else if (currentDataSpec && currentDataSpec.shortLine) parts.push(currentDataSpec.shortLine);
      parts.push(new Date().toLocaleString("zh-CN"));
      vizToolbarSubtitle.textContent = parts.join(" · ");
    }
  }

  function syncExtendedLayers(data) {
    if (!shouldUseArExperience(data)) {
      if (arMeta) {
        arMeta.textContent = "当前问题不涉及地区维度，请查看左侧分析报告。";
      }
      return;
    }
    if (data.scene) {
      ensureArReady();
      if (window.BrandPilotAR) {
        window.BrandPilotAR.update(data.scene);
        if (arMeta) {
          var metaParts = [];
          if (data.scene.topicLabel) metaParts.push(data.scene.topicLabel);
          if (data.scene.dataSpec && data.scene.dataSpec.shortLine) {
            metaParts.push(data.scene.dataSpec.shortLine);
          } else if (data.scene.topicHint) {
            metaParts.push(data.scene.topicHint);
          }
          if (!metaParts.length) {
            metaParts.push(
              ((data.scene.districts && data.scene.districts.length) || 0) + " 个商圈 · " +
              ((data.scene.pois && data.scene.pois.length) || 0) + " 家门店"
            );
          }
          arMeta.textContent = metaParts.join(" · ");
        }
        setTimeout(syncAnalysisFromScene, 0);
      }
    } else if (arMeta) {
      arMeta.textContent = "AR 场景加载中，请稍候…";
    }
  }

  function renderProposal(proposal, dataSpec) {
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
      html += '<div class="proposal-summary"><p>' + escapeHtml(proposal.summary) + '</p></div>';
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
        html += '<li>' + escapeHtml(insight) + '</li>';
      });
      html += '</ul></div>';
    }

    // 推荐动作
    if (proposal.actions && proposal.actions.length > 0) {
      html += '<div class="proposal-section"><h3>🎯 推荐动作</h3><div class="action-list">';
      proposal.actions.forEach(function (action, i) {
        html += '<div class="action-item"><span class="action-num">' + (i + 1) + '</span><span>' + escapeHtml(action) + '</span></div>';
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
          '<div class="timeline-content"><strong>' + escapeHtml(t.title) + '</strong><p>' + escapeHtml(t.body) + '</p></div>' +
          '</div>';
      });
      html += '</div></div>';
    }

    // 风险提示
    if (proposal.risks && proposal.risks.length > 0) {
      html += '<div class="proposal-section"><h3>⚠️ 风险提示</h3><ul class="risk-list">';
      proposal.risks.forEach(function (risk) {
        html += '<li>' + escapeHtml(risk) + '</li>';
      });
      html += '</ul></div>';
    }

    // 资产清单
    if (proposal.assets && proposal.assets.length > 0) {
      html += '<div class="proposal-section"><h3>📦 提案资产</h3><div class="asset-list">';
      proposal.assets.forEach(function (asset) {
        html +=
          '<div class="asset-item">' +
          '<strong>' + escapeHtml(asset.title) + '</strong>' +
          '<p>' + escapeHtml(asset.body) + '</p>' +
          '</div>';
      });
      html += '</div></div>';
    }

    html += renderDataSpecHtml(dataSpec || currentDataSpec);

    proposalBody.innerHTML = html;
  }

  function renderCharts(charts) {
    vizCharts.innerHTML = "";
    vizCharts.style.display = "block";
    chartExports = [];

    charts.forEach(function (chartDef, index) {
      var wrapper = document.createElement("div");
      wrapper.className = "chart-wrapper" + (chartDef.type === "funnel" ? " chart-wrapper--funnel" : "");

      var title = document.createElement("h3");
      title.className = "chart-title";
      title.textContent = chartDef.title || "图表 " + (index + 1);
      wrapper.appendChild(title);

      if (chartDef.type === "funnel") {
        var funnelEl = renderCustomFunnel(chartDef);
        wrapper.appendChild(funnelEl);
        appendDataSpecElement(wrapper, chartDef.dataSpec || currentDataSpec);
        vizCharts.appendChild(wrapper);
        chartExports.push({ type: "html", title: title.textContent, element: funnelEl });
        return;
      }

      var canvas = document.createElement("canvas");
      canvas.id = "chart-" + index;
      wrapper.appendChild(canvas);
      appendDataSpecElement(wrapper, chartDef.dataSpec || currentDataSpec);
      vizCharts.appendChild(wrapper);

      try {
        var ctx = canvas.getContext("2d");
        var config = buildChartConfig(chartDef);
        var chartInstance = new Chart(ctx, config);
        chartInstances.push(chartInstance);
        chartExports.push({ type: "canvas", title: title.textContent, chart: chartInstance });
      } catch (err) {
        console.warn("图表渲染失败:", err.message);
      }
    });
  }

  function formatChartNumber(value) {
    var n = Number(value) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(2).replace(/\.0+$/, "") + " 亿";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + " 万";
    return n.toLocaleString("zh-CN");
  }

  function renderCustomFunnel(chartDef) {
    var labels = (chartDef.data && chartDef.data.labels) || [];
    var values = (chartDef.data && chartDef.data.datasets && chartDef.data.datasets[0])
      ? chartDef.data.datasets[0].data
      : [];
    var maxValue = Math.max.apply(null, values.concat([1]));

    var rates = values.map(function (val, i) {
      if (i === 0) return null;
      var prev = values[i - 1];
      if (!prev) return null;
      return val / prev;
    });

    var weakestIndex = -1;
    var weakestRate = Infinity;
    rates.forEach(function (rate, i) {
      if (rate !== null && rate < weakestRate) {
        weakestRate = rate;
        weakestIndex = i;
      }
    });

    var root = document.createElement("div");
    root.className = "funnel-viz";

    labels.forEach(function (label, index) {
      var value = values[index] || 0;
      var widthPct = Math.max(28, Math.round((value / maxValue) * 100));
      var isBottleneck = index === weakestIndex;
      var rate = rates[index];

      if (index > 0) {
        var connector = document.createElement("div");
        connector.className = "funnel-viz-connector" + (isBottleneck ? " is-bottleneck" : "");
        var rateText = rate === null ? "" : "留存 " + (rate * 100).toFixed(1) + "%";
        connector.innerHTML =
          '<span class="funnel-viz-arrow" aria-hidden="true">▼</span>' +
          '<span class="funnel-viz-rate">' + rateText + (isBottleneck ? " · 最大损耗" : "") + "</span>";
        root.appendChild(connector);
      }

      var stage = document.createElement("div");
      stage.className = "funnel-viz-stage" + (isBottleneck ? " is-bottleneck" : "");

      var bar = document.createElement("div");
      bar.className = "funnel-viz-bar";
      bar.style.width = widthPct + "%";
      bar.innerHTML =
        '<span class="funnel-viz-label">' + escapeHtml(label) + "</span>" +
        '<span class="funnel-viz-value">' + formatChartNumber(value) + "</span>";

      stage.appendChild(bar);
      root.appendChild(stage);
    });

    return root;
  }

  function buildChartConfig(chartDef) {
    var type = chartDef.type;
    var data = chartDef.data;

    var datasets = (data.datasets || []).map(function (ds, dsIndex) {
      var isRateChart = chartDef.title && /转化率|核销率|份额/.test(chartDef.title);
      var yellowBase = "rgba(255, 195, 0, 0.88)";
      var yellowAlt = "rgba(245, 184, 0, 0.72)";
      return {
        label: ds.label,
        data: ds.data,
        borderWidth: 0,
        borderRadius: 6,
        borderSkipped: false,
        backgroundColor: isRateChart
          ? (ds.data || []).map(function (_, i) {
              return "hsla(" + (45 - i * 4) + ", 100%, " + (50 + i * 2) + "%, 0.88)";
            })
          : dsIndex % 2 === 0 ? yellowBase : yellowAlt,
        borderColor: "#f5b800",
        tension: type === "line" ? 0.35 : 0,
        fill: type === "line",
        maxBarThickness: isRateChart ? 28 : 48
      };
    });

    var chartType = "bar";
    if (type === "line") chartType = "line";
    else if (type === "comparison") chartType = "bar";
    else if (type === "bar") chartType = "bar";

    if (chartType === "line") {
      datasets.forEach(function (ds) {
        ds.borderColor = "#f5b800";
        ds.backgroundColor = "rgba(255, 195, 0, 0.18)";
        ds.pointBackgroundColor = "#ffc300";
        ds.pointBorderColor = "#fff";
        ds.pointRadius = 4;
      });
    }

    var isHorizontalBar = chartType === "bar" && chartDef.title && /转化率/.test(chartDef.title);

    var options = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isHorizontalBar ? "y" : "x",
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: "bottom",
          labels: { usePointStyle: true, padding: 16, font: { family: "'Microsoft YaHei', 'PingFang SC', sans-serif", size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var val = isHorizontalBar ? ctx.parsed.x : ctx.parsed.y;
              if (chartDef.title && /转化率/.test(chartDef.title)) {
                return ctx.dataset.label + ": " + Number(val).toFixed(1) + "%";
              }
              return ctx.dataset.label + ": " + formatChartNumber(val);
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(255, 195, 0, 0.14)" },
          ticks: {
            font: { size: 11 },
            callback: function (value) {
              if (isHorizontalBar) return value + "%";
              return value >= 10000 ? (value / 10000).toFixed(0) + "万" : value.toLocaleString();
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(255, 195, 0, 0.14)" },
          ticks: {
            font: { size: 11 },
            callback: function (value) {
              if (isHorizontalBar) return value;
              return value >= 10000 ? (value / 10000).toFixed(0) + "万" : value.toLocaleString();
            }
          }
        }
      }
    };

    if (isHorizontalBar) {
      options.scales.x.max = 100;
    }

    return {
      type: chartType,
      data: { labels: data.labels, datasets: datasets },
      options: options
    };
  }

  // ===== 文档导出（PDF / Word / Markdown）=====
  function buildExportBaseName() {
    var label = "BrandPilot";
    if (lastResponse && lastResponse.workflowLabel) {
      label += "_" + String(lastResponse.workflowLabel).replace(/[^\u4e00-\u9fa5\w-]+/g, "");
    }
    return label + "_" + new Date().toISOString().slice(0, 10);
  }

  function downloadBlob(content, mimeType, filename) {
    var blob = new Blob([content], { type: mimeType + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf() {
    if (!window.html2pdf) {
      alert("PDF 组件未加载，请刷新页面后重试。");
      return;
    }

    var element = buildExportDocument();
    if (!element) {
      alert("当前没有可下载的分析内容。");
      return;
    }

    showPdfStatus("正在生成 PDF…");

    var opt = {
      margin: [10, 10, 10, 10],
      filename: buildExportBaseName() + ".pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: "#ffffff"
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait"
      },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] }
    };

    document.body.appendChild(element);
    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(function () {
        element.remove();
        showPdfStatus("就绪");
      })
      .catch(function (error) {
        element.remove();
        alert("PDF 生成失败：" + error.message);
        showPdfStatus("就绪");
      });
  }

  function handleDownloadWord() {
    var element = buildExportDocument();
    if (!element) {
      alert("当前没有可下载的分析内容。");
      return;
    }

    showPdfStatus("正在生成 Word…");
    var html =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
      "<title>BrandPilot AI 经营分析报告</title>" +
      "<style>body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;line-height:1.6;color:#1a1f2e;}" +
      "h1{font-size:24px;}h2{font-size:18px;margin-top:24px;}h3{font-size:15px;}" +
      "table{border-collapse:collapse;width:100%;}td,th{border:1px solid #dde1e8;padding:8px;}" +
      "img{max-width:100%;}</style></head><body>" +
      element.innerHTML +
      "</body></html>";
    downloadBlob("\ufeff" + html, "application/msword", buildExportBaseName() + ".doc");
    showPdfStatus("就绪");
  }

  function handleDownloadMarkdown() {
    var markdown = buildExportMarkdown();
    if (!markdown) {
      alert("当前没有可下载的分析内容。");
      return;
    }
    downloadBlob(markdown, "text/markdown", buildExportBaseName() + ".md");
  }

  function buildExportMarkdown() {
    if (!lastResponse) return null;

    var hasProposal = lastResponse.proposal;
    var hasAnswer = Boolean(lastResponse.answer && String(lastResponse.answer).trim());
    var hasCharts = lastResponse.charts && lastResponse.charts.length > 0;
    if (!hasProposal && !hasAnswer && !hasCharts) return null;

    var lines = [];
    lines.push("# BrandPilot AI 经营分析报告");
    if (vizToolbarSubtitle && vizToolbarSubtitle.textContent) {
      lines.push("> " + vizToolbarSubtitle.textContent);
    }
    lines.push("");

    if (hasProposal) {
      var proposal = lastResponse.proposal;
      lines.push("## " + (proposal.title || "经营提案"));
      if (proposal.opportunityScore) {
        lines.push("", "**机会评分：** " + proposal.opportunityScore);
      }
      if (proposal.summary) {
        lines.push("", proposal.summary);
      }
      lines.push("");

      if (proposal.metrics && proposal.metrics.length) {
        lines.push("### 核心指标", "", "| 指标 | 数值 | 变化 |", "| --- | --- | --- |");
        proposal.metrics.forEach(function (metric) {
          lines.push(
            "| " + metric.label + " | " + metric.value + " | " + (metric.delta || "-") + " |"
          );
        });
        lines.push("");
      }

      if (proposal.insights && proposal.insights.length) {
        lines.push("### 关键洞察", "");
        proposal.insights.forEach(function (insight) {
          lines.push("- " + insight);
        });
        lines.push("");
      }

      if (proposal.actions && proposal.actions.length) {
        lines.push("### 推荐动作", "");
        proposal.actions.forEach(function (action, index) {
          lines.push((index + 1) + ". " + action);
        });
        lines.push("");
      }

      if (proposal.timeline && proposal.timeline.length) {
        lines.push("### 推进时间线", "");
        proposal.timeline.forEach(function (item) {
          lines.push("- **" + item.title + "**：" + (item.body || ""));
        });
        lines.push("");
      }

      if (proposal.risks && proposal.risks.length) {
        lines.push("### 风险提示", "");
        proposal.risks.forEach(function (risk) {
          lines.push("- " + risk);
        });
        lines.push("");
      }

      if (proposal.assets && proposal.assets.length) {
        lines.push("### 提案资产", "");
        proposal.assets.forEach(function (asset) {
          lines.push("- **" + asset.title + "**：" + (asset.body || ""));
        });
        lines.push("");
      }
    }

    if (hasCharts) {
      lines.push("## 数据图表", "");
      lastResponse.charts.forEach(function (chart, index) {
        lines.push("### " + (chart.title || ("图表 " + (index + 1))));
        var table = chartToMarkdownTable(chart);
        if (table) {
          lines.push("", table, "");
        }
      });
    }

    if (hasAnswer) {
      lines.push("## 完整分析", "", lastResponse.answer);
    }

    return lines.join("\n");
  }

  function chartToMarkdownTable(chart) {
    if (!chart || !chart.data) return "";
    var labels = chart.data.labels || [];
    var datasets = chart.data.datasets || [];
    if (!labels.length || !datasets.length) return "";

    var header = "| 维度 | " + datasets.map(function (ds) { return ds.label || "数值"; }).join(" | ") + " |";
    var separator = "| --- | " + datasets.map(function () { return "---"; }).join(" | ") + " |";
    var rows = labels.map(function (label, rowIndex) {
      return "| " + label + " | " + datasets.map(function (ds) {
        var value = ds.data && ds.data[rowIndex];
        return value == null ? "-" : value;
      }).join(" | ") + " |";
    });
    return [header, separator].concat(rows).join("\n");
  }

  function buildExportDocument() {
    if (!lastResponse) return null;

    var hasProposal = vizProposal && vizProposal.style.display !== "none";
    var hasAnswer = vizAnswer && vizAnswer.style.display !== "none" && vizAnswer.innerHTML.trim();
    var hasCharts = chartInstances.length > 0 || chartExports.length > 0;
    if (!hasProposal && !hasAnswer && !hasCharts) return null;

    var root = document.createElement("div");
    root.className = "viz-export-document";

    var header = document.createElement("div");
    header.className = "viz-export-header";
    header.innerHTML =
      "<h1>BrandPilot AI 经营分析报告</h1>" +
      "<p>" + escapeHtml((vizToolbarSubtitle && vizToolbarSubtitle.textContent) || "") + "</p>";
    root.appendChild(header);

    if (hasProposal && proposalBody) {
      var proposalSection = document.createElement("section");
      proposalSection.className = "viz-export-section";
      proposalSection.innerHTML =
        "<h2>" + escapeHtml(proposalTitle ? proposalTitle.textContent : "经营提案") + "</h2>" +
        proposalBody.innerHTML;
      root.appendChild(proposalSection);
    }

    if (hasCharts) {
      var chartsSection = document.createElement("section");
      chartsSection.className = "viz-export-section";
      chartsSection.innerHTML = "<h2>数据图表</h2>";
      chartExports.forEach(function (item) {
        var block = document.createElement("div");
        block.className = "viz-export-chart";
        var title = document.createElement("h3");
        title.textContent = item.title || "图表";
        block.appendChild(title);
        if (item.type === "html" && item.element) {
          block.appendChild(item.element.cloneNode(true));
        } else if (item.chart) {
          var img = document.createElement("img");
          img.alt = item.title || "图表";
          img.src = item.chart.toBase64Image();
          block.appendChild(img);
        }
        chartsSection.appendChild(block);
      });
      root.appendChild(chartsSection);
    }

    if (hasAnswer) {
      var answerSection = document.createElement("section");
      answerSection.className = "viz-export-section";
      answerSection.innerHTML = "<h2>完整分析</h2>" + vizAnswer.innerHTML;
      root.appendChild(answerSection);
    }

    root.style.position = "fixed";
    root.style.left = "-10000px";
    root.style.top = "0";
    root.style.width = "794px";
    root.style.background = "#ffffff";
    return root;
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
    chartExports = [];
  }

  function escapeHtml(text) {
    if (window.BrandPilotMarkdown) return window.BrandPilotMarkdown.escapeHtml(text);
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function extractSummary(text) {
    if (window.BrandPilotMarkdown) return window.BrandPilotMarkdown.extractSummary(text, 320);
    if (!text) return "";
    var plain = String(text).replace(/[#>*`|]/g, " ").replace(/\s+/g, " ").trim();
    return plain.length > 320 ? plain.slice(0, 320) + "…" : plain;
  }

  function renderMarkdown(text) {
    if (window.BrandPilotMarkdown) return window.BrandPilotMarkdown.renderMarkdown(text);
    if (!text) return "";
    return "<p>" + escapeHtml(text) + "</p>";
  }

  // ===== 启动 =====
  document.addEventListener("DOMContentLoaded", init);
})();
