/**
 * 下钻知识图谱：品牌 → 城市 → 商圈 → 门店
 * 节点结构来自 drill-data；语义标签/规则来自 semantic-graph
 */

const { DRILL_CATALOG } = require("./drill-data");
const {
  getCities,
  getChildLevel,
  getDimensionLabels,
  getLevelTable,
  dimensionLabel: graphDimensionLabel,
  inferNextDrillDimension,
  validateDrillFromGraph
} = require("./semantic-graph");

const DRILL_LEVELS = ["brand", "city", "business_area", "poi"];

function getDimensionLabelsMap() {
  return getDimensionLabels();
}

function getChildLevelMap() {
  return getChildLevel();
}

function listCities() {
  const fromGraph = getCities();
  return fromGraph.length ? fromGraph : DRILL_CATALOG.map((entry) => entry.city);
}

function listBusinessAreas(city) {
  const entry = DRILL_CATALOG.find((item) => item.city === city);
  if (!entry) return [];
  return entry.districts.map((d) => d.area);
}

function listPoiNames(city, businessArea) {
  const entry = DRILL_CATALOG.find((item) => item.city === city);
  if (!entry) return [];
  for (const district of entry.districts) {
    if (!businessArea || district.area === businessArea) {
      return district.stores.slice();
    }
  }
  return [];
}

function buildGraphNodes() {
  const nodes = [{ id: "brand:haidilao", level: "brand", label: "海底捞" }];
  const edges = [];

  DRILL_CATALOG.forEach((cityEntry) => {
    const cityId = `city:${cityEntry.city}`;
    nodes.push({ id: cityId, level: "city", label: cityEntry.city, city: cityEntry.city });
    edges.push({ from: "brand:haidilao", to: cityId, relation: "has_city" });

    cityEntry.districts.forEach((districtEntry) => {
      const areaId = `area:${cityEntry.city}:${districtEntry.area}`;
      nodes.push({
        id: areaId,
        level: "business_area",
        label: districtEntry.area,
        city: cityEntry.city,
        business_area: districtEntry.area,
        district: districtEntry.district
      });
      edges.push({ from: cityId, to: areaId, relation: "has_business_area" });

      districtEntry.stores.forEach((storeName) => {
        const poiId = `poi:${cityEntry.city}:${districtEntry.area}:${storeName}`;
        nodes.push({
          id: poiId,
          level: "poi",
          label: storeName,
          city: cityEntry.city,
          business_area: districtEntry.area,
          poi_name: storeName
        });
        edges.push({ from: areaId, to: poiId, relation: "has_poi" });
      });
    });
  });

  return { nodes, edges, levels: DRILL_LEVELS };
}

function detectCityFromText(text) {
  const t = String(text || "");
  for (const city of listCities()) {
    if (t.includes(city)) return city;
  }
  return null;
}

function detectBusinessAreaFromText(text, city) {
  const t = String(text || "");
  const areas = city ? listBusinessAreas(city) : DRILL_CATALOG.flatMap((c) => c.districts.map((d) => d.area));
  for (const area of areas) {
    if (t.includes(area)) return area;
  }
  return null;
}

function resolveDrillScope(text, intentParams = {}) {
  const city = intentParams.city || detectCityFromText(text);
  const businessArea =
    intentParams.businessArea || intentParams.business_area || detectBusinessAreaFromText(text, city);

  let scopeLevel = "brand";
  if (city) scopeLevel = "city";
  if (businessArea) scopeLevel = "business_area";
  if (intentParams.poiId || intentParams.poi_id) scopeLevel = "poi";

  return {
    scopeLevel,
    city: city || null,
    businessArea: businessArea || null,
    poiId: intentParams.poiId || intentParams.poi_id || null,
    breadcrumb: formatDrillPath({ scopeLevel, city, businessArea })
  };
}

function detectExplicitDimension(text) {
  const t = String(text || "");
  if (/商圈|商业区|商场|按商圈/.test(t)) return "business_area";
  if (/门店|POI|店铺|点位|按门店/.test(t)) return "poi";
  if (/分城市|各城市|同城|城市对比|城市间|按城市/.test(t)) return "city";
  if (/平台|渠道|美团.*抖音|抖音.*美团|分平台/.test(t)) return "platform";
  if (/关键词|搜索词|热搜/.test(t)) return "keyword";
  if (/推荐链路|推荐路径|推荐流量|推荐来源|推荐转化|信息流/.test(t)) return "traffic_source";
  if (/搜索链路|搜索路径|搜索流量|搜索来源|搜索到/.test(t)) return "traffic_source";
  if (/套餐|活动|deal/.test(t)) return "campaign";
  return null;
}

function inferBreakdownDimension(scope, text) {
  const explicit = detectExplicitDimension(text);
  if (explicit) return explicit;

  const wantsDrill = /拖累|贡献|拆解|哪里|哪个|哪块|下钻|主要原因|拉低|下降原因/.test(String(text || ""));
  if (!wantsDrill) return null;

  const childLevel = getChildLevelMap();
  if (scope.city && /哪个城市|哪座城市|哪些城市|分城市拖累/.test(String(text || ""))) {
    return childLevel.city || "business_area";
  }

  return inferNextDrillDimension(scope.scopeLevel, text) || childLevel[scope.scopeLevel] || "city";
}

function formatDrillPath(scope) {
  const parts = ["海底捞"];
  if (scope.city) parts.push(scope.city);
  if (scope.businessArea) parts.push(scope.businessArea);
  if (scope.poiId) parts.push(scope.poiId);
  return parts.join(" → ");
}

function dimensionLabel(dimension) {
  return graphDimensionLabel(dimension);
}

function validateDrillQuestion(scope, dimension, text) {
  return validateDrillFromGraph(scope, dimension, text);
}

function getMetricQueryLevel(scope) {
  if (scope.scopeLevel === "city" && scope.city) return { level: "city", city: scope.city };
  if (scope.scopeLevel === "business_area" && scope.city) {
    return { level: "city", city: scope.city };
  }
  return { level: "brand" };
}

module.exports = {
  DRILL_LEVELS,
  get DIMENSION_LABELS() {
    return getDimensionLabelsMap();
  },
  get CHILD_LEVEL() {
    return getChildLevelMap();
  },
  get LEVEL_TABLE() {
    return getLevelTable();
  },
  buildGraphNodes,
  listCities,
  listBusinessAreas,
  listPoiNames,
  detectCityFromText,
  detectBusinessAreaFromText,
  resolveDrillScope,
  detectExplicitDimension,
  inferBreakdownDimension,
  formatDrillPath,
  dimensionLabel,
  validateDrillQuestion,
  getMetricQueryLevel
};
