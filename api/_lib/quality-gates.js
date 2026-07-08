/**
 * 输出质量门禁
 */

const { auditProposalReferences } = require("./citation-resolver");

function runQualityGates(payload = {}) {
  const answer = String(payload.answer || "");
  const references = payload.references || [];
  const calculations = payload.calculations || [];
  const dataMode = payload.dataMode || "empty";
  const issues = [];

  if (dataMode === "empty" || dataMode === "unavailable") {
    issues.push({
      level: "warning",
      code: "EMPTY_DATA_SOURCE",
      message: "当前无可用经营数据，结论应标注数据边界，禁止编造数字。"
    });
  }

  if (payload.requireReferences !== false) {
    const hasCitation = /\[(?:D|S|K|A|C)\d+\]/.test(answer);
    if (!hasCitation && references.length) {
      issues.push({
        level: "warning",
        code: "MISSING_REFERENCE",
        message: "结论缺少引用编号（如 [S1][C1]）。"
      });
    }
  }

  (calculations || []).forEach((calc) => {
    (calc.warnings || []).forEach((warning) => {
      issues.push({
        level: "warning",
        code: warning.code || "CALC_WARNING",
        message: warning.message || "计算告警"
      });
    });
    if (calc.operator === "computePeriodCompare" && calc.previous && calc.previous.value === 0) {
      issues.push({
        level: "error",
        code: "ZERO_DENOMINATOR",
        message: "环比分母为 0，不得输出强结论环比百分比。"
      });
    }
  });

  const finalPassed = !issues.some((item) => item.level === "error");
  return { passed: finalPassed, issues };
}

module.exports = {
  runQualityGates
};
