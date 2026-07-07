const { requestJsonModel } = require("./model-client");
const { enrichWorkflowWithSidecarReport, getSidecarConfig } = require("./sidecar-client");

async function runDeterministicAgents(state) {
  await runAgent(state, agentDefinitions.brief, briefAgent);
  await runAgent(state, agentDefinitions.data, dataQueryAgent);
  await runAgent(state, agentDefinitions.attribution, attributionAgent);
  await runAgent(state, agentDefinitions.analysis, businessAnalysisAgent);
  await runAgent(state, agentDefinitions.strategy, strategyAgent);
  await runAgent(state, agentDefinitions.quality, qualityAgent);
  return state;
}

async function runHaidilaoWorkflow({ request, modelConfig, requestId, supabaseContext }) {
  const state = {
    request,
    requestId,
    supabaseContext,
    outputs: {},
    trace: []
  };

  await runDeterministicAgents(state);
  await runAgent(state, agentDefinitions.composer, (currentState) => proposalComposerAgent(currentState, modelConfig));

  const result = buildApiResult(state, modelConfig);
  const sidecarConfig = getSidecarConfig(process.env);
  if (sidecarConfig.enabled) {
    try {
      result.sidecar = await enrichWorkflowWithSidecarReport(state, process.env);
    } catch (error) {
      result.sidecar = {
        ok: false,
        error: error.message
      };
    }
  }

  return result;
}

const agentDefinitions = {
  brief: {
    id: "brief-agent",
    name: "提案 Brief Agent",
    role: "锁定品牌、周期、提案目标和不可编造边界。"
  },
  data: {
    id: "data-query-agent",
    name: "智能问数 Agent",
    role: "读取品牌、POI、套餐、搜索、活动和链路事实表。"
  },
  attribution: {
    id: "funnel-attribution-agent",
    name: "链路归因 Agent",
    role: "拆解搜索、POI、套餐、下单、支付、核销的转化漏斗。"
  },
  analysis: {
    id: "business-analysis-agent",
    name: "经营分析 Agent",
    role: "主 Agent：识别半年度经营主矛盾、机会区和风险点。"
  },
  strategy: {
    id: "strategy-agent",
    name: "策略生成 Agent",
    role: "把诊断转成可执行的 KA 半年度推进动作。"
  },
  quality: {
    id: "quality-agent",
    name: "质检评审 Agent",
    role: "检查证据、口径、风险提示和提案可交付性。"
  },
  composer: {
    id: "proposal-composer-agent",
    name: "提案包装 Agent",
    role: "生成最终提案结构、销售表达、数字人口播和资产清单。"
  }
};

async function runAgent(state, definition, fn) {
  const startedAt = Date.now();
  const output = await fn(state);
  state.outputs[definition.id] = output;
  state.trace.push({
    id: definition.id,
    name: definition.name,
    role: definition.role,
    status: "completed",
    durationMs: Date.now() - startedAt,
    summary: output.summary,
    evidence: output.evidence || []
  });
  return output;
}

function briefAgent(state) {
  const requestedBrand = state.request.brand || {};
  const brandProfile = state.supabaseContext.brandProfile || {};
  const brandName = brandProfile.brand_name || requestedBrand.name || "海底捞";

  return {
    summary: `锁定${brandName} 2026 H1 半年度品牌提案，聚焦美团到餐搜索到核销经营链路。`,
    brief: {
      brandId: brandProfile.brand_id || requestedBrand.id || "haidilao",
      brandName,
      category: brandProfile.category || "火锅",
      brandLevel: brandProfile.brand_level || "全国 KA",
      period: "2026 H1",
      proposalType: "semiannual_ka_proposal",
      objective: "用搜索、POI、套餐、下单、支付和核销数据支撑半年度复盘与下半年增长动作。",
      guardrails: [
        "只引用输入数据与底表字段，不编造外部经营事实。",
        "当前样例为链路级生产口径演示，若 Supabase 不可达必须标注数据降级。",
        "经营分析结论必须落到可验证指标、可执行动作和复盘口径。"
      ]
    },
    evidence: ["dim_brand.brand_name", "user.brand", "proposalType=semiannual_ka_proposal"]
  };
}

