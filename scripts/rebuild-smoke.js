/**
 * rebuild-smoke.js — 新架构（真 Agent 编排）冒烟测试
 * 验证：意图识别关键词兜底 + 四个工作流在无模型（确定性兜底）下能跑通。
 * 不依赖真实模型/网络，modelConfig.configured=false 强制走兜底路径。
 */
const assert = require("assert");
const { recognizeIntent, recognizeIntentWithKeywords } = require("../api/_lib/intent-router");

const CASES = [
  { msg: "帮海底捞做一份 2026 上半年的年度提案", expect: "annual_proposal" },
  { msg: "海底捞从搜索到核销的转化链路哪里损耗最大？", expect: "funnel_diagnosis" },
  { msg: "海底捞在美团和抖音的表现对比一下", expect: "competitor_benchmark" },
  { msg: "海底捞 6 月的 GMV 和核销率是多少？", expect: "data_query" }
];

const modelConfig = { configured: false, model: "deterministic", baseUrl: "local", apiKey: "" };

async function main() {
  let pass = 0;
  let fail = 0;

  console.log("=== 1. 意图识别关键词兜底 ===");
  for (const c of CASES) {
    const r = recognizeIntentWithKeywords(c.msg);
    const ok = r.workflow === c.expect;
    console.log((ok ? "  OK  " : "  FAIL") + " [" + r.workflow + " vs " + c.expect + "] " + c.msg);
    ok ? pass++ : fail++;
  }

  console.log("\n=== 2. 工作流执行（确定性兜底，无模型）===");
  const registry = {
    annual_proposal: require("../api/_lib/workflows/annual_proposal"),
    funnel_diagnosis: require("../api/_lib/workflows/funnel_diagnosis"),
    competitor_benchmark: require("../api/_lib/workflows/competitor_benchmark"),
    data_query: require("../api/_lib/workflows/data_query")
  };

  for (const c of CASES) {
    try {
      const mod = registry[c.expect];
      const res = await mod.execute({
        message: c.msg,
        modelConfig,
        brandName: "海底捞",
        intentParams: {},
        history: []
      });
      assert(res && typeof res.answer === "string" && res.answer.length > 0, "answer 为空");
      assert(Array.isArray(res.agentTrace), "agentTrace 非数组");
      assert(Array.isArray(res.charts), "charts 非数组");
      console.log("  OK   " + c.expect + " → answer " + res.answer.length + " 字, charts " + res.charts.length + ", trace " + res.agentTrace.length);
      pass++;
    } catch (err) {
      console.log("  FAIL " + c.expect + " → " + err.message);
      fail++;
    }
  }

  console.log("\n=== 结果: " + pass + " 通过, " + fail + " 失败 ===");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
