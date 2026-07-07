/**
 * 只读 SQL 安全校验
 * 允许表清单来自 semantic-graph/tables.yaml
 */

const { getAllowedTables } = require("./semantic-graph");

const FORBIDDEN_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE|CALL|MERGE|REPLACE)\b/i;

function getAllowedTablesResolved() {
  return getAllowedTables();
}

function validateSql(sql, brandId = "haidilao") {
  const text = String(sql || "").trim();
  const errors = [];
  const ALLOWED_TABLES = getAllowedTablesResolved();

  if (!text) {
    errors.push("SQL 为空");
    return { valid: false, errors };
  }

  if (FORBIDDEN_PATTERN.test(text)) {
    errors.push("仅允许 SELECT / WITH 只读查询");
  }

  const upper = text.toUpperCase();
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH") && !upper.startsWith("--")) {
    errors.push("SQL 必须以 SELECT、WITH 或注释开头");
  }

  const referencedTables = ALLOWED_TABLES.filter((table) => {
    const pattern = new RegExp(`\\b${table}\\b`, "i");
    return pattern.test(text);
  });

  if (!referencedTables.length && !/\bVW_MEITUAN_FUNNEL_DEMO\b/i.test(text)) {
    errors.push("未引用允许的数据表");
  }

  if (brandId && !text.includes(brandId) && !upper.includes("BRAND_ID")) {
    errors.push("SQL 应包含 brand_id 过滤条件");
  }

  return {
    valid: errors.length === 0,
    errors,
    referencedTables
  };
}

module.exports = {
  get ALLOWED_TABLES() {
    return getAllowedTablesResolved();
  },
  validateSql
};
