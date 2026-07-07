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
  var vizProposal = document.getElementById("vizProposal");
  var proposalTitle = document.getElementById("proposalTitle");
  var proposalBody = document.getElementById("proposalBody");
  var vizDossier = document.getElementById("vizDossier");
  var dossierTitle = document.getElementById("dossierTitle");
  var dossierSubtitle = document.getElementById("dossierSubtitle");
  var dossierBody = document.getElementById("dossierBody");
  var referenceIndex = document.getElementById("referenceIndex");
  var vizCharts = document.getElementById("vizCharts");
  var vizAnswer = document.getElementById("vizAnswer");
  var sidecarReportButton = document.getElementById("sidecarReportButton");
  var exportMenuButton = document.getElementById("exportMenuButton");
  var exportMenuPanel = document.getElementById("exportMenuPanel");
  var reportPreviewModal = document.getElementById("reportPreviewModal");
  var reportPreviewBackdrop = document.getElementById("reportPreviewBackdrop");
  var reportPreviewClose = document.getElementById("reportPreviewClose");
  var reportPreviewSave = document.getElementById("reportPreviewSave");
  var reportPreviewStatus = document.getElementById("reportPreviewStatus");
  var reportExportMenuButton = document.getElementById("reportExportMenuButton");
  var reportExportMenuPanel = document.getElementById("reportExportMenuPanel");
  var reportPreviewFrame = document.getElementById("reportPreviewFrame");
  var reportPreviewTitle = document.getElementById("reportPreviewTitle");
  var reportPreviewMeta = document.getElementById("reportPreviewMeta");
  var documentUploadButton = document.getElementById("documentUploadButton");
  var documentUploadInput = document.getElementById("documentUploadInput");
  var docUploadPanel = document.getElementById("docUploadPanel");
  var docUploadPanelTitle = document.getElementById("docUploadPanelTitle");
  var docUploadPanelSummary = document.getElementById("docUploadPanelSummary");
  var docUploadSteps = document.getElementById("docUploadSteps");
  var docUploadFileList = document.getElementById("docUploadFileList");
  var chatAttachments = document.getElementById("chatAttachments");
  var vizProcess = document.getElementById("vizProcess");
  var vizResultsHeader = document.getElementById("vizResultsHeader");
  var vizSandboxLink = document.getElementById("vizSandboxLink");
  var sandboxMeta = document.getElementById("sandboxMeta");
  var authGuest = document.getElementById("authGuest");
  var authUser = document.getElementById("authUser");
  var authUserName = document.getElementById("authUserName");
  var logoutButton = document.getElementById("logoutButton");
  var sessionSidebar = document.getElementById("sessionSidebar");
  var sessionList = document.getElementById("sessionList");
  var newSessionButton = document.getElementById("newSessionButton");
  var appContainer = document.getElementById("appContainer");
  var defaultChatPlaceholder =
    "输入你的问题，并尽量写明统计周期（如 2026年6月）";

  /** 文档上传/解析 UI 暂关（后端能力保留，恢复时改 true 并重新加载 document-upload.js） */
  var DOCUMENT_UPLOAD_UI_ENABLED = false;

  // ===== 状态 =====
  var isProcessing = false;
  var docUploadBusy = false;
  var statusProtectedUntil = 0;
  var resultPanelsEnabled = false;
  var chartInstances = [];
  var chartExports = [];
  var currentDataSpec = null;
  var currentReferences = [];
  var lastResponse = null;
  var lastSidecarHtml = "";
  var sidecarReportSaved = false;
  var sidecarReportDirty = false;
  var lastChartDefs = [];
  var conversationHistory = [];
  var progressMessageEl = null;
  var progressRunningStepId = null;
  var progressStepsMap = {};
  var streamAnswerText = "";
  var currentSessionId = null;
  var SESSION_STORAGE_KEY = "bp_current_session_id";
  var AR_SCENE_STORAGE_KEY = "brandpilot_ar_scene";
  var messageResponseSnapshots = [];
  var activeSnapshotIndex = -1;
  var pendingUserMessageEl = null;

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

  function inferStepStatus(step) {
    var a = assistant();
    return a && a.inferStepStatus ? a.inferStepStatus(step) : "done";
  }

  function renderTraceStepsHtml(traces, options) {
    var a = assistant();
    if (a && a.renderTraceTreeHtml) {
      return a.renderTraceTreeHtml(traces, {
        compact: options && options.compact,
        escapeHtml: escapeHtml
      });
    }
    if (!traces || !traces.length) return "";
    var html = "";
    traces.forEach(function (t) {
      html +=
        '<div class="trace-item">' +
        '<span class="trace-name">' + escapeHtml(friendlyStepName(t.name)) + "</span>" +
        "</div>";
    });
    return html;
  }

  function resetProgressSteps() {
    progressStepsMap = {
      local_start: {
        id: "local_start",
        name: "听懂你的问题",
        summary: "这就开始处理…",
        status: "running",
        level: 0,
        children: []
      }
    };
  }

  function attachProgressChild(parentId, childId) {
    var parent = progressStepsMap[parentId];
    var child = progressStepsMap[childId];
    if (!parent || !child || parentId === childId) return;
    if (!Array.isArray(parent.children)) parent.children = [];
    if (parent.children.indexOf(childId) < 0) parent.children.push(childId);
  }

  function buildProgressTreeNode(stepId) {
    var step = progressStepsMap[stepId];
    if (!step) return null;
    var node = {
      id: step.id,
      name: step.name,
      summary: step.summary,
      tool: step.tool,
      durationMs: step.durationMs,
      status: step.status,
      level: step.level,
      group: step.group,
      workflow: step.workflow,
      routeReason: step.routeReason
    };
    if (step.children && step.children.length) {
      node.children = step.children.map(buildProgressTreeNode).filter(Boolean);
    }
    return node;
  }

  function renderProgressTreeDom() {
    if (!progressMessageEl) return;
    var stepsEl = progressMessageEl.querySelector(".progress-steps");
    if (!stepsEl) return;
    var a = assistant();
    var root = buildProgressTreeNode("local_start");
    if (a && a.renderProgressStepHtml && root) {
      stepsEl.innerHTML = a.renderProgressStepHtml(root, { escapeHtml: escapeHtml });
    }
    scrollToBottom();
  }

  function upsertProgressStep(stepId, step) {
    if (!progressMessageEl) return;
    if (!stepId) stepId = "run_" + Date.now();
    if (stepId !== "local_start" && progressStepsMap.local_start) {
      progressStepsMap.local_start.status = "done";
    }

    var existing = progressStepsMap[stepId] || { id: stepId, children: [] };
    Object.assign(existing, step, { id: stepId });
    if (!Array.isArray(existing.children)) existing.children = [];
    progressStepsMap[stepId] = existing;

    var parentId = step.parentId || (stepId === "local_start" ? null : "local_start");
    if (parentId && progressStepsMap[parentId]) {
      attachProgressChild(parentId, stepId);
      if (progressStepsMap[parentId].status === "running" && stepId !== parentId) {
        progressStepsMap[parentId].status = "done";
      }
    } else if (stepId !== "local_start") {
      attachProgressChild("local_start", stepId);
    }

    if (step.status === "running" || step.status === "active") {
      progressRunningStepId = stepId;
    } else if (
      step.status === "done" ||
      step.status === "warn" ||
      step.status === "error"
    ) {
      if (progressRunningStepId === stepId) progressRunningStepId = null;
    }

    renderProgressTreeDom();
  }

  function hideDocumentUploadUi() {
    document.body.classList.add("doc-upload-disabled");
    [
      "docUploadPolicyHint",
      "docUploadPanel",
      "chatAttachments",
      "documentUploadButton",
      "documentUploadInput"
    ].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.hidden = true;
    });
  }

  // ===== 初始化 =====
  function init() {
    if (!DOCUMENT_UPLOAD_UI_ENABLED) hideDocumentUploadUi();
    checkConnection();
    bindAuth();
    sendButton.addEventListener("click", handleSend);
    chatInput.addEventListener("keydown", handleInputKey);
    brandSelect.addEventListener("change", handleBrandChange);
    if (sidecarReportButton) sidecarReportButton.addEventListener("click", handleSidecarReport);
    bindExportMenu();
    if (reportPreviewClose) reportPreviewClose.addEventListener("click", closeReportPreview);
    if (reportPreviewBackdrop) reportPreviewBackdrop.addEventListener("click", closeReportPreview);
    if (reportPreviewSave) reportPreviewSave.addEventListener("click", handleSaveSidecarReport);
    bindReportExportMenu();
    if (DOCUMENT_UPLOAD_UI_ENABLED) {
      bindDocumentUpload();
      refreshUploadControls();
    }
    bindExampleButtons();
    bindCitationNavigation(vizProposal);
    bindCitationNavigation(vizDossier);
    bindCitationNavigation(vizAnswer);
    bindMessageRestoreClicks();
    chatInput.addEventListener("input", autoResizeInput);

    if (window.BrandPilotAuth) {
      window.BrandPilotAuth.loadMe().then(function () {
        if (!window.BrandPilotAuth.isLoggedIn()) {
          redirectToLogin();
          return;
        }
        document.body.classList.remove("auth-pending");
        refreshAuthUI();
        return restoreSessionAfterAuth().then(function () {
          setResultPanelsEnabled(Boolean(lastResponse));
        });
      });
    } else {
      redirectToLogin();
    }
  }

  function persistCurrentSessionId(sessionId) {
    currentSessionId = sessionId || null;
    try {
      if (sessionId) sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      else sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      // ignore quota errors
    }
  }

  function readPersistedSessionId() {
    try {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function restoreSessionAfterAuth() {
    var savedSessionId = readPersistedSessionId();
    if (savedSessionId) {
      return selectSession(savedSessionId).catch(function () {
        return createNewSession();
      });
    }
    return createNewSession();
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
        persistCurrentSessionId(null);
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
      persistCurrentSessionId(data.session && data.session.id);
      if (!skipReset) {
        conversationHistory = [];
        lastResponse = null;
        resetMessageRestoreState();
        resetChatToWelcome();
        destroyCharts();
        vizEmpty.style.display = "flex";
        updateExportToolbar(null);
        vizProposal.style.display = "none";
        vizAnswer.style.display = "none";
        vizAnswer.innerHTML = "";
        vizCharts.innerHTML = "";
        vizCharts.style.display = "none";
        if (vizProcess) vizProcess.style.display = "none";
        if (vizResultsHeader) vizResultsHeader.hidden = true;
        if (vizSandboxLink) vizSandboxLink.hidden = true;
        setResultPanelsEnabled(false);
      }
      return refreshSessionList();
    });
  }

  function selectSession(sessionId) {
    if (!window.BrandPilotAuth || !sessionId) return Promise.resolve();
    persistCurrentSessionId(sessionId);
    conversationHistory = [];
    lastResponse = null;
    resetMessageRestoreState();
    resetChatToWelcome(false);
    return window.BrandPilotAuth.loadMessages(sessionId).then(function (data) {
      var messages = data.messages || [];
      messages.forEach(function (msg) {
        if (msg.role === "user") {
          addMessage("user", msg.content);
          conversationHistory.push({ role: "user", content: msg.content });
        } else if (msg.role === "assistant") {
          if (msg.metadata && msg.metadata.workflow) {
            addAgentMessage(buildAgentMessageFromStored(msg), 0, { skipRestoreHighlight: true });
          } else {
            addMessage("assistant", msg.content);
          }
          conversationHistory.push({ role: "assistant", content: msg.content });
        }
      });
      if (messageResponseSnapshots.length) {
        restoreResponseSnapshot(messageResponseSnapshots.length - 1);
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
      '<p class="chat-hint">先输入问题并发送；右侧会展示<strong>分析报告</strong>，支持 HTML / PDF 导出。</p>' +
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

  function setResultPanelsEnabled(enabled) {
    resultPanelsEnabled = Boolean(enabled);

    if (appContainer) {
      appContainer.classList.toggle("app-container--chat-only", !resultPanelsEnabled);
    }
  }

  function resetMessageRestoreState() {
    messageResponseSnapshots = [];
    activeSnapshotIndex = -1;
    pendingUserMessageEl = null;
  }

  function buildResponseSnapshot(data) {
    if (!data) return null;
    return {
      answer: data.answer || "",
      proposal: data.proposal || null,
      charts: data.charts ? JSON.parse(JSON.stringify(data.charts)) : [],
      dataSpec: data.dataSpec || null,
      references: data.references || (data.proposal && data.proposal.references) || [],
      dossier: data.dossier || null,
      workflow: data.workflow || "",
      workflowLabel: data.workflowLabel || "",
      scene: data.scene || null,
      capabilities: data.capabilities || null
    };
  }

  function buildAgentMessageFromStored(msg) {
    var meta = msg.metadata || {};
    return {
      workflow: meta.workflow,
      workflowLabel: meta.workflowLabel,
      intent: meta.intent,
      tokenUsage: meta.tokenUsage,
      agentTrace: [],
      answer: msg.content,
      proposal: meta.proposal,
      charts: meta.charts,
      references: meta.references,
      dossier: meta.dossier,
      dataSpec: meta.dataSpec,
      capabilities: meta.capabilities,
      dataMode: "supabase",
      persistence: { persisted: true }
    };
  }

  function isRestorableResponse(data) {
    if (!data || data.workflow === "greeting") return false;
    return Boolean(data.proposal || data.answer || (data.charts && data.charts.length));
  }

  function highlightActiveSnapshot(index) {
    if (!chatMessages) return;
    chatMessages.querySelectorAll(".message-restorable.is-active-result").forEach(function (node) {
      node.classList.remove("is-active-result");
    });
    if (index < 0) return;
    chatMessages.querySelectorAll('.message-restorable[data-snapshot-index="' + index + '"]').forEach(function (node) {
      node.classList.add("is-active-result");
    });
  }

  function restoreResponseSnapshot(index) {
    if (index < 0 || index >= messageResponseSnapshots.length) return;
    activeSnapshotIndex = index;
    highlightActiveSnapshot(index);
    revealResultExperience(messageResponseSnapshots[index]);
  }

  function registerRestorableExchange(assistantEl, data, options) {
    options = options || {};
    var snapshot = buildResponseSnapshot(data);
    if (!snapshot) return -1;

    var index = messageResponseSnapshots.length;
    messageResponseSnapshots.push(snapshot);

    assistantEl.classList.add("message-restorable");
    assistantEl.setAttribute("data-snapshot-index", String(index));
    assistantEl.setAttribute("title", "点击查看右侧分析结果");

    if (pendingUserMessageEl) {
      pendingUserMessageEl.classList.add("message-restorable");
      pendingUserMessageEl.setAttribute("data-snapshot-index", String(index));
      pendingUserMessageEl.setAttribute("title", "点击查看右侧分析结果");
      pendingUserMessageEl = null;
    }

    if (!options.skipRestoreHighlight) {
      activeSnapshotIndex = index;
      highlightActiveSnapshot(index);
    }

    return index;
  }

  function bindMessageRestoreClicks() {
    if (!chatMessages) return;
    chatMessages.addEventListener("click", function (event) {
      if (isProcessing) return;
      if (event.target.closest("a, button, .example-btn, .agent-trace")) return;

      var messageEl = event.target.closest(".message-restorable");
      if (!messageEl || !chatMessages.contains(messageEl)) return;

      var index = parseInt(messageEl.getAttribute("data-snapshot-index"), 10);
      if (isNaN(index) || index === activeSnapshotIndex) return;

      restoreResponseSnapshot(index);
    });
  }

  function revealResultExperience(data) {
    if (!data) return;

    lastResponse = data;
    try {
      sessionStorage.setItem(
        "bp_last_response",
        JSON.stringify({
          answer: data.answer || "",
          proposal: data.proposal || null,
          charts: data.charts || [],
          dataSpec: data.dataSpec || null,
          workflow: data.workflow || "",
          workflowLabel: data.workflowLabel || ""
        })
      );
    } catch (error) {
      // ignore quota errors
    }

    setResultPanelsEnabled(true);
    renderVisualization(data);
  }

  // ===== 连接检查 =====
  function setStatusText(text, options) {
    if (!statusText) return;
    statusText.textContent = text || "就绪";
    if (options && options.protectMs) {
      statusProtectedUntil = Date.now() + options.protectMs;
    } else if (options && options.clearProtect) {
      statusProtectedUntil = 0;
    }
  }

  var UPLOAD_STEP_ORDER = ["select", "read", "parse", "done"];

  function setDocUploadStep(step) {
    if (!docUploadSteps) return;
    var activeIndex = UPLOAD_STEP_ORDER.indexOf(step);
    docUploadSteps.querySelectorAll(".doc-upload-step").forEach(function (node) {
      var nodeStep = node.getAttribute("data-step");
      var nodeIndex = UPLOAD_STEP_ORDER.indexOf(nodeStep);
      node.classList.remove("is-active", "is-complete");
      if (nodeIndex < activeIndex) node.classList.add("is-complete");
      if (nodeIndex === activeIndex) node.classList.add("is-active");
    });
  }

  function renderDocUploadFileRows(fileNames) {
    if (!docUploadFileList) return;
    docUploadFileList.innerHTML = (fileNames || [])
      .map(function (name, index) {
        return (
          '<li class="doc-upload-file-item is-pending" data-file-index="' +
          index +
          '">' +
          '<span class="doc-upload-file-icon" aria-hidden="true">⏳</span>' +
          '<span class="doc-upload-file-name" title="' +
          escapeHtml(name).replace(/"/g, "&quot;") +
          '">' +
          escapeHtml(name) +
          "</span>" +
          '<span class="doc-upload-file-state">等待处理</span>' +
          "</li>"
        );
      })
      .join("");
  }

  function updateDocUploadFileRow(index, options) {
    if (!docUploadFileList) return;
    var row = docUploadFileList.querySelector('[data-file-index="' + index + '"]');
    if (!row) return;
    var opts = options || {};
    var icon = row.querySelector(".doc-upload-file-icon");
    var state = row.querySelector(".doc-upload-file-state");
    row.classList.remove("is-pending", "is-active", "is-done", "is-error");
    if (opts.error) {
      row.classList.add("is-error");
      if (icon) icon.textContent = "✕";
      if (state) state.textContent = opts.message || "解析失败";
      return;
    }
    if (opts.done && opts.item) {
      row.classList.add("is-done");
      if (icon) icon.textContent = "✓";
      if (state) {
        state.textContent =
          window.BrandPilotDocuments.parseStatusLabel(opts.item) +
          " · " +
          (opts.item.charCount || 0).toLocaleString("zh-CN") +
          " 字 · " +
          (opts.item.chunkCount || 1) +
          " 段";
      }
      return;
    }
    row.classList.add("is-active");
    if (icon) icon.textContent = "◌";
    if (state) {
      state.textContent = window.BrandPilotDocuments
        ? window.BrandPilotDocuments.filePhaseLabel(opts.phase)
        : opts.phase || "处理中…";
    }
  }

  function showDocUploadPanel(fileNames) {
    if (!docUploadPanel) {
      setStatusText("正在上传文档…", { clearProtect: true });
      return;
    }
    docUploadPanel.hidden = false;
    docUploadPanel.classList.remove("is-done", "is-error");
    docUploadPanel.classList.add("is-busy");
    if (docUploadPanelTitle) docUploadPanelTitle.textContent = "正在上传文档…";
    if (docUploadPanelSummary) {
      docUploadPanelSummary.textContent =
        "共 " + (fileNames || []).length + " 个文件，请稍候";
    }
    setDocUploadStep("select");
    renderDocUploadFileRows(fileNames);
    if (docUploadPanel.scrollIntoView) {
      docUploadPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function finishDocUploadPanel(items, hadError) {
    if (!docUploadPanel) return;
    docUploadPanel.classList.remove("is-busy");
    docUploadPanel.classList.toggle("is-done", !hadError);
    docUploadPanel.classList.toggle("is-error", Boolean(hadError));
    setDocUploadStep("done");
    if (docUploadPanelTitle) {
      docUploadPanelTitle.textContent = hadError ? "部分文档解析失败" : "✅ 文档上传成功";
    }
    if (docUploadPanelSummary && items && items.length) {
      docUploadPanelSummary.textContent =
        "已解析 " +
        items.length +
        " 个文档，可输入问题后发送；数字类问题请直接提问查底表";
    }
  }

  function hideDocUploadPanel() {
    if (!docUploadPanel) return;
    docUploadPanel.hidden = true;
    docUploadPanel.classList.remove("is-busy", "is-done", "is-error");
    if (docUploadFileList) docUploadFileList.innerHTML = "";
    if (docUploadPanelSummary) docUploadPanelSummary.textContent = "";
  }

  function handleDocUploadProgress(event) {
    if (!event || !window.BrandPilotDocuments) return;
    if (event.type === "batch_start") {
      showDocUploadPanel(event.files || []);
      setDocUploadStep("select");
      return;
    }
    if (event.type === "file_start") {
      setDocUploadStep("read");
      updateDocUploadFileRow(event.index, { phase: "reading" });
      setStatusText("正在读取：" + event.file, { clearProtect: true });
      return;
    }
    if (event.type === "file_phase") {
      if (event.phase === "reading") setDocUploadStep("read");
      else setDocUploadStep("parse");
      updateDocUploadFileRow(event.index, { phase: event.phase });
      setStatusText(
        window.BrandPilotDocuments.filePhaseLabel(event.phase) + "：" + event.file,
        { clearProtect: true }
      );
      return;
    }
    if (event.type === "file_done") {
      updateDocUploadFileRow(event.index, { done: true, item: event.item });
      return;
    }
    if (event.type === "file_error") {
      updateDocUploadFileRow(event.index, { error: true, message: event.message });
      return;
    }
    if (event.type === "batch_done") {
      finishDocUploadPanel(event.items || [], false);
      return;
    }
  }

  function syncDocumentUploadStatus(options) {
    if (!window.BrandPilotDocuments) return;
    var items = window.BrandPilotDocuments.getAttachments();
    if (!items.length) {
      setStatusText("就绪", { clearProtect: true });
      hideDocUploadPanel();
      return;
    }
    var summary = window.BrandPilotDocuments.formatUploadStatusSummary(items);
    if (summary) {
      setStatusText(summary, { protectMs: (options && options.protectMs) || 600000 });
      if (docUploadPanel && !docUploadPanel.classList.contains("is-busy")) {
        docUploadPanel.hidden = false;
        docUploadPanel.classList.add("is-done");
        if (docUploadPanelTitle) docUploadPanelTitle.textContent = "✅ 文档已就绪";
        if (docUploadPanelSummary) {
          docUploadPanelSummary.textContent = summary.replace(/^✅\s*/, "");
        }
        setDocUploadStep("done");
      }
    }
  }

  function isStatusProtected() {
    return Date.now() < statusProtectedUntil || docUploadBusy || isProcessing;
  }

  function checkConnection() {
    fetch("/api/health")
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        if (data.status === "ok") {
          connectionDot.classList.add("connected");
          connectionDot.classList.remove("disconnected");
          if (!isStatusProtected()) setStatusText("就绪");
        } else {
          connectionDot.classList.add("disconnected");
          connectionDot.classList.remove("connected");
          if (!isStatusProtected()) setStatusText("降级");
        }
      })
      .catch(function () {
        connectionDot.classList.add("disconnected");
        connectionDot.classList.remove("connected");
        if (!isStatusProtected()) setStatusText("离线");
      });
  }

  function resetChatInputPlaceholder() {
    if (!chatInput) return;
    var hasDocs = window.BrandPilotDocuments && window.BrandPilotDocuments.getAttachments().length;
    if (!hasDocs) chatInput.placeholder = defaultChatPlaceholder;
  }

  function refreshUploadControls() {
    var attachmentCount = window.BrandPilotDocuments
      ? window.BrandPilotDocuments.getAttachments().length
      : 0;
    var maxFiles = window.BrandPilotDocuments ? window.BrandPilotDocuments.maxFiles : 3;
    var remaining = Math.max(0, maxFiles - attachmentCount);
    var atMax = remaining <= 0;
    var blocked = docUploadBusy || isProcessing;

    if (documentUploadButton) {
      documentUploadButton.classList.toggle("is-uploading", docUploadBusy);
      documentUploadButton.classList.toggle("is-at-limit", atMax && !blocked);
      documentUploadButton.classList.toggle("is-disabled", blocked);
      documentUploadButton.disabled = blocked;
      documentUploadButton.setAttribute("aria-busy", docUploadBusy ? "true" : "false");
      if (atMax && !blocked) {
        documentUploadButton.title =
          "已达 " + maxFiles + " 个文档上限，移除后可继续上传";
      } else if (isProcessing) {
        documentUploadButton.title = "分析进行中，完成后可继续上传";
      } else if (docUploadBusy) {
        documentUploadButton.title = "文档解析中…";
      } else {
        documentUploadButton.title =
          "上传策略性文档或图片（还可添加 " + remaining + " 个，最多 " + maxFiles + " 个）";
      }
    }
  }

  function setDocumentUploadBusy(busy) {
    docUploadBusy = Boolean(busy);
    refreshUploadControls();
  }

  function bindReportExportMenu() {
    if (!reportExportMenuButton || !reportExportMenuPanel) return;

    function closeReportExportMenu() {
      reportExportMenuPanel.hidden = true;
      reportExportMenuButton.setAttribute("aria-expanded", "false");
    }

    reportExportMenuButton.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = reportExportMenuPanel.hidden;
      closeReportExportMenu();
      if (open) {
        reportExportMenuPanel.hidden = false;
        reportExportMenuButton.setAttribute("aria-expanded", "true");
      }
    });

    reportExportMenuPanel.addEventListener("click", function (event) {
      var item = event.target.closest("[data-report-export]");
      if (!item) return;
      closeReportExportMenu();
      var kind = item.getAttribute("data-report-export");
      if (kind === "html") handleDownloadSidecarHtml();
      else if (kind === "pdf") handleDownloadSidecarPdf();
      else if (kind === "word") handleDownloadSidecarWord();
    });

    document.addEventListener("click", function (event) {
      if (reportExportMenuPanel.hidden) return;
      if (event.target.closest(".report-export-menu")) return;
      closeReportExportMenu();
    });
  }

  function bindExportMenu() {
    if (!exportMenuButton || !exportMenuPanel) return;

    function closeExportMenu() {
      exportMenuPanel.hidden = true;
      exportMenuButton.setAttribute("aria-expanded", "false");
    }

    exportMenuButton.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = exportMenuPanel.hidden;
      closeExportMenu();
      if (open) {
        exportMenuPanel.hidden = false;
        exportMenuButton.setAttribute("aria-expanded", "true");
      }
    });

    exportMenuPanel.addEventListener("click", function (event) {
      var item = event.target.closest("[data-export]");
      if (!item) return;
      closeExportMenu();
      var kind = item.getAttribute("data-export");
      if (kind === "html") handleDownloadHtml();
      else if (kind === "pdf") handleDownloadPdf();
      else if (kind === "word") handleDownloadWord();
      else if (kind === "markdown") handleDownloadMarkdown();
    });

    document.addEventListener("click", function (event) {
      if (exportMenuPanel.hidden) return;
      if (event.target.closest(".export-menu")) return;
      closeExportMenu();
    });
  }

  function updateUploadBadge() {
    var badge = document.getElementById("documentUploadBadge");
    if (!badge || !window.BrandPilotDocuments) return;
    var count = window.BrandPilotDocuments.getAttachments().length;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = String(count);
      badge.setAttribute("aria-hidden", "false");
    } else {
      badge.hidden = true;
      badge.setAttribute("aria-hidden", "true");
    }
    refreshUploadControls();
  }

  function bindDocumentUpload() {
    if (!DOCUMENT_UPLOAD_UI_ENABLED || !documentUploadButton || !documentUploadInput) return;

    documentUploadButton.addEventListener("click", function () {
      if (docUploadBusy) {
        setStatusText("文档解析中，请稍候", { protectMs: 3000 });
        return;
      }
      if (isProcessing) {
        setStatusText("分析进行中，请等待完成后再上传", { protectMs: 3000 });
        return;
      }
      var count =
        window.BrandPilotDocuments && window.BrandPilotDocuments.getAttachments
          ? window.BrandPilotDocuments.getAttachments().length
          : 0;
      var maxFiles =
        window.BrandPilotDocuments && window.BrandPilotDocuments.maxFiles
          ? window.BrandPilotDocuments.maxFiles
          : 3;
      if (count >= maxFiles) {
        setStatusText(
          "已达 " + maxFiles + " 个文档上限，请先移除已有文档",
          { protectMs: 4000 }
        );
        return;
      }
      documentUploadInput.click();
    });

    documentUploadInput.addEventListener("change", function () {
      var files = documentUploadInput.files;
      documentUploadInput.value = "";
      if (!files || !files.length || !window.BrandPilotDocuments) return;
      if (!window.BrandPilotAuth || !window.BrandPilotAuth.isLoggedIn()) {
        redirectToLogin();
        return;
      }
      statusProtectedUntil = 0;
      setDocumentUploadBusy(true);
      showDocUploadPanel(Array.prototype.map.call(files, function (file) { return file.name; }));
      window.BrandPilotDocuments.addFiles(files, {
        onProgress: handleDocUploadProgress
      })
        .then(function (added) {
          window.BrandPilotDocuments.renderChips(chatAttachments, {
            justCompleted: true,
            addedCount: (added && added.length) || 1
          });
          updateUploadBadge();
          var list = (added && added.length) ? added : window.BrandPilotDocuments.getAttachments();
          syncDocumentUploadStatus({ protectMs: 600000 });
          var names = (list || []).map(function (item) { return item.filename; }).join("、");
          if (chatInput && names) {
            chatInput.placeholder =
              names +
              " 已就绪，输入问题后发送；或直接发送让 AI 分析文档内容";
          }
          if (chatAttachments && typeof chatAttachments.scrollIntoView === "function") {
            chatAttachments.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        })
        .catch(function (error) {
          alert(error.message || "文档解析失败");
          setStatusText("文档解析失败", { protectMs: 4000 });
          finishDocUploadPanel(window.BrandPilotDocuments.getAttachments(), true);
          if (docUploadPanelTitle) docUploadPanelTitle.textContent = "文档解析失败";
          if (docUploadPanelSummary) docUploadPanelSummary.textContent = error.message || "请重试";
        })
        .finally(function () {
          setDocumentUploadBusy(false);
          refreshUploadControls();
        });
    });

    if (chatAttachments) {
      chatAttachments.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-doc-remove]");
        if (!btn || !window.BrandPilotDocuments) return;
        window.BrandPilotDocuments.removeAttachment(btn.getAttribute("data-doc-remove"));
        window.BrandPilotDocuments.renderChips(chatAttachments);
        updateUploadBadge();
        resetChatInputPlaceholder();
        syncDocumentUploadStatus();
        refreshUploadControls();
      });
    }
  }

  function formatUserMessageContent(message, attachments) {
    var html = "<p>" + escapeHtml(message).replace(/\n/g, "<br>") + "</p>";
    if (attachments && attachments.length) {
      html += '<div class="message-attachments">';
      attachments.forEach(function (item) {
        html +=
          '<span class="message-attachment-chip">📎 ' +
          escapeHtml(item.filename || item.name || "文档") +
          "</span>";
      });
      html += "</div>";
    }
    return html;
  }

  // ===== 发送消息 =====
  function handleSend() {
    if (isProcessing || docUploadBusy) return;

    if (!window.BrandPilotAuth || !window.BrandPilotAuth.isLoggedIn()) {
      redirectToLogin();
      return;
    }

    var message = chatInput.value.trim();
    var attachments = window.BrandPilotDocuments
      ? (window.BrandPilotDocuments.getAttachmentsForRequest
          ? window.BrandPilotDocuments.getAttachmentsForRequest()
          : window.BrandPilotDocuments.getAttachments())
      : [];
    if (!message && !attachments.length) return;
    if (!message && attachments.length) {
      message = "请结合上传文档内容进行分析。";
    }

    addUserMessage(message, attachments);
    chatInput.value = "";
    autoResizeInput();
    if (window.BrandPilotDocuments) {
      window.BrandPilotDocuments.clearAttachments();
      window.BrandPilotDocuments.renderChips(chatAttachments);
      updateUploadBadge();
      resetChatInputPlaceholder();
      hideDocUploadPanel();
    }

    conversationHistory.push({ role: "user", content: message });
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    isProcessing = true;
    sendButton.disabled = true;
    statusText.textContent = "分析中";
    setDocumentUploadBusy(false);

    var startTime = Date.now();
    var brandHint = brandSelect.value || "haidilao";
    startProgressMessage();

    function runChat() {
      return runChatStream({
        message: message,
        attachments: attachments,
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
        if (data.workflow !== "greeting") {
          revealResultExperience(data);
        } else {
          setResultPanelsEnabled(false);
        }

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
        refreshUploadControls();
        if (!isStatusProtected()) setStatusText("就绪");
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
        parentId: data.parentId,
        level: data.level,
        group: data.group,
        workflow: data.workflow,
        routeReason: data.routeReason,
        status: "running"
      });
      return;
    }
    if (eventName === "step") {
      var status = data.status || "done";
      if (status !== "running" && status !== "done" && status !== "warn" && status !== "error") {
        status = inferStepStatus(data);
      }
      upsertProgressStep(data.id || ("run_" + Date.now()), {
        name: data.name,
        tool: data.tool,
        summary: data.summary,
        durationMs: data.durationMs,
        parentId: data.parentId,
        level: data.level,
        group: data.group,
        workflow: data.workflow,
        routeReason: data.routeReason,
        status: status
      });
      return;
    }
    if (eventName === "answer_delta" && data.text) {
      appendStreamAnswer(data.text);
    }
  }

  function appendStreamAnswer(text) {
    streamAnswerText += text;
    if (!progressMessageEl) return;
    var answerEl = progressMessageEl.querySelector(".stream-answer");
    if (!answerEl) return;
    answerEl.hidden = false;
    answerEl.textContent = streamAnswerText;
    scrollToBottom();
  }

  function startProgressMessage() {
    removeProgressMessage();
    streamAnswerText = "";
    progressRunningStepId = "local_start";
    resetProgressSteps();

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
      '<ul class="progress-steps">' +
      '<li class="progress-step running active" data-step-id="local_start">' +
      '<span class="progress-dot"></span>' +
      '<span class="progress-text"><strong>听懂你的问题</strong> ' +
      '<span class="trace-summary">这就开始处理…</span></span>' +
      "</li></ul>" +
      '<div class="stream-answer" hidden></div>';

    body.appendChild(content);
    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    progressMessageEl = div;
    renderProgressTreeDom();
    scrollToBottom();
  }

  function finalizeAllProgressSteps() {
    Object.keys(progressStepsMap).forEach(function (id) {
      if (progressStepsMap[id].status === "running") {
        progressStepsMap[id].status = "done";
      }
    });
    renderProgressTreeDom();
  }

  function finalizeStreamMessage(latencyMs, data) {
    if (progressMessageEl) {
      finalizeAllProgressSteps();
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
    progressRunningStepId = null;
    progressStepsMap = {};
    streamAnswerText = "";
  }

  // ===== 消息渲染 =====
  function addUserMessage(text, attachments) {
    var div = document.createElement("div");
    div.className = "message user";

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "👤";

    var body = document.createElement("div");
    body.className = "message-body";

    var content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = formatUserMessageContent(text, attachments);

    body.appendChild(content);
    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);
    pendingUserMessageEl = div;
    scrollToBottom();
  }

  function addMessage(role, text) {
    if (role === "user") {
      addUserMessage(text, []);
      return;
    }

    pendingUserMessageEl = null;

    var div = document.createElement("div");
    div.className = "message " + role;

    var avatar = createAssistantAvatar();

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

  function addAgentMessage(data, latencyMs, options) {
    options = options || {};
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

    // 数据模式提醒（仅经营分析类工作流）
    var dataWorkflows = ["data_query", "period_compare", "funnel_diagnosis", "competitor_benchmark", "annual_proposal"];
    if ((data.dataMode === "empty" || data.dataMode === "unavailable") && dataWorkflows.indexOf(data.workflow) >= 0) {
      var notice = document.createElement("div");
      notice.className = "data-notice";
      notice.textContent = "⚠️ 当前无可用经营数据，请检查 Supabase 配置与种子数据。";
      body.appendChild(notice);
    }

    if (data.quality && Array.isArray(data.quality.issues) && data.quality.issues.length) {
      var qualityNotice = document.createElement("div");
      qualityNotice.className = "quality-notice" + (data.quality.passed === false ? " is-error" : "");
      qualityNotice.innerHTML = data.quality.issues
        .map(function (issue) {
          return "<div>" + escapeHtml(issue.message || issue.code || "质量告警") + "</div>";
        })
        .join("");
      body.appendChild(qualityNotice);
    }

    // 完整回答（不截断）— 结果优先展示
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

    // Agent 执行轨迹 — 分析过程放在回答之后（寒暄类不展示轨迹）
    if (data.agentTrace && data.agentTrace.length > 0 && data.workflow !== "greeting") {
      var trace = document.createElement("div");
      trace.className = "agent-trace";
      trace.innerHTML = renderTraceStepsHtml(data.agentTrace);
      body.appendChild(trace);
    }

    // 能力与持久化提示
    var capability = document.createElement("div");
    capability.className = "capability-badge";
    var caps = data.capabilities || {};
    var persist = data.persistence || {};
    capability.innerHTML =
      "<span>智能查数</span><span>经营手册</span>" +
      '<span class="' + (persist.persisted ? "ok" : "warn") + '">' +
      (persist.persisted ? "分析已保存" : "分析暂存本地") +
      "</span>";
    body.appendChild(capability);

    if (isRestorableResponse(data)) {
      var hint = document.createElement("div");
      hint.className = "message-restore-hint";
      hint.textContent = "点击查看右侧完整报告";
      body.appendChild(hint);
    }

    div.appendChild(avatar);
    div.appendChild(body);
    chatMessages.appendChild(div);

    if (isRestorableResponse(data)) {
      registerRestorableExchange(div, data, options);
    } else {
      pendingUserMessageEl = null;
    }

    scrollToBottom();
  }

  function addErrorMessage(errorText) {
    pendingUserMessageEl = null;
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

  function buildReferenceIndex(refs) {
    var map = Object.create(null);
    (refs || []).forEach(function (ref) {
      if (ref && ref.id) map[ref.id] = ref;
    });
    return map;
  }

  function renderCitationRefs(refs, refIndex) {
    if (!refs || !refs.length) return "";
    return refs
      .map(function (id) {
        var ref = refIndex[id];
        var href = ref ? ref.href : "#ref-" + id;
        var title = ref ? ref.title + " · " + (ref.location || ref.source || "") : id;
        return (
          '<a class="citation-ref" href="' +
          escapeHtml(href) +
          '" data-ref-id="' +
          escapeHtml(id) +
          '" title="' +
          escapeHtml(title) +
          '">[' +
          escapeHtml(id) +
          "]</a>"
        );
      })
      .join("");
  }

  function citedItemText(item) {
    if (typeof item === "string") return item;
    return item.text || item.label || "";
  }

  function citedItemRefs(item) {
    if (typeof item === "string") return [];
    return item.refs || [];
  }

  function linkifyCitations(html, refIndex) {
    if (!html) return "";
    return String(html).replace(/\[([KDSAPC]\d+)\]/g, function (_, id) {
      var ref = refIndex[id];
      if (!ref) {
        return (
          '<a class="citation-ref" href="#ref-' +
          escapeHtml(id) +
          '" data-ref-id="' +
          escapeHtml(id) +
          '">[' +
          escapeHtml(id) +
          "]</a>"
        );
      }
      return (
        '<a class="citation-ref" href="' +
        escapeHtml(ref.href) +
        '" data-ref-id="' +
        escapeHtml(id) +
        '" title="' +
        escapeHtml(ref.title || id) +
        '">[' +
        escapeHtml(id) +
        "]</a>"
      );
    });
  }

  function scrollToReference(refId) {
    if (!refId) return;
    var target = document.getElementById("ref-" + refId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      target.classList.add("is-highlight");
      window.setTimeout(function () {
        target.classList.remove("is-highlight");
      }, 1600);
    }
  }

  function bindCitationNavigation(root) {
    if (!root) return;
    root.addEventListener("click", function (event) {
      var link = event.target.closest(".citation-ref");
      if (!link) return;
      var refId = link.getAttribute("data-ref-id");
      if (!refId) return;
      event.preventDefault();
      scrollToReference(refId);
    });
  }

  function renderReferenceDetails(ref) {
    var details = ref && (ref.details || ref.meta);
    if (!details && ref && ref.type === "data" && ref.source) {
      details = { table: ref.source };
    }
    if (!details) return "";

    var rows = Array.isArray(details.rows) ? details.rows : (Array.isArray(details) ? details : []);
    var rowCount = Number(details.rowCount || rows.length || 0);
    var html = '<div class="reference-details">';
    var sqlOpen = ref.type === "data" || ref.type === "sql" ? " open" : "";

    if (details.table || details.dataMode || rowCount) {
      var meta = [];
      var tableLabel =
        details.tableLabel ||
        (window.BrandPilotColumnAliases && window.BrandPilotColumnAliases.tableLabel(details.table)) ||
        details.table;
      if (details.table) meta.push("表：" + tableLabel + (tableLabel !== details.table ? "（" + details.table + "）" : ""));
      if (details.dataMode) meta.push("数据源：" + details.dataMode);
      if (rowCount || rows.length) meta.push("结果：" + rowCount + " 行");
      if (meta.length) html += '<p class="reference-detail-meta">' + escapeHtml(meta.join(" · ")) + "</p>";
    }

    if (details.filters && Object.keys(details.filters).length) {
      html += '<p class="reference-detail-meta">筛选：' + escapeHtml(formatReferenceValue(details.filters)) + "</p>";
    }

    if (details.sql) {
      html +=
        '<details class="reference-sql"' +
        sqlOpen +
        '><summary>查询 SQL</summary><pre>' +
        escapeHtml(details.sql) +
        "</pre></details>";
    }

    if (rows.length) {
      html += '<div class="reference-result-block"><div class="reference-result-title">结果明细（前 ' + rows.length + " 行" + (rowCount > rows.length ? " / 共 " + rowCount + " 行" : "") + "）</div>";
      html += renderReferenceRows(rows, details.table, details.columnLabels);
      html += "</div>";
    } else if (ref.type === "data" && !details.sql && details && typeof details === "object") {
      html += '<pre class="reference-detail-json">' + escapeHtml(JSON.stringify(details, null, 2)) + "</pre>";
    }

    if (ref.type === "calculation" && (details.formula || details.formulaLines)) {
      html += '<div class="reference-calc"><div class="reference-result-title">计算公式</div>';
      var formulaLines = details.formulaLines || [details.formula];
      formulaLines.forEach(function (line) {
        if (!line) return;
        html += "<pre>" + escapeHtml(line) + "</pre>";
      });
      if (details.formula && details.formulaLines && details.formulaLines.length) {
        html += '<p class="reference-detail-meta">通用口径：' + escapeHtml(details.formula) + "</p>";
      }
      if (details.result) {
        html += '<div class="reference-result-title">计算结果</div><pre class="reference-detail-json">' + escapeHtml(JSON.stringify(details.result, null, 2)) + "</pre>";
      }
      if (details.inputs && details.inputs.length) {
        html += '<p class="reference-detail-meta">输入引用：' + escapeHtml(details.inputs.join(", ")) + "</p>";
      }
      html += "</div>";
    }

    html += "</div>";
    return html;
  }

  function columnHeaderLabel(key, table, columnLabels) {
    if (columnLabels && columnLabels[key]) return columnLabels[key];
    if (window.BrandPilotColumnAliases) {
      return window.BrandPilotColumnAliases.labelForColumn(key, table);
    }
    return key;
  }

  function renderReferenceRows(rows, table, columnLabels) {
    var list = rows || [];
    if (!list.length) return "";
    var keys = [];
    list.forEach(function (row) {
      Object.keys(row || {}).forEach(function (key) {
        if (keys.indexOf(key) < 0) keys.push(key);
      });
    });
    if (!keys.length) return '<pre class="reference-detail-json">' + escapeHtml(JSON.stringify(list, null, 2)) + "</pre>";

    var html = '<div class="reference-table-wrap"><table class="reference-table"><thead><tr>';
    keys.forEach(function (key) {
      html +=
        "<th title=\"" +
        escapeHtml(key) +
        "\">" +
        escapeHtml(columnHeaderLabel(key, table, columnLabels)) +
        "</th>";
    });
    html += "</tr></thead><tbody>";
    list.forEach(function (row) {
      html += "<tr>";
      keys.forEach(function (key) {
        html += "<td>" + escapeHtml(formatReferenceValue(row ? row[key] : "")) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function formatReferenceValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  function renderDossier(dossier, references) {
    if (!vizDossier) return;
    var refs = references || (dossier && dossier.references) || [];
    if (!dossier && !refs.length) {
      if (vizProcess) vizProcess.style.display = "none";
      if (referenceIndex) referenceIndex.innerHTML = "";
      if (dossierBody) dossierBody.innerHTML = "";
      return;
    }

    if (vizProcess) vizProcess.style.display = "block";
    if (dossierTitle) {
      dossierTitle.textContent = dossier ? (dossier.title || "Agent 分析汇总") : "引用索引";
    }
    if (dossierSubtitle) {
      dossierSubtitle.textContent = dossier
        ? (dossier.workflowLabel || "") +
          (dossier.generatedAt ? " · " + new Date(dossier.generatedAt).toLocaleString("zh-CN") : "")
        : "数据与知识来源";
    }

    var refIndex = buildReferenceIndex(refs);
    if (dossier && dossierBody) {
      var html = "";
      (dossier.agents || []).forEach(function (agent) {
      var anchorId = String(agent.location || agent.id || "agent")
        .replace(/^#/, "")
        .replace(/[^\w\u4e00-\u9fa5-]+/g, "-");
      html += '<section class="dossier-agent" id="' + escapeHtml(anchorId) + '">';
      html +=
        "<h3>" +
        escapeHtml(agent.name) +
        ' <a class="dossier-location" href="' +
        escapeHtml(agent.location || "#") +
        '">[' +
        escapeHtml(agent.citation || agent.id) +
        "]</a></h3>";
      if (agent.role) html += '<p class="dossier-role">' + escapeHtml(agent.role) + "</p>";
      if (agent.summary) html += '<p class="dossier-summary">' + escapeHtml(agent.summary) + "</p>";
      if (agent.tool) html += '<p class="dossier-tool">工具：' + escapeHtml(agent.tool) + "</p>";
      if (agent.formulas && agent.formulas.length) {
        html += '<div class="dossier-formulas"><div class="dossier-formulas-title">计算公式</div><ul>';
        agent.formulas.forEach(function (formula) {
          html += "<li><code>" + escapeHtml(formula) + "</code></li>";
        });
        html += "</ul></div>";
      }
      if (agent.conclusions && agent.conclusions.length) {
        html += '<ul class="dossier-conclusions">';
        agent.conclusions.forEach(function (conclusion) {
          html +=
            "<li>" +
            escapeHtml(conclusion.text) +
            " " +
            renderCitationRefs(conclusion.refs, refIndex) +
            "</li>";
        });
        html += "</ul>";
      }
      html += "</section>";
      });
      dossierBody.innerHTML = html;
    } else if (dossierBody) {
      dossierBody.innerHTML = "";
    }

    if (referenceIndex) {
      var indexRefs = refs.filter(function (ref) {
        return ref.type !== "agent";
      });
      var refHtml = "<h3>引用索引</h3><ul class=\"reference-list\">";
      indexRefs.forEach(function (ref) {
        refHtml +=
          '<li id="ref-' +
          escapeHtml(ref.id) +
          '" class="reference-item" data-ref-type="' +
          escapeHtml(ref.type || "") +
          '">';
        refHtml += "<strong>[" + escapeHtml(ref.id) + "]</strong> ";
        refHtml +=
          '<a href="' +
          escapeHtml(ref.href || "#ref-" + ref.id) +
          '">' +
          escapeHtml(ref.title || ref.id) +
          "</a>";
        refHtml +=
          '<span class="reference-location">' +
          escapeHtml(ref.location || ref.source || "") +
          "</span>";
        if (ref.excerpt) {
          refHtml +=
            '<p class="reference-excerpt">' +
            escapeHtml(String(ref.excerpt).slice(0, 180)) +
            "</p>";
        }
        refHtml += renderReferenceDetails(ref);
        refHtml += "</li>";
      });
      refHtml += "</ul>";
      referenceIndex.innerHTML = refHtml;
    }
  }

  // ===== 可视化渲染 =====
  function renderVisualization(data) {
    destroyCharts();
    currentDataSpec = data.dataSpec || null;
    currentReferences = data.references || (data.proposal && data.proposal.references) || [];
    vizEmpty.style.display = "none";

    var hasResults = Boolean(
      data.proposal || data.answer || (data.charts && data.charts.length)
    );
    if (vizResultsHeader) vizResultsHeader.hidden = !hasResults;

    if (data.proposal) {
      vizProposal.style.display = "block";
      renderProposal(data.proposal, currentDataSpec, currentReferences);
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
      var refIndex = buildReferenceIndex(currentReferences);
      var markdownHtml = window.BrandPilotMarkdown
        ? window.BrandPilotMarkdown.renderMarkdown(data.answer, { references: currentReferences })
        : renderMarkdown(data.answer);
      answerHtml += linkifyCitations(markdownHtml, refIndex);
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

    if (data.dossier || currentReferences.length) {
      renderDossier(data.dossier, currentReferences);
    } else if (vizProcess) {
      vizProcess.style.display = "none";
    }

    updateExportToolbar(data);
    syncArSandbox(data);
  }

  function syncArSandbox(data) {
    var scene = data && data.scene;
    if (scene) {
      try {
        sessionStorage.setItem(
          AR_SCENE_STORAGE_KEY,
          JSON.stringify({
            scene: scene,
            savedAt: Date.now(),
            workflowLabel: data.workflowLabel || "",
            brandName: scene.brandName || "",
            sessionId: currentSessionId || readPersistedSessionId() || ""
          })
        );
      } catch (error) {
        // ignore quota errors
      }
    }

    if (!vizSandboxLink) return;
    vizSandboxLink.hidden = !scene;
    if (scene && sandboxMeta) {
      var cityCount = scene.cities ? scene.cities.length : 0;
      var poiCount = scene.pois ? scene.pois.length : 0;
      var period = scene.dateRange && scene.dateRange.label ? scene.dateRange.label : "当前统计周期";
      sandboxMeta.textContent =
        (scene.brandName || "品牌") +
        " · " +
        period +
        " · " +
        cityCount +
        " 个城市 · " +
        poiCount +
        " 个门店";
    }
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


  function renderProposal(proposal, dataSpec, references) {
    proposalTitle.textContent = proposal.title || "经营提案";
    var refIndex = buildReferenceIndex(references || proposal.references || currentReferences || []);

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
      html +=
        '<div class="proposal-summary"><p>' +
        escapeHtml(proposal.summary) +
        " " +
        renderCitationRefs(proposal.summaryRefs, refIndex) +
        "</p></div>";
    }

    // 指标卡
    if (proposal.metrics && proposal.metrics.length > 0) {
      html += '<div class="metric-cards">';
      proposal.metrics.forEach(function (m) {
        html +=
          '<div class="metric-card">' +
          '<span class="metric-label">' + escapeHtml(m.label) + "</span>" +
          '<strong class="metric-value">' + escapeHtml(m.value) + "</strong>" +
          (m.delta ? '<span class="metric-delta">' + escapeHtml(m.delta) + "</span>" : "") +
          '<span class="metric-refs">' + renderCitationRefs(m.refs, refIndex) + "</span>" +
          "</div>";
      });
      html += "</div>";
    }

    // 洞察
    if (proposal.insights && proposal.insights.length > 0) {
      html += '<div class="proposal-section"><h3>📌 关键洞察</h3><ul class="insight-list">';
      proposal.insights.forEach(function (insight) {
        html +=
          "<li>" +
          escapeHtml(citedItemText(insight)) +
          " " +
          renderCitationRefs(citedItemRefs(insight), refIndex) +
          "</li>";
      });
      html += "</ul></div>";
    }

    // 推荐动作
    if (proposal.actions && proposal.actions.length > 0) {
      html += '<div class="proposal-section"><h3>🎯 推荐动作</h3><div class="action-list">';
      proposal.actions.forEach(function (action, i) {
        html +=
          '<div class="action-item"><span class="action-num">' +
          (i + 1) +
          '</span><span>' +
          escapeHtml(citedItemText(action)) +
          " " +
          renderCitationRefs(citedItemRefs(action), refIndex) +
          "</span></div>";
      });
      html += "</div></div>";
    }

    // 时间线
    if (proposal.timeline && proposal.timeline.length > 0) {
      html += '<div class="proposal-section"><h3>📅 推进时间线</h3><div class="timeline">';
      proposal.timeline.forEach(function (t) {
        html +=
          '<div class="timeline-item">' +
          '<div class="timeline-dot"></div>' +
          '<div class="timeline-content"><strong>' +
          escapeHtml(t.title) +
          "</strong><p>" +
          escapeHtml(t.body) +
          " " +
          renderCitationRefs(t.refs, refIndex) +
          "</p></div>" +
          "</div>";
      });
      html += "</div></div>";
    }

    // 风险提示
    if (proposal.risks && proposal.risks.length > 0) {
      html += '<div class="proposal-section"><h3>⚠️ 风险提示</h3><ul class="risk-list">';
      proposal.risks.forEach(function (risk) {
        html +=
          "<li>" +
          escapeHtml(citedItemText(risk)) +
          " " +
          renderCitationRefs(citedItemRefs(risk), refIndex) +
          "</li>";
      });
      html += "</ul></div>";
    }

    // 资产清单
    if (proposal.assets && proposal.assets.length > 0) {
      html += '<div class="proposal-section"><h3>📦 提案资产</h3><div class="asset-list">';
      proposal.assets.forEach(function (asset) {
        html +=
          '<div class="asset-item">' +
          "<strong>" +
          escapeHtml(asset.title) +
          "</strong>" +
          "<p>" +
          escapeHtml(asset.body) +
          "</p>" +
          "</div>";
      });
      html += "</div></div>";
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
      if (chartDef.description) {
        var desc = document.createElement("p");
        desc.className = "chart-description";
        desc.textContent = chartDef.description;
        wrapper.appendChild(desc);
      }

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

  function hexToRgba(hex, alpha) {
    var normalized = String(hex || "").replace("#", "");
    if (normalized.length !== 6) return "rgba(37, 99, 235, " + alpha + ")";
    var r = parseInt(normalized.slice(0, 2), 16);
    var g = parseInt(normalized.slice(2, 4), 16);
    var b = parseInt(normalized.slice(4, 6), 16);
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function buildChartConfig(chartDef) {
    var type = chartDef.type;
    var data = chartDef.data;
    var colors = window.BrandPilotColors || null;
    var labels = data.labels || [];
    var activeBrandId = brandSelect ? brandSelect.value : "haidilao";

    var isCompareChart = chartDef.title && /当期|上期|vs|对比|美团|抖音|竞品|拖累/.test(chartDef.title);
    var isPeriodCompareChart = chartDef.title && /当期\s*vs|环比|同比/.test(chartDef.title);
    var rawDatasets = data.datasets || [];
    var useSeriesColors = rawDatasets.length > 1 && type !== "line";

    var datasets = rawDatasets.map(function (ds, dsIndex) {
      var isRateChart = chartDef.title && /转化率|核销率|份额/.test(chartDef.title);
      var barValues = ds.data || [];
      var seriesColor = null;
      if (useSeriesColors && colors) {
        seriesColor = colors.resolveSeriesColor(ds.label, dsIndex, activeBrandId);
      }
      var perBarColors = barValues.map(function (_, barIndex) {
        if (seriesColor) return seriesColor;
        var label = labels[barIndex] || "";
        if (colors) {
          var resolved = colors.resolveChartColor(label, {
            chartTitle: chartDef.title,
            barIndex: barIndex,
            barCount: barValues.length,
            datasetLabel: ds.label,
            datasetIndex: dsIndex,
            isRateChart: isRateChart,
            isPeriodCompare: isPeriodCompareChart,
            isCompare: isCompareChart,
            activeBrandId: activeBrandId,
            fallbackIndex: barIndex + dsIndex
          });
          if (resolved) {
            if (isRateChart && resolved.indexOf("rgba(") !== 0 && resolved.indexOf("hsla(") !== 0) {
              return colors.hexToRgba(resolved, 0.9);
            }
            return resolved;
          }
        }
        if (isRateChart) {
          return "hsla(" + (210 + barIndex * 18) + ", 82%, " + (48 + barIndex * 3) + "%, 0.9)";
        }
        var palette = colors ? colors.FALLBACK_PALETTE : ["#2563EB", "#F97316", "#16A34A", "#DC2626", "#7C3AED", "#0891B2"];
        return palette[(barIndex + dsIndex) % palette.length];
      });

      return {
        label: ds.label,
        data: barValues,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        backgroundColor: perBarColors,
        borderColor: perBarColors.map(function (color) {
          return String(color).replace("0.9)", "1)").replace("0.88)", "1)");
        }),
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
      datasets.forEach(function (ds, dsIndex) {
        var lineLabel = ds.label || (labels[dsIndex] || "");
        var lineColor = colors
          ? colors.resolveLineColor(lineLabel, dsIndex, activeBrandId)
          : ["#2563EB", "#F97316", "#16A34A", "#DC2626", "#7C3AED", "#0891B2"][dsIndex % 6];
        ds.borderColor = lineColor;
        ds.backgroundColor = hexToRgba(lineColor, 0.12);
        ds.pointBackgroundColor = lineColor;
        ds.pointBorderColor = "#fff";
        ds.pointRadius = 4;
      });
    }

    var isHorizontalBar = chartType === "bar" && chartDef.title && /转化率/.test(chartDef.title);
    var valueAxis = isHorizontalBar ? "x" : "y";
    var categoryAxis = isHorizontalBar ? "y" : "x";

    var scales = {};
    scales[categoryAxis] = {
      grid: { display: false },
      ticks: {
        font: { size: 11, family: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
        autoSkip: false,
        maxRotation: 45,
        minRotation: 0
      }
    };
    scales[valueAxis] = {
      beginAtZero: true,
      grid: { color: "rgba(255, 195, 0, 0.14)" },
      ticks: {
        font: { size: 11 },
        callback: function (value) {
          if (isHorizontalBar) return value + "%";
          if (typeof value !== "number") return value;
          return value >= 10000 ? (value / 10000).toFixed(0) + "万" : value.toLocaleString("zh-CN");
        }
      }
    };
    if (isHorizontalBar) {
      scales.x.max = 100;
    }

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
      scales: scales
    };

    return {
      type: chartType,
      data: { labels: data.labels || [], datasets: datasets },
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

    if (hasSavedFormalReport()) {
      exportFormalReportPdf();
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

  var EXPORT_HTML_STYLES =
    "body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;line-height:1.65;color:#1a1f2e;max-width:920px;margin:0 auto;padding:32px 28px;background:#fff;}" +
    "h1{font-size:28px;margin:0 0 8px;}h2{font-size:20px;margin:28px 0 12px;border-bottom:1px solid #eee;padding-bottom:6px;}" +
    "h3{font-size:16px;margin:18px 0 8px;}p,li{font-size:14px;}table{border-collapse:collapse;width:100%;margin:12px 0;}" +
    "td,th{border:1px solid #dde1e8;padding:8px 10px;text-align:left;font-size:13px;}th{background:#fff8e0;}" +
    "blockquote{border-left:3px solid #ffc300;margin:12px 0;padding:8px 14px;background:#fffdf5;color:#555;}" +
    ".export-meta{color:#666;font-size:13px;margin-bottom:24px;}.metric-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;}" +
    ".metric-card{border:1px solid #eee;border-radius:10px;padding:12px;background:#fafafa;}" +
    "img{max-width:100%;height:auto;border:1px solid #eee;border-radius:8px;}" +
    "a.citation-ref{color:#2563eb;text-decoration:none;border-bottom:1px dotted #93c5fd;}" +
    "a.citation-ref:hover{color:#1d4ed8;}" +
    ".export-references{margin-top:32px;padding-top:16px;border-top:1px solid #eee;}" +
    ".export-references li{margin:10px 0;}" +
    ".reference-excerpt{color:#64748b;font-size:12px;margin:4px 0 0;}" +
    ".funnel-viz{display:flex;flex-direction:column;align-items:center;gap:0;padding:4px 12px 8px;}" +
    ".funnel-viz-stage{width:100%;display:flex;justify-content:center;}" +
    ".funnel-viz-bar{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:46px;padding:0 18px;border-radius:10px;background:linear-gradient(135deg,#ffe08a 0%,#ffc300 48%,#f5b800 100%);box-shadow:0 8px 22px rgba(255,195,0,.28);color:#1a1f2e;}" +
    ".funnel-viz-stage.is-bottleneck .funnel-viz-bar{background:linear-gradient(135deg,#ffb380 0%,#ff6633 52%,#ff4b10 100%);box-shadow:0 8px 22px rgba(255,102,51,.24);}" +
    ".funnel-viz-label{font-size:13px;font-weight:600;white-space:nowrap;}" +
    ".funnel-viz-value{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;}" +
    ".funnel-viz-connector{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 0;color:#64748b;font-size:11px;}" +
    ".funnel-viz-connector.is-bottleneck{color:#c2410c;font-weight:600;}" +
    ".funnel-viz-rate{padding:2px 10px;border-radius:999px;background:#f6fcee;border:1px solid rgba(126,184,82,.2);}" +
    ".viz-export-chart{margin:20px 0;}";

  function wrapExportHtml(innerHtml, title) {
    return (
      "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>" + escapeHtml(title || "BrandPilot AI 经营分析报告") + "</title>" +
      "<style>" + EXPORT_HTML_STYLES + "</style></head><body>" +
      innerHtml +
      "</body></html>"
    );
  }

  function prepareChartExportsForReport() {
    var html2canvasFn = typeof html2canvas !== "undefined" ? html2canvas : null;
    if (!html2canvasFn) return Promise.resolve();

    var jobs = chartExports
      .filter(function (item) {
        return item.type === "html" && item.element;
      })
      .map(function (item) {
        return html2canvasFn(item.element, {
          backgroundColor: "#ffffff",
          scale: 2,
          logging: false,
          useCORS: true
        })
          .then(function (canvas) {
            item.type = "image";
            item.src = canvas.toDataURL("image/png");
          })
          .catch(function () {
            /* 保留 HTML 漏斗兜底 */
          });
      });

    return Promise.all(jobs);
  }

  function getChartImagesForPayload() {
    return chartExports
      .map(function (item) {
        if (item.type === "image" && item.src) {
          return { title: item.title || "图表", dataUrl: item.src };
        }
        if (item.type === "canvas" && item.chart && typeof item.chart.toBase64Image === "function") {
          return { title: item.title || "图表", dataUrl: item.chart.toBase64Image() };
        }
        return null;
      })
      .filter(Boolean);
  }

  function buildExportReferencesSection() {
    var refs = (currentReferences || []).filter(function (ref) {
      return ref && ref.type !== "agent";
    });
    if (!refs.length) return "";

    var html = '<section class="viz-export-section export-references"><h2>引用索引</h2><ul class="reference-list">';
    refs.forEach(function (ref) {
      html +=
        '<li id="ref-' +
        escapeHtml(ref.id) +
        '" class="reference-item"><strong>[' +
        escapeHtml(ref.id) +
        "]</strong> " +
        escapeHtml(ref.title || ref.id);
      if (ref.location || ref.source) {
        html += ' <span class="reference-location">· ' + escapeHtml(ref.location || ref.source) + "</span>";
      }
      if (ref.excerpt) {
        html += '<p class="reference-excerpt">' + escapeHtml(String(ref.excerpt).slice(0, 240)) + "</p>";
      }
      html += "</li>";
    });
    html += "</ul></section>";
    return html;
  }

  function handleDownloadHtml() {
    if (hasSavedFormalReport()) {
      handleDownloadSidecarHtml();
      return;
    }

    var element = buildExportDocument();
    if (!element) {
      alert("当前没有可下载的分析内容。");
      return;
    }
    showPdfStatus("正在生成 HTML…");
    var html = wrapExportHtml(element.innerHTML, "BrandPilot AI 经营分析报告");
    downloadBlob(html, "text/html", buildExportBaseName() + ".html");
    showPdfStatus("就绪");
  }

  function handleDownloadWord() {
    if (hasSavedFormalReport()) {
      handleDownloadSidecarWord();
      return;
    }

    var element = buildExportDocument();
    if (!element) {
      alert("当前没有可下载的分析内容。");
      return;
    }

    showPdfStatus("正在生成 Word…");
    var html = wrapExportHtml(element.innerHTML, "BrandPilot AI 经营分析报告");
    downloadBlob("\ufeff" + html, "application/msword", buildExportBaseName() + ".doc");
    showPdfStatus("就绪");
  }

  function getExportableResponse() {
    if (
      lastResponse &&
      (lastResponse.proposal ||
        lastResponse.answer ||
        (lastResponse.charts && lastResponse.charts.length))
    ) {
      return lastResponse;
    }

    try {
      var cached = sessionStorage.getItem("bp_last_response");
      if (cached) {
        var parsed = JSON.parse(cached);
        if (
          parsed &&
          (parsed.proposal || parsed.answer || (parsed.charts && parsed.charts.length))
        ) {
          return parsed;
        }
      }
    } catch (error) {
      // ignore parse errors
    }

    var hasAnswer = vizAnswer && vizAnswer.style.display !== "none" && vizAnswer.innerHTML.trim();
    var hasProposal = vizProposal && vizProposal.style.display !== "none";
    var hasCharts = lastChartDefs && lastChartDefs.length > 0;
    if (!hasAnswer && !hasProposal && !hasCharts) return null;

    return {
      answer: hasAnswer ? vizAnswer.innerText || vizAnswer.textContent || "" : "",
      proposal: hasProposal ? lastResponse && lastResponse.proposal : null,
      charts: hasCharts ? lastChartDefs : [],
      dataSpec: currentDataSpec,
      workflow: lastResponse && lastResponse.workflow,
      workflowLabel: lastResponse && lastResponse.workflowLabel
    };
  }

  function setSidecarButtonLoading(loading) {
    if (!sidecarReportButton) return;
    sidecarReportButton.classList.toggle("is-loading", Boolean(loading));
    sidecarReportButton.disabled = Boolean(loading);
  }

  function parseJsonResponse(res) {
    return res.text().then(function (text) {
      var data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (error) {
          data = { message: text };
        }
      }
      if (!res.ok) {
        throw new Error((data && data.message) || "请求失败 (" + res.status + ")");
      }
      return data;
    });
  }

  function handleDownloadMarkdown() {
    var markdown = buildExportMarkdown();
    if (!markdown) {
      alert("当前没有可下载的分析内容。");
      return;
    }
    downloadBlob(markdown, "text/markdown", buildExportBaseName() + ".md");
  }

  function buildLocalFormalReportHtml(exportData) {
    var element = buildExportDocument();
    var title =
      (exportData && exportData.proposal && exportData.proposal.title) ||
      (exportData && exportData.workflowLabel) ||
      "BrandPilot AI 经营分析报告";

    if (element) {
      return wrapExportHtml(element.innerHTML, title);
    }

    if (!exportData) return "";

    var sections = [];
    sections.push("<h1>" + escapeHtml(title) + "</h1>");
    if (vizToolbarSubtitle && vizToolbarSubtitle.textContent) {
      sections.push('<p class="export-meta">' + escapeHtml(vizToolbarSubtitle.textContent) + "</p>");
    }

    if (exportData.proposal) {
      var proposal = exportData.proposal;
      sections.push("<h2>" + escapeHtml(proposal.title || "经营提案") + "</h2>");
      if (proposal.summary) sections.push("<p>" + escapeHtml(proposal.summary) + "</p>");
      if (proposal.insights && proposal.insights.length) {
        sections.push("<h3>关键洞察</h3><ul>");
        proposal.insights.forEach(function (item) {
          sections.push("<li>" + escapeHtml(item) + "</li>");
        });
        sections.push("</ul>");
      }
    }

    if (exportData.answer) {
      sections.push("<h2>完整分析</h2>");
      var answerHtml =
        window.BrandPilotMarkdown
          ? window.BrandPilotMarkdown.renderMarkdown(exportData.answer, { references: currentReferences })
          : "<p>" + escapeHtml(exportData.answer) + "</p>";
      sections.push(linkifyCitations(answerHtml, buildReferenceIndex(currentReferences)));
    }

    if (exportData.charts && exportData.charts.length) {
      sections.push("<h2>数据图表</h2>");
      chartExports.forEach(function (item) {
        sections.push("<h3>" + escapeHtml(item.title || "图表") + "</h3>");
        if (item.type === "image" && item.src) {
          sections.push(
            '<img src="' +
              item.src +
              '" alt="' +
              escapeHtml(item.title || "图表") +
              '" style="max-width:100%;height:auto;" />'
          );
          return;
        }
        if (item.chart && typeof item.chart.toBase64Image === "function") {
          sections.push(
            '<img src="' +
              item.chart.toBase64Image() +
              '" alt="' +
              escapeHtml(item.title || "图表") +
              '" style="max-width:100%;height:auto;" />'
          );
          return;
        }
        if (item.type === "html" && item.element) {
          sections.push(item.element.outerHTML);
          return;
        }
        var chart = exportData.charts.find(function (c) {
          return (c.title || "") === (item.title || "");
        });
        if (!chart) return;
        var labels = (chart.data && chart.data.labels) || [];
        var values =
          (chart.data &&
            chart.data.datasets &&
            chart.data.datasets[0] &&
            chart.data.datasets[0].data) ||
          [];
        if (labels.length) {
          sections.push("<ul>");
          labels.forEach(function (label, index) {
            sections.push(
              "<li>" +
                escapeHtml(String(label)) +
                "：" +
                escapeHtml(values[index] != null ? String(values[index]) : "-") +
                "</li>"
            );
          });
          sections.push("</ul>");
        }
      });
    }

    var referencesHtml = buildExportReferencesSection();
    if (referencesHtml) sections.push(referencesHtml);

    if (!sections.length) return "";
    return wrapExportHtml(sections.join("\n"), title);
  }

  function openLocalFormalReport(exportData, reason) {
    return prepareChartExportsForReport().then(function () {
      var html = buildLocalFormalReportHtml(exportData);
      if (!html) {
        setStatusText("无法生成本地报告", { protectMs: 5000 });
        alert("当前没有可生成报告的分析内容。");
        return false;
      }
      var meta = "基于当前分析结果生成的可编辑报告";
      if (reason) meta += "（" + reason + "）";
      openReportPreview(html, meta + " · 可直接编辑，保存后可导出");
      setStatusText("正式报告已打开（本地模式）", { protectMs: 5000 });
      return true;
    });
  }

  function handleSidecarReport() {
    var exportData = getExportableResponse();
    if (
      !exportData ||
      (!exportData.proposal && !exportData.answer && !(exportData.charts && exportData.charts.length))
    ) {
      setStatusText("请先完成一次分析，再生成正式报告。", { protectMs: 5000 });
      alert("请先完成一次分析，再生成正式报告。");
      return;
    }

    setSidecarButtonLoading(true);
    setStatusText("正在生成正式报告…", { protectMs: 30000 });

    prepareChartExportsForReport()
      .then(function () {
        var payload = {
          templateType: "fix",
          proposal: exportData.proposal || null,
          summary: exportData.answer || (exportData.proposal && exportData.proposal.summary) || "",
          brandName: (exportData.proposal && exportData.proposal.title) || "海底捞",
          period:
            (exportData.dataSpec && exportData.dataSpec.period && exportData.dataSpec.period.label) ||
            "2026 H1",
          charts: exportData.charts || [],
          chartImages: getChartImagesForPayload(),
          references: (currentReferences || []).filter(function (ref) {
            return ref && ref.type !== "agent";
          })
        };

        var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timeoutId = controller
          ? window.setTimeout(function () { controller.abort(); }, 45000)
          : null;

        return fetch("/api/sidecar-report", {
          method: "POST",
          headers: window.BrandPilotAuth
            ? window.BrandPilotAuth.authHeaders({ "Content-Type": "application/json" })
            : { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller ? controller.signal : undefined
        })
          .then(parseJsonResponse)
          .then(function (data) {
            if (data && data.ok === false) {
              throw new Error(data.message || "侧车报告服务不可用");
            }
            var html = extractSidecarHtml(data);
            if (!html) throw new Error("未返回 HTML 报告内容");
            lastSidecarHtml = html;
            openReportPreview(html, describeSidecarMode(data) + " · 可直接编辑，保存后可导出");
            setStatusText("正式报告已生成", { protectMs: 4000 });
          })
          .catch(function (error) {
            var reason =
              error && error.name === "AbortError"
                ? "侧车服务超时"
                : (error && error.message) || "侧车服务不可用";
            return openLocalFormalReport(exportData, reason).then(function (opened) {
              if (!opened) {
                setStatusText("正式报告生成失败", { protectMs: 6000 });
                alert("正式报告生成失败：" + reason);
              }
            });
          })
          .finally(function () {
            if (timeoutId) window.clearTimeout(timeoutId);
            setSidecarButtonLoading(false);
          });
      })
      .catch(function () {
        setSidecarButtonLoading(false);
      });
  }

  function extractSidecarHtml(data) {
    if (!data) return "";
    if (data.report && data.report.html) return data.report.html;
    if (data.sidecar && data.sidecar.report && data.sidecar.report.html) return data.sidecar.report.html;
    if (data.sidecar && data.sidecar.orchestration && data.sidecar.orchestration.html) {
      return data.sidecar.orchestration.html;
    }
    return "";
  }

  function describeSidecarMode(data) {
    if (!data) return "";
    if (data.mode === "direct-task") return "基于当前分析真实数据生成的正式 HTML 报告";
    if (data.mode === "workflow-report") return "基于多 Agent 工作流真实数据生成的正式 HTML 报告";
    return "正式 HTML 报告";
  }

  function hasSavedFormalReport() {
    return Boolean(lastSidecarHtml && sidecarReportSaved && !sidecarReportDirty);
  }

  function updateReportPreviewStatus() {
    if (!reportPreviewStatus) return;
    if (sidecarReportDirty) {
      reportPreviewStatus.textContent = "有未保存的修改";
      reportPreviewStatus.classList.add("is-dirty");
      reportPreviewStatus.classList.remove("is-saved");
    } else if (sidecarReportSaved) {
      reportPreviewStatus.textContent = "已保存，可导出";
      reportPreviewStatus.classList.add("is-saved");
      reportPreviewStatus.classList.remove("is-dirty");
    } else {
      reportPreviewStatus.textContent = "可直接编辑报告内容";
      reportPreviewStatus.classList.remove("is-dirty", "is-saved");
    }

    if (reportPreviewSave) {
      reportPreviewSave.disabled = !sidecarReportDirty;
      reportPreviewSave.textContent = sidecarReportDirty ? "保存 *" : "保存";
    }
    if (reportExportMenuButton) {
      reportExportMenuButton.disabled = !sidecarReportSaved || sidecarReportDirty;
    }
  }

  function enableReportEditing() {
    var doc = reportPreviewFrame && reportPreviewFrame.contentDocument;
    if (!doc || !doc.body) {
      window.setTimeout(enableReportEditing, 50);
      return;
    }

    doc.body.contentEditable = "true";
    doc.body.setAttribute("spellcheck", "false");

    if (!doc.getElementById("bp-report-edit-style")) {
      var style = doc.createElement("style");
      style.id = "bp-report-edit-style";
      style.textContent =
        "body{cursor:text;min-height:100%;box-sizing:border-box;}" +
        "body:focus{outline:2px solid #a78bfa;outline-offset:-2px;}" +
        "[contenteditable]:empty:before{content:attr(data-placeholder);color:#94a3b8;}";
      (doc.head || doc.documentElement).appendChild(style);
    }

    if (!doc.body.getAttribute("data-edit-bound")) {
      doc.body.setAttribute("data-edit-bound", "true");
      doc.body.addEventListener("input", function () {
        sidecarReportDirty = true;
        sidecarReportSaved = false;
        updateReportPreviewStatus();
      });
    }
  }

  function getReportHtmlFromFrame() {
    var doc = reportPreviewFrame && reportPreviewFrame.contentDocument;
    if (!doc || !doc.documentElement) return lastSidecarHtml || "";
    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  }

  function ensureSidecarSavedForExport() {
    if (hasSavedFormalReport()) return true;
    if (sidecarReportDirty) {
      if (window.confirm("导出前需要先保存修改，是否现在保存？")) {
        handleSaveSidecarReport();
        return hasSavedFormalReport();
      }
      return false;
    }
    alert("请先在正式报告中保存内容，再导出。");
    return false;
  }

  function handleSaveSidecarReport() {
    if (!reportPreviewFrame) return;
    lastSidecarHtml = getReportHtmlFromFrame();
    if (!lastSidecarHtml) {
      alert("没有可保存的报告内容。");
      return;
    }
    sidecarReportSaved = true;
    sidecarReportDirty = false;
    updateReportPreviewStatus();
    if (reportPreviewMeta) {
      reportPreviewMeta.textContent = "报告已保存，可继续导出 HTML / PDF / Word";
    }
    setStatusText("正式报告已保存", { protectMs: 4000 });
  }

  function openReportPreview(html, metaText) {
    if (!reportPreviewModal || !reportPreviewFrame) return;
    if (reportPreviewTitle) {
      reportPreviewTitle.textContent =
        (lastResponse && lastResponse.proposal && lastResponse.proposal.title) || "正式报告编辑";
    }
    if (reportPreviewMeta) reportPreviewMeta.textContent = metaText || "";
    lastSidecarHtml = html;
    sidecarReportSaved = true;
    sidecarReportDirty = false;
    updateReportPreviewStatus();

    reportPreviewFrame.onload = function () {
      enableReportEditing();
    };
    reportPreviewFrame.srcdoc = html;
    reportPreviewModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeReportPreview() {
    if (!reportPreviewModal) return;
    if (sidecarReportDirty && !window.confirm("有未保存的修改，确定关闭吗？")) return;
    reportPreviewModal.hidden = true;
    if (reportPreviewFrame) {
      reportPreviewFrame.onload = null;
      reportPreviewFrame.srcdoc = "";
    }
    document.body.style.overflow = "";
  }

  function handleDownloadSidecarHtml() {
    if (!ensureSidecarSavedForExport()) return;
    downloadBlob(lastSidecarHtml, "text/html", buildExportBaseName() + "_formal.html");
    setStatusText("HTML 报告已导出", { protectMs: 4000 });
  }

  function handleDownloadSidecarWord() {
    if (!ensureSidecarSavedForExport()) return;
    showPdfStatus("正在生成 Word…");
    downloadBlob("\ufeff" + lastSidecarHtml, "application/msword", buildExportBaseName() + "_formal.doc");
    showPdfStatus("就绪");
    setStatusText("Word 报告已导出", { protectMs: 4000 });
  }

  function handleDownloadSidecarPdf() {
    if (!window.html2pdf) {
      alert("PDF 组件未加载，请刷新页面后重试。");
      return;
    }
    if (!ensureSidecarSavedForExport()) return;

    var doc = reportPreviewFrame && reportPreviewFrame.contentDocument;
    var element = doc && doc.body;
    if (!element) {
      alert("无法读取报告内容，请重新打开正式报告。");
      return;
    }

    showPdfStatus("正在生成 PDF…");
    var opt = {
      margin: [10, 10, 10, 10],
      filename: buildExportBaseName() + "_formal.pdf",
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

    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(function () {
        showPdfStatus("就绪");
        setStatusText("PDF 报告已导出", { protectMs: 4000 });
      })
      .catch(function (error) {
        alert("PDF 生成失败：" + error.message);
        showPdfStatus("就绪");
      });
  }

  function exportFormalReportPdf() {
    if (!ensureSidecarSavedForExport()) return;
    if (reportPreviewModal && !reportPreviewModal.hidden) {
      handleDownloadSidecarPdf();
      return;
    }

    if (!window.html2pdf) {
      alert("PDF 组件未加载，请刷新页面后重试。");
      return;
    }

    showPdfStatus("正在生成 PDF…");
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;width:920px;height:1200px;border:0;";
    iframe.srcdoc = lastSidecarHtml;
    document.body.appendChild(iframe);

    iframe.onload = function () {
      var body = iframe.contentDocument && iframe.contentDocument.body;
      if (!body) {
        iframe.remove();
        alert("PDF 生成失败：无法读取报告内容");
        showPdfStatus("就绪");
        return;
      }

      html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: buildExportBaseName() + "_formal.pdf",
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] }
        })
        .from(body)
        .save()
        .then(function () {
          iframe.remove();
          showPdfStatus("就绪");
        })
        .catch(function (error) {
          iframe.remove();
          alert("PDF 生成失败：" + error.message);
          showPdfStatus("就绪");
        });
    };
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
      '<p class="export-meta">' + escapeHtml((vizToolbarSubtitle && vizToolbarSubtitle.textContent) || "") + "</p>";
    root.appendChild(header);

    if (hasProposal && proposalBody) {
      var proposalSection = document.createElement("section");
      proposalSection.className = "viz-export-section";
      proposalSection.innerHTML =
        "<h2>" + escapeHtml(proposalTitle ? proposalTitle.textContent : "经营提案") + "</h2>" +
        proposalBody.innerHTML;
      root.appendChild(proposalSection);
    }

    if (hasAnswer) {
      var answerSection = document.createElement("section");
      answerSection.className = "viz-export-section";
      var refIndex = buildReferenceIndex(currentReferences);
      answerSection.innerHTML =
        "<h2>完整分析</h2>" + linkifyCitations(vizAnswer.innerHTML, refIndex);
      root.appendChild(answerSection);
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
        if (item.type === "image" && item.src) {
          var snapshot = document.createElement("img");
          snapshot.alt = item.title || "图表";
          snapshot.src = item.src;
          block.appendChild(snapshot);
        } else if (item.type === "html" && item.element) {
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

    var referencesHtml = buildExportReferencesSection();
    if (referencesHtml) {
      var refWrap = document.createElement("div");
      refWrap.innerHTML = referencesHtml;
      root.appendChild(refWrap.firstElementChild);
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
