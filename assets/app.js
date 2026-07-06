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
  var vizCharts = document.getElementById("vizCharts");
  var vizAnswer = document.getElementById("vizAnswer");
  var downloadPdfButton = document.getElementById("downloadPdfButton");
  var downloadHtmlButton = document.getElementById("downloadHtmlButton");
  var downloadWordButton = document.getElementById("downloadWordButton");
  var downloadMarkdownButton = document.getElementById("downloadMarkdownButton");
  var documentUploadButton = document.getElementById("documentUploadButton");
  var documentUploadInput = document.getElementById("documentUploadInput");
  var chatAttachments = document.getElementById("chatAttachments");
  var arPanel = document.getElementById("panelAr");
  var arStage = document.getElementById("arStage");
  var arMeta = document.getElementById("arMeta");
  var enterXrButton = document.getElementById("enterXrButton");
  var enterMarkerArButton = document.getElementById("enterMarkerArButton");
  var resetArButton = document.getElementById("resetArButton");
  var authGuest = document.getElementById("authGuest");
  var authUser = document.getElementById("authUser");
  var authUserName = document.getElementById("authUserName");
  var logoutButton = document.getElementById("logoutButton");
  var sessionSidebar = document.getElementById("sessionSidebar");
  var sessionList = document.getElementById("sessionList");
  var newSessionButton = document.getElementById("newSessionButton");
  var appContainer = document.getElementById("appContainer");
  var defaultChatPlaceholder =
    "输入你的问题，并尽量写明统计周期；也可先点 📎 上传文档再提问";

  // ===== 状态 =====
  var isProcessing = false;
  var resultPanelsEnabled = false;
  var chartInstances = [];
  var chartExports = [];
  var currentDataSpec = null;
  var lastResponse = null;
  var lastChartDefs = [];
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
    if (downloadHtmlButton) downloadHtmlButton.addEventListener("click", handleDownloadHtml);
    if (downloadWordButton) downloadWordButton.addEventListener("click", handleDownloadWord);
    if (downloadMarkdownButton) downloadMarkdownButton.addEventListener("click", handleDownloadMarkdown);
    bindDocumentUpload();
    bindArSandboxControls();
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
        setResultPanelsEnabled(true);
        renderVisualization(lastResponse);
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
      '<p class="chat-hint">先输入问题并发送，或点击 📎 上传文档；右侧会展示<strong>分析报告</strong>，支持 HTML / PDF 导出。</p>' +
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

  function revealResultExperience(data) {
    if (!data) return;

    setResultPanelsEnabled(true);
    renderVisualization(data);
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

  function resetChatInputPlaceholder() {
    if (!chatInput) return;
    var hasDocs = window.BrandPilotDocuments && window.BrandPilotDocuments.getAttachments().length;
    if (!hasDocs) chatInput.placeholder = defaultChatPlaceholder;
  }

  function bindDocumentUpload() {
    if (!documentUploadButton || !documentUploadInput) return;

    documentUploadButton.addEventListener("click", function () {
      documentUploadInput.click();
    });

    documentUploadInput.addEventListener("change", function () {
      var files = documentUploadInput.files;
      documentUploadInput.value = "";
      if (!files || !files.length || !window.BrandPilotDocuments) return;
      statusText.textContent = window.BrandPilotDocuments.hasPendingImages(files)
        ? "OCR 识别中…"
        : "解析文档中…";
      window.BrandPilotDocuments.addFiles(files)
        .then(function (added) {
          window.BrandPilotDocuments.renderChips(chatAttachments);
          var count = (added && added.length) || 1;
          var hasOcr = (added || []).some(function (item) { return item.sourceType === "ocr"; });
          var names = (added || []).map(function (item) { return item.filename; }).join("、");
          statusText.textContent = hasOcr
            ? "已识别 " + count + " 个文件（OCR）"
            : "已添加 " + count + " 个文档";
          if (chatInput) {
            chatInput.placeholder =
              names +
              " 已就绪，输入问题后发送；或直接发送让 AI 分析文档内容";
          }
        })
        .catch(function (error) {
          alert(error.message || "文档解析失败");
          statusText.textContent = "文档解析失败";
          window.setTimeout(function () {
            if (statusText.textContent === "文档解析失败") statusText.textContent = "就绪";
          }, 3000);
        });
    });

    if (chatAttachments) {
      chatAttachments.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-doc-remove]");
        if (!btn || !window.BrandPilotDocuments) return;
        window.BrandPilotDocuments.removeAttachment(btn.getAttribute("data-doc-remove"));
        window.BrandPilotDocuments.renderChips(chatAttachments);
        resetChatInputPlaceholder();
        if (!window.BrandPilotDocuments.getAttachments().length) {
          statusText.textContent = "就绪";
        }
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
    if (isProcessing) return;

    if (!window.BrandPilotAuth || !window.BrandPilotAuth.isLoggedIn()) {
      redirectToLogin();
      return;
    }

    var message = chatInput.value.trim();
    var attachments = window.BrandPilotDocuments ? window.BrandPilotDocuments.getAttachments() : [];
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
      resetChatInputPlaceholder();
    }

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
    scrollToBottom();
  }

  function addMessage(role, text) {
    if (role === "user") {
      addUserMessage(text, []);
      return;
    }

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
    if (data.dataMode === "empty" || data.dataMode === "unavailable") {
      var notice = document.createElement("div");
      notice.className = "data-notice";
      notice.textContent = "⚠️ 当前无可用经营数据，请检查 Supabase 配置与种子数据。";
      body.appendChild(notice);
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
    currentDataSpec = data.dataSpec || null;
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
    syncArSandbox(data);
  }

  function bindArSandboxControls() {
    if (enterXrButton) {
      enterXrButton.addEventListener("click", function () {
        if (!window.BrandPilotAR) return;
        window.BrandPilotAR.enterXR().catch(function (error) {
          alert(error.message || "当前设备暂不支持 WebXR AR。");
        });
      });
    }

    if (enterMarkerArButton) {
      enterMarkerArButton.addEventListener("click", function () {
        if (!window.BrandPilotAR) return;
        window.BrandPilotAR.enterMarkerAR().catch(function (error) {
          alert(error.message || "当前环境无法启动 Marker AR。");
        });
      });
    }

    if (resetArButton) {
      resetArButton.addEventListener("click", function () {
        if (window.BrandPilotAR && typeof window.BrandPilotAR.reset === "function") {
          window.BrandPilotAR.reset();
        }
      });
    }

    window.addEventListener("resize", function () {
      if (window.BrandPilotAR && typeof window.BrandPilotAR.resize === "function") {
        window.BrandPilotAR.resize();
      }
    });
  }

  function syncArSandbox(data) {
    if (!arPanel || !arStage || !window.BrandPilotAR) return;
    var scene = data && data.scene;
    if (!scene) {
      arPanel.hidden = true;
      return;
    }

    arPanel.hidden = false;
    window.BrandPilotAR.init(arStage);
    window.BrandPilotAR.update(scene);

    if (arMeta) {
      var cityCount = scene.cities ? scene.cities.length : 0;
      var poiCount = scene.pois ? scene.pois.length : 0;
      var period = scene.dateRange && scene.dateRange.label ? scene.dateRange.label : "当前统计周期";
      arMeta.textContent =
        (scene.brandName || "品牌") +
        " · " +
        period +
        " · " +
        cityCount +
        " 个城市柱 · " +
        poiCount +
        " 个门店点，可拖拽旋转、滚轮缩放、点击城市下钻。";
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

  var EXPORT_HTML_STYLES =
    "body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;line-height:1.65;color:#1a1f2e;max-width:920px;margin:0 auto;padding:32px 28px;background:#fff;}" +
    "h1{font-size:28px;margin:0 0 8px;}h2{font-size:20px;margin:28px 0 12px;border-bottom:1px solid #eee;padding-bottom:6px;}" +
    "h3{font-size:16px;margin:18px 0 8px;}p,li{font-size:14px;}table{border-collapse:collapse;width:100%;margin:12px 0;}" +
    "td,th{border:1px solid #dde1e8;padding:8px 10px;text-align:left;font-size:13px;}th{background:#fff8e0;}" +
    "blockquote{border-left:3px solid #ffc300;margin:12px 0;padding:8px 14px;background:#fffdf5;color:#555;}" +
    ".export-meta{color:#666;font-size:13px;margin-bottom:24px;}.metric-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;}" +
    ".metric-card{border:1px solid #eee;border-radius:10px;padding:12px;background:#fafafa;}" +
    "img{max-width:100%;height:auto;border:1px solid #eee;border-radius:8px;}";

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

  function handleDownloadHtml() {
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
