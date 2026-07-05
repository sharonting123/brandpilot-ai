const mockBrands = [
  {
    id: "haidilao",
    name: "海底捞",
    title: "海底捞 2026 H1 半年度经营提案",
    score: 82,
    metrics: [
      { label: "搜索曝光", value: "12,800", delta: "haidilao" },
      { label: "POI 点击", value: "436", delta: "搜索承接" },
      { label: "支付订单", value: "41", delta: "套餐转化" },
      { label: "核销订单", value: "29", delta: "闭环复盘" }
    ],
    insights: [
      "半年度提案的主线不是泛泛讲曝光，而是讲海底捞品牌搜索心智如何被 POI、套餐、支付和核销承接。",
      "当前样例链路显示 POI 到套餐详情是关键承接点，需要用门店页套餐组和聚餐场景权益提升转化。",
      "销售侧需要把活动方案升级成经营复盘方案，明确 H1 基线、Q3 实验和 Q4 放大节奏。"
    ],
    actions: [
      "补齐 H1 全量日期、城市和门店分层数据，形成半年度经营基线。",
      "围绕 haidilao 高意图词配置品牌专区、门店页套餐组和家庭聚餐场景入口。",
      "把支付后核销、退款原因和复购纳入 KA 复盘看板。"
    ],
    timeline: [
      { title: "H1 复盘", body: "补齐 H1 日期范围、城市、门店、套餐和活动维度，形成经营基线。" },
      { title: "Q3 承接", body: "上线搜索承接和门店页套餐组实验，跟踪 POI 到套餐与下单支付转化。" },
      { title: "Q4 放大", body: "沉淀高效套餐、会员日权益和核销复盘模板，复制到重点城市。" }
    ]
  }
];

const agents = [
  {
    name: "提案 Brief Agent",
    body: "锁定海底捞、2026 H1、半年度 KA 提案和数据边界。",
    output: "确认提案目标、周期、业务口径和不可编造约束。"
  },
  {
    name: "智能问数 Agent",
    body: "读取品牌、POI、套餐、搜索、活动和链路事实表。",
    output: "完成搜索、POI、套餐、下单、支付、核销数据快照。"
  },
  {
    name: "链路归因 Agent",
    body: "拆解搜索到核销的关键转化与损耗节点。",
    output: "计算搜索点击率、POI 到套餐、支付转化和核销率。"
  },
  {
    name: "经营分析 Agent",
    body: "主 Agent：识别半年度经营主矛盾、机会区和风险点。",
    output: "输出海底捞半年度经分结论和机会分。"
  },
  {
    name: "策略生成 Agent",
    body: "把经分诊断转成下半年 KA 推进动作。",
    output: "生成搜索承接、套餐策略、核销闭环和销售打法。"
  },
  {
    name: "质检评审 Agent",
    body: "检查证据、口径、风险提示和提案可交付性。",
    output: "完成证据约束、半年度口径和行动可交付质检。"
  },
  {
    name: "提案包装 Agent",
    body: "把多 Agent 结果包装成品牌半年度提案。",
    output: "生成最终提案、口播脚本、AR 讲解和资产清单。"
  }
];

const scenarios = {
  boost: {
    label: "半年度提案",
    lift: 3,
    metric: { label: "提案周期", value: "2026 H1", delta: "KA" },
    insight: "半年度提案优先回答：搜索心智如何承接、交易转化在哪里损耗、下半年怎么复盘放大。",
    action: "先跑多 Agent 工作流，形成经分结论、链路证据、策略动作和质检结果。",
    assetTitle: "半年度经营提案",
    assetBody: "输出 H1 复盘、链路归因、下半年策略和销售拜访材料。"
  },
  defense: {
    label: "搜索承接",
    lift: 2,
    metric: { label: "承接节点", value: "POI→套餐", delta: "关键" },
    insight: "搜索承接场景下，重点不是继续扩大曝光，而是提升 POI 到套餐详情的承接效率。",
    action: "把品牌专区、门店页套餐组和聚餐场景入口作为下半年实验重点。",
    assetTitle: "搜索承接方案",
    assetBody: "输出高意图词、POI 承接、套餐入口和转化跟踪口径。"
  },
  live: {
    label: "KA 拜访",
    lift: 1,
    metric: { label: "销售材料", value: "4件", delta: "提案包" },
    insight: "KA 拜访场景下，经分结论要转成一页链路图、一页动作清单和一段可讲述口播。",
    action: "把多 Agent 输出包装成销售可用的话术、资产、时间线和风险提示。",
    assetTitle: "KA 拜访提案包",
    assetBody: "输出拜访开场、链路图讲法、下半年动作和复盘承诺。"
  }
};

