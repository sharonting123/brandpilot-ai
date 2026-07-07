/**
 * Answer Composer：基于结构化 facts / calculations 生成表达
 */

const { buildChatMessages } = require("./workflow-utils");

function buildFactsBlock(payload = {}) {
  return JSON.stringify(
    {
      scenario: payload.scenario,
      facts: payload.facts || [],
      calculations: payload.calculations || [],
      queries: payload.queries || [],
      charts: payload.charts || [],
      references: payload.references || [],
      warnings: payload.warnings || []
    },
    null,
    2
  );
}

function composeDeterministicAnswer(payload = {}) {
  const calc = (payload.calculations || [])[0];
  const metric = payload.metric || "GMV";
  const period = payload.period || {};
  const lines = ["## 同环比分析结论", ""];

  if (calc && calc.operator === "computePeriodCompare") {
    const cur = calc.current || {};
    const prev = calc.previous || {};
    lines.push(
      `- **${period.year || ""}年${period.monthNum || ""}月${metric}**：${cur.value ?? "-"}`,
      `- **上期（${prev.period || "-"}）**：${prev.value ?? "-"}`,
      calc.momPct != null
        ? `- **环比**：${calc.momPct > 0 ? "+" : ""}${calc.momPct}%`
        : "- **环比**：无法计算（上期为 0）"
    );
    if (calc.yoyPct != null) {
      lines.push(`- **同比**：${calc.yoyPct > 0 ? "+" : ""}${calc.yoyPct}%`);
    }
    if (calc.refs && calc.refs.length) {
      lines.push("", "引用：" + calc.refs.map((id) => `[${id}]`).join(" "));
    }
  }

  const contrib = (payload.calculations || []).find((item) => item.operator === "computeContribution");
  if (contrib && contrib.largestDrag) {
    lines.push(
      "",
      "## 城市贡献拆解",
      `- **最大拖累城市**：${contrib.largestDrag.city}（变化 ${contrib.largestDrag.delta}）`
    );
    if (contrib.refs && contrib.refs.length) {
      lines.push("引用：" + contrib.refs.map((id) => `[${id}]`).join(" "));
    }
  }

  (payload.warnings || []).forEach((warning) => {
    lines.push("", `> ⚠ ${warning.message || warning}`);
  });

  return lines.join("\n");
}

async function composeAnswer(params = {}) {
  const { modelConfig, brandName = "海底捞", message, history = [] } = params;
  const factsBlock = buildFactsBlock(params);

  if (!modelConfig || !modelConfig.configured) {
    return {
      answer: composeDeterministicAnswer(params),
      mode: "deterministic"
    };
  }

  const [{ generateText }, { createOpenAI }] = await Promise.all([
    import("ai"),
    import("@ai-sdk/openai")
  ]);

  const model = createOpenAI({
    baseURL: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey
  })(modelConfig.model);

  const system = [
    "你是 BrandPilot AI 的数据分析表达层，负责把已计算好的结构化事实写成中文结论。",
    "",
    "硬性要求：",
    "1. 只能使用 facts / calculations / queries 中的数字，禁止自行推算",
    "2. 每个关键结论句末标注引用（如 [S1][C1]）",
    "3. 若 warnings 非空，必须在回答中说明数据边界",
    "4. 不要重复粘贴 SQL，查数结果已在引用索引中",
    "",
    "## 结构化事实",
    "```json",
    factsBlock,
    "```"
  ].join("\n");

  const result = await generateText({
    model,
    system,
    messages: buildChatMessages(history, message || "请基于结构化事实输出同环比分析结论。"),
    temperature: 0.2,
    maxOutputTokens: modelConfig.maxTokens || 2000
  });

  return {
    answer: result.text,
    mode: "llm"
  };
}

module.exports = {
  composeAnswer,
  composeDeterministicAnswer,
  buildFactsBlock
};
