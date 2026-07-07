/**
 * NL2SQL 结果格式化（回答 / 引用展示）
 */

function formatPercent(value) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(2) + "%";
}

function formatNl2SqlMarkdown(nl) {
  if (!nl || nl.error) {
    return nl && nl.message
      ? "> NL2SQL：" + nl.message
      : "";
  }

  const rows = Array.isArray(nl.rows) ? nl.rows : [];
  const preview = rows.slice(0, 10);
  const lines = [
    "## 数据查询（NL2SQL）",
    "",
    nl.generationMode === "agent" && nl.agentReasoning
      ? "> SQL 生成 Agent：" + nl.agentReasoning
      : nl.explanation
        ? "> " + nl.explanation
        : "",
    "",
    "### 查询 SQL",
    "```sql",
    nl.sql || "",
    "```",
    "",
    "### 查询结果（前 " + preview.length + " 行" + (nl.rowCount > preview.length ? " / 共 " + nl.rowCount + " 行" : "") + "）"
  ];

  if (!preview.length) {
    lines.push("- 无匹配行");
  } else {
    preview.forEach((row) => {
      const parts = Object.keys(row).map((key) => {
        const val = row[key];
        if (key === "conversion_rate" || key === "conversion_rate_pct") {
          return key + "=" + formatPercent(val);
        }
        return key + "=" + val;
      });
      lines.push("- " + parts.join("，"));
    });
  }

  if (nl.citationRefs && nl.citationRefs.length) {
    lines.push("", "引用：" + nl.citationRefs.map((id) => "[" + id + "]").join(" "));
  }

  return lines.filter((line) => line !== "").join("\n");
}

function findNl2SqlPayloadFromSteps(steps) {
  for (const step of steps || []) {
    for (const tc of step.toolCalls || []) {
      if (tc.toolName !== "runNl2Sql" || !tc.result) continue;
      try {
        return typeof tc.result === "string" ? JSON.parse(tc.result) : tc.result;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function prependNl2SqlSection(answer, nl) {
  const block = formatNl2SqlMarkdown(nl);
  if (!block) return answer || "";
  if (!answer || !String(answer).trim()) return block;
  return block + "\n\n---\n\n" + answer;
}

module.exports = {
  formatNl2SqlMarkdown,
  findNl2SqlPayloadFromSteps,
  prependNl2SqlSection
};