const defaultAssets = [
  { title: "半年度经营诊断页", body: "搜索到核销漏斗、关键损耗点、机会分和证据口径。" },
  { title: "KA 拜访链路图", body: "用海底捞搜索到套餐下单链路解释美团到餐经营价值。" },
  { title: "下半年动作清单", body: "搜索承接、套餐策略、核销闭环、复盘看板四类动作。" },
  { title: "质检风险提示", body: "标注数据范围、外部事实边界和正式提案前的数据补齐项。" }
];

const meituanFunnel = {
  stages: [
    {
      label: "首页入口",
      event: "home_open",
      activity: "MainActivity",
      route: "imeituan://www.meituan.com/",
      fields: ["入口页", "城市/定位", "推荐位曝光"]
    },
    {
      label: "搜索结果",
      event: "search_result",
      activity: "SearchResultActivity",
      route: "imeituan://www.meituan.com/search/result",
      fields: ["search_word=haidilao", "source=mt_search_poi", "query_id"]
    },
    {
      label: "POI 门店页",
      event: "poi_view",
      activity: "MRNBaseActivity",
      route: "mrn_entry=food-poi",
      fields: ["poi_id=1287671875", "mrn_biz=meishi", "mt_source=mt_search"]
    },
    {
      label: "套餐/券详情",
      event: "deal_view",
      activity: "MRNStandardActivity",
      route: "mrn_entry=food-deal",
      fields: ["deal_id=1651151438", "campaign_id=1151457400", "isMarketingDeal=true"]
    },
    {
      label: "下单确认",
      event: "order_submit",
      activity: "MRNStandardActivity",
      route: "mrn_entry=c-group-order-submit",
      fields: ["button_type=buy", "pay_price=358.3", "coupon_reduce=30.7"]
    }
  ],
  facts: [
    { label: "搜索词", value: "haidilao", note: "搜索意图入口" },
    { label: "来源", value: "mt_search_poi", note: "搜索结果到 POI" },
    { label: "POI", value: "1287671875", note: "门店粒度" },
    { label: "Deal", value: "1651151438", note: "套餐/券粒度" },
    { label: "Campaign", value: "1151457400", note: "活动归因" },
    { label: "支付前金额", value: "358.3", note: "下单确认页" }
  ],
  schemas: [
    { title: "维表", body: "dim_brand、dim_poi、dim_deal 承接品牌、门店和套餐资产。" },
    { title: "搜索事实", body: "fact_search_keyword_daily 记录搜索词曝光、点击、POI 点击、下单和核销。" },
    { title: "POI 事实", body: "fact_poi_daily 看门店页访问、停留、收藏、导航、电话和套餐点击。" },
    { title: "活动事实", body: "fact_deal_campaign_daily 拆解 deal/campaign 的详情页、购买、支付和核销。" },
    { title: "事件明细", body: "fact_meituan_funnel_events 保留 activity、route、MRN entry 和关键参数。" }
  ]
};

const zonesByMode = {
  growth: [
    {
      name: "静安 CBD",
      value: "+18.6%",
      cls: "zone-green",
      left: "14%",
      top: "16%",
      plan: "建议配置午高峰新人券 + 会员日资源位",
      metric: "+18.6%",
      narrative: "高曝光低首购，适合用新人券承接搜索心智。"
    },
    {
      name: "徐汇高校",
      value: "+15.2%",
      cls: "zone-blue",
      left: "54%",
      top: "25%",
      plan: "建议配置学生双人餐 + 晚间团购券",
      metric: "+15.2%",
      narrative: "晚餐和周末场景强，适合做套餐化权益。"
    },
    {
      name: "杨浦办公",
      value: "+12.9%",
      cls: "zone-amber",
      left: "34%",
      top: "62%",
      plan: "建议配置工作餐券包 + 企业团餐引流",
      metric: "+12.9%",
      narrative: "午高峰稳定但复购不足，适合提高券包连续性。"
    }
  ],
  competition: [
    {
      name: "竞对会员日",
      value: "强压",
      cls: "zone-amber",
      left: "17%",
      top: "22%",
      plan: "提前锁定会员日资源位，防止搜索结果被截流",
      metric: "43家",
      narrative: "竞对资源集中，建议用品牌专区和会员权益防守。"
    },
    {
      name: "新品折扣区",
      value: "中压",
      cls: "zone-blue",
      left: "60%",
      top: "18%",
      plan: "用新品套餐对冲竞对折扣，保住高客单用户",
      metric: "21家",
      narrative: "新品折扣带来短期波动，需要关注客单和评分。"
    },
    {
      name: "低价套餐区",
      value: "强压",
      cls: "zone-amber",
      left: "42%",
      top: "66%",
      plan: "用限量组合券防守低价套餐，避免长期价格战",
      metric: "37家",
      narrative: "强折扣会拖累品牌价格锚点，建议限量而非长期补贴。"
    }
  ],
  budget: [
    {
      name: "高 ROI 门店",
      value: "3.9",
      cls: "zone-green",
      left: "12%",
      top: "18%",
      plan: "追加预算 35%，继续放大高 ROI 门店",
      metric: "ROI 3.9",
      narrative: "高 ROI 门店仍有曝光空间，可以作为确定性增长池。"
    },
    {
      name: "测试预算池",
      value: "80万",
      cls: "zone-blue",
      left: "58%",
      top: "31%",
      plan: "保留 80 万测试预算，做 A/B 券包实验",
      metric: "80万",
      narrative: "适合验证套餐权益、补贴力度和商圈资源位组合。"
    },
    {
      name: "收缩门店",
      value: "-12%",
      cls: "zone-amber",
      left: "31%",
      top: "63%",
      plan: "收缩低转化预算，转入履约和评分修复",
      metric: "-12%",
      narrative: "预算继续投放会浪费，需要先修复门店评分和履约。"
    }
  ]
};

