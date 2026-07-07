/**
 * 轻量 Markdown 渲染（提案/分析输出）
 */
(function (global) {
  "use strict";

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildReferenceIndexFromList(refs) {
    var map = Object.create(null);
    (refs || []).forEach(function (ref) {
      if (ref && ref.id) map[ref.id] = ref;
    });
    return map;
  }

  function renderMarkdown(text, options) {
    options = options || {};
    var html = renderMarkdownCore(text, options);
    if (options.references && options.references.length) {
      html = linkifyCitationHtml(html, buildReferenceIndexFromList(options.references));
    }
    return html;
  }

  function linkifyCitationHtml(html, refIndex) {
    return String(html || "").replace(/\[([KDSAP]\d+)\]/g, function (_, id) {
      var ref = refIndex[id];
      var href = ref ? ref.href : "#ref-" + id;
      var title = ref ? ref.title : id;
      return (
        '<a class="citation-ref" href="' +
        escapeHtml(href) +
        '" data-ref-id="' +
        escapeHtml(id) +
        '" title="' +
        escapeHtml(title) +
        '">[' +
        escapeHtml(id) +
        "]</a>"
      );
    });
  }

  function renderMarkdownCore(text) {
    if (!text) return "";

    var lines = String(text).replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var inUl = false;
    var inOl = false;
    var inTable = false;
    var tableRows = [];

    function closeLists() {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (inOl) { html.push("</ol>"); inOl = false; }
    }

    function flushTable() {
      if (!tableRows.length) return;
      html.push('<div class="md-table-wrap"><table class="md-table">');
      tableRows.forEach(function (row, idx) {
        if (idx === 1 && /^[\s|:-]+$/.test(row.join(""))) return;
        var tag = idx === 0 ? "th" : "td";
        html.push("<tr>" + row.map(function (cell) {
          return "<" + tag + ">" + inlineFormat(cell) + "</" + tag + ">";
        }).join("") + "</tr>");
      });
      html.push("</table></div>");
      tableRows = [];
      inTable = false;
    }

    function inlineFormat(line) {
      var s = escapeHtml(line);
      s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
        return '<a href="' + escapeHtml(href) + '" class="md-link">' + escapeHtml(label) + "</a>";
      });
      return s;
    }

    lines.forEach(function (raw) {
      var line = raw.trim();

      if (line.indexOf("|") >= 0 && line.indexOf("|") < 3) {
        closeLists();
        inTable = true;
        tableRows.push(line.split("|").filter(function (c, i, arr) {
          return i > 0 && i < arr.length - 1;
        }).map(function (c) { return c.trim(); }));
        return;
      }

      if (inTable) flushTable();

      if (!line) {
        closeLists();
        return;
      }

      if (/^---+$/.test(line)) {
        closeLists();
        html.push("<hr>");
        return;
      }

      if (/^###\s+/.test(line)) {
        closeLists();
        html.push("<h4>" + inlineFormat(line.replace(/^###\s+/, "")) + "</h4>");
        return;
      }
      if (/^##\s+/.test(line)) {
        closeLists();
        html.push("<h3>" + inlineFormat(line.replace(/^##\s+/, "")) + "</h3>");
        return;
      }
      if (/^#\s+/.test(line)) {
        closeLists();
        html.push("<h2>" + inlineFormat(line.replace(/^#\s+/, "")) + "</h2>");
        return;
      }

      if (/^>\s+/.test(line)) {
        closeLists();
        html.push("<blockquote>" + inlineFormat(line.replace(/^>\s+/, "")) + "</blockquote>");
        return;
      }

      if (/^[-*]\s+/.test(line)) {
        if (!inUl) { closeLists(); html.push("<ul>"); inUl = true; }
        html.push("<li>" + inlineFormat(line.replace(/^[-*]\s+/, "")) + "</li>");
        return;
      }

      if (/^\d+\.\s+/.test(line)) {
        if (!inOl) { closeLists(); html.push("<ol>"); inOl = true; }
        html.push("<li>" + inlineFormat(line.replace(/^\d+\.\s+/, "")) + "</li>");
        return;
      }

      closeLists();
      html.push("<p>" + inlineFormat(line) + "</p>");
    });

    if (inTable) flushTable();
    closeLists();
    return html.join("");
  }

  function extractSummary(text, maxLen) {
    if (!text) return "";
    var limit = maxLen || 320;
    var plain = String(text)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[(\d+)\]/g, "")
      .replace(/[#>*`|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plain.length > limit ? plain.slice(0, limit) + "…" : plain;
  }

  global.BrandPilotMarkdown = {
    escapeHtml: escapeHtml,
    renderMarkdown: renderMarkdown,
    extractSummary: extractSummary
  };
})(window);
