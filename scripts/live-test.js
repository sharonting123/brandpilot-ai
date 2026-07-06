/**
 * live-test.js — 真实模型链路测试（读 .env.local，走真 LongCat）
 */
const fs = require("fs");
const path = require("path");

// 手动加载 .env.local
const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const { getModelConfig } = require("../api/_lib/env");
const { recognizeIntent } = require("../api/_lib/intent-router");

async function main() {
  const modelConfig = getModelConfig(process.env);
  console.log("模型配置:", { baseUrl: modelConfig.baseUrl, model: modelConfig.model, maxTokens: modelConfig.maxTokens, configured: modelConfig.configured });

  const msg = "海底捞 6 月的 GMV 和核销率是多少？";
  console.log("\n[意图识别] 输入:", msg);
  const t0 = Date.now();
  const intent = await recognizeIntent(msg, modelConfig);
  console.log("[意图识别] 模式:", intent.recognitionMode, "| 工作流:", intent.workflow, "| 置信度:", intent.confidence, "|", (Date.now() - t0) + "ms");
  console.log("[意图识别] reasoning:", intent.reasoning);
  if (intent.llmError) console.log("[意图识别] LLM错误:", intent.llmError);

  console.log("\n[工作流执行]", intent.workflow);
  const mod = require("../api/_lib/workflows/" + intent.workflow);
  const t1 = Date.now();
  const res = await mod.execute({ message: msg, modelConfig, brandName: "海底捞", intentParams: intent.params || {}, history: [] });
  console.log("[工作流] 耗时:", (Date.now() - t1) + "ms | trace步数:", res.agentTrace.length, "| charts:", res.charts.length);
  console.log("[工作流] agentTrace:");
  for (const t of res.agentTrace) console.log("   -", t.tool, ":", t.summary);
  console.log("\n[answer 前 400 字]:\n", res.answer.slice(0, 400));
}

main().catch((e) => { console.error("失败:", e); process.exit(1); });
