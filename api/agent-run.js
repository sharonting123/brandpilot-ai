const DEFAULT_MODEL = "gpt-4o-mini";

module.exports = async function handler(req, res) {
  if (req.method && req.method !== "POST") {
    return sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "Use POST /api/agent-run." });
  }

  try {
    const request = await readJson(req);
    const env = process.env;
    const modelApiKey = env.MODEL_API_KEY || env.OPENAI_API_KEY;

    if (!modelApiKey) {
      return sendJson(res, 503, {
        error: "MODEL_API_KEY_NOT_CONFIGURED",
        message: "服务端未配置 MODEL_API_KEY 或 OPENAI_API_KEY，不能进行真实模型调用。"
      });
    }

    const supabaseContext = await loadSupabaseContext(env);
    const result = await runModel({
      env,
      modelApiKey,
      request,
      supabaseContext
    });

    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, {
      error: "AGENT_RUN_FAILED",
      message: error.message || "模型调用失败。"
    });
  }
};

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function loadSupabaseContext(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      connected: false,
      funnelEvents: [],
      dailyFacts: {},
      assets: []
    };
  }

  const endpoint = supabaseUrl.replace(/\/$/, "");
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json"
  };

  const [funnelEvents, searchFacts, poiFacts, campaignFacts, assets] = await Promise.all([
    supabaseGet(`${endpoint}/rest/v1/vw_meituan_funnel_demo?select=*&order=occurred_at.asc&limit=20`, headers),
    supabaseGet(`${endpoint}/rest/v1/fact_search_keyword_daily?select=*&order=date.desc&limit=10`, headers),
    supabaseGet(`${endpoint}/rest/v1/fact_poi_daily?select=*&order=date.desc&limit=10`, headers),
    supabaseGet(`${endpoint}/rest/v1/fact_deal_campaign_daily?select=*&order=date.desc&limit=10`, headers),
    supabaseGet(`${endpoint}/rest/v1/brand_assets?select=asset_type,title,content,metadata&order=created_at.desc&limit=8`, headers)
  ]);

  return {
    connected: true,
    funnelEvents,
    dailyFacts: {
      searchFacts,
      poiFacts,
      campaignFacts
    },
    assets
  };
}

async function supabaseGet(url, headers) {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    return [];
  }
}

async function runModel({ env, modelApiKey, request, supabaseContext }) {
  const baseUrl = (env.MODEL_API_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.MODEL_NAME || env.OPENAI_MODEL || DEFAULT_MODEL;
  const inputContext = buildInputContext(request, supabaseContext);
  let parsed;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const data = await requestChatCompletion({
        baseUrl,
        modelApiKey,
        model,
        env,
        inputContext
      });
      const content = extractMessageContent(data);
      if (!content) {
        const finishReason = data.choices?.[0]?.finish_reason || "unknown";
        throw new Error(`模型 API 未返回可解析内容，finish_reason=${finishReason}`);
      }
      parsed = parseJsonContent(content);
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 2 || /额度不足|账单不可用|quota|billing|401|403/i.test(error.message)) {
        throw error;
      }
    }
  }

  if (!parsed) throw lastError || new Error("模型 API 未返回可解析内容。");

  return normalizeModelResult({
    parsed,
    request,
    supabaseContext,
    model,
    provider: baseUrl
  });
}

async function requestChatCompletion({ baseUrl, modelApiKey, model, env, inputContext }) {
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: Number(env.MODEL_MAX_TOKENS || 4096),
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "你是 BrandPilot AI 的生产环境经营分析 Agent。",
              "你面向本地生活/餐饮品牌提案场景，必须基于输入的 Supabase 数据、链路事件、品牌指标和用户选择生成结果。",
              "不要编造外部事实，不要声称接入了没有出现在输入里的平台字段。",
              "只输出一个严格 JSON 对象，不要 Markdown，不要解释，不要代码块，不要多余文本。",
              "所有字符串必须使用双引号，数组元素之间必须有逗号，禁止尾随逗号，禁止注释。",
              "控制输出长度：agentLog 5条，metrics 4条，insights 4条，actions 4条，timeline 3条，assets 4条，liveScript.lines 3条，evidence 5条以内。",
              "JSON 顶层字段必须包含：agentLog, metrics, insights, actions, timeline, assets, liveScript, arPlan, proposal, evidence。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify(inputContext)
          }
        ]
      }),
      signal: AbortSignal.timeout(65000)
    });
  } catch (error) {
    throw new Error(`模型 API 网络连接失败：${error.cause?.code || error.message}`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || data.message || `HTTP ${response.status}`;
    if (/quota|billing|insufficient/i.test(detail)) {
      throw new Error("模型 API 已连通，但当前 Key 额度不足或账单不可用，请更换有额度的 Key 或配置可用的 MODEL_API_BASE_URL。");
    }
    throw new Error(`模型 API 调用失败：${detail}`);
  }

  return data;
}

function extractMessageContent(data) {
  const message = data.choices?.[0]?.message;
  const content = message?.content || data.choices?.[0]?.text || data.output_text;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || part.content || "").join("\n").trim();
  }
  if (typeof content === "string") return content.trim();
  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item) => item.content || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim();
  }
  return "";
}

