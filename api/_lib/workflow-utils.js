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

module.exports = {
  buildChatMessages
};