function dataQueryAgent(state) {
  const context = state.supabaseContext;
  const counts = getSourceCounts(context);
  const searchSummary = aggregateSearchFacts(context.dailyFacts.searchFacts);
  const poiSummary = aggregatePoiFacts(context.dailyFacts.poiFacts);
  const campaignSummary = aggregateCampaignFacts(context.dailyFacts.campaignFacts);
  const h1Summary = aggregateMonthlyFacts(context.monthlyFacts || []);
  const topCities = latestCityFacts(context.cityMonthlyFacts || []).slice(0, 5);
  const competitorBenchmarks = latestCompetitorFacts(context.competitorBenchmarks || []);
  const latestSearch = first(context.dailyFacts.searchFacts);
  const latestPoi = first(context.dailyFacts.poiFacts);
  const latestCampaign = first(context.dailyFacts.campaignFacts);
  const deal = first(context.deals);
  const poi = first(context.pois);

  return {
    summary: `完成 ${counts.funnelEvents} 条链路事件、${counts.searchFacts} 条搜索事实、${counts.monthlyFacts} 条月度经分、${counts.cityMonthlyFacts} 条城市分层、${counts.competitorBenchmarks} 条竞对基准读取。`,
    dataMode: context.dataMode,
    connected: context.connected,
    warnings: context.warnings || [],
    errors: context.errors || [],
    counts,
    snapshots: {
      brand: context.brandProfile,
      poi,
      deal,
      latestSearch,
      latestPoi,
      latestCampaign,
      searchSummary,
      poiSummary,
      campaignSummary,
      h1Summary,
      topCities,
      competitorBenchmarks,
      assets: context.assets
    },
    evidence: [
      "fact_search_keyword_monthly",
      "fact_poi_monthly",
      "fact_deal_campaign_monthly",
      "fact_brand_monthly",
      "fact_city_brand_monthly",
      "fact_competitor_benchmark_monthly",
      "vw_meituan_funnel_demo",
      "brand_assets"
    ]
  };
}

function attributionAgent(state) {
  const data = state.outputs[agentDefinitions.data.id];
  const search = data.snapshots.searchSummary || {};
  const campaign = data.snapshots.campaignSummary || {};
  const poi = data.snapshots.poiSummary || {};

  const funnel = [
    makeStage("搜索曝光", search.impressions, null),
    makeStage("搜索点击", search.clicks, ratio(search.clicks, search.impressions)),
    makeStage("POI 点击", search.poi_clicks || poi.search_visits, ratio(search.poi_clicks || poi.search_visits, search.clicks)),
    makeStage("套餐详情", search.deal_clicks || campaign.detail_views, ratio(search.deal_clicks || campaign.detail_views, search.poi_clicks || poi.search_visits)),
    makeStage("下单提交", search.order_submits || campaign.order_submits, ratio(search.order_submits || campaign.order_submits, search.deal_clicks || campaign.detail_views)),
    makeStage("支付订单", search.paid_orders || campaign.paid_orders, ratio(search.paid_orders || campaign.paid_orders, search.order_submits || campaign.order_submits)),
    makeStage("核销订单", search.verified_orders || campaign.verified_orders, ratio(search.verified_orders || campaign.verified_orders, search.paid_orders || campaign.paid_orders))
  ];

  const gmv = number(search.gmv || campaign.pay_gmv);
  const paidOrders = number(search.paid_orders || campaign.paid_orders);
  const verifiedOrders = number(search.verified_orders || campaign.verified_orders);
  const subsidy = number(campaign.coupon_reduce_amount);
  const refunds = number(campaign.refunds);
  const leakage = findLargestLeakage(funnel);

  return {
    summary: `链路主损耗位于${leakage.from}到${leakage.to}，转化率 ${formatPercent(leakage.conversion)}。`,
    funnel,
    derivedMetrics: {
      searchCtr: ratio(search.clicks, search.impressions),
      poiToDealRate: ratio(search.deal_clicks || campaign.detail_views, search.poi_clicks || poi.search_visits),
      dealToSubmitRate: ratio(search.order_submits || campaign.order_submits, search.deal_clicks || campaign.detail_views),
      submitToPaidRate: ratio(search.paid_orders || campaign.paid_orders, search.order_submits || campaign.order_submits),
      paidToVerifiedRate: ratio(verifiedOrders, paidOrders),
      averageOrderValue: paidOrders ? gmv / paidOrders : 0,
      subsidyRate: ratio(subsidy, gmv),
      refundRate: ratio(refunds, paidOrders)
    },
    bottlenecks: [
      `POI 到套餐详情承接率 ${formatPercent(ratio(search.deal_clicks || campaign.detail_views, search.poi_clicks || poi.search_visits))}`,
      `下单到支付转化率 ${formatPercent(ratio(search.paid_orders || campaign.paid_orders, search.order_submits || campaign.order_submits))}`,
      `支付到核销率 ${formatPercent(ratio(verifiedOrders, paidOrders))}`
    ],
    evidence: ["search_word=haidilao", "source=mt_search_poi", "poi_id", "deal_id", "campaign_id"]
  };
}

