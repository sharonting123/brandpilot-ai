/**
 * BrandPilot 经营顾问「悦悦」— 名称、头像与口语化文案
 */
(function (global) {
  "use strict";

  var ASSISTANT = {
    name: "悦悦",
    title: "品牌经营顾问",
    avatarUrl: "assets/assistant-avatar.png"
  };

  var STEP_NAMES = {
    "意图识别路由": "意图识别中",
    "场景数据": "准备商圈地图",
    "事件持久化": "记下这次分析",
    "保存对话": "存进历史对话",
    "生成回答": "整理成回答",
    "工具调用": "查数据中",
    "链路诊断Agent": "分析转化哪里漏了",
    "链路诊断 Agent": "分析转化哪里漏了",
    "数据查询Agent": "帮你把数查出来",
    "数据查询 Agent": "帮你把数查出来",
    "竞对分析Agent": "对比各平台表现",
    "竞对分析 Agent": "对比各平台表现",
    "推理Agent": "综合信息写结论",
    "年度提案 Agent": "写经营提案",
    "提案结构化Agent": "整理成提案卡片",
    "确定性分析Agent": "用内置数据先算一版",
    "品牌年度提案": "写经营提案",
    "链路诊断": "看转化漏斗",
    "竞对对比": "比一比各平台",
    "数据问答": "查具体数字",
    "寒暄招呼": "跟你打个招呼",
    NL2SQL: "自然语言查数",
    "Data Query Engine": "统一查数",
    "指标粒度校验": "核对指标是否支持该粒度",
    "选表路由": "选择对应的底表",
    QueryPlan: "QueryPlan",
    "识别场景": "识别分析场景",
    "识别时间范围": "理解你说的时间",
    "识别目标粒度": "判断按日/周/月哪种粒度",
    "识别指标 / 维度": "识别指标和拆解维度"
  };

  var TOOL_NAMES = {
    computeFunnel: "computeFunnel",
    queryBrandData: "queryBrandData",
    retrieveKnowledge: "retrieveKnowledge",
    runNl2Sql: "runNl2Sql",
    aggregateMonthly: "aggregateMonthly",
    getCompetitorBenchmark: "getCompetitorBenchmark",
    getBrandPeerBenchmark: "getBrandPeerBenchmark",
    getBrandAssets: "getBrandAssets",
    generateObject: "generateObject",
    nl2sql_fallback: "nl2sql_fallback",
    fallback: "fallback",
    skipped: "skipped",
    supabase: "supabase",
    fixture: "fixture",
    memory: "memory",
    workflow: "workflow",
    stream: "stream",
    "LLM 语义识别": "LLM intent",
    "关键词快路由": "keyword_fast",
    "关键词兜底": "keyword_fallback",
    "关键词规则": "keyword_rule",
    "推理完成": "inference_done",
    error: "error"
  };

  var MODE_LABELS = {
    llm: "智能理解",
    keyword_fast: "快速匹配",
    keyword_fallback: "快速匹配",
    keyword_only: "快速匹配"
  };

  function sanitizeTechTerms(text) {
    return String(text || "")
      .replace(/\bNL2SQL\b/gi, "自然语言查数")
      .replace(/\bRAG\b/g, "经营手册")
      .replace(/\bLLM\b/g, "智能分析")
      .replace(/\bAgent\b/gi, "助手")
      .replace(/语义识别/g, "理解问题")
      .replace(/意图识别/g, "听懂问题")
      .replace(/工作流/g, "分析任务")
      .replace(/路由/g, "匹配")
      .replace(/\bSupabase\b/gi, "云端")
      .replace(/\bfixture\b/gi, "演示数据")
      .replace(/\bworkflow\b/gi, "分析")
      .replace(/推理/g, "分析")
      .replace(/编排/g, "处理")
      .replace(/持久化/g, "保存")
      .replace(/结构化提取/g, "整理卡片")
      .replace(/确定性分析/g, "内置分析")
      .replace(/事件落库/g, "已保存记录")
      .replace(/内存缓存/g, "临时记录")
      .replace(/generateObject/g, "generateObject")
      .replace(/\s+/g, " ")
      .trim();
  }

  function friendlyStepName(name) {
    var value = String(name || "").trim();
    if (!value) return "处理中";
    if (STEP_NAMES[value]) return STEP_NAMES[value];
    return sanitizeTechTerms(value.replace(/Agent$/i, "").replace(/\s+Agent$/i, ""));
  }

  function labelTool(tool) {
    if (!tool) return "";
    return String(tool)
      .split(/\s*→\s*/)
      .map(function (part) {
        var key = part.trim();
        return TOOL_NAMES[key] || TOOL_NAMES[key.toLowerCase()] || key;
      })
      .join(" → ");
  }

  function friendlyModeLabel(modeOrLabel) {
    var value = String(modeOrLabel || "").trim();
    if (!value) return "";
    return MODE_LABELS[value] || sanitizeTechTerms(value);
  }

  function shortenText(text, maxLen) {
    var value = String(text || "").trim();
    if (!value) return "";
    if (value.length <= maxLen) return value;
    return value.slice(0, maxLen) + "…";
  }

  function friendlyStepSummary(step) {
    var summary = String((step && step.summary) || "").trim();
    var tool = step && step.tool ? labelTool(step.tool) : "";
    var match;

    match = summary.match(/识别为「([^」]+)」（置信度 (\d+)%）[:：]\s*(.*)$/s);
    if (match) {
      var reason = shortenText(sanitizeTechTerms(match[3].replace(/\s+/g, " ")), 48);
      return "判断你在问「" + match[1] + "」这类事（把握约 " + match[2] + "%）" +
        (reason ? " · " + reason : "");
    }
    if (/^(调用 .+ 完成|call .+ done)$/.test(summary)) {
      var toolName = tool || summary.replace(/^(调用\s+|\s+完成|call\s+|\s+done)$/g, "");
      return "done: " + toolName;
    }
    if (/^完成 /.test(summary) && tool) {
      return sanitizeTechTerms(summary.replace(/^完成\s*/, "已完成：")) + "（" + tool + "）";
    }
    if (/^调用了 \d+ 个工具/.test(summary)) {
      return "一共用了几个数据源，分析完成";
    }
    if (/工作流执行完成/.test(summary)) return "这一块分析做完了";
    if (/商圈地图 · 已加载/.test(summary)) {
      return summary
        .replace("商圈地图 · 已加载", "已加载")
        .replace(" 座城市与 ", " 个城市、")
        .replace(" 个商圈", " 个商圈地图");
    }
    if (/未提及商圈/.test(summary)) return "这次没问商圈，地图先不出";
    if (/已写入 \d+ 条/.test(summary)) return "已记录本次分析过程";
    if (/降级到内存/.test(summary)) return "暂时记在本地，稍后再同步";
    if (/对话已保存/.test(summary)) return "已经放进左侧历史对话了";
    if (/回答已生成/.test(summary)) return "回答写好了，正在一个字一个字给你看";
    if (/LLM|模型/.test(summary) && /失败|未配置/.test(summary)) {
      return "智能分析暂时没连上，先用内置数据和规则算";
    }
    if (/NL2SQL|nl2sql/.test(summary)) return "已改用自然语言帮你查数";
    if (/RAG|知识检索/.test(summary)) return "已从经营手册里找参考";
    if (/完成数据查询/.test(summary)) return "数字查好了，结论也写好了";
    if (/完成漏斗/.test(summary)) return "漏斗看完了，损耗点也找出来了";
    if (/完成竞对/.test(summary)) return "各平台对比完了";
    if (/成功提取结构化/.test(summary)) return "提案卡片整理好了";
    if (/结构化提取失败|兜底提案/.test(summary)) return "提案卡片整理降级，已用查数结果补全";
    if (/拉取品牌数据/.test(summary)) return "先看品牌情况，再写一版提案";
    if (/NL2SQL|数据检索/.test(summary)) return "用大白话帮你把数查出来";
    if (/计算漏斗/.test(summary)) return "算漏斗，找哪里在漏客";
    if (/竞对基准/.test(summary)) return "各平台数据拉出来比一比";
    if (/^正在/.test(summary)) return summary.replace(/^正在/, "这就").replace(/…$/, "");

    return sanitizeTechTerms(summary || (tool ? "正在" + tool : ""));
  }

  function friendlyDuration(ms) {
    var value = Number(ms);
    if (!isFinite(value) || value <= 0) return "";
    if (value < 1000) return "不到 1 秒";
    return "约 " + (value / 1000).toFixed(1) + " 秒";
  }

  function inferStepStatus(step) {
    step = step || {};
    var explicit = String(step.status || "").toLowerCase();
    if (explicit === "running" || explicit === "done" || explicit === "warn" || explicit === "error") {
      return explicit;
    }
    var tool = String(step.tool || "").toLowerCase();
    var summary = String(step.summary || "");
    if (tool === "error") return "error";
    if (tool === "fallback" || tool === "nl2sql_fallback" || tool === "skipped" || tool === "failed") {
      return "warn";
    }
    if (/失败|降级|兜底|fallback|未配置|无可用|暂存本地|对话保存失败|结构化提取失败/.test(summary)) {
      return "warn";
    }
    if (/当前无可用经营数据/.test(summary)) return "warn";
    return "done";
  }

  function classifyTraceGroup(step) {
    var group = step && step.group;
    if (group) return group;
    var name = String((step && step.name) || "");
    if (name === "意图识别路由") return "intent";
    if (/识别场景|识别时间|识别目标粒度|识别指标/.test(name)) return "planning";
    if (/指标粒度|选表|Data Query|QueryPlan|SQL|NL2SQL|时间语义|目标粒度|统一查数/.test(name)) {
      return "query";
    }
    if (/结构化|提案卡片/.test(name)) return "package";
    if (/经营数据|事件持久化|保存对话|生成回答/.test(name)) return "post";
    return "analysis";
  }

  function inferWorkflowGroupName(traces) {
    for (var i = 0; i < (traces || []).length; i++) {
      var step = traces[i];
      if (step.group === "workflow" || step.tool === "workflow" || step.tool === "分析") {
        return friendlyStepName(step.name) || "分析任务";
      }
    }
    return "分析任务";
  }

  function buildTraceTree(traces) {
    if (!traces || !traces.length) return [];

    var groups = [
      { id: "intent", name: "听懂你的问题", children: [] },
      { id: "workflow", name: inferWorkflowGroupName(traces), children: [] },
      { id: "post", name: "收尾", children: [] }
    ];
    var groupMap = {
      intent: groups[0],
      planning: groups[0],
      query: groups[1],
      analysis: groups[1],
      package: groups[1],
      workflow: groups[1],
      post: groups[2]
    };

    traces.forEach(function (step) {
      var bucket = groupMap[classifyTraceGroup(step)] || groups[1];
      bucket.children.push(step);
    });

    return groups.filter(function (group) {
      return group.children.length > 0;
    });
  }

  function renderProgressStepHtml(step, options) {
    options = options || {};
    var escapeHtml = options.escapeHtml || function (value) {
      return String(value || "");
    };
    var status = inferStepStatus(step);
    var stepName = friendlyStepName(step.name) || "处理中";
    var stepSummary = friendlyStepSummary(step);
    var hasChildren = step.children && step.children.length > 0;
    var showSpinner = status === "running" && !hasChildren;
    var duration = step.durationMs && status !== "running"
      ? '<span class="trace-duration">' + escapeHtml(friendlyDuration(step.durationMs)) + "</span>"
      : "";
    var summary = stepSummary
      ? '<span class="trace-summary">' + escapeHtml(stepSummary) + "</span>"
      : "";
    var statusLabel = "";
    if (status === "warn") {
      statusLabel = '<span class="step-status-label step-status-label--warn">降级</span>';
    }
    if (status === "error") {
      statusLabel = '<span class="step-status-label step-status-label--error">失败</span>';
    }
    var routeHtml = "";
    if (step.routeReason) {
      routeHtml =
        '<span class="trace-route-reason">' +
        escapeHtml(shortenText(sanitizeTechTerms(step.routeReason), 72)) +
        "</span>";
    }

    var dotStatus = showSpinner ? status : status === "running" && hasChildren ? "done" : status;
    var classNames = ["progress-step", "status-" + dotStatus];
    if (showSpinner) classNames.push("running", "active");
    if (dotStatus === "done") classNames.push("done");

    var html =
      '<li class="' + classNames.join(" ") +
      '" data-step-id="' + escapeHtml(step.id || "") + '">' +
      '<span class="progress-dot"></span>' +
      '<span class="progress-text">' +
      "<strong>" + escapeHtml(stepName) + "</strong> " +
      statusLabel + duration + summary + routeHtml +
      "</span>";

    if (step.children && step.children.length) {
      html += '<ul class="progress-steps progress-steps--nested">';
      step.children.forEach(function (child) {
        html += renderProgressStepHtml(child, options);
      });
      html += "</ul>";
    }

    html += "</li>";
    return html;
  }

  function renderTraceTreeHtml(traces, options) {
    options = options || {};
    var escapeHtml = options.escapeHtml || function (value) {
      return String(value || "");
    };
    var compact = options.compact;
    var tree = buildTraceTree(traces);
    if (!tree.length) return "";

    var html = compact ? "" : '<div class="trace-tree">';
    tree.forEach(function (group) {
      var groupStatus = "done";
      group.children.forEach(function (child) {
        var childStatus = inferStepStatus(child);
        if (childStatus === "error") groupStatus = "error";
        else if (childStatus === "warn" && groupStatus !== "error") groupStatus = "warn";
      });

      if (compact) {
        html += renderProgressStepHtml({
          id: group.id,
          name: group.name,
          status: groupStatus,
          children: group.children.map(function (child) {
            return Object.assign({}, child, { status: inferStepStatus(child) });
          })
        }, { escapeHtml: escapeHtml });
      } else {
        html +=
          '<section class="trace-group status-' + groupStatus + '">' +
          '<div class="trace-group-title">' + escapeHtml(group.name) + "</div>" +
          '<ul class="progress-steps progress-steps--nested">';
        group.children.forEach(function (child) {
          html += renderProgressStepHtml(
            Object.assign({}, child, { status: inferStepStatus(child) }),
            { escapeHtml: escapeHtml }
          );
        });
        html += "</ul></section>";
      }
    });
    if (!compact) html += "</div>";
    return html;
  }

  function createAvatarElement(options) {
    options = options || {};
    var el = document.createElement("div");
    el.className = "message-avatar" + (options.className ? " " + options.className : "");
    el.setAttribute("aria-label", ASSISTANT.name);

    var img = document.createElement("img");
    img.src = ASSISTANT.avatarUrl;
    img.alt = ASSISTANT.name + "头像";
    img.width = 36;
    img.height = 36;
    img.loading = "lazy";
    el.appendChild(img);
    return el;
  }

  global.BrandPilotAssistant = {
    name: ASSISTANT.name,
    title: ASSISTANT.title,
    avatarUrl: ASSISTANT.avatarUrl,
    createAvatarElement: createAvatarElement,
    friendlyStepName: friendlyStepName,
    friendlyStepSummary: friendlyStepSummary,
    friendlyModeLabel: friendlyModeLabel,
    labelTool: labelTool,
    friendlyDuration: friendlyDuration,
    inferStepStatus: inferStepStatus,
    buildTraceTree: buildTraceTree,
    renderProgressStepHtml: renderProgressStepHtml,
    renderTraceTreeHtml: renderTraceTreeHtml,
    sanitizeTechTerms: sanitizeTechTerms
  };
})(window);
