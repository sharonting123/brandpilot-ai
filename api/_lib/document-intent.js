/**
 * 上传文档后的问答意图（优先于 data_query 默认路由）
 */

const BUSINESS_SIGNALS =
  /gmv|gtv|核销|漏斗|环比|同比|roi|客单价|曝光|订单|营业额|经营数据|竞对|美团|抖音|\d{4}\s*年|\d{1,2}\s*月.*多少|多少万|多少钱/i;

const DOCUMENT_SIGNALS =
  /文档|文件|附件|上传|pdf|docx|ppt|主要内容|讲什么|说了什么|写了什么|总结|摘要|概括|解读|什么意思|内容是什么|这份|这篇|这一份|帮我看|帮我读/i;

function hasAttachmentText(attachments = []) {
  return (attachments || []).some(
    (item) => item && (String(item.text || "").trim() || (item.chunks && item.chunks.length))
  );
}

function detectDocumentQaIntent(userMessage, attachments = []) {
  if (!hasAttachmentText(attachments)) return null;

  const text = String(userMessage || "").trim();

  if (BUSINESS_SIGNALS.test(text)) {
    return null;
  }

  if (!text) {
    return {
      confidence: 0.92,
      reasoning: "用户已上传文档，将结合文档内容作答。"
    };
  }

  if (DOCUMENT_SIGNALS.test(text)) {
    return {
      confidence: 0.95,
      reasoning: "用户询问上传文档的内容，路由到文档解析。"
    };
  }

  if (text.length <= 100) {
    return {
      confidence: 0.88,
      reasoning: "已上传文档且问题不涉及经营指标，按文档解读处理。"
    };
  }

  return null;
}

module.exports = {
  detectDocumentQaIntent,
  hasAttachmentText
};