function businessAnalysisAgent(state) {
  const brief = state.outputs[agentDefinitions.brief.id].brief;
  const data = state.outputs[agentDefinitions.data.id];
  const attribution = state.outputs[agentDefinitions.attribution.id];
  const metrics = attribution.derivedMetrics;
  const h1 = data.snapshots.h1Summary;
  const topCities = data.snapshots.topCities || [];
  const competitors = data.snapshots.competitorBenchmarks || [];
  const meituanBenchmark = competitors.find((item) => item.competitor === "美团到餐") || competitors[0] || {};
  const douyinBenchmark = competitors.find((item) => item.competitor === "抖音到店") || {};
  const riskSignals = buildRiskSignals({ h1, metrics, meituanBenchmark });
  const score = scoreOpportunity(metrics, data.dataMode);

  return {
    summary: `经分结论：${brief.brandName}半年度提案的主矛盾是高意图搜索进入后，POI 到套餐承接、广告变现效率和核销质量需要一起经营。`,
    opportunityScore: score,
    metricCards: [
      { label: "H1 GTV", value: compactCurrency(h1.totalGtv), delta: `月环比 ${formatSignedPercent(h1.gtvGrowth)}` },
      { label: "POI 到套餐", value: formatPercent(metrics.poiToDealRate), delta: "关键承接点" },
      { label: "综合变现率", value: formatPercent(h1.latestTakeRate), delta: `广告渗透 ${formatPercent(h1.latestAdPenetration)}` },
      { label: "核销率", value: formatPercent(metrics.paidToVerifiedRate || h1.verifiedRate), delta: `补贴率 ${formatPercent(h1.latestSubsidyRate)}` }
    ],
    insights: [
      `GTV 三因子显示：H1 活跃用户从 ${h1.firstActiveUsers} 增至 ${h1.lastActiveUsers}，频次 ${h1.latestFrequency}，客单 ${formatCurrency(h1.latestAov)}，增长主要来自用户规模与广告承接，而不是单纯降价。`,
      `变现率视角显示：综合 take rate ${formatPercent(h1.latestTakeRate)}，广告收入占商户收入 ${formatPercent(h1.adRevenueMix)}，提案应把海底捞从“交易活动”升级到“搜索广告 + 套餐经营”。`,
      `当前链路中 POI 到套餐详情承接率 ${formatPercent(metrics.poiToDealRate)}，是经营化改造的主战场，适合用门店页套餐组、家庭聚餐场景和会员权益承接。`,
      `城市分层显示：${topCities.map((city) => `${city.city} GMV ${compactCurrency(city.gmv)} ROI ${city.roi}`).join("；")}，资源应按城市 ROI 和核销质量分配。`,
      `竞对视角显示：美团到餐核销率 ${formatPercent(meituanBenchmark.verification_rate)} vs 抖音到店 ${formatPercent(douyinBenchmark.verification_rate)}，美团优势在高意图搜索和核销质量，不宜陷入内容平台式低价补贴。`
    ],
    risks: [
      data.dataMode === "supabase"
        ? "当前样本仍需扩展到完整 H1 日期范围、城市和门店分层。"
        : "当前使用内置演示数据，必须在正式提案前切换到真实 Supabase 或数仓数据。",
      ...riskSignals,
      "若只优化套餐价格，不同步优化 POI 页面信息、到店权益和核销提醒，支付后的实际到店转化会继续损耗。"
    ],
    dimensions: {
      gtvThreeFactor: {
        activeUsers: h1.lastActiveUsers,
        purchaseFrequency: h1.latestFrequency,
        avgOrderValue: h1.latestAov,
        h1Gtv: h1.totalGtv,
        gtvGrowth: h1.gtvGrowth
      },
      monetization: {
        takeRate: h1.latestTakeRate,
        adRevenueMix: h1.adRevenueMix,
        adMerchantPenetration: h1.latestAdPenetration,
        subsidyRate: h1.latestSubsidyRate
      },
      cityTiers: topCities,
      competitorBenchmarks: competitors,
      riskSignals
    },
    evidence: [
      "经营分析 Agent 引用 attribution.derivedMetrics",
      "fact_brand_monthly.take_rate",
      "fact_brand_monthly.ad_merchant_penetration",
      "fact_city_brand_monthly.roi",
      "fact_competitor_benchmark_monthly.verification_rate",
      "fact_search_keyword_monthly.paid_orders",
      "fact_deal_campaign_monthly.coupon_reduce_amount"
    ]
  };
}