const arModeCopy = {
  growth: ["增长机会", "+18.6%", "午晚高峰券包可提升复购与交易额"],
  competition: ["竞对强压", "3个热区", "会员日资源需要提前锁定关键商圈"],
  budget: ["预算模拟", "80万", "预算优先投向高曝光低转化门店"]
};

const liveScripts = {
  short: {
    title: "45秒品牌复盘口播",
    lines: [
      "本月核心机会在华东 CBD 午高峰场景。",
      "高曝光门店已经有流量，但首购转化低于同品类。",
      "建议用门店分层券包承接搜索流量，并在 14 天内追踪复购。"
    ]
  },
  pitch: {
    title: "90秒 KA 提案讲解",
    lines: [
      "这次提案先回答三个问题：增长在哪里、预算怎么花、效果怎么复盘。",
      "从搜索到 POI 再到套餐详情页，流失最明显的是首购决策环节。",
      "我们建议把预算分成增长、防守、测试三类池，用 AR 热区展示给品牌方看。",
      "最后把提案沉淀成数字人口播，方便城市经理二次传播。"
    ]
  },
  stream: {
    title: "虚拟直播间话术",
    lines: [
      "欢迎来到品牌经营直播间，今天先看上海核心商圈的机会热区。",
      "这块区域不是单纯流量少，而是有流量但转化没有吃满。",
      "如果您是品牌运营，可以重点看券包权益和会员日资源位的组合。",
      "屏幕右侧这张清单，就是下周可以立刻推进的门店动作。"
    ]
  }
};

const scriptSteps = [
  { title: "AI 人像", body: "基于本人或品牌代言人口播形象生成标准化视频封面与头像资产。" },
  { title: "数字人口播", body: "把品牌服务报告改写成 45 秒、90 秒、3 分钟三种讲解脚本。" },
  { title: "虚拟直播", body: "按直播节奏生成开场、利益点、案例、追问和收口话术。" },
  { title: "销售赋能", body: "沉淀可复用素材，城市经理拜访前直接带走一套提案包。" }
];

let appState = {
  brands: mockBrands,
  selectedBrandId: mockBrands[0].id,
  activeScenario: "boost",
  activeArMode: "growth",
  selectedZoneIndex: 0,
  activeFunnelIndex: null,
  funnelRows: [],
  liveMode: "short",
  liveRunId: 0,
  proposals: [],
  generatedAssets: defaultAssets,
  agentLog: [],
  budgetSimulation: 0,
  aiResult: null,
  modelConfigured: false,
  modelName: null,
  supabase: null,
  connected: false,
  runningAgents: false
};

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindActions();
  renderBrandOptions();
  renderAgents();
  renderAgentLog();
  renderBrand(getSelectedBrand());
  renderAssets(defaultAssets);
  renderCity("growth");
  renderScripts();
  renderFunnel();
  await initSupabase();
});

function bindNavigation() {
  document.querySelectorAll(".rail-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".rail-button").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(`view-${button.dataset.view}`).classList.add("active");
    });
  });

  document.querySelectorAll("[data-ar-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-ar-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      appState.activeArMode = button.dataset.arMode;
      appState.selectedZoneIndex = 0;
      renderCity(appState.activeArMode);
    });
  });

  document.querySelectorAll("[data-live-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-live-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      appState.liveMode = button.dataset.liveMode;
      renderScripts();
      setNotice(`已切换为${liveScripts[appState.liveMode].title}。`);
    });
  });
}

