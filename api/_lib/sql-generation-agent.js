/**
 * SQL 生成 Agent
 * 根据用户问题 + Schema + Few-shot 识别查询类型并生成只读 SQL。
 */

const { formatFewShotsForPrompt, QUERY_TYPE_LABELS } = require("./sql-few-shots");
const { validateSql } = require("./sql-validator");
const { getIntentMaxTokens } = require("./token-budget");

function buildAgentInstruction() {
  return [
    "你是 BrandPilot AI 的 SQL 生成专家，负责把自然语言经营分析问题转成只读 PostgreSQL 查询。",
    "",
    "支持的 queryType（必须从中选一个）：",
    Object.entries(QUERY_TYPE_LABELS)
      .map(([id, label]) => `- ${id}: ${label}`)
      .join("\n"),
    "",
    "规则：",
    "1. 只生成 SELECT 或 WITH ... SELECT 只读语句，禁止写操作",
    "2. 必须包含 brand_id = '<brandId>' 过滤",
    "3. 根据问题提取 period/city 等过滤条件写入 SQL",
    "4. 先识别 queryType，再参考 few-shot 生成对应 SQL",
    "5. 漏斗类问题用 funnel_conversion，月度 GMV 用 monthly_gtv，城市 ROI 用 city_roi",
    "",
    "只输出一个 JSON 对象，不要 Markdown：",
    '{"queryType":"...","table":"...","sql":"...","reasoning":"...","filters":{"year":"2026","monthNum":6,"city":"上海"}}'
  ].join("\n");
}

function buildSchemaPrompt() {
  const { SCHEMA_CATALOG } = require("./nl2sql");
  return SCHEMA_CATALOG.map(
    (item) =>
      `- ${item.table}: ${item.description}\n  列: ${item.columns.join(", ")}`
  ).join("\n");
}

function parseSqlAgentJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let payload;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("SQL Agent 未返回合法 JSON");
    }
    payload = JSON.parse(cleaned.slice(start, end + 1));
  }

  const queryType = String(payload.queryType || "").trim();
  const table = String(payload.table || "").trim();
  const sql = String(payload.sql || "").trim();
  const reasoning = String(payload.reasoning || "SQL Agent 生成").trim();
  const filters = payload.filters && typeof payload.filters === "object" ? payload.filters : {};

  if (!queryType) throw new Error("SQL Agent 缺少 queryType");
  if (!sql) throw new Error("SQL Agent 缺少 sql");

  return { queryType, table, sql, reasoning, filters };
}

/**
 * 调用 LLM 生成 SQL 计划
 */
async function generateSqlPlan(params = {}) {
  const { question, brandId = "haidilao", filters = {}, modelConfig, timeRoute } = params;
  if (!modelConfig || !modelConfig.configured) {
    throw new Error("模型未配置，无法调用 SQL 生成 Agent");
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
    buildAgentInstruction(),
    "",
    "## 数据表 Schema",
    buildSchemaPrompt(),
    "",
    "## Few-shot 示例",
    formatFewShotsForPrompt(8),
    "",
    "brandId 固定为：" + brandId,
    timeRoute
      ? [
          "",
          "## 时间路由（必须遵循）",
          `- 目标粒度：${timeRoute.targetGrain} → 有效粒度：${timeRoute.effectiveGrain}`,
          `- 路由表：${timeRoute.table}（${timeRoute.tableKind}）`,
          `- 时间列：${timeRoute.dateColumn}`,
          `- SQL 时间条件：${timeRoute.sqlTimeClause || "无"}`,
          timeRoute.metricValidation && timeRoute.metricValidation.fallbackReason
            ? `- 粒度降级：${timeRoute.metricValidation.fallbackReason}`
            : ""
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    filters && Object.keys(filters).length
      ? "已从问题预提取 filters：" + JSON.stringify(filters)
      : ""
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateText({
    model,
    system,
    prompt: String(question || ""),
    temperature: 0,
    maxOutputTokens: Math.min(getIntentMaxTokens(modelConfig) * 2, 2000)
  });

  const plan = parseSqlAgentJson(result.text);
  const mergedFilters = { ...filters, ...(plan.filters || {}) };
  plan.sql = require("./sql-period").ensurePeriodInSql(plan.sql, mergedFilters, {
    table: plan.table,
    dateColumn: timeRoute && timeRoute.dateColumn ? timeRoute.dateColumn : "month",
    timeRoute: timeRoute || null
  });
  const validation = validateSql(plan.sql, brandId);

  if (!validation.valid) {
    throw new Error("SQL 校验失败：" + validation.errors.join("；"));
  }

  return {
    ...plan,
    table: plan.table || validation.referencedTables[0] || "",
    generationMode: "agent",
    validation
  };
}

module.exports = {
  generateSqlPlan,
  buildAgentInstruction
};