function strategyAgent(state) {
  const analysis = state.outputs[agentDefinitions.analysis.id];
  const attribution = state.outputs[agentDefinitions.attribution.id];
  const aov = attribution.derivedMetrics.averageOrderValue;
  const dimensions = analysis.dimensions || {};
  const topCity = dimensions.cityTiers?.[0];

  return {
    summary: "生成下半年四段式推进策略：搜索承接、广告变现、城市分层、核销复盘。",
    actions: [
      "搜索承接：围绕 haidilao 高意图词配置品牌专区、门店页套餐组和聚餐场景入口，优先提升 POI 到套餐详情点击。",
      `广告变现：以商户广告渗透率 ${formatPercent(dimensions.monetization?.adMerchantPenetration)} 为核心战役，推动搜索竞价、CPC 和智能投放案例教育。`,
      `城市分层：优先放大 ${topCity?.city || "高 ROI 城市"} 的高 ROI 资源组合，低 ROI 城市先修 POI 承接和套餐结构。`,
      "套餐策略：保留客单价约束，以家庭/多人餐、工作日错峰、会员日三类权益做组合，而不是单一降价。",
      "核销闭环：把支付后提醒、到店核销、退款原因和二次复购纳入半年度经营看板。",
      "销售打法：KA 拜访用一页链路图讲清搜索、POI、套餐、支付、核销的机会点，再落到城市和门店分层动作。"
    ],
    timeline: [
      { title: "H1 复盘", body: "补齐 H1 日期范围、城市、门店、套餐和活动维度，形成半年度经营基线。" },
      { title: "Q3 承接", body: "上线搜索承接与门店页套餐组实验，跟踪 POI 到套餐和下单支付转化。" },
      { title: "Q4 放大", body: "沉淀高效套餐、会员日权益和核销复盘模板，复制到重点城市与高潜门店。" }
    ],
    assets: [
      { title: "半年度经营诊断页", body: "展示搜索到核销漏斗、关键损耗点和机会分。" },
      { title: "KA 拜访链路图", body: "用海底捞搜索到套餐下单链路解释美团到餐经营价值。" },
      { title: "变现率与补贴率看板", body: "追踪 take rate、广告收入占比、广告商户渗透率、补贴率和核销率预警线。" },
      { title: "下半年动作清单", body: "按搜索承接、广告变现、城市分层、套餐策略、核销闭环拆解责任人与指标。" },
      { title: "数据补齐清单", body: `正式版需补齐 H1 全量日期、城市门店分层和复购指标；当前客单约 ${formatCurrency(aov)}。` }
    ],
    evidence: ["business-analysis-agent.insights", "attribution.derivedMetrics"]
  };
}

