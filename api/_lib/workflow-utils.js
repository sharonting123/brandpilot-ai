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
  "仅基于工具返回的数据回答用户所问内容；不要追加用户未询问的维度、城市对比表或分城市拆解。若用户上传了文档，可结合文档内容补充说明，但以工具查询结果为准。";

module.exports = {
  buildChatMessages,
  ANSWER_SCOPE_RULE
};
