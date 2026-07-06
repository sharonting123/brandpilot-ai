/**
 * RAG Embedding + Rerank（百炼 DashScope 主路径，OpenAI-compatible 可回退）
 */

const crypto = require("crypto");

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";
const EMBED_PATH = "/services/embeddings/text-embedding/text-embedding";
const RERANK_PATH = "/services/rerank/text-rerank/text-rerank";

const embeddingCache = new Map();

function getRagEmbedConfig(env = process.env) {
  const dashscopeKey = env.DASHSCOPE_API_KEY || env.BAILIAN_API_KEY || "";
  const modelApiKey = env.MODEL_API_KEY || env.OPENAI_API_KEY || "";
  const modelBaseUrl = (env.MODEL_API_BASE_URL || env.OPENAI_BASE_URL || "").replace(/\/$/, "");
  const provider = String(env.RAG_EMBEDDING_PROVIDER || "auto").toLowerCase();
  const timeoutMs = Number(env.RAG_EMBEDDING_TIMEOUT_MS) || 30000;
  const recallSize = Math.max(4, Math.min(Number(env.RAG_RECALL_SIZE) || 12, 24));

  let embeddingProvider = "none";
  if (provider === "dashscope" && dashscopeKey) embeddingProvider = "dashscope";
  else if (provider === "openai" && modelApiKey && modelBaseUrl) embeddingProvider = "openai";
  else if (provider === "auto") {
    if (dashscopeKey) embeddingProvider = "dashscope";
    else if (modelApiKey && modelBaseUrl) embeddingProvider = "openai";
  }

  const embeddingEnabled = env.RAG_EMBEDDING_ENABLED !== "false" && embeddingProvider !== "none";
  const rerankEnabled = env.RAG_RERANK_ENABLED !== "false" && Boolean(dashscopeKey);

  return {
    embeddingProvider,
    embeddingEnabled,
    rerankEnabled,
    dashscopeKey,
    modelApiKey,
    modelBaseUrl,
    embeddingModel: env.RAG_EMBEDDING_MODEL || "text-embedding-v3",
    rerankModel: env.RAG_RERANK_MODEL || "gte-rerank-v2",
    recallSize,
    timeoutMs
  };
}

function isEmbeddingConfigured(env) {
  return getRagEmbedConfig(env).embeddingEnabled;
}

function isRerankConfigured(env) {
  return getRagEmbedConfig(env).rerankEnabled;
}

