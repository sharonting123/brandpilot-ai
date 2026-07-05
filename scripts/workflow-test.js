const assert = require("assert");
const { getHaidilaoFixture } = require("../api/_lib/supabase-context");
const { runHaidilaoWorkflow } = require("../api/_lib/agent-workflow");

async function main() {
  const fixture = getHaidilaoFixture();
  const result = await runHaidilaoWorkflow({
    requestId: "workflow-test",
    request: {
      brand: {
        id: "haidilao",
        name: "海底捞",
        title: "海底捞半年度经营提案",
        score: 82
      }
    },
    modelConfig: {
      configured: false,
      model: "deterministic",
      baseUrl: "local",
      maxTokens: 4096,
      timeoutMs: 1000
    },
    supabaseContext: {
      connected: false,
      dataMode: "fixture",
      errors: [],
      warnings: ["workflow-test"],
      ...fixture
    }
  });

  assert.strictEqual(result.mode, "multi_agent_workflow");
  assert.strictEqual(result.workflow.agents.length, 7);
  assert.strictEqual(result.proposal.brand_id, "haidilao");
  assert.match(result.proposal.title, /海底捞/);
  assert.ok(result.metrics.some((item) => item.label === "H1 GTV"));
  assert.ok(result.metrics.some((item) => item.label === "POI 到套餐"));
  assert.ok(result.workflow.analysis.dimensions.cityTiers.length >= 3);
  assert.ok(result.workflow.analysis.dimensions.competitorBenchmarks.length >= 2);
  assert.ok(result.workflow.analysis.dimensions.monetization.takeRate > 0);
  assert.ok(result.workflow.analysis.insights.length >= 3);
  assert.ok(result.workflow.qualityGates.every((gate) => typeof gate.passed === "boolean"));

  console.log("Workflow test passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