function qualityAgent(state) {
  const data = state.outputs[agentDefinitions.data.id];
  const analysis = state.outputs[agentDefinitions.analysis.id];
  const attribution = state.outputs[agentDefinitions.attribution.id];
  const gates = [
    {
      name: "证据约束",
      passed: analysis.evidence.length > 0 && attribution.evidence.length > 0,
      message: "结论均引用链路事实、活动事实或派生指标。"
    },
    {
      name: "半年度口径",
      passed: true,
      message: data.dataMode === "supabase" ? "已使用 Supabase 数据，但仍需确认 H1 完整日期范围。" : "当前为演示数据，正式半年度提案前必须接入 H1 全量数据。"
    },
    {
      name: "行动可交付",
      passed: state.outputs[agentDefinitions.strategy.id].actions.length >= 4,
      message: "动作已拆到搜索承接、套餐策略、核销闭环和销售打法。"
    }
  ];

  return {
    summary: gates.every((gate) => gate.passed) ? "质检通过：可用于半年度提案演示，正式版需补齐 H1 全量数据。" : "质检发现阻塞项，需要补证据。",
    gates,
    warnings: [
      ...data.warnings,
      ...data.errors.map((item) => `数据源告警：${item}`)
    ].slice(0, 8),
    evidence: gates.map((gate) => gate.name)
  };
}

async function proposalComposerAgent(state, modelConfig) {
  // 调试态：模型未配置不再降级到确定性提案，直接抛错暴露问题
  if (!modelConfig.configured) {
    throw new Error("提案包装 Agent 失败：模型未配置（MODEL_API_KEY 缺失）。调试态已关闭确定性降级。");
  }

  // 调试态：模型失败不再降级到确定性提案，直接抛错暴露问题
  const modelDraft = await requestJsonModel({
    modelConfig,
    maxTokens: modelConfig.maxTokens,
    system: [
      "你是 BrandPilot AI 的提案包装 Agent，只负责把已完成的多 Agent 结果改写成清晰的半年度品牌提案。",
      "禁止编造外部事实；必须保留数据口径限制；必须围绕海底捞 2026 H1 半年度提案。",
      "只输出严格 JSON，不要 Markdown。",
      "顶层字段必须包含：metrics, insights, actions, timeline, assets, liveScript, proposal, evidence。"
    ].join("\n"),
    user: {
      requestId: state.requestId,
      brief: state.outputs[agentDefinitions.brief.id].brief,
      data: state.outputs[agentDefinitions.data.id],
      attribution: state.outputs[agentDefinitions.attribution.id],
      analysis: state.outputs[agentDefinitions.analysis.id],
      strategy: state.outputs[agentDefinitions.strategy.id],
      quality: state.outputs[agentDefinitions.quality.id],
      outputRules: {
        metrics: "4 items",
        insights: "4 items",
        actions: "4 items",
        timeline: "3 items",
        evidence: "6 items max"
      }
    }
  });

  return mergeComposerOutput(buildDeterministicProposal(state), modelDraft);
}

