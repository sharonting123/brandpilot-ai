/**
 * 安全执行 SQL 计划：根据 queryType 在内存上下文中取数（不执行任意 SQL）
 */

const { getQueryTemplate } = require("./nl2sql");

function executeSqlPlan(context, plan, brandId, filters = {}) {
  const queryType = plan.queryType || plan.templateId;
  const template = getQueryTemplate(queryType);
  if (!template) {
    throw new Error("未知 queryType：" + queryType);
  }

  const mergedFilters = {
    ...filters,
    ...(plan.filters && typeof plan.filters === "object" ? plan.filters : {})
  };

  return {
    template,
    rows: template.run(context, mergedFilters),
    filters: mergedFilters,
    sql: plan.sql || template.sql(brandId, mergedFilters)
  };
}

module.exports = {
  executeSqlPlan
};