function buildInputContext(request, supabaseContext) {
  const brand = request.brand || {};
  return {
    task: "生成可用于演示的真实模型版经营分析提案",
    brand: {
      id: brand.id,
      name: brand.name,
      title: brand.title,
      score: brand.score,
      metrics: brand.metrics,
      insights: brand.insights,
      actions: brand.actions
    },
    userSelections: {
      scenario: request.scenario,
      scenarioLabel: request.scenarioLabel,
      arMode: request.arMode,
      selectedZone: request.selectedZone,
      liveMode: request.liveMode,
      budgetSimulation: request.budgetSimulation
    },
    productionData: {
      supabaseConnected: supabaseContext.connected,
      funnelEvents: supabaseContext.funnelEvents,
      dailyFacts: supabaseContext.dailyFacts,
      existingAssets: supabaseContext.assets
    },
    outputContract: {
      agentLog: [{ time: "HH:mm:ss", text: "每个 Agent 的真实处理结果，5 条左右" }],
      metrics: [{ label: "指标名", value: "指标值", delta: "变化或原因" }],
      insights: ["关键结论，最多 4 条"],
      actions: ["推荐动作，最多 4 条"],
      timeline: [{ title: "推进阶段", body: "行动内容" }],
      assets: [{ title: "资产标题", body: "资产内容" }],
      liveScript: { title: "数字人口播标题", lines: ["逐句口播文案"] },
      arPlan: { zone: "热区名", headline: "AR 展示主张", metric: "核心指标", narrative: "讲解文案" },
      proposal: {
        brand_id: "品牌 ID",
        brand_name: "品牌名",
        title: "提案标题",
        opportunity_score: 0,
        summary: "一句话摘要",
        payload: {}
      },
      evidence: ["引用哪些输入数据作为依据"]
    }
  };
}

function parseJsonContent(content) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw error;
  }
}

function normalizeModelResult({ parsed, request, supabaseContext, model, provider }) {
  const now = new Date();
  const brand = request.brand || {};
  const selectedZone = request.selectedZone || {};
  const scenarioLabel = request.scenarioLabel || request.scenario || "经营诊断";
  const score = clampScore(parsed.proposal?.opportunity_score ?? brand.score ?? 80);

  const metrics = asArray(parsed.metrics).slice(0, 4);
  const insights = asArray(parsed.insights).slice(0, 5);
  const actions = asArray(parsed.actions).slice(0, 5);
  const timeline = asArray(parsed.timeline).slice(0, 4);
  const assets = asArray(parsed.assets).slice(0, 6);
  const agentLog = asArray(parsed.agentLog).slice(0, 6).map((item) => ({
    time: item.time || now.toLocaleTimeString("zh-CN", { hour12: false }),
    text: item.text || String(item)
  }));

  return {
    mode: "live_model",
    generatedAt: now.toISOString(),
    provider,
    model,
    supabaseConnected: supabaseContext.connected,
    sourceCounts: {
      funnelEvents: supabaseContext.funnelEvents.length,
      searchFacts: supabaseContext.dailyFacts.searchFacts?.length || 0,
      poiFacts: supabaseContext.dailyFacts.poiFacts?.length || 0,
      campaignFacts: supabaseContext.dailyFacts.campaignFacts?.length || 0,
      assets: supabaseContext.assets.length
    },
    agentLog: agentLog.length ? agentLog : [{ time: now.toLocaleTimeString("zh-CN", { hour12: false }), text: "模型完成经营诊断与提案生成。" }],
    metrics: metrics.length ? metrics : [{ label: "机会分", value: String(score), delta: scenarioLabel }],
    insights: insights.length ? insights : [parsed.proposal?.summary || "模型已基于当前上下文生成经营结论。"],
    actions: actions.length ? actions : ["将模型生成结果同步到销售提案资产，并在 Supabase 中保留复盘记录。"],
    timeline: timeline.length ? timeline : [{ title: "第 1 周", body: "确认门店分层、投放策略和复盘指标。" }],
    assets: assets.length ? assets : [{ title: "模型生成提案", body: parsed.proposal?.summary || "模型已生成提案资产。" }],
    liveScript: parsed.liveScript || {
      title: "模型口播脚本",
      lines: [parsed.proposal?.summary || "本次提案基于真实链路与经营数据生成。"]
    },
    arPlan: parsed.arPlan || {
      zone: selectedZone.name || "核心商圈",
      headline: selectedZone.plan || "展示模型生成的核心增长策略",
      metric: selectedZone.metric || String(score),
      narrative: parsed.proposal?.summary || "结合链路数据进行现场讲解。"
    },
    proposal: {
      brand_id: parsed.proposal?.brand_id || brand.id || "demo-brand",
      brand_name: parsed.proposal?.brand_name || brand.name || "Demo Brand",
      title: parsed.proposal?.title || `${brand.title || brand.name || "品牌"} · ${scenarioLabel}`,
      opportunity_score: score,
      summary: parsed.proposal?.summary || asArray(parsed.insights)[0] || "模型已生成提案。",
      payload: {
        ...(parsed.proposal?.payload || {}),
        model,
        provider,
        scenario: request.scenario,
        selectedZone,
        sourceCounts: {
          funnelEvents: supabaseContext.funnelEvents.length,
          assets: supabaseContext.assets.length
        },
        generatedAt: now.toISOString()
      }
    },
    evidence: asArray(parsed.evidence).slice(0, 8)
  };
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 80;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function sendJson(res, status, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
