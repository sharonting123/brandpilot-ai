const { requestJsonModel } = require("./model-client");

async function runHaidilaoWorkflow({ request, modelConfig, requestId, supabaseContext }) {
  const state = {
    request,
    requestId,
    supabaseContext,
    outputs: {},
    trace: []
  };

  await runAgent(state, agentDefinitions.brief, briefAgent);
  await runAgent(state, agentDefinitions.data, dataQueryAgent);
  await runAgent(state, agentDefinitions.attribution, attributionAgent);
  await runAgent(state, agentDefinitions.analysis, businessAnalysisAgent);
  await runAgent(state, agentDefinitions.strategy, strategyAgent);
  await runAgent(state, agentDefinitions.quality, qualityAgent);
  await runAgent(state, agentDefinitions.composer, (currentState) => proposalComposerAgent(currentState, modelConfig));

  return buildApiResult(state, modelConfig);
}

module.exports = { runHaidilaoWorkflow };
