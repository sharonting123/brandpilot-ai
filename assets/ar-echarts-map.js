/**
 * ECharts 中国地图沙盘（阿里 DataV GeoJSON + effectScatter）
 */
(function (global) {
  "use strict";

  var GEO_LOCAL = "/assets/geo/china.json";
  var GEO_CDN = "https://geo.datav.aliyun.com/areas_v3/bound/100000.json";
  var CITY_GEO = (global.BrandPilotChinaMap && global.BrandPilotChinaMap.CITY_CENTERS) || {};

  var state = {
    chart: null,
    container: null,
    geoReady: null,
    registered: false,
    resizeObserver: null,
    onSelect: null,
    onDrill: null,
    lastSelected: "",
    renderToken: 0,
    pendingCities: [],
    pendingSelected: ""
  };

  function loadChinaGeo() {
    if (state.geoReady) return state.geoReady;
    state.geoReady = fetch(GEO_LOCAL)
      .then(function (resp) {
        if (resp.ok) return resp.json();
        return fetch(GEO_CDN).then(function (r) {
          if (!r.ok) throw new Error("geo fetch failed");
          return r.json();
        });
      })
      .catch(function () {
        return fetch(GEO_CDN).then(function (r) {
          if (!r.ok) throw new Error("geo cdn failed");
          return r.json();
        });
      });
    return state.geoReady;
  }

  function isContainerReady(container) {
    if (!container || !container.isConnected) return false;
    var panel = container.closest("#panelAr");
    if (panel && !panel.classList.contains("active")) return false;
    return container.offsetWidth > 20 && container.offsetHeight > 20;
  }

  function waitForContainerSize(container, maxMs) {
    maxMs = maxMs || 8000;
    return new Promise(function (resolve) {
      var start = Date.now();
      function tick() {
        if (isContainerReady(container)) return resolve(true);
        if (Date.now() - start > maxMs) return resolve(false);
        requestAnimationFrame(tick);
      }
      tick();
    });
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

  function ensureResizeObserver(container) {
    if (!container || state.resizeObserver || typeof ResizeObserver === "undefined") return;
    state.resizeObserver = new ResizeObserver(function () {
      onResize();
    });
    state.resizeObserver.observe(container);
  }

  function buildOption(cities, selectedCity) {
    var barData = buildBarData(cities, selectedCity);
    var scatter = barData.map(function (item) {
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
        textStyle: { color: "#222222" },
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
      geo: {
        map: "china",
        roam: true,
        zoom: 1.15,
        center: [104.5, 35.5],
        label: { show: false },
        itemStyle: {
          areaColor: "#f0f0f0",
          borderColor: "#cccccc",
          borderWidth: 0.8
        },
        emphasis: {
          itemStyle: { areaColor: "#fff8e0", borderColor: "#ffc300" }
        }
      },
      series: [
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
            color: "#222222",
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

  function scheduleRenderRetry(container, cities, selectedCity, onSelect, onDrill, attempt) {
    attempt = attempt || 0;
    if (attempt > 8 || !container || !container.isConnected) return;
    setTimeout(function () {
      render(container, cities, selectedCity, onSelect, onDrill, attempt + 1);
    }, 120 + attempt * 120);
  }

  function render(container, cities, selectedCity, onSelect, onDrill, retryAttempt) {
    retryAttempt = retryAttempt || 0;
    if (!container) return Promise.resolve(false);
    if (!global.echarts) return Promise.resolve(false);

    var token = ++state.renderToken;
    state.onSelect = onSelect;
    state.onDrill = onDrill;
    state.lastSelected = selectedCity || "";
    state.pendingCities = cities || [];
    state.pendingSelected = selectedCity || "";

    return waitForContainerSize(container).then(function (ready) {
      if (token !== state.renderToken) return false;
      if (!ready) {
        console.warn("地图容器尚未就绪，稍后重试");
        scheduleRenderRetry(container, cities, selectedCity, onSelect, onDrill, retryAttempt);
        return false;
      }

      if (!state.chart || state.container !== container) {
        dispose();
        state.container = container;
        state.chart = global.echarts.init(container, null, { renderer: "canvas" });
        ensureResizeObserver(container);
        global.addEventListener("resize", onResize);
      }

      return loadChinaGeo().then(function (geoJson) {
        if (token !== state.renderToken || !state.chart) return false;
        if (!state.registered) {
          global.echarts.registerMap("china", geoJson);
          state.registered = true;
        }
        var citiesList = cities || [];
        state.chart.setOption(buildOption(citiesList, selectedCity), true);
        bindEvents(state.chart);
        onResize();
        setTimeout(onResize, 0);
        setTimeout(onResize, 150);
        setTimeout(onResize, 400);
        return true;
      });
    }).catch(function (err) {
      console.warn("中国地图渲染失败:", err);
      scheduleRenderRetry(container, cities, selectedCity, onSelect, onDrill, retryAttempt);
      return false;
    });
  }

  function update(cities, selectedCity) {
    state.pendingCities = cities || [];
    state.pendingSelected = selectedCity || state.pendingSelected;
    if (!state.chart) {
      if (state.container) {
        render(
          state.container,
          state.pendingCities,
          state.pendingSelected,
          state.onSelect,
          state.onDrill
        );
      }
      return;
    }
    state.lastSelected = selectedCity || state.lastSelected;
    state.chart.setOption(buildOption(cities || [], selectedCity), false);
    onResize();
  }

  function onResize() {
    if (!state.chart || !state.container) return;
    if (!isContainerReady(state.container)) return;
    state.chart.resize();
  }

  function resize() {
    if (state.chart && state.container && isContainerReady(state.container)) {
      onResize();
      return;
    }
    if (state.container && global.echarts) {
      render(
        state.container,
        state.pendingCities,
        state.pendingSelected,
        state.onSelect,
        state.onDrill
      );
    }
  }

  function dispose() {
    global.removeEventListener("resize", onResize);
    if (state.resizeObserver) {
      state.resizeObserver.disconnect();
      state.resizeObserver = null;
    }
    if (state.chart) {
      state.chart.dispose();
      state.chart = null;
    }
    state.container = null;
    state.lastSelected = "";
    state.renderToken += 1;
  }

  global.BrandPilotEchartsMap = {
    render: render,
    update: update,
    resize: resize,
    dispose: dispose
  };
})(typeof window !== "undefined" ? window : global);
