/**
 * BrandPilot AR 展厅 — Three.js 3D 沙盘 + 城市/商圈/门店下钻
 */
(function (global) {
  "use strict";

  var DRILL = { CITY: 0, DISTRICT: 1, POI: 2 };

  var state = {
    container: null,
    currentScene: null,
    sceneBase: null,
    shellReady: false,
    timeFilter: {
      mode: "month",
      monthKey: "",
      from: "",
      to: "",
      preset: ""
    },
    drillLevel: DRILL.CITY,
    selectedCity: "",
    selectedDistrictId: "",
    selectedPoiId: "",
    three: {
      renderer: null,
      scene: null,
      camera: null,
      frameId: 0,
      clock: 0,
      meshes: [],
      selectable: [],
      orbit: { theta: 0.55, phi: 0.92, radius: 17 },
      dragging: false,
      lastX: 0,
      lastY: 0,
      xrSession: null,
      decorMeshes: [],
      animMeshes: [],
      cityLabelEls: [],
      cityLabelHeights: {},
      onSelectionChange: null
    }
  };

  function init(container) {
    if (!container) return false;
    if (state.container !== container) {
      disposeThree();
      state.shellReady = false;
    }
    state.container = container;
    container.classList.add("ar-map-stage");
    render();
    return true;
  }

  function update(sceneData) {
    state.sceneBase = sceneData ? shallowCloneScene(sceneData) : null;
    state.currentScene = sceneData || null;
    if (!sceneData) {
      syncSelectionDefaults();
      render();
      return;
    }
    primeSceneFromData(sceneData);
    render();

    ensureDrillSource(sceneData).then(function () {
      primeSceneFromData(sceneData);
      render();
      scheduleMapResize();
    });
  }

  function primeSceneFromData(sceneData) {
    if (global.BrandPilotDrillMetrics) {
      state.timeFilter = global.BrandPilotDrillMetrics.initFilterFromPeriod(
        sceneData.displayPeriod,
        sceneData.drillSource
      );
    }
    if (sceneData.drillSource) {
      rebuildSceneFromFilter();
    }
    if (sceneData.focusCity) {
      state.selectedCity = sceneData.focusCity;
    } else if (!state.selectedCity && getCities().length) {
      state.selectedCity = getCities()[0].name;
    }
    syncSelectionDefaults();
  }

  function scheduleMapResize() {
    var delays = [0, 80, 240, 600];
    delays.forEach(function (ms) {
      setTimeout(function () {
        if (global.BrandPilotEchartsMap && typeof global.BrandPilotEchartsMap.resize === "function") {
          global.BrandPilotEchartsMap.resize();
        }
        if (state.drillLevel === DRILL.CITY) {
          syncMapView(state.currentScene);
        }
      }, ms);
    });
  }

  function ensureDrillSource(sceneData) {
    if (!sceneData || sceneData.drillSource) return Promise.resolve(sceneData);
    var headers = { "Content-Type": "application/json" };
    if (global.BrandPilotAuth && typeof global.BrandPilotAuth.authHeaders === "function") {
      headers = global.BrandPilotAuth.authHeaders();
    }
    var brandId = sceneData.brandId || "haidilao";
    return fetch("/api/drill-source?brandId=" + encodeURIComponent(brandId), { headers: headers })
      .then(function (resp) {
        return resp.json().then(function (data) {
          if (!resp.ok) throw new Error((data && data.message) || "load failed");
          return data;
        });
      })
      .then(function (data) {
        if (data && data.drillSource) {
          sceneData.drillSource = data.drillSource;
          if (state.sceneBase) state.sceneBase.drillSource = data.drillSource;
        }
        return sceneData;
      })
      .catch(function (err) {
        console.warn("沙盘 drillSource 加载失败:", err.message || err);
        return sceneData;
      });
  }

  function shallowCloneScene(sceneData) {
    return {
      brandName: sceneData.brandName,
      brandId: sceneData.brandId,
      topicLabel: sceneData.topicLabel,
      topicHint: sceneData.topicHint,
      focusCity: sceneData.focusCity,
      focusMonth: sceneData.focusMonth,
      workflow: sceneData.workflow,
      funnel: sceneData.funnel,
      funnelBrand: sceneData.funnelBrand,
      dataSpec: sceneData.dataSpec,
      opportunityScore: sceneData.opportunityScore,
      summary: sceneData.summary,
      drillSource: sceneData.drillSource,
      cities: (sceneData.cities || []).map(function (city) {
        return Object.assign({}, city);
      }),
      pois: (sceneData.pois || []).map(function (poi) {
        return Object.assign({}, poi, { metrics: Object.assign({}, poi.metrics || {}) });
      }),
      districts: (sceneData.districts || []).map(function (district) {
        return Object.assign({}, district, { pois: (district.pois || []).slice() });
      })
    };
  }

  function rebuildSceneFromFilter() {
    var base = state.sceneBase;
    if (!base || !base.drillSource || !global.BrandPilotDrillMetrics) return;

    var rebuilt = global.BrandPilotDrillMetrics.rebuildSceneMetrics(
      base.drillSource,
      state.timeFilter,
      { workflow: base.workflow }
    );
    var cityPositionMap = {};
    (base.cities || []).forEach(function (city) {
      cityPositionMap[city.name] = city.position;
    });
    var chinaMap = global.BrandPilotChinaMap;
    var cities = rebuilt.cities.map(function (city) {
      var position = cityPositionMap[city.name];
      if (!position && chinaMap && typeof chinaMap.cityMapPosition === "function") {
        position = chinaMap.cityMapPosition(city.name);
      }
      return Object.assign({}, city, { position: position });
    }).sort(function (a, b) {
      return (b.gmv || 0) - (a.gmv || 0);
    });

    var poiMeta = {};
    (base.pois || []).forEach(function (poi) {
      poiMeta[poi.id] = poi;
    });
    var pois = rebuilt.pois.map(function (poi) {
      var meta = poiMeta[poi.id] || {};
      return Object.assign({}, meta, poi, { metrics: Object.assign({}, poi.metrics) });
    });

    var districtMeta = {};
    (base.districts || []).forEach(function (district) {
      districtMeta[district.id] = district;
    });
    var districts = rebuilt.districts.map(function (district, index) {
      var meta = districtMeta[district.id] || {};
      return Object.assign({}, meta, district, {
        pois: (district.pois || []).slice(),
        mapPosition: meta.mapPosition || districtMapPosition(index),
        lng: meta.lng,
        lat: meta.lat,
        visitRate: district.visitRate,
        dealClickRate: district.dealClickRate
      });
    });

    state.currentScene = Object.assign({}, base, {
      drillMetrics: rebuilt.drillMetrics,
      cities: cities,
      districts: districts,
      pois: pois,
      dateRange: rebuilt.dateRange,
      displayPeriod: rebuilt.displayPeriod,
      brandPeerBenchmarks: rebuilt.brandPeerBenchmarks,
      platformBenchmarks: rebuilt.platformBenchmarks,
      competitors: rebuilt.competitors
    });
  }

  function districtMapPosition(index) {
    var presets = [
      { x: 28, y: 30 },
      { x: 58, y: 24 },
      { x: 73, y: 52 },
      { x: 42, y: 62 },
      { x: 23, y: 70 },
      { x: 64, y: 78 }
    ];
    return presets[index % presets.length];
  }

  function resetSelection() {
    showCityMap(true);
  }

  function showCityMap(clearSelection) {
    state.drillLevel = DRILL.CITY;
    if (clearSelection) {
      state.selectedCity = "";
      state.selectedDistrictId = "";
      state.selectedPoiId = "";
    }
    if (state.three) {
      state.three.orbit = { theta: 0.55, phi: 0.92, radius: 17 };
    }
    syncSelectionDefaults();
    render();
  }

  function syncSelectionDefaults() {
    var cities = getCities();
    var districts = districtsInScope();
    var pois = poisInScope();

    if (state.drillLevel >= DRILL.DISTRICT && state.selectedCity) {
      if (!cities.some(function (c) { return c.name === state.selectedCity; })) {
        state.drillLevel = DRILL.CITY;
        state.selectedCity = "";
      }
    }
    if (state.drillLevel >= DRILL.DISTRICT) {
      districts = districtsInCity(state.selectedCity);
      if (districts.length && !districts.some(function (d) { return d.id === state.selectedDistrictId; })) {
        state.selectedDistrictId = districts[0].id;
      }
      if (!districts.length) {
        state.drillLevel = DRILL.CITY;
        state.selectedDistrictId = "";
      }
    }
    if (state.drillLevel === DRILL.POI) {
      pois = poisInDistrict(state.selectedDistrictId);
      if (pois.length && !pois.some(function (p) { return p.id === state.selectedPoiId; })) {
        state.selectedPoiId = pois[0].id;
      }
      if (!pois.length) {
        state.drillLevel = DRILL.DISTRICT;
        state.selectedPoiId = "";
      }
    }

    if (!state.selectedCity && cities.length === 1) {
      state.selectedCity = cities[0].name;
    }
    if (!state.selectedDistrictId && districts.length === 1 && state.drillLevel >= DRILL.DISTRICT) {
      state.selectedDistrictId = districts[0].id;
    }
    if (!state.selectedPoiId && pois.length === 1 && state.drillLevel === DRILL.POI) {
      state.selectedPoiId = pois[0].id;
    }
  }

  function render() {
    if (!state.container) return;
    var sceneData = state.currentScene;
    if (!sceneData) {
      disposeThree();
      state.shellReady = false;
      state.container.innerHTML =
        '<div class="map-empty">' +
        "<strong>等待 AR 场景</strong>" +
        "<span>完成一次分析后，将生成 3D 经营沙盘。</span>" +
        "</div>";
      return;
    }

    if (!state.shellReady) {
      state.container.innerHTML =
        '<div class="ar-shell">' +
        '<div data-ar-header></div>' +
        '<div class="ar-time-filter" data-ar-time-filter></div>' +
        '<div data-ar-insights></div>' +
        '<div class="ar-viewport">' +
        '<div id="ar-echarts-map" class="ar-echarts-map" aria-label="中国地图沙盘"></div>' +
        '<canvas id="ar-three-canvas" aria-label="AR 3D 沙盘"></canvas>' +
        '<div class="ar-viewport-hud">' +
        '<nav class="ar-breadcrumb" data-ar-breadcrumb aria-label="下钻路径"></nav>' +
        '<button type="button" class="ghost-button sm ar-back-btn" data-ar-back hidden>返回上一级</button>' +
        "</div>" +
        '<div class="ar-map-labels" data-ar-map-labels aria-hidden="true"></div>' +
        '<p class="ar-view-hint">ECharts 中国地图 · 点击城市选中 · 再点下钻商圈</p>' +
        "</div>" +
        '<div class="ar-detail-dock" data-ar-detail></div>' +
        '<div data-ar-spec></div>' +
        "</div>";
      state.shellReady = true;
      bindShellControls();
    }

    refreshShell(sceneData);
    syncMapView(sceneData);
  }

  function syncMapView(sceneData) {
    var canvas = state.container && state.container.querySelector("#ar-three-canvas");
    var echartsEl = state.container && state.container.querySelector("#ar-echarts-map");
    var hint = state.container && state.container.querySelector(".ar-view-hint");
    var labelLayer = state.container && state.container.querySelector("[data-ar-map-labels]");

    if (state.drillLevel === DRILL.CITY) {
      if (canvas) canvas.hidden = true;
      if (echartsEl) echartsEl.hidden = false;
      if (hint) hint.textContent = "ECharts 中国地图 · 点击城市选中 · 再点下钻商圈";
      if (labelLayer) {
        labelLayer.innerHTML = "";
        labelLayer.setAttribute("aria-hidden", "true");
      }
      cancelAnimationFrame(state.three.frameId);
      state.three.frameId = 0;

      if (global.BrandPilotEchartsMap && echartsEl) {
        var cities = getCities();
        if (!cities.length && hint) {
          hint.textContent = "城市数据加载中…";
        } else if (!global.echarts && hint) {
          hint.textContent = "地图库加载中，请稍候或刷新页面…";
        }
        global.BrandPilotEchartsMap.render(
          echartsEl,
          cities,
          state.selectedCity,
          function (cityName) {
            selectCity(cityName, false);
          },
          function (cityName) {
            selectCity(cityName, true);
          }
        ).then(function (ok) {
          if (!ok && hint) {
            hint.textContent = "中国地图加载失败，请刷新页面或检查网络";
          } else if (hint) {
            hint.textContent = "ECharts 中国地图 · 点击城市选中 · 再点下钻商圈";
          }
          if (global.BrandPilotEchartsMap && typeof global.BrandPilotEchartsMap.resize === "function") {
            global.BrandPilotEchartsMap.resize();
          }
        });
      } else if (hint && (!global.BrandPilotEchartsMap || !global.echarts)) {
        hint.textContent = "地图组件加载中…";
      }
      return;
    }

    if (echartsEl) echartsEl.hidden = true;
    if (canvas) canvas.hidden = false;
    if (global.BrandPilotEchartsMap) global.BrandPilotEchartsMap.dispose();
    if (!state.three.renderer && canvas) initThree();
    rebuildThreeScene();
  }

  function refreshShell(sceneData) {
    var headerEl = state.container.querySelector("[data-ar-header]");
    var filterEl = state.container.querySelector("[data-ar-time-filter]");
    var insightsEl = state.container.querySelector("[data-ar-insights]");
    var detailEl = state.container.querySelector("[data-ar-detail]");
    var specEl = state.container.querySelector("[data-ar-spec]");
    var backBtn = state.container.querySelector("[data-ar-back]");
    var crumbEl = state.container.querySelector("[data-ar-breadcrumb]");

    if (headerEl) headerEl.innerHTML = renderHeader(sceneData);
    if (filterEl) filterEl.innerHTML = renderTimeFilter(sceneData);
    if (insightsEl) insightsEl.innerHTML = renderTopicInsights(sceneData);
    if (detailEl) detailEl.innerHTML = renderDetailDock(sceneData);
    if (specEl) specEl.innerHTML = renderDataSpec(sceneData);
    if (backBtn) backBtn.hidden = state.drillLevel === DRILL.CITY;
    if (crumbEl) crumbEl.innerHTML = renderBreadcrumb(sceneData);
    if (state.drillLevel === DRILL.CITY && global.BrandPilotEchartsMap) {
      var echartsEl = state.container.querySelector("#ar-echarts-map");
      if (echartsEl && !echartsEl.hidden) {
        global.BrandPilotEchartsMap.update(getCities(), state.selectedCity);
      }
    } else {
      syncCityLabelLayer();
    }
    emitSelectionChange(sceneData);
  }

  function getChinaMap() {
    return global.BrandPilotChinaMap || null;
  }

  function clearDecorMeshes() {
    if (!state.three.scene) return;
    (state.three.decorMeshes || []).forEach(function (mesh) {
      state.three.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach(function (m) { m.dispose(); });
        else mesh.material.dispose();
      }
    });
    state.three.decorMeshes = [];
    state.three.animMeshes = [];
  }

  function addDecorMesh(mesh) {
    state.three.scene.add(mesh);
    state.three.decorMeshes.push(mesh);
  }

  function createMapTexture(THREE, kind) {
    var canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    var ctx = canvas.getContext("2d");
    if (kind === "ocean") {
      var oceanGrad = ctx.createRadialGradient(256, 200, 40, 256, 280, 420);
      oceanGrad.addColorStop(0, "#1a3d66");
      oceanGrad.addColorStop(0.55, "#0f2847");
      oceanGrad.addColorStop(1, "#071525");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.04)";
      ctx.lineWidth = 1;
      for (var gx = 0; gx < 512; gx += 32) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, 512);
        ctx.stroke();
      }
      for (var gz = 0; gz < 512; gz += 32) {
        ctx.beginPath();
        ctx.moveTo(0, gz);
        ctx.lineTo(512, gz);
        ctx.stroke();
      }
    } else {
      var landGrad = ctx.createLinearGradient(0, 0, 512, 512);
      landGrad.addColorStop(0, "#2a4f72");
      landGrad.addColorStop(0.5, "#1e3d5c");
      landGrad.addColorStop(1, "#16324a");
      ctx.fillStyle = landGrad;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "rgba(94, 234, 212, 0.06)";
      for (var i = 0; i < 120; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 2 + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (kind === "ocean") texture.repeat.set(2, 2);
    return texture;
  }

  function outlineToShape(map, outline) {
    var shape = new global.THREE.Shape();
    outline.forEach(function (pt, index) {
      var pos = map.projectLngLat(pt[0], pt[1]);
      if (index === 0) shape.moveTo(pos.x, pos.z);
      else shape.lineTo(pos.x, pos.z);
    });
    shape.closePath();
    return shape;
  }

  function addLandMass(THREE, map, outline, options) {
    var opts = options || {};
    var shape = outlineToShape(map, outline);
    var depth = opts.depth || 0.18;
    var y = opts.y || 0.04;

    var land = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.025,
        bevelSegments: 2
      }),
      new THREE.MeshStandardMaterial({
        map: createMapTexture(THREE, "land"),
        color: opts.color || 0xffffff,
        roughness: 0.72,
        metalness: 0.08,
        emissive: opts.emissive || 0x0a1f33,
        emissiveIntensity: 0.35
      })
    );
    land.rotation.x = -Math.PI / 2;
    land.position.y = y;
    addDecorMesh(land);

    var borderPoints = [];
    outline.forEach(function (pt) {
      var pos = map.projectLngLat(pt[0], pt[1]);
      borderPoints.push(new THREE.Vector3(pos.x, y + depth + 0.02, pos.z));
    });
    if (borderPoints.length > 2) {
      var curve = new THREE.CatmullRomCurve3(borderPoints, true, "catmullrom", 0.12);
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, borderPoints.length * 3, 0.018, 6, true),
        new THREE.MeshBasicMaterial({
          color: opts.borderColor || 0x5eead4,
          transparent: true,
          opacity: 0.85
        })
      );
      addDecorMesh(tube);

      var glow = new THREE.Mesh(
        new THREE.TubeGeometry(curve, borderPoints.length * 3, 0.045, 6, true),
        new THREE.MeshBasicMaterial({
          color: opts.glowColor || 0x14b8a6,
          transparent: true,
          opacity: 0.12
        })
      );
      addDecorMesh(glow);
    }
  }

  function buildChinaMapBase(THREE) {
    var map = getChinaMap();
    if (!map) return;

    var ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(map.MAP_WIDTH + 6, map.MAP_DEPTH + 5, 1, 1),
      new THREE.MeshStandardMaterial({
        map: createMapTexture(THREE, "ocean"),
        color: 0x9ec5e8,
        roughness: 0.92,
        metalness: 0.05,
        emissive: 0x041018,
        emissiveIntensity: 0.4
      })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.06;
    addDecorMesh(ocean);

    var rim = new THREE.Mesh(
      new THREE.RingGeometry(7.5, 8.8, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.04;
    addDecorMesh(rim);

    addLandMass(THREE, map, map.CHINA_OUTLINE, {
      depth: 0.2,
      color: 0xd4e8f8,
      emissive: 0x0c2438,
      borderColor: 0x7dd3fc,
      glowColor: 0x22d3ee
    });

    if (map.HAINAN_OUTLINE) {
      addLandMass(THREE, map, map.HAINAN_OUTLINE, {
        depth: 0.14,
        y: 0.03,
        color: 0xc8dff0,
        emissive: 0x0a1f33,
        borderColor: 0x67e8f9,
        glowColor: 0x06b6d4
      });
    }

    if (map.TAIWAN_OUTLINE) {
      addLandMass(THREE, map, map.TAIWAN_OUTLINE, {
        depth: 0.12,
        y: 0.03,
        color: 0xb8d4e8,
        emissive: 0x0a1f33,
        borderColor: 0x5eead4,
        glowColor: 0x14b8a6
      });
    }
  }

  function buildDistrictGround(THREE) {
    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(8, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a3350,
        roughness: 0.88,
        metalness: 0.12,
        emissive: 0x061018,
        emissiveIntensity: 0.5
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    addDecorMesh(ground);

    var grid = new THREE.GridHelper(16, 16, 0x1e4d6b, 0x122a40);
    grid.position.y = 0.01;
    if (grid.material) {
      grid.material.transparent = true;
      grid.material.opacity = 0.45;
    }
    addDecorMesh(grid);
  }

  function syncCityLabelLayer() {
    var layer = state.container && state.container.querySelector("[data-ar-map-labels]");
    if (!layer) return;

    if (state.drillLevel !== DRILL.CITY) {
      layer.innerHTML = "";
      layer.setAttribute("aria-hidden", "true");
      state.three.cityLabelEls = [];
      return;
    }

    layer.setAttribute("aria-hidden", "false");
    var cities = getCities();
    var existing = {};
    layer.querySelectorAll(".ar-city-label").forEach(function (el) {
      existing[el.getAttribute("data-city")] = el;
    });

    state.three.cityLabelEls = [];
    cities.forEach(function (city) {
      var el = existing[city.name];
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "ar-city-label";
        el.setAttribute("data-city", city.name);
        el.textContent = city.name;
        el.addEventListener("click", function () {
          if (state.selectedCity === city.name) selectCity(city.name, true);
          else selectCity(city.name, false);
        });
        layer.appendChild(el);
      }
      state.three.cityLabelEls.push({ city: city.name, el: el });
    });

    Object.keys(existing).forEach(function (name) {
      if (!cities.some(function (c) { return c.name === name; })) {
        existing[name].remove();
      }
    });

    updateCityLabelPositions();
  }

  function updateCityLabelPositions() {
    var layer = state.container && state.container.querySelector("[data-ar-map-labels]");
    var camera = state.three.camera;
    var canvas = state.three.renderer && state.three.renderer.domElement;
    if (!layer || !camera || !canvas || state.drillLevel !== DRILL.CITY) return;

    var rect = canvas.getBoundingClientRect();
    var vector = new THREE.Vector3();

    state.three.cityLabelEls.forEach(function (item) {
      var city = getCities().find(function (c) { return c.name === item.city; });
      if (!city) return;
      var pos = city.position || { x: 0, z: 0 };
      var height = state.three.cityLabelHeights[item.city] || 1.2;
      vector.set(pos.x, height + 0.55, pos.z);
      vector.project(camera);

      var visible = vector.z < 1 && vector.x >= -1 && vector.x <= 1 && vector.y >= -1 && vector.y <= 1;
      if (!visible) {
        item.el.style.display = "none";
        return;
      }

      var x = rect.left + (vector.x * 0.5 + 0.5) * rect.width;
      var y = rect.top + (-vector.y * 0.5 + 0.5) * rect.height;
      item.el.style.display = "block";
      item.el.style.left = x + "px";
      item.el.style.top = y + "px";
      item.el.classList.toggle("active", item.city === (state.selectedCity || getCities()[0] && getCities()[0].name));
    });
  }

  function computeActiveScope(sceneData) {
    if (!sceneData || !sceneData.drillMetrics) return sceneData && sceneData.activeScope ? sceneData.activeScope : null;
    var dm = sceneData.drillMetrics;
    var brand = dm.brand || {};
    var dateRange = dm.dateRange || sceneData.dateRange || {};

    if (state.drillLevel === DRILL.POI && state.selectedPoiId) {
      var poi = (dm.pois || []).find(function (p) { return p.id === state.selectedPoiId; });
      if (poi) {
        var district = (dm.districts || []).find(function (d) { return d.pois.indexOf(poi.id) >= 0; });
        return {
          level: "poi",
          label: poi.name,
          breadcrumb: [brand.brandName, poi.city, district && district.name, poi.name].filter(Boolean).join(" / "),
          metrics: poi.metrics,
          dateRange: dateRange
        };
      }
    }
    if (state.drillLevel >= DRILL.DISTRICT && state.selectedDistrictId) {
      var dist = (dm.districts || []).find(function (d) { return d.id === state.selectedDistrictId; });
      if (dist) {
        return {
          level: "district",
          label: dist.name,
          breadcrumb: [brand.brandName, dist.city, dist.name].join(" / "),
          metrics: {
            storeCount: dist.storeCount,
            exposure: dist.exposure,
            visits: dist.visits,
            dealClicks: dist.dealClicks,
            visitRate: dist.visitRate,
            dealClickRate: dist.dealClickRate
          },
          dateRange: dateRange
        };
      }
    }
    if (state.selectedCity) {
      var city = (dm.cities || []).find(function (c) { return c.name === state.selectedCity; });
      if (city) {
        return {
          level: "city",
          label: city.name,
          breadcrumb: [brand.brandName, city.name].join(" / "),
          metrics: {
            gmv: city.gmv,
            roi: city.roi,
            verifiedRate: city.verifiedRate,
            storeCount: city.storeCount,
            paidOrders: city.paidOrders,
            verifiedOrders: city.verifiedOrders,
            avgOrderValue: city.avgOrderValue
          },
          dateRange: dateRange
        };
      }
    }
    return {
      level: "brand",
      label: brand.brandName || sceneData.brandName || "品牌",
      breadcrumb: brand.brandName || sceneData.brandName || "海底捞",
      metrics: {
        gtv: brand.gtv,
        gmv: brand.gmv,
        verifiedRate: brand.verifiedRate,
        storeCount: brand.storeCount,
        paidOrders: brand.paidOrders,
        verifiedOrders: brand.verifiedOrders
      },
      dateRange: dateRange
    };
  }

  function emitSelectionChange(sceneData) {
    var scope = computeActiveScope(sceneData);
    if (typeof state.onSelectionChange === "function") {
      state.onSelectionChange({
        drillLevel: state.drillLevel,
        selectedCity: state.selectedCity,
        selectedDistrictId: state.selectedDistrictId,
        selectedPoiId: state.selectedPoiId,
        timeFilter: Object.assign({}, state.timeFilter),
        scope: scope,
        scene: sceneData
      });
    }
  }

  function renderScopeMetrics(sceneData) {
    var scope = computeActiveScope(sceneData);
    if (!scope || !scope.metrics) return "";
    var m = scope.metrics;
    var cards = [];
    var period = scope.dateRange && scope.dateRange.label
      ? scope.dateRange.label
      : (scope.dateRange && scope.dateRange.range ? scope.dateRange.range : "2024-01-01 至 2026-06-30");

    if (scope.level === "brand" || scope.level === "city") {
      if (m.gtv != null) cards.push(metric("GTV", formatCompact(m.gtv)));
      if (m.gmv != null) cards.push(metric("GMV", formatCompact(m.gmv)));
      if (m.verifiedRate != null) cards.push(metric("核销率", formatPercent(m.verifiedRate)));
      if (m.roi != null) cards.push(metric("ROI", formatNumber(m.roi)));
      if (m.storeCount != null) cards.push(metric("门店数", String(m.storeCount)));
    } else if (scope.level === "district") {
      cards.push(metric("门店数", String(m.storeCount || 0)));
      cards.push(metric("曝光", formatCompact(m.exposure || 0)));
      cards.push(metric("访问", formatCompact(m.visits || 0)));
      cards.push(metric("进店率", formatPercent(m.visitRate || 0)));
    } else {
      cards.push(metric("曝光", formatCompact(m.exposure || 0)));
      cards.push(metric("访问", formatCompact(m.visits || 0)));
      cards.push(metric("套餐点击", formatCompact(m.dealClicks || 0)));
      cards.push(metric("停留", formatNumber(m.avgStaySeconds || 0) + "s"));
    }

    return (
      '<div class="ar-scope-panel">' +
      '<div class="ar-scope-head">' +
      "<strong>" + escapeHtml(scope.breadcrumb || scope.label) + "</strong>" +
      '<span class="ar-scope-period">' + escapeHtml(period) + "</span>" +
      "</div>" +
      '<div class="ar-scope-metrics">' + cards.join("") + "</div>" +
      "</div>"
    );
  }

  function renderTimeFilter(sceneData) {
    if (!sceneData) return "";
    if (!sceneData.drillSource || !global.BrandPilotDrillMetrics) {
      return (
        '<div class="ar-time-filter-inner ar-time-filter--loading">' +
        '<span class="ar-time-label">统计周期</span>' +
        '<span class="ar-time-current">' + escapeHtml((sceneData.dateRange && sceneData.dateRange.label) || "加载中…") + "</span>" +
        '<span class="ar-time-grain">沙盘数据同步中</span>' +
        "</div>"
      );
    }
    var months = global.BrandPilotDrillMetrics.listMonthOptions(sceneData.drillSource);
    var filter = state.timeFilter || {};
    var monthOptions = months.map(function (item) {
      var selected = item.value === filter.monthKey ? " selected" : "";
      return '<option value="' + escapeAttr(item.value) + '"' + selected + ">" + escapeHtml(item.label) + "</option>";
    }).join("");
    var rangePresets = [
      { id: "h1-2026", label: "2026年上半年" },
      { id: "y2026", label: "2026年至今" },
      { id: "full", label: "全量累计" },
      { id: "custom", label: "自定义区间" }
    ];
    var presetOptions = rangePresets.map(function (item) {
      var selected = filter.preset === item.id ? " selected" : "";
      return '<option value="' + escapeAttr(item.id) + '"' + selected + ">" + escapeHtml(item.label) + "</option>";
    }).join("");
    var fromMonth = (filter.from || "2024-01").slice(0, 7);
    var toMonth = (filter.to || "2026-06").slice(0, 7);
    var monthMode = filter.mode !== "range";
    var customRange = filter.preset === "custom";

    return (
      '<div class="ar-time-filter-inner">' +
      '<div class="ar-time-filter-group">' +
      '<label class="ar-time-label">统计周期</label>' +
      '<div class="ar-time-mode">' +
      '<button type="button" class="ar-time-mode-btn' + (monthMode ? " active" : "") + '" data-time-mode="month">按月</button>' +
      '<button type="button" class="ar-time-mode-btn' + (!monthMode ? " active" : "") + '" data-time-mode="range">区间</button>' +
      "</div>" +
      "</div>" +
      '<div class="ar-time-filter-group ar-time-month-wrap"' + (monthMode ? "" : ' hidden') + ">" +
      '<select class="ar-time-select" data-ar-month-select aria-label="选择月份">' +
      monthOptions +
      "</select>" +
      "</div>" +
      '<div class="ar-time-filter-group ar-time-range-wrap"' + (monthMode ? ' hidden' : "") + ">" +
      '<select class="ar-time-select" data-ar-range-preset aria-label="区间预设">' +
      presetOptions +
      "</select>" +
      '<div class="ar-time-custom"' + (customRange ? "" : ' hidden') + ">" +
      '<input type="month" class="ar-time-input" data-ar-range-from value="' + escapeAttr(fromMonth) + '" min="2024-01" max="2026-06" aria-label="起始月" />' +
      '<span class="ar-time-sep">至</span>' +
      '<input type="month" class="ar-time-input" data-ar-range-to value="' + escapeAttr(toMonth) + '" min="2024-01" max="2026-06" aria-label="结束月" />' +
      "</div>" +
      "</div>" +
      '<div class="ar-time-filter-summary">' +
      '<span class="ar-time-current">' + escapeHtml((sceneData.dateRange && sceneData.dateRange.label) || "") + "</span>" +
      '<span class="ar-time-grain">' + escapeHtml((sceneData.dateRange && sceneData.dateRange.grain) || "") + "</span>" +
      "</div>" +
      "</div>"
    );
  }

  function applyTimeFilter() {
    if (!state.sceneBase || !state.sceneBase.drillSource) return;
    rebuildSceneFromFilter();
    syncSelectionDefaults();
    refreshShell(state.currentScene);
    syncMapView(state.currentScene);
  }

  function monthEndFromInput(value) {
    if (!value) return "2026-06-30";
    var parts = String(value).split("-");
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var lastDay = new Date(year, month, 0).getDate();
    return year + "-" + String(month).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");
  }

  function readTimeFilterFromDom() {
    var root = state.container && state.container.querySelector("[data-ar-time-filter]");
    if (!root) return;
    var modeBtn = root.querySelector(".ar-time-mode-btn.active");
    var mode = modeBtn ? modeBtn.getAttribute("data-time-mode") : "month";
    var monthSelect = root.querySelector("[data-ar-month-select]");
    var presetSelect = root.querySelector("[data-ar-range-preset]");
    var fromInput = root.querySelector("[data-ar-range-from]");
    var toInput = root.querySelector("[data-ar-range-to]");
    if (mode === "month") {
      state.timeFilter = {
        mode: "month",
        monthKey: monthSelect ? monthSelect.value : "",
        from: "",
        to: "",
        preset: ""
      };
      return;
    }
    var preset = presetSelect ? presetSelect.value : "h1-2026";
    var from = fromInput ? fromInput.value + "-01" : "2024-01-01";
    var to = toInput ? monthEndFromInput(toInput.value) : "2026-06-30";
    if (preset !== "custom") {
      state.timeFilter = {
        mode: "range",
        monthKey: "",
        from: "",
        to: "",
        preset: preset
      };
      return;
    }
    state.timeFilter = {
      mode: "range",
      monthKey: "",
      from: from,
      to: to,
      preset: "custom"
    };
  }

  function renderHeader(sceneData) {
    var scope = computeActiveScope(sceneData);
    var title = scope && scope.level !== "brand" ? scope.label + " · 经营沙盘" : (sceneData.topicLabel || "经营沙盘");
    var hint = sceneData.topicHint || "";
    if (scope && scope.level !== "brand") {
      hint = scope.breadcrumb + " · " + ((scope.dateRange && scope.dateRange.range) || "");
    }
    var guide =
      '<div class="ar-interaction-guide">' +
      "<span>① 切换统计周期</span>" +
      "<span>② 点城市选中指标</span>" +
      "<span>③ 再点下钻商圈/门店</span>" +
      "</div>";
    return (
      '<div class="map-header ar-header">' +
      '<div><span class="map-kicker">AR 展厅 · ' + escapeHtml(sceneData.brandName || "品牌") + "</span>" +
      "<h3>" + escapeHtml(title) + "</h3>" +
      (hint ? '<p class="map-topic-hint">' + escapeHtml(hint) + "</p>" : "") +
      guide +
      "</div>" +
      '<div class="ar-level-tag">' + escapeHtml(levelLabel()) + "</div>" +
      "</div>"
    );
  }

  function levelLabel() {
    if (state.drillLevel === DRILL.CITY) return "全国城市地图";
    if (state.drillLevel === DRILL.DISTRICT) return "商圈视图 · " + state.selectedCity;
    return "门店视图 · " + districtName(state.selectedDistrictId);
  }

  function renderBreadcrumb(sceneData) {
    var parts = [
      '<button type="button" data-crumb="root"' +
      (state.drillLevel === DRILL.CITY && !state.selectedCity ? ' class="active"' : "") +
      ">全国</button>"
    ];
    if (state.selectedCity) {
      parts.push('<span class="ar-crumb-sep">/</span>');
      parts.push(
        '<button type="button" data-crumb="city"' +
        (state.drillLevel === DRILL.CITY ? ' class="active"' : "") +
        ">" + escapeHtml(state.selectedCity) + "</button>"
      );
    }
    if (state.selectedDistrictId && state.drillLevel >= DRILL.DISTRICT) {
      parts.push('<span class="ar-crumb-sep">/</span>');
      parts.push(
        '<button type="button" data-crumb="district"' +
        (state.drillLevel === DRILL.DISTRICT ? ' class="active"' : "") +
        ">" + escapeHtml(districtName(state.selectedDistrictId)) + "</button>"
      );
    }
    if (state.selectedPoiId && state.drillLevel === DRILL.POI) {
      var poi = (state.currentScene && state.currentScene.pois || []).find(function (p) {
        return p.id === state.selectedPoiId;
      });
      parts.push('<span class="ar-crumb-sep">/</span>');
      parts.push(
        '<button type="button" data-crumb="poi" class="active">' +
        escapeHtml((poi && poi.name) || "门店") +
        "</button>"
      );
    }
    return parts.join("");
  }

  function renderTopicInsights(sceneData) {
    var blocks = [renderScopeMetrics(sceneData)];
    var scope = computeActiveScope(sceneData);
    var funnelSource = sceneData.funnelBrand || sceneData.funnel || [];
    var funnel = funnelSource;
    if (scope && scope.level !== "brand" && funnelSource.length) {
      var ratio = scope.level === "city" ? 0.18 : scope.level === "district" ? 0.06 : 0.02;
      funnel = funnelSource.map(function (item) {
        return { stage: item.stage, value: Math.round(Number(item.value || 0) * ratio) };
      });
    }
    if (funnel && funnel.length) {
      var maxValue = funnel.reduce(function (max, item) {
        return Math.max(max, Number(item.value) || 0);
      }, 1);
      var funnelBars = funnel.map(function (item) {
        var value = Number(item.value) || 0;
        var width = Math.max(8, Math.round((value / maxValue) * 100));
        return (
          '<div class="map-funnel-item">' +
          "<span>" + escapeHtml(item.stage || "阶段") + "</span>" +
          '<div class="map-funnel-bar"><i style="width:' + width + '%"></i></div>' +
          "<em>" + formatCompact(value) + "</em>" +
          "</div>"
        );
      }).join("");
      blocks.push('<div class="map-funnel-strip">' + funnelBars + "</div>");
    }
    if (sceneData.competitors && sceneData.competitors.length) {
      var platformCards = sceneData.competitors.map(function (item) {
        return (
          '<div class="map-competitor-card">' +
          "<strong>" + escapeHtml(item.name || "平台") + "</strong>" +
          "<span>份额 " + formatPercent(item.marketShare || 0) + "</span>" +
          "<span>核销 " + formatPercent(item.verificationRate || 0) + "</span>" +
          "</div>"
        );
      }).join("");
      blocks.push(
        '<div class="ar-compare-block">' +
        '<div class="ar-compare-title">平台对比 · 美团 vs 抖音</div>' +
        '<div class="map-competitor-strip">' + platformCards + "</div></div>"
      );
    }
    if (sceneData.brandPeerBenchmarks && sceneData.brandPeerBenchmarks.ownBrand) {
      var peer = sceneData.brandPeerBenchmarks;
      var peerPeriod =
        (sceneData.drillMetrics && sceneData.drillMetrics.dateRange && sceneData.drillMetrics.dateRange.label) ||
        peer.month ||
        "";
      var brandCards = [peer.ownBrand, peer.peerBrand].map(function (item) {
        return (
          '<div class="map-competitor-card">' +
          "<strong>" + escapeHtml(item.name || "品牌") + "</strong>" +
          "<span>GTV " + formatCompact(item.gtv || 0) + "</span>" +
          "<span>客单 " + formatNumber(item.avgOrderValue || 0) + "元</span>" +
          "<span>核销 " + formatPercent(item.verifiedRate || 0) + "</span>" +
          "</div>"
        );
      }).join("");
      blocks.push(
        '<div class="ar-compare-block">' +
        '<div class="ar-compare-title">品牌竞品 · 海底捞 vs 呷哺呷哺' +
        (peerPeriod ? ' <span class="ar-compare-period">（' + escapeHtml(peerPeriod) + "）</span>" : "") +
        "</div>" +
        '<div class="map-competitor-strip">' + brandCards + "</div></div>"
      );
    }
    if (!blocks.filter(Boolean).length) return "";
    return '<div class="map-topic-insights ar-topic-insights">' + blocks.filter(Boolean).join("") + "</div>";
  }

  function renderDataSpec(sceneData) {
    var spec = sceneData && sceneData.dataSpec;
    if (!spec) return "";
    return '<div class="map-data-spec"><p class="data-spec-line">' + escapeHtml(spec.footnote || spec.shortLine || "") + "</p></div>";
  }

  function renderDetailDock(sceneData) {
    if (state.drillLevel === DRILL.CITY) {
      var cities = getCities().slice().sort(function (a, b) {
        return (b.gmv || 0) - (a.gmv || 0);
      });
      var city = cities.find(function (c) { return c.name === state.selectedCity; }) || cities[0];
      if (!city) {
        return '<div class="ar-detail-empty">暂无城市数据</div>';
      }
      var periodLabel = (sceneData.dateRange && sceneData.dateRange.label) || "";
      var cityCards = cities.map(function (item) {
        var active = item.name === city.name;
        return (
          '<button type="button" class="ar-detail-card' + (active ? " active" : "") + '" data-city-name="' + escapeAttr(item.name) + '">' +
          "<strong>" + escapeHtml(item.name) + "</strong>" +
          "<span>GMV " + formatCompact(item.gmv || 0) + "</span>" +
          "<span>核销 " + formatPercent(item.verifiedRate || 0) + "</span>" +
          "<span>ROI " + formatNumber(item.roi || 0) + "</span>" +
          '<span class="ar-detail-actions">' +
          '<em class="ar-select-hint">' + (active ? "已选中 · 指标已联动" : "点击选中") + "</em>" +
          '<em class="ar-drill-hint" data-city-drill>下钻商圈 →</em>' +
          "</span>" +
          "</button>"
        );
      }).join("");
      return (
        '<div class="ar-detail-head">' +
        "<h4>城市经营分析" + (periodLabel ? " · " + escapeHtml(periodLabel) : "") + "</h4>" +
        "<p>点击城市卡片选中并联动指标；<strong>再次点击已选城市</strong>或点「下钻商圈」进入商圈视图</p>" +
        "</div>" +
        '<div class="ar-detail-grid">' + cityCards + "</div>"
      );
    }

    if (state.drillLevel === DRILL.DISTRICT) {
      var districts = districtsInCity(state.selectedCity);
      var district = districts.find(function (d) { return d.id === state.selectedDistrictId; }) || districts[0];
      if (!district) {
        return '<div class="ar-detail-empty">该城市暂无商圈数据</div>';
      }
      var districtCards = districts.map(function (item) {
        var active = item.id === district.id;
        return (
          '<button type="button" class="ar-detail-card' + (active ? " active" : "") + '" data-district-id="' + escapeAttr(item.id) + '">' +
          "<strong>" + escapeHtml(item.name) + "</strong>" +
          "<span>" + (item.storeCount || 0) + " 家门店</span>" +
          "<span>访问 " + formatCompact(item.visits || 0) + "</span>" +
          "<span>进店率 " + formatPercent(item.visitRate || 0) + "</span>" +
          '<span class="ar-detail-actions">' +
          '<em class="ar-select-hint">' + (active ? "已选中" : "点击选中") + "</em>" +
          '<em class="ar-drill-hint" data-district-drill>下钻门店 →</em>' +
          "</span>" +
          "</button>"
        );
      }).join("");
      return (
        '<div class="ar-detail-head">' +
        "<h4>" + escapeHtml(state.selectedCity) + " · " + escapeHtml(district.name) + "</h4>" +
        "<p>商圈聚合指标，与 3D 圆盘一一对应</p>" +
        "</div>" +
        '<div class="ar-detail-metrics">' +
        metric("门店数", String(district.storeCount || 0)) +
        metric("曝光", formatCompact(district.exposure || 0)) +
        metric("访问", formatCompact(district.visits || 0)) +
        metric("套餐点击", formatCompact(district.dealClicks || 0)) +
        "</div>" +
        '<div class="ar-detail-grid">' + districtCards + "</div>"
      );
    }

    var pois = poisInDistrict(state.selectedDistrictId);
    var poi = pois.find(function (p) { return p.id === state.selectedPoiId; }) || pois[0];
    if (!poi) {
      return '<div class="ar-detail-empty">该商圈暂无门店</div>';
    }
    var metrics = poi.metrics || {};
    var poiCards = pois.map(function (item) {
      var active = item.id === poi.id;
      return (
        '<button type="button" class="ar-detail-card ar-detail-card--poi' + (active ? " active" : "") + '" data-poi-id="' + escapeAttr(item.id) + '">' +
        "<strong>" + escapeHtml(item.name || "门店") + "</strong>" +
        "<span>访问 " + formatCompact((item.metrics && item.metrics.visits) || 0) + "</span>" +
        "</button>"
      );
    }).join("");
    return (
      '<div class="ar-detail-head">' +
      "<h4>" + escapeHtml(poi.name || "门店") + "</h4>" +
      "<p>" + escapeHtml([poi.city, poi.district, poi.businessArea].filter(Boolean).join(" · ")) + "</p>" +
      "</div>" +
      '<div class="ar-detail-metrics">' +
      metric("曝光", formatCompact(metrics.exposure || 0)) +
      metric("访问", formatCompact(metrics.visits || 0)) +
      metric("到店意向", formatCompact((metrics.navigateClicks || 0) + (metrics.phoneClicks || 0))) +
      metric("套餐点击率", formatPercent(metrics.dealClickRate || 0)) +
      "</div>" +
      '<div class="ar-detail-grid ar-detail-grid--poi">' + poiCards + "</div>"
    );
  }

  function metric(label, value) {
    return '<div class="store-metric"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
  }

  function bindShellControls() {
    if (!state.container || state.container.dataset.arBound) return;
    state.container.dataset.arBound = "1";

    state.container.addEventListener("click", function (event) {
      var modeBtn = event.target.closest("[data-time-mode]");
      if (modeBtn) {
        var root = state.container.querySelector("[data-ar-time-filter]");
        if (!root) return;
        root.querySelectorAll(".ar-time-mode-btn").forEach(function (btn) {
          btn.classList.toggle("active", btn === modeBtn);
        });
        var isMonth = modeBtn.getAttribute("data-time-mode") === "month";
        var monthWrap = root.querySelector(".ar-time-month-wrap");
        var rangeWrap = root.querySelector(".ar-time-range-wrap");
        if (monthWrap) monthWrap.hidden = !isMonth;
        if (rangeWrap) rangeWrap.hidden = isMonth;
        readTimeFilterFromDom();
        applyTimeFilter();
        return;
      }
      var back = event.target.closest("[data-ar-back]");
      if (back) {
        drillUp();
        return;
      }
      var crumb = event.target.closest("[data-crumb]");
      if (crumb) {
        var level = crumb.getAttribute("data-crumb");
        if (level === "root") goToLevel(DRILL.CITY, "", "", "");
        if (level === "city") goToLevel(DRILL.CITY, state.selectedCity, "", "");
        if (level === "district") goToLevel(DRILL.DISTRICT, state.selectedCity, state.selectedDistrictId, "");
        return;
      }
      var cityBtn = event.target.closest("[data-city-name]");
      if (cityBtn) {
        var cityName = cityBtn.getAttribute("data-city-name");
        if (event.target.closest("[data-city-drill]")) {
          selectCity(cityName, true);
        } else if (cityName === state.selectedCity && state.drillLevel === DRILL.CITY) {
          selectCity(cityName, true);
        } else {
          selectCity(cityName, false);
        }
        return;
      }
      var districtBtn = event.target.closest("[data-district-id]");
      if (districtBtn) {
        var districtId = districtBtn.getAttribute("data-district-id");
        if (event.target.closest("[data-district-drill]")) {
          selectDistrict(districtId, true);
        } else if (districtId === state.selectedDistrictId && state.drillLevel === DRILL.DISTRICT) {
          selectDistrict(districtId, true);
        } else if (state.drillLevel >= DRILL.DISTRICT) {
          selectDistrict(districtId, false);
        }
        return;
      }
      var poiBtn = event.target.closest("[data-poi-id]");
      if (poiBtn && state.drillLevel === DRILL.POI) {
        selectPoi(poiBtn.getAttribute("data-poi-id") || "");
      }
    });

    state.container.addEventListener("change", function (event) {
      if (!event.target.closest("[data-ar-time-filter]")) return;
      var presetSelect = event.target.closest("[data-ar-range-preset]");
      if (presetSelect) {
        var root = state.container.querySelector("[data-ar-time-filter]");
        var customWrap = root && root.querySelector(".ar-time-custom");
        if (customWrap) customWrap.hidden = presetSelect.value !== "custom";
      }
      readTimeFilterFromDom();
      applyTimeFilter();
    });
  }

  function goToLevel(level, city, districtId, poiId) {
    state.drillLevel = level;
    state.selectedCity = city || "";
    state.selectedDistrictId = districtId || "";
    state.selectedPoiId = poiId || "";
    syncSelectionDefaults();
    render();
  }

  function drillUp() {
    if (state.drillLevel === DRILL.POI) {
      goToLevel(DRILL.DISTRICT, state.selectedCity, state.selectedDistrictId, "");
      return;
    }
    if (state.drillLevel === DRILL.DISTRICT) {
      goToLevel(DRILL.CITY, state.selectedCity, "", "");
    }
  }

  function selectCity(cityName, drill) {
    if (!cityName) return;
    state.selectedCity = cityName;
    var districts = districtsInCity(cityName);
    state.selectedDistrictId = districts[0] ? districts[0].id : "";
    state.selectedPoiId = "";
    state.drillLevel = drill ? DRILL.DISTRICT : DRILL.CITY;
    if (drill && !districts.length) state.drillLevel = DRILL.CITY;
    render();
  }

  function selectDistrict(districtId, drill) {
    if (!districtId) return;
    state.selectedDistrictId = districtId;
    var pois = poisInDistrict(districtId);
    state.selectedPoiId = pois[0] ? pois[0].id : "";
    state.drillLevel = drill ? DRILL.POI : DRILL.DISTRICT;
    if (drill && !pois.length) state.drillLevel = DRILL.DISTRICT;
    render();
  }

  function selectPoi(poiId) {
    state.selectedPoiId = poiId;
    refreshShell(state.currentScene);
    highlightMeshes();
    emitSelectionChange(state.currentScene);
  }

  function initThree() {
    if (!global.THREE) return;
    var canvas = state.container.querySelector("#ar-three-canvas");
    if (!canvas) return;

    disposeThree();
    var THREE = global.THREE;
    var width = canvas.clientWidth || 640;
    var height = canvas.clientHeight || 360;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
    }

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071525);
    scene.fog = new THREE.FogExp2(0x071525, 0.038);

    var camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 200);
    updateCamera();

    scene.add(new THREE.HemisphereLight(0x7dd3fc, 0x0a1628, 0.55));
    scene.add(new THREE.AmbientLight(0x1e3a5f, 0.35));
    var dir = new THREE.DirectionalLight(0xe0f2fe, 0.95);
    dir.position.set(8, 14, 6);
    scene.add(dir);
    var rim = new THREE.DirectionalLight(0x5eead4, 0.35);
    rim.position.set(-6, 8, -10);
    scene.add(rim);

    state.three.renderer = renderer;
    state.three.scene = scene;
    state.three.camera = camera;
    state.three.meshes = [];
    state.three.selectable = [];
    state.three.decorMeshes = [];
    state.three.animMeshes = [];
    state.three.clock = 0;

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    startLoop();
  }

  function rebuildThreeScene() {
    if (!state.three.scene || !global.THREE) return;
    var THREE = global.THREE;

    state.three.selectable.forEach(function (mesh) {
      state.three.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    state.three.selectable = [];
    clearDecorMeshes();

    if (state.drillLevel === DRILL.CITY) {
      return;
    } else if (state.drillLevel === DRILL.DISTRICT) {
      buildDistrictGround(THREE);
      buildDistrictMeshes(THREE);
      state.three.orbit.radius = 10;
    } else {
      buildDistrictGround(THREE);
      buildPoiMeshes(THREE);
      state.three.orbit.radius = 7;
    }
    updateCamera();
    highlightMeshes();
    syncCityLabelLayer();
  }

  function buildCityMeshes(THREE) {
    var cities = getCities();
    var map = getChinaMap();
    var maxGmv = cities.reduce(function (max, c) { return Math.max(max, c.gmv || 0); }, 1);
    state.three.cityLabelHeights = {};

    cities.forEach(function (city, index) {
      var pos = city.position || (map ? map.cityMapPosition(city.name) : layoutOnRing(index, cities.length, 5.5));
      var height = 0.5 + (city.gmv || 0) / maxGmv * 2.2;
      var active = city.name === (state.selectedCity || cities[0] && cities[0].name);
      var userData = { type: "city", id: city.name, label: city.name };
      state.three.cityLabelHeights[city.name] = 0.35 + height;

      var halo = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.5, 32),
        new THREE.MeshBasicMaterial({
          color: active ? 0xffc300 : 0xff6633,
          transparent: true,
          opacity: active ? 0.55 : 0.18,
          side: THREE.DoubleSide
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(pos.x, 0.22, pos.z);
      halo.userData = userData;
      state.three.scene.add(halo);
      state.three.selectable.push(halo);
      state.three.animMeshes.push({ mesh: halo, kind: "halo", active: active });

      var stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.1, height, 8),
        new THREE.MeshStandardMaterial({
          color: active ? 0xffc300 : 0xffd54f,
          roughness: 0.25,
          metalness: 0.45,
          emissive: active ? 0xf5b800 : 0xffa000,
          emissiveIntensity: active ? 0.55 : 0.22,
          transparent: true,
          opacity: 0.92
        })
      );
      stem.position.set(pos.x, 0.22 + height / 2, pos.z);
      stem.userData = userData;
      state.three.scene.add(stem);
      state.three.selectable.push(stem);

      var cap = new THREE.Mesh(
        new THREE.OctahedronGeometry(active ? 0.14 : 0.11, 0),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: active ? 0xffc300 : 0xffa000,
          emissiveIntensity: active ? 0.9 : 0.45,
          roughness: 0.2,
          metalness: 0.3
        })
      );
      cap.position.set(pos.x, 0.22 + height + 0.12, pos.z);
      cap.userData = userData;
      state.three.scene.add(cap);
      state.three.selectable.push(cap);
      state.three.animMeshes.push({ mesh: cap, kind: "cap", active: active });

      if (active) {
        var beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.14, 0.5, 8, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xffc300,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide
          })
        );
        beam.position.set(pos.x, 0.22 + height + 0.35, pos.z);
        beam.userData = userData;
        state.three.scene.add(beam);
        state.three.animMeshes.push({ mesh: beam, kind: "beam", active: true });
      }
    });
  }

  function buildDistrictMeshes(THREE) {
    var districts = districtsInCity(state.selectedCity);
    districts.forEach(function (district, index) {
      var pos = layoutOnRing(index, districts.length, 4.2);
      var active = district.id === state.selectedDistrictId;
      var size = 0.55 + Math.min(1.2, (district.visits || 0) / 200000);
      var mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(size, size * 1.15, 0.35, 6),
        new THREE.MeshStandardMaterial({
          color: active ? 0x14b8a6 : 0x64748b,
          roughness: 0.5,
          metalness: 0.2,
          emissive: active ? 0x065f46 : 0x000000,
          emissiveIntensity: active ? 0.2 : 0
        })
      );
      mesh.position.set(pos.x, 0.2, pos.z);
      mesh.userData = { type: "district", id: district.id, label: district.name };
      state.three.scene.add(mesh);
      state.three.selectable.push(mesh);

      var pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.5 + (district.storeCount || 1) * 0.15, 0.25),
        new THREE.MeshStandardMaterial({ color: active ? 0xffc300 : 0xffd54f })
      );
      pillar.position.set(pos.x, 0.65, pos.z);
      pillar.userData = mesh.userData;
      state.three.scene.add(pillar);
      state.three.selectable.push(pillar);
    });
  }

  function buildPoiMeshes(THREE) {
    var pois = poisInDistrict(state.selectedDistrictId);
    var maxVisits = pois.reduce(function (max, p) { return Math.max(max, (p.metrics && p.metrics.visits) || 0); }, 1);
    pois.forEach(function (poi, index) {
      var pos = layoutOnRing(index, pois.length, 3.2);
      var visits = (poi.metrics && poi.metrics.visits) || 0;
      var scale = 0.28 + (visits / maxVisits) * 0.35;
      var active = poi.id === state.selectedPoiId;
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(scale, 20, 20),
        new THREE.MeshStandardMaterial({
          color: active ? 0xf59e0b : 0x2563eb,
          roughness: 0.35,
          metalness: 0.25,
          emissive: active ? 0x92400e : 0x000000,
          emissiveIntensity: active ? 0.25 : 0
        })
      );
      mesh.position.set(pos.x, scale + 0.15, pos.z);
      mesh.userData = { type: "poi", id: poi.id, label: poi.name };
      state.three.scene.add(mesh);
      state.three.selectable.push(mesh);
    });
  }

  function layoutOnRing(index, total, radius) {
    if (total <= 1) return { x: 0, z: 0 };
    var angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  }

  function highlightMeshes() {
    state.three.selectable.forEach(function (mesh) {
      var data = mesh.userData || {};
      var active = false;
      if (data.type === "city") active = data.id === (state.selectedCity || getCities()[0] && getCities()[0].name);
      if (data.type === "district") active = data.id === state.selectedDistrictId;
      if (data.type === "poi") active = data.id === state.selectedPoiId;
      if (mesh.material && mesh.material.emissive) {
        mesh.material.emissiveIntensity = active ? 0.28 : (data.type === "city" ? 0.08 : 0.05);
      }
    });
    updateCityLabelPositions();
  }

  function onPointerDown(event) {
    state.three.dragging = true;
    state.three.pointerDown = { x: event.clientX, y: event.clientY };
    state.three.lastX = event.clientX;
    state.three.lastY = event.clientY;
  }

  function onPointerMove(event) {
    if (!state.three.dragging) return;
    var dx = event.clientX - state.three.lastX;
    var dy = event.clientY - state.three.lastY;
    state.three.lastX = event.clientX;
    state.three.lastY = event.clientY;
    state.three.orbit.theta -= dx * 0.008;
    state.three.orbit.phi = Math.max(0.35, Math.min(1.45, state.three.orbit.phi + dy * 0.008));
    updateCamera();
  }

  function onPointerUp(event) {
    if (!state.three.dragging) return;
    state.three.dragging = false;
    var origin = state.three.pointerDown || { x: event.clientX, y: event.clientY };
    var dx = event.clientX - origin.x;
    var dy = event.clientY - origin.y;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      pickAt(event.clientX, event.clientY);
    }
  }

  function pickAt(clientX, clientY) {
    if (!state.three.renderer || !global.THREE) return;
    var THREE = global.THREE;
    var canvas = state.three.renderer.domElement;
    var rect = canvas.getBoundingClientRect();
    var mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, state.three.camera);
    var hits = raycaster.intersectObjects(state.three.selectable, false);
    if (!hits.length) return;
    var data = hits[0].object.userData || {};
    if (data.type === "city") {
      if (state.drillLevel === DRILL.CITY && state.selectedCity === data.id) {
        selectCity(data.id, true);
      } else {
        selectCity(data.id, false);
      }
    } else if (data.type === "district") {
      if (state.drillLevel === DRILL.DISTRICT && state.selectedDistrictId === data.id) {
        selectDistrict(data.id, true);
      } else {
        selectDistrict(data.id, false);
      }
    } else if (data.type === "poi") {
      selectPoi(data.id);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    state.three.orbit.radius = Math.max(5, Math.min(22, state.three.orbit.radius + event.deltaY * 0.01));
    updateCamera();
  }

  function updateCamera() {
    var cam = state.three.camera;
    var o = state.three.orbit;
    if (!cam) return;
    cam.position.x = o.radius * Math.sin(o.phi) * Math.cos(o.theta);
    cam.position.y = o.radius * Math.cos(o.phi);
    cam.position.z = o.radius * Math.sin(o.phi) * Math.sin(o.theta);
    cam.lookAt(0, state.drillLevel === DRILL.CITY ? 1.2 : 0.4, 0);
  }

  function startLoop() {
    cancelAnimationFrame(state.three.frameId);
    function tick() {
      state.three.frameId = requestAnimationFrame(tick);
      state.three.clock += 0.016;
      var t = state.three.clock;
      (state.three.animMeshes || []).forEach(function (item) {
        if (!item.mesh) return;
        if (item.kind === "halo") {
          var pulse = item.active ? 1 + Math.sin(t * 3.2) * 0.08 : 1;
          item.mesh.scale.set(pulse, pulse, pulse);
          if (item.mesh.material) {
            item.mesh.material.opacity = item.active
              ? 0.42 + Math.sin(t * 3.2) * 0.18
              : 0.14 + Math.sin(t * 1.5 + 1) * 0.04;
          }
        } else if (item.kind === "cap" && item.active) {
          item.mesh.rotation.y = t * 1.2;
        } else if (item.kind === "beam") {
          item.mesh.material.opacity = 0.14 + Math.sin(t * 4) * 0.08;
        }
      });
      if (state.three.renderer && state.three.scene && state.three.camera) {
        state.three.renderer.render(state.three.scene, state.three.camera);
        if (state.drillLevel === DRILL.CITY) updateCityLabelPositions();
      }
    }
    tick();
  }

  function resize() {
    if (global.BrandPilotEchartsMap) global.BrandPilotEchartsMap.resize();
    var canvas = state.container && state.container.querySelector("#ar-three-canvas");
    var renderer = state.three.renderer;
    var camera = state.three.camera;
    if (!canvas || !renderer || !camera) return;
    var width = canvas.clientWidth || 640;
    var height = canvas.clientHeight || 360;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function enterXR() {
    if (!navigator.xr || !state.three.renderer) {
      return Promise.reject(new Error("当前浏览器或设备不支持 WebXR。"));
    }
    return navigator.xr.isSessionSupported("immersive-vr").then(function (supported) {
      if (!supported) throw new Error("当前设备不支持沉浸式 VR。");
      return navigator.xr.requestSession("immersive-vr");
    }).then(function (session) {
      state.three.xrSession = session;
      state.three.renderer.xr.enabled = true;
      return state.three.renderer.xr.setSession(session);
    });
  }

  function disposeThree() {
    if (global.BrandPilotEchartsMap) global.BrandPilotEchartsMap.dispose();
    cancelAnimationFrame(state.three.frameId);
    if (state.three.xrSession) {
      try { state.three.xrSession.end(); } catch (e) { /* ignore */ }
    }
    state.three.selectable.forEach(function (mesh) {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    if (state.three.renderer) {
      state.three.renderer.dispose();
    }
    state.three = {
      renderer: null,
      scene: null,
      camera: null,
      frameId: 0,
      clock: 0,
      meshes: [],
      selectable: [],
      orbit: { theta: 0.55, phi: 0.92, radius: 17 },
      dragging: false,
      lastX: 0,
      lastY: 0,
      xrSession: null,
      decorMeshes: [],
      animMeshes: [],
      cityLabelEls: [],
      cityLabelHeights: {}
    };
  }

  function getCities() {
    return (state.currentScene && state.currentScene.cities) || [];
  }

  function getDistricts() {
    return (state.currentScene && state.currentScene.districts) || [];
  }

  function getPois() {
    return (state.currentScene && state.currentScene.pois) || [];
  }

  function districtsInCity(cityName) {
    return getDistricts().filter(function (d) { return d.city === cityName; });
  }

  function districtsInScope() {
    if (state.drillLevel === DRILL.CITY) return getDistricts();
    return districtsInCity(state.selectedCity);
  }

  function poisInDistrict(districtId) {
    var district = getDistricts().find(function (d) { return d.id === districtId; });
    if (!district) return [];
    return getPois().filter(function (p) {
      return p.city === district.city && (p.businessArea || "核心商圈") === district.name;
    });
  }

  function poisInScope() {
    if (state.drillLevel !== DRILL.POI) return [];
    return poisInDistrict(state.selectedDistrictId);
  }

  function districtName(districtId) {
    var district = getDistricts().find(function (d) { return d.id === districtId; });
    return (district && district.name) || "商圈";
  }

  function formatCompact(value) {
    var number = Number(value || 0);
    if (number >= 10000) return (number / 10000).toFixed(number >= 100000 ? 0 : 1) + "万";
    return Math.round(number).toLocaleString("zh-CN");
  }

  function formatPercent(value) {
    var number = Number(value || 0);
    return (number * 100).toFixed(number >= 0.1 ? 1 : 2) + "%";
  }

  function formatNumber(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number)) return "0";
    return number >= 100 ? Math.round(number).toLocaleString("zh-CN") : number.toFixed(1).replace(/\.0$/, "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function dispose() {
    disposeThree();
    if (state.container) state.container.innerHTML = "";
    state.container = null;
    state.currentScene = null;
    state.sceneBase = null;
    state.shellReady = false;
    state.drillLevel = DRILL.CITY;
    state.selectedCity = "";
    state.selectedDistrictId = "";
    state.selectedPoiId = "";
  }

  global.BrandPilotAR = {
    init: init,
    update: update,
    resetSelection: resetSelection,
    showCityMap: showCityMap,
    enterXR: enterXR,
    resize: resize,
    dispose: dispose,
    setSelectionHandler: function (handler) {
      state.onSelectionChange = typeof handler === "function" ? handler : null;
    },
    getSelection: function () {
      return {
        drillLevel: state.drillLevel,
        selectedCity: state.selectedCity,
        selectedDistrictId: state.selectedDistrictId,
        selectedPoiId: state.selectedPoiId,
        timeFilter: Object.assign({}, state.timeFilter),
        scope: computeActiveScope(state.currentScene)
      };
    },
    getSceneData: function () {
      return state.currentScene;
    },
    selectCity: function (cityName, drill) {
      selectCity(cityName, Boolean(drill));
    },
    selectDistrict: function (districtId, drill) {
      selectDistrict(districtId, Boolean(drill));
    },
    applyTimeFilter: function (filter) {
      if (!filter || !state.sceneBase) return;
      state.timeFilter = Object.assign({}, filter);
      rebuildSceneFromFilter();
      syncSelectionDefaults();
      render();
    },
    getTimeFilter: function () {
      return Object.assign({}, state.timeFilter);
    },
    scheduleMapResize: scheduleMapResize
  };
})(window);