function buildApiResult(state, modelConfig) {
  const brief = state.outputs[agentDefinitions.brief.id].brief;
  const data = state.outputs[agentDefinitions.data.id];
  const analysis = state.outputs[agentDefinitions.analysis.id];
  const quality = state.outputs[agentDefinitions.quality.id];
  const composer = state.outputs[agentDefinitions.composer.id];
  const now = new Date();
  const sourceCounts = data.counts;
  const agentLog = state.trace.map((item) => ({
    time: now.toLocaleTimeString("zh-CN", { hour12: false }),
    text: `${item.name}：${item.summary}`
  }));

  return {
    mode: "multi_agent_workflow",
    generatedAt: now.toISOString(),
    provider: modelConfig.baseUrl,
    model: modelConfig.model,
    supabaseConnected: data.connected,
    supabaseErrors: data.errors,
    sourceCounts,
    workflow: {
      requestId: state.requestId,
      scenario: brief.proposalType,
      period: brief.period,
      dataMode: data.dataMode,
      agents: state.trace,
      qualityGates: quality.gates,
      warnings: quality.warnings,
      analysis
    },
    agentLog,
    metrics: composer.metrics,
    insights: composer.insights,
    actions: composer.actions,
    timeline: composer.timeline,
    assets: composer.assets,
    liveScript: composer.liveScript,
    proposal: {
      ...composer.proposal,
      payload: {
        ...(composer.proposal.payload || {}),
        workflow: {
          requestId: state.requestId,
          agents: state.trace,
          qualityGates: quality.gates,
          dataMode: data.dataMode
        },
        sourceCounts,
        model: modelConfig.model,
        provider: modelConfig.baseUrl,
        generatedAt: now.toISOString()
      }
    },
    evidence: composer.evidence
  };
}

function buildDeterministicProposal(state) {
  const brief = state.outputs[agentDefinitions.brief.id].brief;
  const analysis = state.outputs[agentDefinitions.analysis.id];
  const strategy = state.outputs[agentDefinitions.strategy.id];
  const quality = state.outputs[agentDefinitions.quality.id];

  return {
    summary: "确定性提案包装完成。",
    metrics: analysis.metricCards,
    insights: analysis.insights,
    actions: strategy.actions,
    timeline: strategy.timeline,
    assets: strategy.assets,
    liveScript: {
      title: "海底捞半年度经营提案口播",
      lines: [
        "这份半年度提案先不从曝光讲起，而是从海底捞搜索到核销的经营链路讲起。",
        "当前主机会在 POI 到套餐详情的承接，以及支付后的核销闭环。",
        "下半年建议用搜索承接、套餐组合和复盘看板，把销售方案升级成经营方案。"
      ]
    },
    proposal: {
      brand_id: brief.brandId,
      brand_name: brief.brandName,
      title: `${brief.brandName} ${brief.period} 半年度经营提案`,
      opportunity_score: analysis.opportunityScore,
      summary: analysis.summary,
      payload: {
        risks: analysis.risks,
        qualityWarnings: quality.warnings
      }
    },
    evidence: unique([
      ...analysis.evidence,
      ...strategy.evidence,
      ...quality.evidence
    ]).slice(0, 8)
  };
}

function mergeComposerOutput(fallback, modelDraft) {
  return {
    summary: "模型提案包装完成。",
    metrics: normalizeList(modelDraft.metrics, fallback.metrics, 4),
    insights: normalizeList(modelDraft.insights, fallback.insights, 4),
    actions: normalizeList(modelDraft.actions, fallback.actions, 4),
    timeline: normalizeList(modelDraft.timeline, fallback.timeline, 3),
    assets: normalizeList(modelDraft.assets, fallback.assets, 4),
    liveScript: modelDraft.liveScript?.lines?.length ? modelDraft.liveScript : fallback.liveScript,
    proposal: {
      ...fallback.proposal,
      ...(modelDraft.proposal || {}),
      payload: {
        ...fallback.proposal.payload,
        ...(modelDraft.proposal?.payload || {})
      }
    },
    evidence: normalizeList(modelDraft.evidence, fallback.evidence, 8)
  };
}

function normalizeList(value, fallback, limit) {
  return Array.isArray(value) && value.length ? value.filter(Boolean).slice(0, limit) : fallback.slice(0, limit);
}