function bindActions() {
  document.getElementById("brandSelect").addEventListener("change", (event) => {
    appState.selectedBrandId = event.target.value;
    appState.budgetSimulation = 0;
    renderBrand(getSelectedBrand());
    setNotice(`已切换品牌：${getSelectedBrand().name}。`);
  });

  document.getElementById("scenarioSelect").addEventListener("change", (event) => {
    appState.activeScenario = event.target.value;
    appState.budgetSimulation = 0;
    renderBrand(getSelectedBrand());
    setNotice(`策略场景已切换为：${scenarios[appState.activeScenario].label}。`);
  });

  document.getElementById("runAgentButton").addEventListener("click", async () => {
    await runAgentWorkflow(false);
  });

  document.getElementById("generateButton").addEventListener("click", async () => {
    const proposal = await runAgentWorkflow(true);
    if (proposal) await saveProposal(proposal);
  });

  document.getElementById("simulateBudgetButton").addEventListener("click", () => {
    simulateBudget();
  });

  document.getElementById("exportBriefButton").addEventListener("click", () => {
    exportBrief();
  });

  document.getElementById("syncButton").addEventListener("click", async () => {
    await loadProposals();
  });

  document.getElementById("loadFunnelButton").addEventListener("click", async () => {
    await loadFunnelFromSupabase();
  });

  document.getElementById("playFunnelButton").addEventListener("click", async () => {
    await playFunnel();
  });

  document.getElementById("arApplyPlanButton").addEventListener("click", () => {
    applyArPlan();
  });

  document.getElementById("generateLiveButton").addEventListener("click", async () => {
    await generateLiveScript();
  });
}

function renderBrandOptions() {
  const select = document.getElementById("brandSelect");
  select.innerHTML = appState.brands
    .map((brand) => `<option value="${brand.id}">${brand.name}</option>`)
    .join("");
  select.value = appState.selectedBrandId;
}

function renderAgents(doneCount = agents.length, activeIndex = null) {
  const container = document.getElementById("agentList");
  container.innerHTML = agents
    .map((agent, index) => {
      const done = index < doneCount ? "done" : "";
      const active = index === activeIndex ? "active" : "";
      return `
        <article class="agent-item ${done} ${active}">
          <div class="agent-index">${index + 1}</div>
          <div>
            <h4>${agent.name}</h4>
            <p>${agent.body}</p>
          </div>
        </article>
      `;
    })
    .join("");
  document.getElementById("agentProgressLabel").textContent = `${doneCount}/${agents.length}`;
}

function renderAgentLog() {
  const container = document.getElementById("agentActivityLog");
  if (!container) return;
  if (!appState.agentLog.length) {
    container.innerHTML = `<span>等待运行 Agent，生成诊断日志。</span>`;
    return;
  }
  container.innerHTML = appState.agentLog
    .map((item) => `<div><strong>${escapeHtml(item.time)}</strong><span>${escapeHtml(item.text)}</span></div>`)
    .join("");
}

function renderBrand(brand) {
  const scenario = scenarios[appState.activeScenario];
  const score = Math.min(99, brand.score + scenario.lift + appState.budgetSimulation);
  const metrics = [scenario.metric, ...brand.metrics].slice(0, 4);

  document.getElementById("proposalTitle").textContent = `${brand.title} · ${scenario.label}`;
  document.getElementById("opportunityScore").textContent = score;

  document.getElementById("metricStrip").innerHTML = metrics
    .map(
      (metric) => `
        <div class="metric">
          <span>${metric.label}</span>
          <strong>${metric.value}</strong>
          <small>${metric.delta}</small>
        </div>
      `
    )
    .join("");

  const insights = [scenario.insight, ...brand.insights].slice(0, 4);
  const actions = [scenario.action, ...brand.actions].slice(0, 4);

  document.getElementById("insightList").innerHTML = insights.map((item) => `<li>${item}</li>`).join("");
  document.getElementById("actionList").innerHTML = actions
    .map((item) => `<button class="action-item" type="button">${item}</button>`)
    .join("");

  document.querySelectorAll(".action-item").forEach((button, index) => {
    button.addEventListener("click", () => {
      setNotice(`已选中动作 ${index + 1}：可放入销售提案或 AR 展示。`);
    });
  });

  document.getElementById("timeline").innerHTML = brand.timeline
    .map(
      (step, index) => `
        <button class="timeline-step" type="button" data-timeline-index="${index}">
          <strong>${step.title}</strong>
          <p>${step.body}</p>
        </button>
      `
    )
    .join("");

  document.querySelectorAll("[data-timeline-index]").forEach((button) => {
    button.addEventListener("click", () => {
      setNotice(`已定位到${button.querySelector("strong").textContent}推进计划。`);
    });
  });
}

function renderAssets(items) {
  appState.generatedAssets = items;
  document.getElementById("proposalCount").textContent = items.length;
  document.getElementById("assetStack").innerHTML = items
    .map(
      (item, index) => `
        <article class="asset-item" role="button" tabindex="0" data-asset-index="${index}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.body)}</span>
        </article>
      `
    )
    .join("");

  document.querySelectorAll("[data-asset-index]").forEach((card) => {
    card.addEventListener("click", () => {
      const asset = items[Number(card.dataset.assetIndex)];
      setNotice(`已打开资产：${asset.title}。`);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") card.click();
    });
  });
}

