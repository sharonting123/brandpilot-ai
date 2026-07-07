/**
 * 寒暄 / 身份咨询意图识别（优先于数据分析路由）
 */

const GREETING_PATTERNS = [
  /^(你好|您好|hi|hello|hey|嗨|哈喽|在吗|在么|早上好|下午好|晚上好|中午好)([!！?？~\s]*)$/i
];

const IDENTITY_PATTERNS = [
  /你是谁/,
  /你叫什么/,
  /你的名字/,
  /介绍一下你/,
  /介绍下你/,
  /你是做什么的/,
  /你能做什么/,
  /你会什么/,
  /你能帮我什么/,
  /你能帮我做/,
  /你能干啥/,
  /有什么功能/,
  /什么能力/,
  /能干什么/,
  /你是谁开发的/,
  /悦悦是谁/,
  /你是机器人/,
  /你是ai/,
  /你是人工智能/,
  /你是助手/,
  /你是什么/
];

const CLOSING_PATTERNS = [
  /^(谢谢|多谢|感谢|再见|拜拜|bye|goodbye)([!！?？~\s]*)$/i
];

const ANALYSIS_SIGNALS =
  /gmv|gtv|核销|漏斗|环比|同比|提案|对比|诊断|分析|报告|美团|抖音|数据|查询|经营|品牌|多少|趋势|损耗|链路|竞对|竞品|呷哺|\d{4}\s*年|\d{1,2}\s*月/i;

function normalizeMessage(message) {
  return String(message || "")
    .trim()
    .replace(/\s+/g, " ");
}

function detectGreetingIntent(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  if (ANALYSIS_SIGNALS.test(text)) return null;

  if (GREETING_PATTERNS.some((pattern) => pattern.test(text))) {
    return { type: "greeting", confidence: 0.97 };
  }

  if (CLOSING_PATTERNS.some((pattern) => pattern.test(text))) {
    return { type: "closing", confidence: 0.95 };
  }

  if (IDENTITY_PATTERNS.some((pattern) => pattern.test(text))) {
    return { type: "identity", confidence: 0.96 };
  }

  if (text.length <= 16 && !ANALYSIS_SIGNALS.test(text)) {
    if (/^(嗯|哦|ok|好的|好|行)[!！?？~\s]*$/i.test(text)) {
      return { type: "greeting", confidence: 0.9 };
    }
  }

  return null;
}

module.exports = {
  detectGreetingIntent,
  ANALYSIS_SIGNALS
};
