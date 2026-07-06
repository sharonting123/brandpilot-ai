/**
 * 中国地图投影与城市坐标（AR 沙盘前端）
 */
(function (global) {
  "use strict";

  var CHINA_BOUNDS = { minLng: 73, maxLng: 135, minLat: 17, maxLat: 54 };
  var MAP_WIDTH = 14;
  var MAP_DEPTH = 11;

  var CITY_CENTERS = {
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

  // 简化但可辨认的中国大陆轮廓（lng, lat）
  var CHINA_OUTLINE = [
    [73.4, 39.2], [75.2, 40.8], [77.5, 39.5], [79.8, 41.8], [82.5, 44.5], [85.8, 47.2],
    [88.5, 48.8], [91.8, 46.5], [95.5, 44.2], [98.8, 42.5], [102.5, 41.8], [106.2, 41.5],
    [109.5, 42.2], [112.8, 43.5], [116.2, 44.8], [118.8, 46.2], [121.5, 47.2], [124.8, 48.2],
    [127.5, 47.8], [130.2, 46.5], [132.5, 44.2], [134.0, 41.8], [133.2, 39.5], [131.5, 37.2],
    [129.2, 35.0], [127.0, 33.0], [124.5, 31.0], [122.8, 29.0], [121.5, 27.0], [120.5, 25.2],
    [119.5, 23.8], [118.5, 22.8], [117.2, 22.2], [115.8, 22.0], [114.5, 22.2], [113.2, 21.8],
    [112.0, 21.2], [110.8, 20.5], [109.8, 19.5], [109.0, 18.5], [108.2, 18.2], [107.5, 18.8],
    [106.8, 19.8], [106.2, 20.8], [105.2, 21.5], [104.0, 22.2], [102.5, 23.0], [101.0, 24.0],
    [99.2, 25.2], [97.5, 26.5], [96.0, 27.8], [94.2, 28.8], [92.0, 29.5], [89.8, 30.2],
    [87.5, 30.8], [85.2, 31.5], [82.8, 32.8], [80.5, 34.2], [78.5, 35.5], [76.8, 36.8],
    [75.2, 38.0], [73.4, 39.2]
  ];

  // 海南岛
  var HAINAN_OUTLINE = [
    [108.6, 20.1], [109.5, 19.2], [110.6, 18.4], [110.9, 18.1], [110.2, 18.3],
    [109.2, 18.9], [108.6, 19.6], [108.6, 20.1]
  ];

  // 台湾岛（示意）
  var TAIWAN_OUTLINE = [
    [121.0, 25.3], [121.8, 24.5], [121.5, 22.8], [120.8, 22.0], [120.2, 22.5],
    [120.0, 24.0], [120.5, 25.0], [121.0, 25.3]
  ];

  function projectLngLat(lng, lat) {
    var x = ((lng - CHINA_BOUNDS.minLng) / (CHINA_BOUNDS.maxLng - CHINA_BOUNDS.minLng) - 0.5) * MAP_WIDTH;
    var z = -((lat - CHINA_BOUNDS.minLat) / (CHINA_BOUNDS.maxLat - CHINA_BOUNDS.minLat) - 0.5) * MAP_DEPTH;
    return { x: x, z: z };
  }

  function cityMapPosition(cityName) {
    var center = CITY_CENTERS[cityName];
    if (!center) return { x: 0, z: 0, lng: null, lat: null };
    var pos = projectLngLat(center.lng, center.lat);
    return { x: pos.x, y: 0, z: pos.z, lng: center.lng, lat: center.lat };
  }

  global.BrandPilotChinaMap = {
    CHINA_OUTLINE: CHINA_OUTLINE,
    HAINAN_OUTLINE: HAINAN_OUTLINE,
    TAIWAN_OUTLINE: TAIWAN_OUTLINE,
    CHINA_BOUNDS: CHINA_BOUNDS,
    MAP_WIDTH: MAP_WIDTH,
    MAP_DEPTH: MAP_DEPTH,
    CITY_CENTERS: CITY_CENTERS,
    projectLngLat: projectLngLat,
    cityMapPosition: cityMapPosition
  };
})(typeof window !== "undefined" ? window : global);