function renderCity(mode) {
  const cityGrid = document.getElementById("cityGrid");
  const zones = zonesByMode[mode];
  cityGrid.innerHTML = zones
    .map(
      (zone, index) => `
        <button
          class="heat-zone ${zone.cls} ${index === appState.selectedZoneIndex ? "active" : ""}"
          style="left:${zone.left};top:${zone.top}"
          type="button"
          data-zone-index="${index}"
        >
          <strong>${zone.name}</strong>
          <span>${zone.value}</span>
        </button>
      `
    )
    .join("");

  document.querySelectorAll("[data-zone-index]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.selectedZoneIndex = Number(button.dataset.zoneIndex);
      renderCity(appState.activeArMode);
    });
  });

  renderArPreview(mode);
}

function renderArPreview(mode) {
  const zones = zonesByMode[mode];
  const selected = zones[appState.selectedZoneIndex] || zones[0];
  const [label, value, narrative] = arModeCopy[mode];
  document.getElementById("arModeLabel").textContent = `${label} · ${selected.name}`;
  document.getElementById("arPrimaryMetric").textContent = selected.metric || value;
  document.getElementById("arNarrative").textContent = selected.narrative || narrative;
  document.getElementById("arSelectedZone").textContent = `已选热区：${selected.name}`;
  document.getElementById("arPlanHeadline").textContent = selected.plan;
}

function renderFunnel(rows = null) {
  const timeline = document.getElementById("funnelTimeline");
  if (!timeline) return;

  const stages = rows && rows.length ? rows.map(normalizeFunnelRow) : meituanFunnel.stages;
  timeline.innerHTML = stages
    .map(
      (stage, index) => `
        <article class="funnel-step ${index === appState.activeFunnelIndex ? "active" : ""}" data-funnel-index="${index}">
          <div class="step-index">${index + 1}</div>
          <div>
            <span class="step-tag">${stage.event}</span>
            <h3>${stage.label}</h3>
            <p>${stage.activity}</p>
            <code>${stage.route}</code>
            <div class="field-row">
              ${stage.fields.map((field) => `<span>${field}</span>`).join("")}
            </div>
          </div>
        </article>
      `
    )
    .join("");

  document.querySelectorAll("[data-funnel-index]").forEach((step) => {
    step.addEventListener("click", () => {
      appState.activeFunnelIndex = Number(step.dataset.funnelIndex);
      renderFunnel(appState.funnelRows);
      setNotice(`链路节点已定位：${stages[appState.activeFunnelIndex].label}。`);
    });
  });

  renderFunnelFacts(rows && rows.length ? makeFunnelFactsFromRows(rows) : meituanFunnel.facts);
  renderSchemaCards();
}

function renderFunnelFacts(facts) {
  document.getElementById("funnelFacts").innerHTML = facts
    .map(
      (fact) => `
        <article class="field-card">
          <span>${fact.label}</span>
          <strong>${fact.value || "-"}</strong>
          <small>${fact.note}</small>
        </article>
      `
    )
    .join("");
}

function renderSchemaCards() {
  document.getElementById("schemaCards").innerHTML = meituanFunnel.schemas
    .map(
      (schema) => `
        <article class="schema-card">
          <strong>${schema.title}</strong>
          <p>${schema.body}</p>
        </article>
      `
    )
    .join("");
}

function renderScripts() {
  const script = liveScripts[appState.liveMode];
  document.getElementById("liveTitle").textContent = script.title;
  document.getElementById("scriptCards").innerHTML = scriptSteps
    .map(
      (step, index) => `
        <article class="script-card ${index === 1 ? "active" : ""}" data-script-index="${index}">
          <strong>${step.title}</strong>
          <p>${step.body}</p>
        </article>
      `
    )
    .join("");
  document.getElementById("liveTranscript").innerHTML = script.lines
    .map((line, index) => `<p><span>${index + 1}</span>${line}</p>`)
    .join("");

  document.querySelectorAll("[data-script-index]").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll("[data-script-index]").forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
      setNotice(`已选中数字人内容环节：${card.querySelector("strong").textContent}。`);
    });
  });
}

async function runAgentWorkflow(shouldSave) {
  if (appState.runningAgents) return null;
  appState.runningAgents = true;
  toggleAgentButtons(true);
  appState.agentLog = [];
  renderAgentLog();
  renderAgents(0, 0);
  setNotice(`正在调用${appState.modelName || "模型 API"}，并读取 Supabase 生产上下文...`);
  const modelRun = callProductionAgent();

  try {
    for (let index = 0; index < agents.length; index += 1) {
      renderAgents(index, index);
      await sleep(380);
      appState.agentLog.unshift({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        text: `${agents[index].name} 已提交真实模型任务：${agents[index].output}`
      });
      renderAgentLog();
      renderAgents(index + 1, index < agents.length - 1 ? index + 1 : null);
    }

    const result = await modelRun;
    applyModelResult(result);
    setNotice(
      shouldSave
        ? `真实模型已返回，正在保存提案到 Supabase。模型：${result.model}`
        : `真实模型已返回。模型：${result.model}，链路事件 ${result.sourceCounts?.funnelEvents || 0} 条。`
    );
    return result.proposal;
  } catch (error) {
    setNotice(`真实模型调用失败：${error.message}`);
    appState.agentLog.unshift({
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      text: `模型 API 错误：${error.message}`
    });
    renderAgentLog();
    return null;
  } finally {
    appState.runningAgents = false;
    toggleAgentButtons(false);
    renderAgents(agents.length);
  }
}

