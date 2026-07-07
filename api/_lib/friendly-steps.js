/**
 * 执行步骤口语化展示（面向业务同学，不出现技术术语）
 */

const STEP_NAMES = {
  "意图识别路由": "意图识别中",
  "识别场景": "识别分析场景",
  "识别时间范围": "理解你说的时间",
  "识别目标粒度": "判断按日/周/月哪种粒度",
  "识别指标 / 维度": "识别指标和拆解维度",
  "经营数据": "加载经营数据",
  "场景数据": "加载经营数据",
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
  "寒暄 Agent": "跟你打个招呼",
  "寒暄招呼": "跟你打个招呼",
  NL2SQL: "自然语言查数",
  "Data Query Engine": "统一查数",
  "时间语义解析": "理解你说的时间",
  "目标粒度判断": "判断按日/周/月哪种粒度",
  "指标粒度校验": "核对指标是否支持该粒度",
  "选表路由": "选择对应的底表",
  "Analysis Planner": "拆解分析步骤",
  "Metric Operators": "确定性计算",
  "Metric Operators": "确定性双指标计算",
  "环比/同比计算": "当期与上期指标对比",
  "贡献度拆解": "结构变化贡献计算",
  "漏斗聚合": "漏斗阶段转化率计算",
  "Answer Composer": "整理结论",
  "Quality Gates": "结果质检",
  SQL生成Agent: "生成查询语句",
  "SQL生成 Agent": "生成查询语句"
};

const TOOL_NAMES = {
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
  "关键词回退": "keyword_fallback",
  "关键词校正": "keyword_override",
  "关键词规则": "keyword_rule",
  "推理完成": "inference_done",
  error: "error"
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
    .replace(/generateObject/g, "generateObject")
    .replace(/\s+/g, " ")
    .trim();
}

function friendlyStepName(name) {
  const value = String(name || "").trim();
  if (!value) return "处理中";
  if (STEP_NAMES[value]) return STEP_NAMES[value];
  return sanitizeTechTerms(value.replace(/Agent$/i, "").replace(/\s+Agent$/i, ""));
}

function friendlyTool(tool) {
  if (!tool) return "";
  return String(tool)
    .split(/\s*→\s*/)
    .map((part) => {
      const key = part.trim();
      return TOOL_NAMES[key] || TOOL_NAMES[key.toLowerCase()] || key;
    })
    .join(" → ");
}

function shortenText(text, maxLen) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen) + "…";
}

function friendlyStepSummary(step) {
  const summary = String((step && step.summary) || "").trim();
  const tool = step && step.tool ? friendlyTool(step.tool) : "";

  let match = summary.match(/识别为「([^」]+)」（置信度 (\d+)%）[:：]\s*(.*)$/s);
  if (match) {
    const reason = shortenText(sanitizeTechTerms(match[3].replace(/\s+/g, " ")), 48);
    return `判断你在问「${match[1]}」这类事（把握约 ${match[2]}%）${reason ? " · " + reason : ""}`;
  }

  if (/^(调用 .+ 完成|call .+ done)$/.test(summary)) {
    const toolName = tool || summary.replace(/^(调用\s+|\s+完成|call\s+|\s+done)$/g, "");
    return `done: ${toolName}`;
  }
  if (/^完成 /.test(summary) && tool) {
    return `${sanitizeTechTerms(summary.replace(/^完成\s*/, "已完成："))}（${tool}）`;
  }
  if (/^调用了 \d+ 个工具/.test(summary)) {
    return "一共用了几个数据源，分析完成";
  }
  if (/工作流执行完成/.test(summary)) {
    return "这一块分析做完了";
  }
  if (/商圈地图 · 已加载/.test(summary)) {
    return summary
      .replace("商圈地图 · 已加载", "已加载")
      .replace(" 座城市与 ", " 个城市、")
      .replace(" 个商圈", " 个商圈地图");
  }
  if (/商圈问题 · 加载/.test(summary)) {
    return summary
      .replace("商圈问题 · 加载", "已加载")
      .replace(" 座城市与 ", " 个城市、")
      .replace(" 个商圈", " 个商圈地图");
  }
  if (/未提及商圈/.test(summary)) {
    return "这次没问商圈，地图先不出";
  }
  if (/已写入 \d+ 条/.test(summary)) {
    return "已记录本次分析过程";
  }
  if (/降级到内存/.test(summary)) {
    return "暂时记在本地，稍后再同步";
  }
  if (/对话已保存/.test(summary)) return "已经放进左侧历史对话了";
  if (/回答已生成/.test(summary)) return "回答写好了，正在一个字一个字给你看";
  if (/LLM|模型/.test(summary) && /失败|未配置/.test(summary)) {
    return "智能分析暂时没连上，先用内置数据和规则算";
  }
  if (/NL2SQL|nl2sql/i.test(summary)) return "已改用自然语言帮你查数";
  if (/RAG|知识检索/.test(summary)) return "已从经营手册里找参考";
  if (/完成数据查询/.test(summary)) return "数字查好了，结论也写好了";
  if (/完成漏斗/.test(summary)) return "漏斗看完了，损耗点也找出来了";
  if (/完成竞对/.test(summary)) return "各平台对比完了";
  if (/成功提取结构化/.test(summary)) return "提案卡片整理好了";
  if (/拉取品牌数据/.test(summary)) return "先看品牌情况，再写一版提案";
  if (/NL2SQL|数据检索/.test(summary)) return "用大白话帮你把数查出来";
  if (/计算漏斗/.test(summary)) return "算漏斗，找哪里在漏客";
  if (/竞对基准/.test(summary)) return "各平台数据拉出来比一比";
  if (/^正在/.test(summary)) {
    return summary.replace(/^正在/, "这就").replace(/…$/, "");
  }

  return sanitizeTechTerms(summary || (tool ? `正在${tool}` : ""));
}

function friendlyDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1000) return "不到 1 秒";
  return "约 " + (value / 1000).toFixed(1) + " 秒";
}

module.exports = {
  friendlyStepName,
  friendlyTool,
  friendlyStepSummary,
  friendlyDuration,
  sanitizeTechTerms
};