function chunkToText(chunk) {
  return [chunk.title, chunk.content, ...(chunk.tags || [])].filter(Boolean).join("\n");
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function dashscopeRequest(path, body, apiKey, timeoutMs) {
  const response = await fetch(DASHSCOPE_BASE + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = payload.message || payload.code || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return payload;
}

async function embedDashScope(texts, textType, config) {
  const list = Array.isArray(texts) ? texts : [texts];
  const payload = await dashscopeRequest(
    EMBED_PATH,
    {
      model: config.embeddingModel,
      input: { texts: list },
      parameters: { text_type: textType || "document" }
    },
    config.dashscopeKey,
    config.timeoutMs
  );
  const outputs = payload.output?.embeddings || payload.data?.embeddings || [];
  if (!outputs.length) {
    throw new Error("DashScope embedding 返回为空");
  }
  return outputs
    .sort((a, b) => (a.text_index ?? a.index ?? 0) - (b.text_index ?? b.index ?? 0))
    .map((item) => item.embedding);
}

async function embedOpenAI(texts, config) {
  const list = Array.isArray(texts) ? texts : [texts];
  const response = await fetch(`${config.modelBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.modelApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: list
    }),
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = payload.error?.message || payload.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return (payload.data || [])
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

async function embedTexts(texts, options = {}) {
  const config = getRagEmbedConfig();
  if (!config.embeddingEnabled) {
    throw new Error("Embedding 未配置");
  }
  const textType = options.textType || "document";
  const list = Array.isArray(texts) ? texts : [texts];
  if (!list.length) return [];

  if (config.embeddingProvider === "dashscope") {
    const batchSize = 10;
    const vectors = [];
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const part = await embedDashScope(batch, textType, config);
      vectors.push(...part);
    }
    return vectors;
  }

  const batchSize = 20;
  const vectors = [];
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const part = await embedOpenAI(batch, config);
    vectors.push(...part);
  }
  return vectors;
}

async function getChunkEmbedding(chunk, config) {
  const text = chunkToText(chunk);
  const cacheKey = `${chunk.id}:${hashText(text)}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }
  const [vector] = await embedTexts([text], { textType: "document" });
  embeddingCache.set(cacheKey, vector);
  return vector;
}

async function vectorRecall(query, chunks, recallSize, env = process.env) {
  const config = getRagEmbedConfig(env);
  if (!config.embeddingEnabled || !chunks.length) return [];

  const [queryVector] = await embedTexts([query], { textType: "query" });

  const scored = [];
  const batchSize = 8;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const vectors = await Promise.all(batch.map((chunk) => getChunkEmbedding(chunk, config)));
    batch.forEach((chunk, index) => {
      scored.push({
        ...chunk,
        embeddingScore: cosineSimilarity(queryVector, vectors[index])
      });
    });
  }

  return scored
    .filter((item) => item.embeddingScore > 0)
    .sort((a, b) => b.embeddingScore - a.embeddingScore)
    .slice(0, recallSize);
}

function mergeCandidates(keywordRanked, embeddingRanked, recallSize) {
  const merged = new Map();

  function add(list, source) {
    list.forEach((chunk, rank) => {
      const existing = merged.get(chunk.id) || {
        chunk,
        rrf: 0,
        keywordScore: 0,
        embeddingScore: 0,
        sources: []
      };
      existing.rrf += 1 / (60 + rank + 1);
      if (source === "keyword") existing.keywordScore = chunk.score || 0;
      if (source === "embedding") existing.embeddingScore = chunk.embeddingScore || 0;
      if (!existing.sources.includes(source)) existing.sources.push(source);
      merged.set(chunk.id, existing);
    });
  }

  add(keywordRanked, "keyword");
  add(embeddingRanked, "embedding");

  return [...merged.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, recallSize)
    .map((item) => ({
      ...item.chunk,
      keywordScore: item.keywordScore,
      embeddingScore: item.embeddingScore,
      recallSources: item.sources,
      rrfScore: item.rrf
    }));
}

async function rerankChunks(query, chunks, topK, env = process.env) {
  const config = getRagEmbedConfig(env);
  if (!config.rerankEnabled || chunks.length <= 1) {
    return chunks.slice(0, topK).map((chunk, index) => ({
      ...chunk,
      rerankScore: chunk.rrfScore || chunk.embeddingScore || chunk.score || 0,
      rank: index + 1
    }));
  }

  const documents = chunks.map((chunk) => chunkToText(chunk));
  const payload = await dashscopeRequest(
    RERANK_PATH,
    {
      model: config.rerankModel,
      input: { query, documents },
      parameters: {
        top_n: Math.min(topK, documents.length),
        return_documents: false
      }
    },
    config.dashscopeKey,
    config.timeoutMs
  );

  const results = payload.output?.results || payload.results || [];
  if (!results.length) {
    throw new Error("Rerank 返回为空");
  }

  return results.map((item, index) => {
    const chunk = chunks[item.index ?? item.document_index ?? index];
    return {
      ...chunk,
      rerankScore: Number(item.relevance_score ?? item.score ?? 0),
      rank: index + 1
    };
  });
}

function clearEmbeddingCache() {
  embeddingCache.clear();
}

module.exports = {
  getRagEmbedConfig,
  isEmbeddingConfigured,
  isRerankConfigured,
  chunkToText,
  cosineSimilarity,
  embedTexts,
  vectorRecall,
  mergeCandidates,
  rerankChunks,
  clearEmbeddingCache
};