async function callProductionAgent() {
  const brand = getSelectedBrand();
  const mode = appState.activeArMode;
  const selectedZone = zonesByMode[mode][appState.selectedZoneIndex];
  const response = await fetch("/api/agent-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand,
      scenario: appState.activeScenario,
      scenarioLabel: scenarios[appState.activeScenario].label,
      arMode: mode,
      selectedZone,
      liveMode: appState.liveMode,
      budgetSimulation: appState.budgetSimulation
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function applyModelResult(result) {
  appState.aiResult = result;
  appState.agentLog = result.agentLog || [];
  renderAgentLog();

  const proposal = result.proposal || {};
  document.getElementById("proposalTitle").textContent = proposal.title || "模型生成提案";
  document.getElementById("opportunityScore").textContent = proposal.opportunity_score ?? "-";

  renderModelMetrics(result.metrics || []);
  renderModelInsights(result.insights || []);
  renderModelActions(result.actions || []);
  renderModelTimeline(result.timeline || []);
  renderModelLiveScript(result.liveScript);
  renderModelArPlan(result.arPlan);

  const evidenceAsset = result.evidence?.length
    ? [{ title: "模型引用依据", body: result.evidence.join("；") }]
    : [];
  renderAssets([...(result.assets || []), ...evidenceAsset].slice(0, 6));
}

function renderModelMetrics(metrics) {
  document.getElementById("metricStrip").innerHTML = metrics
    .slice(0, 4)
    .map(
      (metric) => `
        <div class="metric">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${escapeHtml(metric.delta)}</small>
        </div>
      `
    )
    .join("");
}

function renderModelInsights(insights) {
  document.getElementById("insightList").innerHTML = insights
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderModelActions(actions) {
  document.getElementById("actionList").innerHTML = actions
    .map((item) => `<button class="action-item" type="button">${escapeHtml(item)}</button>`)
    .join("");
  document.querySelectorAll(".action-item").forEach((button, index) => {
    button.addEventListener("click", () => {
      setNotice(`已选中模型推荐动作 ${index + 1}，可放入销售提案或 AR 展示。`);
    });
  });
}

function renderModelTimeline(timeline) {
  document.getElementById("timeline").innerHTML = timeline
    .map(
      (step, index) => `
        <button class="timeline-step" type="button" data-timeline-index="${index}">
          <strong>${escapeHtml(step.title)}</strong>
          <p>${escapeHtml(step.body)}</p>
        </button>
      `
    )
    .join("");
  document.querySelectorAll("[data-timeline-index]").forEach((button) => {
    button.addEventListener("click", () => {
      setNotice(`已定位到${button.querySelector("strong").textContent}推进计划。`);
    });
  });
}

function renderModelLiveScript(liveScript) {
  if (!liveScript?.lines?.length) return;
  document.getElementById("liveTitle").textContent = liveScript.title || "模型口播脚本";
  document.getElementById("liveCaption").textContent = liveScript.lines[0];
  document.getElementById("liveTranscript").innerHTML = liveScript.lines
    .map((line, index) => `<p><span>${index + 1}</span>${escapeHtml(line)}</p>`)
    .join("");
}

function renderModelArPlan(arPlan) {
  if (!arPlan) return;
  document.getElementById("arModeLabel").textContent = `模型 AR · ${arPlan.zone || "核心热区"}`;
  document.getElementById("arPrimaryMetric").textContent = arPlan.metric || "-";
  document.getElementById("arNarrative").textContent = arPlan.narrative || "";
  document.getElementById("arSelectedZone").textContent = `已选热区：${arPlan.zone || "模型推荐热区"}`;
  document.getElementById("arPlanHeadline").textContent = arPlan.headline || "模型已生成 AR 展示主张";
}

function buildScenarioAssets(brand, scenario) {
  const selectedZone = zonesByMode[appState.activeArMode][appState.selectedZoneIndex];
  return [
    { title: scenario.assetTitle, body: scenario.assetBody },
    { title: "经营诊断摘要", body: `${brand.name} 机会分 ${Math.min(99, brand.score + scenario.lift + appState.budgetSimulation)}，核心结论：${scenario.insight}` },
    { title: "AR 热区讲解", body: `${selectedZone.name}：${selectedZone.plan}` },
    { title: "数字人口播脚本", body: liveScripts[appState.liveMode].lines.join(" ") },
    { title: "销售推进清单", body: "包含首访开场、品牌痛点、资源位组合、复盘指标和下次跟进问题。" }
  ];
}

function toggleAgentButtons(disabled) {
  ["runAgentButton", "generateButton"].forEach((id) => {
    const button = document.getElementById(id);
    button.disabled = disabled;
  });
}

function simulateBudget() {
  appState.budgetSimulation = Math.min(8, appState.budgetSimulation + 2);
  renderBrand(getSelectedBrand());
  const scenario = scenarios[appState.activeScenario];
  renderAssets([
    {
      title: "预算模拟结果",
      body: `${scenario.label}场景下，机会分额外提升 ${appState.budgetSimulation} 分，建议把预算分成增长池、防守池和测试池。`
    },
    ...appState.generatedAssets.slice(0, 4)
  ]);
  setNotice(`预算模拟已刷新：机会分 +${appState.budgetSimulation}。`);
}

function exportBrief() {
  const brand = getSelectedBrand();
  const scenario = scenarios[appState.activeScenario];
  const brief = {
    title: "销售拜访话术",
    body: `开场先讲 ${brand.name} 的${scenario.label}机会，再展示美团链路归因和 AR 热区，最后落到下周能推进的资源位组合。`
  };
  renderAssets([brief, ...appState.generatedAssets.filter((item) => item.title !== brief.title)].slice(0, 6));
  setNotice("拜访话术已生成，并加入右侧提案资产。");
}

function applyArPlan() {
  const mode = appState.activeArMode;
  const zone = zonesByMode[mode][appState.selectedZoneIndex];
  renderAssets([
    { title: "AR 现场展示脚本", body: `${zone.name}：${zone.plan}。手机端展示指标为 ${zone.metric}。` },
    ...appState.generatedAssets.filter((item) => item.title !== "AR 现场展示脚本")
  ].slice(0, 6));
  setNotice(`AR 提案已生成：${zone.name}。`);
}

async function generateLiveScript() {
  const script = liveScripts[appState.liveMode];
  const runId = appState.liveRunId + 1;
  appState.liveRunId = runId;
  renderScripts();
  setNotice(`${script.title}正在生成字幕...`);

  for (const line of script.lines) {
    if (appState.liveRunId !== runId) return;
    document.getElementById("liveCaption").textContent = line;
    await sleep(520);
  }

  renderAssets([
    { title: script.title, body: script.lines.join(" ") },
    ...appState.generatedAssets.filter((item) => item.title !== script.title)
  ].slice(0, 6));
  setNotice(`${script.title}已生成，并加入提案资产。`);
}

async function playFunnel() {
  const rows = appState.funnelRows.length ? appState.funnelRows : null;
  const total = rows ? rows.length : meituanFunnel.stages.length;
  setNotice("正在播放从搜索到下单的归因链路...");
  for (let index = 0; index < total; index += 1) {
    appState.activeFunnelIndex = index;
    renderFunnel(rows);
    await sleep(420);
  }
  setNotice("链路播放完成：已走完搜索、POI、套餐详情和下单确认。");
}

async function initSupabase() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("config unavailable");
    const config = await response.json();
    appState.modelConfigured = Boolean(config.modelConfigured);
    appState.modelName = config.modelName || null;
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      setConnection(
        false,
        appState.modelConfigured
          ? `模型 ${appState.modelName} 已配置，但未配置 Supabase，当前缺少生产数据上下文。`
          : "未配置 Supabase 和模型 Key，当前无法进行真实生产模拟。"
      );
      renderAssets(defaultAssets);
      return;
    }
    appState.supabase = createSupabaseRestClient(config.supabaseUrl, config.supabaseAnonKey);
    appState.connected = true;
    setConnection(
      true,
      appState.modelConfigured
        ? `Supabase 已连接，模型 ${appState.modelName} 已配置，可以进行真实 Agent 调用。`
        : "Supabase 已连接，但未配置模型 Key，只能读取数据，不能真实生成。"
    );
    await loadProposals();
  } catch (error) {
    setConnection(false, "本地预览模式：Vercel API 未启动，当前使用样例数据。");
  }
}

