/**
 * 数字人直播口播放本生成
 * 优先把结构化提案转成分镜口播；无提案时用回答摘要兜底。
 */

function buildLiveScript(params = {}) {
  const brandName = params.brandName || "海底捞";
  const workflow = params.workflow || "annual_proposal";
  const proposal = params.proposal || null;
  const answer = String(params.answer || "");
  const charts = params.charts || [];

  if (proposal) {
    return fromProposal(brandName, proposal, charts);
  }

  return fromAnswer(brandName, workflow, answer, charts);
}

function fromProposal(brandName, proposal, charts) {
  const scenes = [];
  scenes.push({
    id: "hook",
    title: "开场钩子",
    durationSec: 12,
    narration:
      `各位同事，今天我们聚焦${brandName}半年度经营主线。` +
      `机会评分 ${proposal.opportunityScore || 80} 分，核心判断是：${clip(proposal.summary, 60)}`
  });

  if (proposal.metrics && proposal.metrics.length) {
    const metricLine = proposal.metrics
      .slice(0, 4)
      .map((m) => `${m.label} ${m.value}`)
      .join("，");
    scenes.push({
      id: "metrics",
      title: "关键指标",
      durationSec: 18,
      narration: `先看四个关键指标：${metricLine}。这些数字会决定下半年资源投放的优先级。`
    });
  }

  if (proposal.insights && proposal.insights.length) {
    scenes.push({
      id: "insights",
      title: "深度洞察",
      durationSec: 24,
      narration:
        "再看洞察：" +
        proposal.insights.slice(0, 3).map((item, i) => `${i + 1}、${clip(item, 48)}`).join(" ")
    });
  }

  const funnelChart = charts.find((c) => c.type === "funnel");
  if (funnelChart) {
    scenes.push({
      id: "funnel",
      title: "链路归因",
      durationSec: 20,
      narration:
        "链路层面，请看搜索到核销的漏斗形状。一旦某段斜率明显变陡，就说明当前最大损耗发生在这里，需要先修承接，再谈投放。"
    });
  }

  if (proposal.actions && proposal.actions.length) {
    scenes.push({
      id: "actions",
      title: "推进动作",
      durationSec: 22,
      narration:
        "建议立即推进：" +
        proposal.actions.slice(0, 3).map((item, i) => `${i + 1}、${clip(item, 40)}`).join(" ")
    });
  }

  if (proposal.timeline && proposal.timeline.length) {
    scenes.push({
      id: "timeline",
      title: "时间线",
      durationSec: 16,
      narration:
        "节奏上：" +
        proposal.timeline
          .slice(0, 3)
          .map((t) => `${t.title}，${clip(t.body, 28)}`)
          .join("；") +
        "。"
    });
  }

  scenes.push({
    id: "close",
    title: "收尾邀请",
    durationSec: 10,
    narration: `以上就是${brandName}半年度经营提案的数字人口播版本。下一步我们可以进入 AR 城市展厅，逐城拆指标。`
  });

  return finalize(brandName, scenes, proposal.title || `${brandName} 经营提案直播`);
}

function fromAnswer(brandName, workflow, answer, charts) {
  const summary = clip(answer.replace(/[#*`>\-]/g, " ").replace(/\s+/g, " "), 120) ||
    `${brandName}经营数据已完成分析，可继续追问指标细节。`;

  const scenes = [
    {
      id: "hook",
      title: "开场",
      durationSec: 10,
      narration: `关于${brandName}的${workflowLabel(workflow)}，结论先讲：${summary}`
    },
    {
      id: "detail",
      title: "展开讲解",
      durationSec: 20,
      narration:
        charts.length > 0
          ? "右侧图表已同步更新，建议先看主图趋势，再回看关键损耗环节。"
          : "你可以继续追问具体月份、城市或竞对维度，我会给出带证据的回答。"
    },
    {
      id: "close",
      title: "收尾",
      durationSec: 8,
      narration: "需要我把这一段导出成直播短视频，或者切到 AR 展厅继续讲解吗？"
    }
  ];

  return finalize(brandName, scenes, `${brandName} 数字人口播`);
}

function finalize(brandName, scenes, title) {
  const fullScript = scenes.map((s) => s.narration).join("\n\n");
  const totalDurationSec = scenes.reduce((sum, s) => sum + (s.durationSec || 0), 0);
  return {
    title,
    brandName,
    totalDurationSec,
    scenes,
    fullScript,
    subtitles: scenes.map((s, index) => ({
      index,
      text: s.narration,
      startSec: scenes.slice(0, index).reduce((sum, item) => sum + (item.durationSec || 0), 0),
      endSec: scenes.slice(0, index + 1).reduce((sum, item) => sum + (item.durationSec || 0), 0)
    }))
  };
}

function workflowLabel(workflow) {
  const labels = {
    annual_proposal: "年度提案",
    funnel_diagnosis: "链路诊断",
    competitor_benchmark: "竞对对比",
    data_query: "数据问答"
  };
  return labels[workflow] || "经营分析";
}

function clip(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}

module.exports = {
  buildLiveScript
};
