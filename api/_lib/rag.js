/**
 * RAG 知识检索层
 * 混合检索：关键词召回 + Embedding 向量召回 → Rerank 精排
 * 数据源：内置知识块 + Supabase brand_assets
 */

const {
  getRagEmbedConfig,
  isEmbeddingConfigured,
  isRerankConfigured,
  vectorRecall,
  mergeCandidates,
  rerankChunks
} = require("./rag-embeddings");

const BUILTIN_CHUNKS = [
  {
    id: "framework_gtv",
    brandId: "haidilao",
    type: "framework",
    title: "GTV 三因子框架",
    content:
      "GTV = 活跃交易用户数 × 购买频次 × 客单价。增长诊断先判断哪个因子驱动，再决定对应动作：拉新、提频或提客单。",
    tags: ["gtv", "三因子", "经分", "活跃用户", "频次", "客单价"]
  },
  {
    id: "framework_funnel",
    brandId: "haidilao",
    type: "framework",
    title: "搜索到核销漏斗",
    content:
      "搜索曝光→搜索点击→POI点击→套餐详情→下单提交→支付订单→核销订单。最大损耗通常在 POI 到套餐承接和支付到核销。",
    tags: ["漏斗", "转化", "损耗", "poi", "套餐", "核销"]
  },
  {
    id: "framework_monetization",
    brandId: "haidilao",
    type: "framework",
    title: "变现率与补贴率",
    content:
      "take rate = (佣金收入 + 广告收入) / GTV。补贴率触及 2% 预警线需关注竞争烈度；广告商户渗透低于 15% 代表投放意愿不足。",
    tags: ["take rate", "补贴", "广告", "变现", "预警"]
  },
  {
    id: "framework_city",
    brandId: "haidilao",
    type: "framework",
    title: "城市分层资源分配",
    content:
      "高 GMV + 高 ROI 城市优先放大；低 ROI 城市先修复 POI 承接与套餐组，再投入广告预算。",
    tags: ["城市", "roi", "资源", "分层", "投放"]
  },
  {
    id: "framework_competitor",
    brandId: "haidilao",
    type: "framework",
    title: "平台差异化对比口径",
    content:
      "美团到餐优势在高意图搜索和核销质量；抖音到店优势在内容分发和内容占比；私域会员优势在复购与触达成本。",
    tags: ["竞对", "美团", "抖音", "私域", "对比"]
  },
  {
    id: "talk_track_ka",
    brandId: "haidilao",
    type: "talk_track",
    title: "KA 拜访话术骨架",
    content:
      "先讲高意图搜索进店→用漏斗指出最大损耗→落到 POI 套餐组与城市 ROI 分层动作→用核销质量和 take rate 证明经营闭环。",
    tags: ["话术", "ka", "拜访", "口播", "提案"]
  },
  {
    id: "playbook_q3",
    brandId: "haidilao",
    type: "playbook",
    title: "Q3 承接动作手册",
    content:
      "围绕品牌高意图词配置专区与门店入口；上线家庭聚餐/错峰/会员日三类套餐组合；追踪 POI→套餐详情转化周报。",
    tags: ["策略", "q3", "动作", "套餐", "搜索"]
  }
];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .concat(extractCjkGrams(text));
}

function extractCjkGrams(text) {
  const chars = String(text || "").replace(/[^\u4e00-\u9fa5]/g, "");
  const grams = [];
  for (let i = 0; i < chars.length - 1; i += 1) {
    grams.push(chars.slice(i, i + 2));
  }
  return grams;
}

function scoreChunk(chunk, queryTokens) {
  if (!queryTokens.length) return 0;
  const haystack = [chunk.title, chunk.content, ...(chunk.tags || [])].join(" ").toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (haystack.includes(token)) {
      score += token.length >= 2 ? 2 : 1;
      if ((chunk.tags || []).some((t) => t.toLowerCase().includes(token))) score += 1.5;
      if (String(chunk.title).toLowerCase().includes(token)) score += 1;
    }
  }
  return score;
}

function assetsToChunks(assets, brandId) {
  return (assets || []).map((asset, index) => ({
    id: `asset_${index}_${asset.asset_type || "doc"}`,
    brandId,
    type: asset.asset_type || "asset",
    title: asset.title || "品牌资产",
    content: asset.content || "",
    tags: [asset.asset_type || "asset", brandId]
  }));
}

