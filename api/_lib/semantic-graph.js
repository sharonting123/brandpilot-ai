/**
 * API 层语义图谱入口（唯一事实源薄封装）
 */

const loader = require("../../semantic-graph/loader");

function graph() {
  return loader.loadSemanticGraph();
}

module.exports = {
  ...loader,
  getTableRegistry() {
    return graph().tableRegistry;
  },
  getMetricGrainRegistry() {
    return graph().metricGrainRegistry;
  },
  getMetricFieldMap() {
    return graph().metricFieldMap;
  },
  getSchemaCatalog() {
    return graph().schemaCatalog;
  },
  getTableDescriptions() {
    return graph().tableDescriptions;
  },
  getAllowedTables() {
    return graph().allowedTables;
  },
  getJoinIndex() {
    return graph().joinIndex;
  },
  getDrillJoinPaths() {
    return graph().drillJoinPaths;
  },
  getGrainTablePriority() {
    return graph().grainTablePriority;
  },
  getDimensionLabels() {
    return graph().dimensionLabels;
  },
  getChildLevel() {
    return graph().childLevel;
  },
  getLevelTable() {
    return graph().levelTable;
  },
  getCities() {
    return graph().cities;
  },
  getWorkflows() {
    return graph().workflows;
  },
  getDataWorkflows() {
    return graph().dataWorkflows;
  },
  getQueryTypeMap() {
    return graph().queryTypeMap;
  },
  getDomainDefaultTable() {
    return graph().domainDefaultTable;
  }
};
