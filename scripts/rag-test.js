/**
 * RAG 混合检索冒烟测试
 * node scripts/rag-test.js "海底捞补贴率预警"
 */

const { retrieveKnowledge } = require("../api/_lib/rag");
const { getRagEmbedConfig } = require("../api/_lib/rag-embeddings");

async function main() {
  const query = process.argv.slice(2).join(" ") || "海底捞 GTV 三因子怎么拆解";
  const config = getRagEmbedConfig();
  console.log("RAG config:", {
    embedding: config.embeddingEnabled,
    embeddingProvider: config.embeddingProvider,
    embeddingModel: config.embeddingModel,
    rerank: config.rerankEnabled,
    rerankModel: config.rerankModel
  });

  const raw = await retrieveKnowledge({ query, brandId: "haidilao", topK: 4 });
  const payload = JSON.parse(raw);
  console.log("retrievalMode:", payload.retrievalMode);
  if (payload.warning) console.log("warning:", payload.warning);
  payload.passages.forEach((p) => {
    console.log(`- [${p.score}] ${p.title} (${(p.recallSources || []).join("+") || "fallback"})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
