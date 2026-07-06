/**
 * 共享 AI 工具工厂：给各工作流挂载统一的 tool calling 定义。
 */

async function buildSharedTools(toolNames = []) {
  const [{ tool }, { z }] = await Promise.all([
    import("ai"),
    import("zod")
  ]);
  const { TOOL_REGISTRY } = require("./agent-tools");

  const catalog = {
    queryBrandData: () =>
      tool({
        description: TOOL_REGISTRY.queryBrandData.description,
        parameters: z.object({
          brandId: z.string().default("haidilao").describe("品牌 ID")
        }),
        execute: async (args) => TOOL_REGISTRY.queryBrandData.fn(args)
      }),
    computeFunnel: () =>
      tool({
        description: TOOL_REGISTRY.computeFunnel.description,
        parameters: z.object({
          brandId: z.string().default("haidilao").describe("品牌 ID")
        }),
        execute: async (args) => TOOL_REGISTRY.computeFunnel.fn(args)
      }),
    aggregateMonthly: () =>
      tool({
        description: TOOL_REGISTRY.aggregateMonthly.description,
        parameters: z.object({
          brandId: z.string().default("haidilao").describe("品牌 ID")
        }),
        execute: async (args) => TOOL_REGISTRY.aggregateMonthly.fn(args)
      }),
    getCompetitorBenchmark: () =>
      tool({
        description: TOOL_REGISTRY.getCompetitorBenchmark.description,
        parameters: z.object({
          brandId: z.string().default("haidilao").describe("品牌 ID")
        }),
        execute: async (args) => TOOL_REGISTRY.getCompetitorBenchmark.fn(args)
      }),
    getBrandAssets: () =>
      tool({
        description: TOOL_REGISTRY.getBrandAssets.description,
        parameters: z.object({
          brandId: z.string().default("haidilao").describe("品牌 ID")
        }),
        execute: async (args) => TOOL_REGISTRY.getBrandAssets.fn(args)
      }),
    runNl2Sql: () =>
      tool({
        description: TOOL_REGISTRY.runNl2Sql.description,
        parameters: z.object({
          brandId: z.string().default("haidilao").describe("品牌 ID"),
          question: z.string().describe("自然语言问数问题")
        }),
        execute: async (args) => TOOL_REGISTRY.runNl2Sql.fn(args)
      }),
    retrieveKnowledge: () =>
      tool({
        description: TOOL_REGISTRY.retrieveKnowledge.description,
        parameters: z.object({
          brandId: z.string().default("haidilao").describe("品牌 ID"),
          query: z.string().describe("检索问题"),
          topK: z.number().optional().describe("返回条数，默认 4")
        }),
        execute: async (args) => TOOL_REGISTRY.retrieveKnowledge.fn(args)
      })
  };

  const selected = toolNames.length ? toolNames : Object.keys(catalog);
  const tools = {};
  for (const name of selected) {
    if (catalog[name]) tools[name] = catalog[name]();
  }
  return tools;
}

module.exports = {
  buildSharedTools
};