function getSourceCounts(context) {
  return {
    brandProfiles: context.brandProfile ? 1 : 0,
    pois: context.pois?.length || 0,
    deals: context.deals?.length || 0,
    funnelEvents: context.funnelEvents?.length || 0,
    searchFacts: context.dailyFacts?.searchFacts?.length || 0,
    poiFacts: context.dailyFacts?.poiFacts?.length || 0,
    campaignFacts: context.dailyFacts?.campaignFacts?.length || 0,
    monthlyFacts: context.monthlyFacts?.length || 0,
    cityMonthlyFacts: context.cityMonthlyFacts?.length || 0,
    competitorBenchmarks: context.competitorBenchmarks?.length || 0,
    assets: context.assets?.length || 0
  };
}

function aggregateSearchFacts(rows = []) {
  return sumFields(rows, [
    "impressions",
    "clicks",
    "poi_clicks",
    "deal_clicks",
    "order_submits",
    "paid_orders",
    "verified_orders",
    "gmv"
  ]);
}

function aggregatePoiFacts(rows = []) {
  return sumFields(rows, [
    "exposure",
    "visits",
    "search_visits",
    "deal_clicks",
    "favorite_count",
    "navigate_clicks",
    "phone_clicks"
  ]);
}

function aggregateCampaignFacts(rows = []) {
  return sumFields(rows, [
    "impressions",
    "detail_views",
    "buy_clicks",
    "order_submits",
    "paid_orders",
    "verified_orders",
    "pay_gmv",
    "coupon_reduce_amount",
    "refunds"
  ]);
}

function aggregateMonthlyFacts(rows = []) {
  const ordered = [...rows].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const firstRow = ordered[0] || {};
  const latestRow = ordered[ordered.length - 1] || {};
  const totals = sumFields(ordered, [
    "gtv",
    "paid_orders",
    "verified_orders",
    "commission_revenue",
    "ad_revenue",
    "merchant_revenue",
    "subsidy_amount",
    "operating_cost"
  ]);

  return {
    months: ordered.length,
    firstMonth: firstRow.month || null,
    latestMonth: latestRow.month || null,
    totalGtv: totals.gtv,
    paidOrders: totals.paid_orders,
    verifiedOrders: totals.verified_orders,
    commissionRevenue: totals.commission_revenue,
    adRevenue: totals.ad_revenue,
    merchantRevenue: totals.merchant_revenue,
    subsidyAmount: totals.subsidy_amount,
    operatingCost: totals.operating_cost,
    verifiedRate: ratio(totals.verified_orders, totals.paid_orders),
    adRevenueMix: ratio(totals.ad_revenue, totals.merchant_revenue),
    firstActiveUsers: number(firstRow.active_users),
    lastActiveUsers: number(latestRow.active_users),
    latestFrequency: number(latestRow.purchase_frequency),
    latestAov: number(latestRow.avg_order_value),
    latestTakeRate: number(latestRow.take_rate),
    latestSubsidyRate: number(latestRow.subsidy_rate),
    latestAdPenetration: number(latestRow.ad_merchant_penetration),
    gtvGrowth: ratio(number(latestRow.gtv) - number(firstRow.gtv), firstRow.gtv),
    activeUserGrowth: ratio(number(latestRow.active_users) - number(firstRow.active_users), firstRow.active_users),
    aovChange: ratio(number(latestRow.avg_order_value) - number(firstRow.avg_order_value), firstRow.avg_order_value)
  };
}

function latestCityFacts(rows = []) {
  const latestMonth = maxBy(rows, (item) => String(item.month || ""))?.month;
  return rows
    .filter((item) => item.month === latestMonth)
    .map((item) => ({
      ...item,
      gmv: number(item.gmv),
      roi: number(item.roi),
      verificationRate: ratio(item.verified_orders, item.paid_orders),
      subsidyRate: ratio(item.coupon_reduce_amount, item.gmv)
    }))
    .sort((a, b) => b.gmv - a.gmv);
}

