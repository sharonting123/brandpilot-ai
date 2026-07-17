const assert = require("assert");

process.env.INTENT_EMBEDDING_ENABLED = "false";

const {
  recognizeIntent,
  recognizeIntentWithKeywords,
  FAST_PATH_THRESHOLD
} = require("../api/_lib/intent-router");

const noModel = { configured: false };

async function main() {
  const greeting = await recognizeIntent("你好", noModel);
  assert.strictEqual(greeting.workflow, "greeting");
  assert.strictEqual(greeting.recognitionMode, "keyword_fast");

  const businessGreeting = await recognizeIntent("你好，6月GMV多少", noModel);
  assert.strictEqual(businessGreeting.workflow, "data_query");

  const proposal = recognizeIntentWithKeywords("生成年度经营复盘报告");
  assert.strictEqual(proposal.workflow, "annual_proposal");
  assert.ok(proposal.confidence >= FAST_PATH_THRESHOLD);

  const funnel = recognizeIntentWithKeywords("搜索到核销链路的最大损耗点在哪里");
  assert.strictEqual(funnel.workflow, "funnel_diagnosis");

  const period = recognizeIntentWithKeywords("GMV同比下降，哪个城市拖累最大");
  assert.strictEqual(period.workflow, "period_compare");

  const periodRecent = recognizeIntentWithKeywords("最近比上个月表现怎么样");
  assert.strictEqual(periodRecent.workflow, "period_compare");

  const competitor = recognizeIntentWithKeywords("对比美团和抖音的经营表现");
  assert.strictEqual(competitor.workflow, "competitor_benchmark");

  const documentQa = await recognizeIntent("总结这份文档", noModel, {
    attachments: [{ text: "这里是已解析的文档正文。" }]
  });
  assert.strictEqual(documentQa.workflow, "document_qa");

  const documentDataQuery = await recognizeIntent("根据文档查询6月GMV", noModel, {
    attachments: [{ text: "这里是已解析的文档正文。" }]
  });
  assert.notStrictEqual(documentDataQuery.workflow, "document_qa");

  console.log("Intent router test passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
