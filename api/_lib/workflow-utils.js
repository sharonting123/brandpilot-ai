/**
 * 工作流共享工具
 */

function buildChatMessages(history, message) {
  const prior = (history || [])
    .filter(function (item) {
      return item && (item.role === "user" || item.role === "assistant") && item.content;
    })
    .slice(-10)
    .map(function (item) {
      return {
        role: item.role,
        content: String(item.content)
      };
    });

  return prior.concat([{ role: "user", content: message }]);
}

const ANSWER_SCOPE_RULE =
  "仅基于工具返回的数据回答用户所问内容；未明确询问城市/商圈/门店下钻时，不要追加城市对比表、分城市拆解或下钻式分析。";

module.exports = {
  buildChatMessages,
  ANSWER_SCOPE_RULE
};
