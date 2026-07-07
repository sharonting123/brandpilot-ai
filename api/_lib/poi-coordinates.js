/**
 * 门店/商圈坐标（演示数据与真实地标对齐）
 * canonical POI ID 与 semantic-graph / 09_drill_granular_seed 一致
 */

const POI_COORDINATES = {
  "1287671875": { lng: 116.821, lat: 39.947, label: "燕郊示例店" },
  "hdl-上海-静安大悦城-01": { lng: 121.4584, lat: 31.2478, label: "静安大悦城" },
  "hdl-上海-静安大悦城-02": { lng: 121.4584, lat: 31.2478, label: "静安大悦城" },
  "hdl-上海-陆家嘴-01": { lng: 121.4998, lat: 31.2397, label: "陆家嘴" },
  "hdl-北京-朝阳合生汇-01": { lng: 116.4872, lat: 39.8945, label: "朝阳合生汇" },
  "hdl-北京-朝阳合生汇-02": { lng: 116.4872, lat: 39.8945, label: "朝阳合生汇" },
  "hdl-深圳-万象天地-01": { lng: 113.9569, lat: 22.5412, label: "万象天地" },
  "hdl-成都-春熙路-01": { lng: 104.0815, lat: 30.6572, label: "春熙路" },
  "hdl-杭州-滨江龙湖-01": { lng: 120.2118, lat: 30.2084, label: "滨江龙湖" },
  "xb-sh-jingan-001": { lng: 121.4584, lat: 31.2478, label: "静安大悦城" },
  "xb-bj-chaoyang-001": { lng: 116.4872, lat: 39.8945, label: "朝阳合生汇" },
  "xb-sz-nanshan-001": { lng: 113.9569, lat: 22.5412, label: "万象天地" },
  "xb-cd-jinjiang-001": { lng: 104.0815, lat: 30.6572, label: "春熙路" },
  "xb-hz-binjiang-001": { lng: 120.2118, lat: 30.2084, label: "滨江龙湖" }
};

const CITY_CENTERS = {
  上海: { lng: 121.4737, lat: 31.2304 },
  北京: { lng: 116.4074, lat: 39.9042 },
  深圳: { lng: 114.0579, lat: 22.5431 },
  成都: { lng: 104.0665, lat: 30.5728 },
  杭州: { lng: 120.1551, lat: 30.2741 },
  广州: { lng: 113.2644, lat: 23.1291 },
  南京: { lng: 118.7969, lat: 32.0603 },
  武汉: { lng: 114.3055, lat: 30.5928 },
  重庆: { lng: 106.5516, lat: 29.563 },
  西安: { lng: 108.9398, lat: 34.3416 },
  三河: { lng: 116.821, lat: 39.947 }
};

const CHINA_BOUNDS = { minLng: 73, maxLng: 135, minLat: 17, maxLat: 54 };
const MAP_WIDTH = 14;
const MAP_DEPTH = 11;

function projectLngLat(lng, lat) {
  const x = ((lng - CHINA_BOUNDS.minLng) / (CHINA_BOUNDS.maxLng - CHINA_BOUNDS.minLng) - 0.5) * MAP_WIDTH;
  const z = -((lat - CHINA_BOUNDS.minLat) / (CHINA_BOUNDS.maxLat - CHINA_BOUNDS.minLat) - 0.5) * MAP_DEPTH;
  return { x, z };
}

function cityMapPosition(cityName) {
  const center = CITY_CENTERS[cityName];
  if (!center) return { x: 0, y: 0, z: 0 };
  const pos = projectLngLat(center.lng, center.lat);
  return { x: pos.x, y: 0, z: pos.z, lng: center.lng, lat: center.lat };
}

const BUSINESS_AREA_COORDINATES = {
  静安大悦城: { lng: 121.4584, lat: 31.2478 },
  朝阳合生汇: { lng: 116.4872, lat: 39.8945 },
  万象天地: { lng: 113.9569, lat: 22.5412 },
  春熙路: { lng: 104.0815, lat: 30.6572 },
  滨江龙湖: { lng: 120.2118, lat: 30.2084 },
  示例商圈: { lng: 116.821, lat: 39.947 }
};

function resolveBusinessAreaName(poi = {}) {
  const id = poi.poi_id || poi.id;
  if (id && POI_COORDINATES[id] && POI_COORDINATES[id].label) {
    return POI_COORDINATES[id].label;
  }
  return poi.business_area || poi.businessArea || poi.district || "核心商圈";
}

function resolvePoiCoordinates(poi = {}) {
  const id = poi.poi_id || poi.id;
  if (id && POI_COORDINATES[id]) {
    return { ...POI_COORDINATES[id] };
  }

  const area = poi.business_area || poi.businessArea;
  if (area && BUSINESS_AREA_COORDINATES[area]) {
    return { ...BUSINESS_AREA_COORDINATES[area] };
  }

  const city = poi.city;
  if (city && CITY_CENTERS[city]) {
    return { ...CITY_CENTERS[city] };
  }

  return { lng: 116.4074, lat: 39.9042, label: "默认" };
}

function centroidFromPois(pois = []) {
  const points = pois
    .map((poi) => ({ lng: Number(poi.lng), lat: Number(poi.lat) }))
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  if (!points.length) return null;
  const sum = points.reduce(
    (acc, point) => ({ lng: acc.lng + point.lng, lat: acc.lat + point.lat }),
    { lng: 0, lat: 0 }
  );
  return {
    lng: sum.lng / points.length,
    lat: sum.lat / points.length
  };
}

module.exports = {
  POI_COORDINATES,
  CITY_CENTERS,
  CHINA_BOUNDS,
  projectLngLat,
  cityMapPosition,
  resolvePoiCoordinates,
  resolveBusinessAreaName,
  centroidFromPois
};