function createSupabaseRestClient(url, anonKey) {
  const endpoint = url.replace(/\/$/, "");
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json"
  };

  return {
    async listProposals() {
      const response = await fetch(
        `${endpoint}/rest/v1/brand_proposals?select=*&order=created_at.desc&limit=8`,
        { headers }
      );
      if (!response.ok) throw new Error(`Supabase list failed: ${response.status}`);
      return response.json();
    },
    async insertProposal(payload) {
      const response = await fetch(`${endpoint}/rest/v1/brand_proposals`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Supabase insert failed: ${response.status}`);
      return response.json();
    },
    async listFunnelEvents() {
      const response = await fetch(
        `${endpoint}/rest/v1/vw_meituan_funnel_demo?select=*&order=occurred_at.asc`,
        { headers }
      );
      if (!response.ok) throw new Error(`Supabase funnel failed: ${response.status}`);
      return response.json();
    }
  };
}

async function loadProposals() {
  if (!appState.supabase) {
    setConnection(false, "Supabase 未连接，暂时展示默认提案资产。");
    renderAssets(defaultAssets);
    return;
  }

  try {
    const proposals = await appState.supabase.listProposals();
    appState.proposals = proposals;
    if (!proposals.length) {
      renderAssets(defaultAssets);
      setConnection(true, "Supabase 已连接，当前还没有保存的提案。");
      return;
    }
    renderAssets(
      proposals.map((item) => ({
        title: item.title || item.brand_name,
        body: item.summary || `机会分 ${item.opportunity_score || "-"}，已保存到 Supabase。`
      }))
    );
    setConnection(true, `已同步 ${proposals.length} 条 Supabase 提案记录。`);
  } catch (error) {
    setConnection(false, "Supabase 同步失败，请检查表结构、URL、Anon Key 和 RLS 策略。");
  }
}

async function loadFunnelFromSupabase() {
  if (!appState.supabase) {
    setConnection(false, "Supabase 未连接，当前仍展示样例链路。");
    return;
  }

  try {
    const rows = await appState.supabase.listFunnelEvents();
    appState.funnelRows = rows;
    appState.activeFunnelIndex = rows.length ? 0 : null;
    renderFunnel(rows);
    document.getElementById("funnelSourceLabel").textContent = `已读取 Supabase：${rows.length} 条事件`;
    setConnection(true, `已从 Supabase 读取 ${rows.length} 条美团链路事件。`);
  } catch (error) {
    appState.funnelRows = [];
    document.getElementById("funnelSourceLabel").textContent = "读取失败，展示样例链路";
    setConnection(false, "链路读取失败，请确认 vw_meituan_funnel_demo 视图和 RLS 读取策略。");
  }
}

async function saveProposal(proposal) {
  if (!appState.supabase) {
    setConnection(false, "已生成本地提案。配置 Supabase 后可保存到云端。");
    renderAssets([{ title: proposal.title, body: proposal.summary }, ...defaultAssets.slice(1)]);
    return;
  }

  try {
    await appState.supabase.insertProposal(proposal);
    setConnection(true, "提案已保存到 Supabase。");
    await loadProposals();
  } catch (error) {
    setConnection(false, "提案保存失败，请检查 Supabase RLS insert 策略。");
  }
}

function normalizeFunnelRow(row) {
  const params = row.event_params && typeof row.event_params === "object" ? row.event_params : {};
  const event = row.event_name || row.event || row.event_code || row.event_type || "event";
  const activity = row.activity_name || row.activity || row.activity_class || row.page_activity || "-";
  const route = row.route_uri || row.route || row.page_route || row.mrn_entry || "-";
  const fields = [
    row.search_word ? `search_word=${row.search_word}` : null,
    row.source || row.mt_source ? `source=${row.source || row.mt_source}` : null,
    row.poi_id ? `poi_id=${row.poi_id}` : null,
    row.deal_id ? `deal_id=${row.deal_id}` : null,
    row.campaign_id ? `campaign_id=${row.campaign_id}` : null,
    row.campon_reduce ? `coupon_reduce=${row.coupon_reduce}` : null,
    row.mrn_biz ? `mrn_biz=${row.mrn_biz}` : null,
    row.mrn_entry ? `mrn_entry=${row.mrn_entry}` : null,
    params.mrn_biz ? `mrn_biz=${params.mrn_biz}` : null,
    params.mrn_entry ? `mrn_entry=${params.mrn_entry}` : null
  ].filter(Boolean);

  return {
    label: eventLabel(event),
    event,
    activity,
    route,
    fields: fields.length ? fields.slice(0, 4) : ["已记录事件参数"]
  };
}

function eventLabel(event) {
  const labels = {
    home_open: "首页入口",
    search_result: "搜索结果",
    poi_view: "POI 门店页",
    deal_view: "套餐/券详情",
    order_submit: "下单确认"
  };
  return labels[event] || event;
}

function makeFunnelFactsFromRows(rows) {
  const merged = rows.reduce((acc, row) => ({ ...acc, ...row }), {});
  return [
    { label: "搜索词", value: merged.search_word || "haidilao", note: "搜索意图入口" },
    { label: "来源", value: merged.source || merged.mt_source || "mt_search_poi", note: "搜索结果到 POI" },
    { label: "POI", value: merged.poi_id, note: "门店粒度" },
    { label: "Deal", value: merged.deal_id, note: "套餐/券粒度" },
    { label: "Campaign", value: merged.campaign_id, note: "活动归因" },
    { label: "支付前金额", value: merged.pay_price, note: "下单确认页" }
  ];
}

function setConnection(isConnected, message) {
  const dot = document.getElementById("connectionDot");
  dot.classList.toggle("connected", isConnected);
  appState.connected = isConnected;
  setNotice(message);
}

function setNotice(message) {
  document.getElementById("runtimeNotice").textContent = message;
}

function getSelectedBrand() {
  return appState.brands.find((brand) => brand.id === appState.selectedBrandId) || appState.brands[0];
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
laceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
