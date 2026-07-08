/**
 * 为提案/分析类工作流预注册关键数据源，避免 LLM 只拿到 city_roi 却写竞对数字。
 */

const { getCitationRegistry } = require("./citation-registry");
const { registerQueryResult } = require("./data-query-engine");
const { getQueryTemplate } = require("./nl2sql");

function hasTableRef(table) {
  return getCitationRegistry().some(
    (item) =>
      refTable(item) === table ||
      (item.type === "sql" && String(item.source || "").includes(table.replace(/^fact_/, "")))
  );
}

function refTable(ref) {
  return String((ref.details && ref.details.table) || ref.source || "");
}

const PROPOSAL_PREFETCH_TEMPLATES = ["competitor", "monthly_gtv"];

function prefetchProposalDataSources({ brandId, message, context, filters = {} }) {
  const registered = [];
  for (const templateId of PROPOSAL_PREFETCH_TEMPLATES) {
    const template = getQueryTemplate(templateId);
    if (!template) continue;
    if (hasTableRef(template.table)) continue;

    const sql = template.sql(brandId, filters);
    const rows = template.run(context, filters);
    const result = registerQueryResult(template.id, sql, rows, context, filters, {
      table: template.table,
      brandId,
      generationMode: "template",
      queryType: template.id,
      question: message
    });
    if (result && result.citationRef) registered.push(result.citationRef);
  }
  return registered;
}

module.exports = {
  prefetchProposalDataSources
};