function latestCompetitorFacts(rows = []) {
  const latestMonth = maxBy(rows, (item) => String(item.month || ""))?.month;
  return rows.filter((item) => item.month === latestMonth);
}

function buildRiskSignals({ h1, metrics, meituanBenchmark }) {
  const signals = [];
  if (h1.latestSubsidyRate >= 0.02) {
    signals.push(`补贴率 ${formatPercent(h1.latestSubsidyRate)} 已触及 2% 竞争烈度预警线。`);
  }
  if (h1.latestAdPenetration < 0.15) {
    signals.push(`广告商户渗透 ${formatPercent(h1.latestAdPenetration)} 低于 15%，商户广告意愿不足。`);
  }
  const verifiedRate = metrics.paidToVerifiedRate || h1.verifiedRate || number(meituanBenchmark.verification_rate);
  if (verifiedRate < 0.78) {
    signals.push(`核销率 ${formatPercent(verifiedRate)} 低于 78%，购买决策质量存在风险。`);
  }
  if (!signals.length) {
    signals.push("补贴率、广告渗透和核销率均处于演示安全区间，但正式提案需用 H1 全量数据复核。");
  }
  return signals;
}

function sumFields(rows, fields) {
  return rows.reduce((acc, row) => {
    for (const field of fields) {
      acc[field] = number(acc[field]) + number(row?.[field]);
    }
    return acc;
  }, {});
}

function makeStage(name, value, conversionFromPrevious) {
  return {
    name,
    value: number(value),
    conversionFromPrevious,
    conversionLabel: conversionFromPrevious === null ? "起点" : formatPercent(conversionFromPrevious)
  };
}

function findLargestLeakage(stages) {
  let result = { from: stages[0].name, to: stages[1].name, conversion: stages[1].conversionFromPrevious || 0 };
  for (let index = 1; index < stages.length; index += 1) {
    const current = stages[index];
    if (current.conversionFromPrevious !== null && current.conversionFromPrevious < result.conversion) {
      result = {
        from: stages[index - 1].name,
        to: current.name,
        conversion: current.conversionFromPrevious
      };
    }
  }
  return result;
}

function scoreOpportunity(metrics, dataMode) {
  const base = 72;
  const searchBonus = (metrics.searchCtr || 0) > 0.06 ? 6 : 2;
  const bottleneckBonus = (metrics.poiToDealRate || 0) < 0.45 ? 8 : 3;
  const closeLoopBonus = (metrics.paidToVerifiedRate || 0) > 0.65 ? 5 : 2;
  const dataPenalty = dataMode === "supabase" ? 0 : 4;
  return Math.max(0, Math.min(100, Math.round(base + searchBonus + bottleneckBonus + closeLoopBonus - dataPenalty)));
}

function first(items) {
  return Array.isArray(items) && items.length ? items[0] : null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(numerator, denominator) {
  const top = number(numerator);
  const bottom = number(denominator);
  return bottom > 0 ? top / bottom : 0;
}

function formatPercent(value) {
  return `${(number(value) * 100).toFixed(1)}%`;
}

function formatSignedPercent(value) {
  const parsed = number(value);
  const sign = parsed >= 0 ? "+" : "";
  return `${sign}${(parsed * 100).toFixed(1)}%`;
}

function formatCurrency(value) {
  return `${number(value).toFixed(1)} 元`;
}

function compactCurrency(value) {
  const parsed = number(value);
  if (Math.abs(parsed) >= 100000000) return `${(parsed / 100000000).toFixed(2)}亿`;
  if (Math.abs(parsed) >= 10000) return `${(parsed / 10000).toFixed(1)}万`;
  return formatCurrency(parsed);
}

function maxBy(items, selector) {
  return items.reduce((best, item) => {
    if (!best) return item;
    return selector(item) > selector(best) ? item : best;
  }, null);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

module.exports = {
  agentDefinitions,
  runDeterministicAgents,
  runHaidilaoWorkflow
};
