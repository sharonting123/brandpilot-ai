/**
 * ECharts 中国地图沙盘（阿里 DataV GeoJSON + bar3D）
 */
(function (global) {
  "use strict";

  var GEO_LOCAL = "assets/geo/china.json";
  var GEO_CDN = "https://geo.datav.aliyun.com/areas_v3/bound/100000.json";
  var CITY_GEO = (global.BrandPilotChinaMap && global.BrandPilotChinaMap.CITY_CENTERS) || {};

  var state = {
    chart: null,
    container: null,
    geoReady: null,
    registered: false,
    onSelect: null,
    onDrill: null,
    lastSelected: ""
  };

  function loadChinaGeo() {
    if (state.geoReady) return state.geoReady;
    state.geoReady = fetch(GEO_LOCAL)
      .then(function (resp) {
        if (resp.ok) return resp.json();
        return fetch(GEO_CDN).then(function (r) { return r.json(); });
      })
      .catch(function () {
        return fetch(GEO_CDN).then(function (r) { return r.json(); });
      });
    return state.geoReady;
  }

  function cityCoord(cityName) {
    var center = CITY_GEO[cityName];
    if (!center) return null;
    return [center.lng, center.lat];
  }

  function normalizeBarHeight(gmv, maxGmv) {
    var ratio = maxGmv ? Number(gmv || 0) / maxGmv : 0;
    return Math.max(0.8, ratio * 12 + 0.5);
  }

  function buildBarData(cities, selectedCity) {
    var maxGmv = cities.reduce(function (max, c) {
      return Math.max(max, Number(c.gmv) || 0);
    }, 1);

    return cities.map(function (city) {
      var coord = cityCoord(city.name);
      if (!coord) return null;
      var active = city.name === selectedCity;
      return {
        name: city.name,
        value: coord.concat([normalizeBarHeight(city.gmv, maxGmv)]),
        gmv: city.gmv,
        roi: city.roi,
        verifiedRate: city.verifiedRate,
        itemStyle: {
          color: active ? "#ffc300" : "#ffd54f",
          opacity: active ? 0.95 : 0.82
        }
      };
    }).filter(Boolean);
  }

  function hasEchartsGl() {
    try {
      return Boolean(global.echarts && global.echarts.seriesTypes && global.echarts.seriesTypes.bar3D);
    } catch (err) {
      return false;
    }
  }

  function buildOption(cities, selectedCity) {
    var barData = buildBarData(cities, selectedCity);
    var use3d = hasEchartsGl();

    if (use3d && barData.length) {
      return {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          borderColor: "#f0d878",
          textStyle: { color: "#222222", fontSize: 12 },
          formatter: function (params) {
            if (!params.data) return params.name || "";
            var d = params.data;
            var vr = d.verifiedRate != null ? (d.verifiedRate * 100).toFixed(1) + "%" : "-";
            var roi = d.roi != null ? Number(d.roi).toFixed(1) : "-";
            var gmv = d.gmv != null ? formatCompact(d.gmv) : "-";
            return (
              "<strong>" + escapeHtml(params.name || "") + "</strong><br/>" +
              "GMV " + gmv + "<br/>" +
              "核销率 " + vr + "<br/>" +
              "ROI " + roi + "<br/>" +
              "<span style='opacity:.7'>单击选中 · 再点下钻商圈</span>"
            );
          }
        },
        geo3D: {
          map: "china",
          roam: true,
          regionHeight: 1.8,
          itemStyle: {
            color: "#f0f0f0",
            opacity: 1,
            borderWidth: 0.6,
            borderColor: "#dddddd"
          },
          emphasis: {
            itemStyle: { color: "#ffe08a" },
            label: { show: false }
          },
          label: { show: false },
          light: {
            main: { intensity: 1.05, shadow: true, alpha: 50, beta: 10 },
            ambient: { intensity: 0.55 }
          },
          viewControl: {
            distance: 78,
            minDistance: 45,
            maxDistance: 120,
            alpha: 42,
            beta: -8,
            panMouseButton: "right",
            rotateMouseButton: "left"
          },
          groundPlane: {
            show: false
          }
        },
        series: [
          {
            type: "bar3D",
            coordinateSystem: "geo3D",
            data: barData,
            barSize: 0.55,
            minHeight: 0.4,
            shading: "lambert",
            bevelSize: 0.12,
            bevelSmoothness: 2,
            label: {
              show: true,
              formatter: "{b}",
              position: "top",
              distance: 2,
              textStyle: {
                color: "#222222",
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: "rgba(255,255,255,0.9)",
                padding: [3, 6],
                borderRadius: 4
              }
            },
            emphasis: {
              label: { show: true },
              itemStyle: { color: "#f5b800" }
            }
          }
        ]
      };
    }

    return build2dOption(cities, selectedCity, barData);
  }

  function build2dOption(cities, selectedCity, barData) {
    var scatter = (barData || buildBarData(cities, selectedCity)).map(function (item) {
      return {
        name: item.name,
        value: item.value.slice(0, 2).concat([item.gmv || 0]),
        gmv: item.gmv,
        roi: item.roi,
        verifiedRate: item.verifiedRate,
        itemStyle: item.itemStyle
      };
    });

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        borderColor: "#f0d878",
        textStyle: { color: "#222222" }
      },
      geo: {
        map: "china",
        roam: true,
        zoom: 1.15,
        label: { show: false },
        itemStyle: {
          areaColor: "#f5f5f5",
          borderColor: "#dddddd",
          borderWidth: 0.8
        },
        emphasis: {
          itemStyle: { areaColor: "#fff8e0" }
        }
      },
      series: [
        {
          type: "map",
          map: "china",
          geoIndex: 0,
          silent: true,
          itemStyle: {
            areaColor: "transparent",
            borderColor: "transparent"
          }
        },
        {
          type: "effectScatter",
          coordinateSystem: "geo",
          data: scatter,
          symbolSize: function (val) {
            var gmv = val[2] || 0;
            return Math.max(10, Math.min(28, Math.sqrt(gmv / 800000)));
          },
          rippleEffect: { brushType: "stroke", scale: 3 },
          label: {
            show: true,
            formatter: "{b}",
            position: "right",
            color: "#e0f2fe",
            fontSize: 11
          },
          itemStyle: {
            color: function (params) {
              return params.name === selectedCity ? "#ffc300" : "#ff6633";
            },
            shadowBlur: 8,
            shadowColor: "rgba(255, 195, 0, 0.35)"
          }
        }
      ]
    };
  }

  function formatCompact(value) {
    var n = Number(value || 0);
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "万";
    return Math.round(n).toLocaleString("zh-CN");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function bindEvents(chart) {
    chart.off("click");
    chart.on("click", function (params) {
      var cityName = params.name;
      if (!cityName) return;
      if (state.lastSelected === cityName && typeof state.onDrill === "function") {
        state.onDrill(cityName);
        return;
      }
      state.lastSelected = cityName;
      if (typeof state.onSelect === "function") state.onSelect(cityName);
    });
  }

  function render(container, cities, selectedCity, onSelect, onDrill) {
    if (!container || !global.echarts) return Promise.resolve(false);
    state.onSelect = onSelect;
    state.onDrill = onDrill;
    state.lastSelected = selectedCity || "";

    if (!state.chart || state.container !== container) {
      dispose();
      state.container = container;
      state.chart = global.echarts.init(container, null, { renderer: "canvas" });
      global.addEventListener("resize", onResize);
    }

    return loadChinaGeo().then(function (geoJson) {
      if (!state.chart) return false;
      if (!state.registered) {
        global.echarts.registerMap("china", geoJson);
        state.registered = true;
      }
      var citiesList = cities || [];
      try {
        state.chart.setOption(buildOption(citiesList, selectedCity), true);
      } catch (err) {
        console.warn("3D 地图渲染失败，降级 2D:", err.message || err);
        state.chart.setOption(build2dOption(citiesList, selectedCity, buildBarData(citiesList, selectedCity)), true);
      }
      bindEvents(state.chart);
      setTimeout(onResize, 0);
      setTimeout(onResize, 150);
      return true;
    }).catch(function (err) {
      console.warn("中国地图 GeoJSON 加载失败:", err);
      return false;
    });
  }

  function update(cities, selectedCity) {
    if (!state.chart) return;
    state.lastSelected = selectedCity || state.lastSelected;
    state.chart.setOption(buildOption(cities || [], selectedCity), false);
  }

  function onResize() {
    if (state.chart) state.chart.resize();
  }

  function resize() {
    onResize();
  }

  function dispose() {
    global.removeEventListener("resize", onResize);
    if (state.chart) {
      state.chart.dispose();
      state.chart = null;
    }
    state.container = null;
    state.lastSelected = "";
  }

  global.BrandPilotEchartsMap = {
    render: render,
    update: update,
    resize: resize,
    dispose: dispose
  };
})(typeof window !== "undefined" ? window : global);