function keywordRecall(chunks, query, recallSize) {
  const queryTokens = tokenize(query);
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, queryTokens)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, recallSize);
}

function buildRetrievalMode({ embeddingUsed, rerankUsed, keywordOnly }) {
  if (keywordOnly) return "keyword";
  const parts = ["hybrid"];
  if (embeddingUsed) parts.push("embedding");
  if (rerankUsed) parts.push("rerank");
  return parts.join("+");
}

/**
 * 检索相关知识块
 */
async function retrieveKnowledge(params = {}) {
  const { getContext } = require("./agent-tools");
  const brandId = params.brandId || "haidilao";
  const query = String(params.query || params.question || "").trim();
  const topK = Math.max(1, Math.min(Number(params.topK) || 4, 8));
  const ragConfig = getRagEmbedConfig();
  const recallSize = Math.max(topK * 2, ragConfig.recallSize);

  if (!query) {
    return JSON.stringify({ error: "query 不能为空", chunks: [] });
  }

  const context = await getContext(brandId);
  const chunks = [
    ...BUILTIN_CHUNKS.filter((c) => !c.brandId || c.brandId === brandId),
    ...assetsToChunks(context.assets, brandId)
  ];

  let embeddingUsed = false;
  let rerankUsed = false;
  let retrievalWarning = null;

  const keywordRanked = keywordRecall(chunks, query, recallSize);
  let embeddingRanked = [];

  if (isEmbeddingConfigured()) {
    try {
      embeddingRanked = await vectorRecall(query, chunks, recallSize);
      embeddingUsed = embeddingRanked.length > 0;
    } catch (error) {
      retrievalWarning = "Embedding 召回失败，已回退关键词：" + error.message;
      console.warn(retrievalWarning);
    }
  }

  let candidates = mergeCandidates(keywordRanked, embeddingRanked, recallSize);

  if (!candidates.length && keywordRanked.length) {
    candidates = keywordRanked;
  }
  if (!candidates.length && embeddingRanked.length) {
    candidates = embeddingRanked;
  }
  if (!candidates.length) {
    candidates = chunks.slice(0, Math.min(topK, chunks.length)).map((chunk) => ({
      ...chunk,
      score: 0.01
    }));
  }

  let ranked = candidates;
  if (isRerankConfigured() && candidates.length > 1) {
    try {
      ranked = await rerankChunks(query, candidates, topK);
      rerankUsed = true;
    } catch (error) {
      retrievalWarning = (retrievalWarning ? retrievalWarning + "；" : "") +
        "Rerank 失败，使用融合排序：" + error.message;
      console.warn(retrievalWarning);
      ranked = candidates.slice(0, topK);
    }
  } else {
    ranked = candidates.slice(0, topK);
  }

  const passages = ranked.map((chunk, index) => ({
    rank: chunk.rank || index + 1,
    id: chunk.id,
    type: chunk.type,
    title: chunk.title,
    content: chunk.content,
    score: Number((chunk.rerankScore ?? chunk.rrfScore ?? chunk.embeddingScore ?? chunk.score ?? 0).toFixed(4)),
    recallSources: chunk.recallSources || [],
    citation: `[${index + 1}] ${chunk.title}`
  }));

  const retrievalMode = buildRetrievalMode({
    embeddingUsed,
    rerankUsed,
    keywordOnly: !embeddingUsed && !rerankUsed
  });

  return JSON.stringify({
    query,
    topK,
    hitCount: passages.length,
    retrievalMode,
    embeddingModel: embeddingUsed ? ragConfig.embeddingModel : null,
    rerankModel: rerankUsed ? ragConfig.rerankModel : null,
    passages,
    citations: passages.map((p) => p.citation),
    dataMode: context.dataMode,
    warning: retrievalWarning,
    explanation:
      passages.length > 0
        ? `混合检索（${retrievalMode}）命中 ${passages.length} 条，请在回答中引用 citations。`
        : "未命中知识库，可继续用工具查数，但不要编造外部事实。"
  });
}

module.exports = {
  retrieveKnowledge,
  BUILTIN_CHUNKS,
  scoreChunk,
  tokenize,
  keywordRecall
};
