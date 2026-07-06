/**
 * BrandPilot 真 AR 中国经营沙盘
 * Three.js renders the sandbox. WebXR enters markerless AR when supported.
 */
(function (global) {
  "use strict";

  var CITY_COLORS = {
    normal: 0xffc300,
    selected: 0xff6633,
    poi: 0x8b5cf6,
    line: 0x3b82f6,
    map: 0xffc300
  };

  var state = {
    container: null,
    rootEl: null,
    canvas: null,
    labelLayer: null,
    detailEl: null,
    statusEl: null,
    sceneData: null,
    geoJson: null,
    threeScene: null,
    camera: null,
    renderer: null,
    sandtable: null,
    mapGroup: null,
    cityGroup: null,
    poiGroup: null,
    cityMeshes: [],
    poiMeshes: [],
    raycaster: null,
    pointer: null,
    selectedCity: "",
    selectedPoiId: "",
    dragging: false,
    dragStart: null,
    rotationStart: null,
    autoRotate: true,
    xrSession: null,
    initialized: false
  };

  function init(container) {
    if (!container) return false;
    state.container = container;
    if (!state.rootEl) buildDom(container);
    if (!state.initialized) initThree();
    loadChinaMap().then(function () {
      rebuildScene();
    }).catch(function () {
      setStatus("中国地图资源加载失败，仍可查看城市 3D 柱体。");
      rebuildScene();
    });
    resize();
    animate();
    return true;
  }

  function update(sceneData) {
    state.sceneData = sceneData || null;
    var firstCity = getCities()[0];
    if (!state.selectedCity && firstCity) state.selectedCity = firstCity.name;
    if (state.selectedCity && !getCities().some(function (city) { return city.name === state.selectedCity; })) {
      state.selectedCity = firstCity ? firstCity.name : "";
    }
    rebuildScene();
  }

  function reset() {
    state.selectedCity = getCities()[0] ? getCities()[0].name : "";
    state.selectedPoiId = "";
    state.autoRotate = true;
    if (state.sandtable) {
      state.sandtable.rotation.set(0, 0, -0.14);
      state.sandtable.scale.set(1, 1, 1);
      state.sandtable.position.set(0, 0, 0);
    }
    renderDetail();
  }

  function buildDom(container) {
    container.innerHTML =
      '<div class="ar-sandbox-root">' +
      '<div class="ar-sandbox-viewport">' +
      '<canvas class="ar-sandbox-canvas" aria-label="3D 中国经营沙盘"></canvas>' +
      '<div class="ar-scan-line" aria-hidden="true"></div>' +
      '<div class="ar-sandbox-hud">' +
      '<span class="ar-xr-pill">Three.js</span>' +
      '<span class="ar-xr-pill">WebXR</span>' +
      '<span class="ar-xr-pill">AR.js ready</span>' +
      '</div>' +
      '<div class="ar-sandbox-status"></div>' +
      '<div class="ar-city-label-layer"></div>' +
      '</div>' +
      '<aside class="ar-sandbox-detail"></aside>' +
      '</div>';
    state.rootEl = container.querySelector(".ar-sandbox-root");
    state.canvas = container.querySelector(".ar-sandbox-canvas");
    state.labelLayer = container.querySelector(".ar-city-label-layer");
    state.detailEl = container.querySelector(".ar-sandbox-detail");
    state.statusEl = container.querySelector(".ar-sandbox-status");
    bindDomEvents();
    renderEmpty();
  }

  function initThree() {
    if (!global.THREE || !state.canvas) {
      setStatus("Three.js 未加载，无法启动 3D 沙盘。");
      return;
    }

    var THREE = global.THREE;
    state.threeScene = new THREE.Scene();
    state.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    state.camera.position.set(0, 7.8, 9.6);
    state.camera.lookAt(0, 0, 0);
    state.renderer = new THREE.WebGLRenderer({
      canvas: state.canvas,
      antialias: true,
      alpha: true
    });
    state.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.xr.enabled = true;

    state.raycaster = new THREE.Raycaster();
    state.pointer = new THREE.Vector2();

    var ambient = new THREE.AmbientLight(0xffffff, 1.1);
    var key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 8, 5);
    var rim = new THREE.PointLight(0xffc300, 1.2, 18);
    rim.position.set(-4, 4, 3);
    state.threeScene.add(ambient, key, rim);

    state.sandtable = new THREE.Group();
    state.sandtable.rotation.set(0, 0, -0.14);
    state.threeScene.add(state.sandtable);

    state.mapGroup = new THREE.Group();
    state.cityGroup = new THREE.Group();
    state.poiGroup = new THREE.Group();
    state.sandtable.add(state.mapGroup, state.cityGroup, state.poiGroup);

    addBase();
    state.initialized = true;
  }

  function addBase() {
    if (!global.THREE || !state.sandtable) return;
    var THREE = global.THREE;
    var baseMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.25,
      roughness: 0.55,
      transparent: true,
      opacity: 0.86
    });
    var base = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.8, 0.16, 96), baseMat);
    base.position.y = -0.12;
    base.userData.ignoreRaycast = true;
    state.sandtable.add(base);

    var grid = new THREE.GridHelper(10, 18, 0xffc300, 0x334155);
    grid.position.y = -0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.24;
    state.sandtable.add(grid);

    var halo = new THREE.Mesh(
      new THREE.TorusGeometry(5.85, 0.018, 10, 160),
      new THREE.MeshBasicMaterial({ color: 0xffc300, transparent: true, opacity: 0.72 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.02;
    state.sandtable.add(halo);
  }

  function loadChinaMap() {
    if (state.geoJson) return Promise.resolve(state.geoJson);
    return fetch("assets/geo/china.json")
      .then(function (resp) {
        if (!resp.ok) throw new Error("map load failed");
        return resp.json();
      })
      .then(function (geo) {
        state.geoJson = geo;
        return geo;
      });
  }

  function rebuildScene() {
    if (!state.initialized || !state.sandtable) return;
    clearGroup(state.mapGroup);
    clearGroup(state.cityGroup);
    clearGroup(state.poiGroup);
    state.cityMeshes = [];
    state.poiMeshes = [];
    drawChinaMap();
    drawCities();
    drawPoiLayer();
    renderDetail();
  }

  function drawChinaMap() {
    if (!state.geoJson || !global.THREE || !state.mapGroup) return;
    var THREE = global.THREE;
    var material = new THREE.LineBasicMaterial({
      color: CITY_COLORS.map,
      transparent: true,
      opacity: 0.92
    });
    var glowMaterial = new THREE.LineBasicMaterial({
      color: 0xffc300,
      transparent: true,
      opacity: 0.36
    });

    (state.geoJson.features || []).forEach(function (feature) {
      extractRings(feature.geometry).forEach(function (ring) {
        var points = simplifyRing(ring, 5).map(function (coord) {
          var pos = project(coord);
          return new THREE.Vector3(pos.x, 0.03, pos.z);
        });
        if (points.length < 2) return;
        var geometry = new THREE.BufferGeometry().setFromPoints(points);
        var line = new THREE.Line(geometry, material);
        var glow = new THREE.Line(geometry.clone(), glowMaterial);
        glow.position.y = 0.018;
        state.mapGroup.add(line, glow);
      });
    });
  }

  function drawCities() {
    if (!global.THREE || !state.cityGroup) return;
    var THREE = global.THREE;
    var cities = getCities();
    var maxGmv = Math.max.apply(null, cities.map(function (city) { return Number(city.gmv || 0); }).concat([1]));

    cities.forEach(function (city) {
      var pos = project(city.coordinate);
      var selected = city.name === state.selectedCity;
      var height = 0.45 + Math.sqrt(Number(city.gmv || 0) / maxGmv) * 2.3;
      var radius = selected ? 0.14 : 0.11;
      var geometry = new THREE.CylinderGeometry(radius, radius * 0.86, height, 24);
      var material = new THREE.MeshStandardMaterial({
        color: selected ? CITY_COLORS.selected : CITY_COLORS.normal,
        metalness: 0.55,
        roughness: 0.24,
        emissive: selected ? 0x7c2d12 : 0x5f4700,
        emissiveIntensity: selected ? 0.55 : 0.22
      });
      var mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(pos.x, height / 2 + 0.04, pos.z);
      mesh.userData = { type: "city", city: city, height: height };
      state.cityGroup.add(mesh);
      state.cityMeshes.push(mesh);

      var cap = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.14, 16, 12),
        new THREE.MeshBasicMaterial({ color: selected ? 0xfff7ad : 0xffffff })
      );
      cap.position.set(pos.x, height + 0.08, pos.z);
      cap.userData = { type: "city", city: city, height: height };
      state.cityGroup.add(cap);
      state.cityMeshes.push(cap);

      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(selected ? 0.42 : 0.3, 0.012, 8, 56),
        new THREE.MeshBasicMaterial({
          color: selected ? CITY_COLORS.selected : CITY_COLORS.line,
          transparent: true,
          opacity: selected ? 0.86 : 0.42
        })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pos.x, 0.08, pos.z);
      ring.userData.ignoreRaycast = true;
      state.cityGroup.add(ring);
    });
  }

  function drawPoiLayer() {
    if (!global.THREE || !state.poiGroup || !state.selectedCity) return;
    var THREE = global.THREE;
    var pois = getPois().filter(function (poi) { return poi.city === state.selectedCity; });
    pois.forEach(function (poi, index) {
      var pos = project(poi.coordinate);
      var selected = poi.id === state.selectedPoiId;
      var height = 0.14 + Math.min(0.52, Number(poi.metrics && poi.metrics.visits || 0) / 120000);
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(selected ? 0.09 : 0.065, 16, 12),
        new THREE.MeshStandardMaterial({
          color: selected ? 0xff6633 : CITY_COLORS.poi,
          emissive: selected ? 0xff6633 : 0x4c1d95,
          emissiveIntensity: selected ? 0.8 : 0.35
        })
      );
      mesh.position.set(pos.x, height + 0.12 + index * 0.002, pos.z);
      mesh.userData = { type: "poi", poi: poi };
      state.poiGroup.add(mesh);
      state.poiMeshes.push(mesh);
    });
  }

  function bindDomEvents() {
    if (!state.canvas) return;
    state.canvas.addEventListener("pointerdown", function (event) {
      state.dragging = true;
      state.autoRotate = false;
      state.dragStart = { x: event.clientX, y: event.clientY };
      state.rotationStart = {
        x: state.sandtable ? state.sandtable.rotation.x : 0,
        z: state.sandtable ? state.sandtable.rotation.z : -0.14
      };
      state.canvas.setPointerCapture(event.pointerId);
    });
    state.canvas.addEventListener("pointermove", function (event) {
      if (!state.dragging || !state.sandtable || !state.dragStart) return;
      var dx = event.clientX - state.dragStart.x;
      var dy = event.clientY - state.dragStart.y;
      state.sandtable.rotation.z = state.rotationStart.z + dx * 0.006;
      state.sandtable.rotation.x = clamp(state.rotationStart.x + dy * 0.004, -0.62, 0.42);
    });
    state.canvas.addEventListener("pointerup", function (event) {
      if (state.dragging && state.dragStart) {
        var moved = Math.abs(event.clientX - state.dragStart.x) + Math.abs(event.clientY - state.dragStart.y);
        if (moved < 6) pick(event);
      }
      state.dragging = false;
      state.dragStart = null;
    });
    state.canvas.addEventListener("wheel", function (event) {
      if (!state.sandtable) return;
      event.preventDefault();
      var next = clamp(state.sandtable.scale.x + (event.deltaY > 0 ? -0.06 : 0.06), 0.72, 1.65);
      state.sandtable.scale.set(next, next, next);
    }, { passive: false });

    if (state.detailEl) {
      state.detailEl.addEventListener("click", function (event) {
        var cityBtn = event.target.closest("[data-ar-city]");
        var poiBtn = event.target.closest("[data-ar-poi]");
        if (cityBtn) {
          selectCity(cityBtn.getAttribute("data-ar-city"));
        } else if (poiBtn) {
          state.selectedPoiId = poiBtn.getAttribute("data-ar-poi");
          rebuildScene();
        }
      });
    }
  }

  function pick(event) {
    if (!state.raycaster || !state.camera || !state.renderer) return;
    var rect = state.canvas.getBoundingClientRect();
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.pointer, state.camera);
    var intersects = state.raycaster.intersectObjects(state.cityMeshes.concat(state.poiMeshes), false);
    var hit = intersects.find(function (item) { return !item.object.userData.ignoreRaycast; });
    if (!hit) return;
    if (hit.object.userData.type === "city") {
      selectCity(hit.object.userData.city.name);
    } else if (hit.object.userData.type === "poi") {
      state.selectedPoiId = hit.object.userData.poi.id;
      rebuildScene();
    }
  }

  function selectCity(name) {
    state.selectedCity = name || "";
    state.selectedPoiId = "";
    state.autoRotate = false;
    rebuildScene();
  }

  function renderEmpty() {
    if (!state.detailEl) return;
    state.detailEl.innerHTML =
      '<div class="ar-detail-empty">' +
      '<strong>等待经营数据</strong><br>' +
      '发送问题后，这里会出现 3D 中国沙盘和城市下钻。' +
      '</div>';
  }

  function renderDetail() {
    if (!state.detailEl) return;
    var cities = getCities();
    if (!cities.length) {
      renderEmpty();
      return;
    }
    var city = cities.find(function (item) { return item.name === state.selectedCity; }) || cities[0];
    state.selectedCity = city.name;
    var districts = getDistricts().filter(function (item) { return item.city === city.name; });
    var pois = getPois().filter(function (item) { return item.city === city.name; });
    var selectedPoi = pois.find(function (poi) { return poi.id === state.selectedPoiId; });

    var html =
      '<div class="ar-detail-head">' +
      '<span>城市下钻</span>' +
      '<h4>' + escapeHtml(city.name) + ' · GMV ' + formatCompact(city.gmv) + '</h4>' +
      '<p>ROI ' + formatNumber(city.roi, 2) +
      ' · 核销率 ' + formatPercent(city.verifiedRate) +
      ' · 门店 ' + formatCompact(city.storeCount) + '</p>' +
      '</div>' +
      '<div class="ar-detail-metrics">' +
      metricCard("GMV", formatCompact(city.gmv)) +
      metricCard("已支付", formatCompact(city.paidOrders)) +
      metricCard("已核销", formatCompact(city.verifiedOrders)) +
      metricCard("客单价", city.avgOrderValue ? "¥" + formatNumber(city.avgOrderValue, 0) : "-") +
      '</div>' +
      '<div class="ar-city-switch">';
    cities.forEach(function (item) {
      html +=
        '<button type="button" class="' + (item.name === city.name ? "active" : "") +
        '" data-ar-city="' + escapeAttr(item.name) + '">' +
        escapeHtml(item.name) +
        '</button>';
    });
    html += '</div>';

    html += '<h5>商圈 / 门店下钻</h5><div class="ar-detail-grid">';
    if (districts.length) {
      districts.forEach(function (district) {
        html +=
          '<div class="ar-detail-card">' +
          '<strong>' + escapeHtml(district.name) + '</strong>' +
          '<span>' + escapeHtml(district.district || city.name) +
          ' · ' + formatCompact(district.visits) + ' 访问</span>' +
          '<em class="ar-drill-hint">' + formatCompact(district.storeCount) + ' 家门店</em>' +
          '</div>';
      });
    } else {
      html += '<div class="ar-detail-empty">暂无商圈数据</div>';
    }
    html += '</div>';

    html += '<h5>门店点位</h5><div class="ar-detail-grid ar-detail-grid--poi">';
    if (pois.length) {
      pois.forEach(function (poi) {
        var active = selectedPoi && selectedPoi.id === poi.id;
        html +=
          '<button type="button" class="ar-detail-card' + (active ? " active" : "") +
          '" data-ar-poi="' + escapeAttr(poi.id) + '">' +
          '<strong>' + escapeHtml(shortName(poi.name)) + '</strong>' +
          '<span>' + escapeHtml(poi.businessArea || poi.district || city.name) + '</span>' +
          '<em class="ar-drill-hint">' + formatCompact(poi.metrics && poi.metrics.visits) + ' 访问</em>' +
          '</button>';
      });
    } else {
      html += '<div class="ar-detail-empty">暂无门店数据</div>';
    }
    html += '</div>';

    if (selectedPoi) {
      html +=
        '<div class="ar-poi-inspector">' +
        '<strong>' + escapeHtml(selectedPoi.name) + '</strong>' +
        '<div class="ar-detail-metrics">' +
        metricCard("曝光", formatCompact(selectedPoi.metrics && selectedPoi.metrics.exposure)) +
        metricCard("访问", formatCompact(selectedPoi.metrics && selectedPoi.metrics.visits)) +
        metricCard("团购点击", formatCompact(selectedPoi.metrics && selectedPoi.metrics.dealClicks)) +
        metricCard("停留", formatNumber(selectedPoi.metrics && selectedPoi.metrics.avgStaySeconds, 0) + "s") +
        '</div>' +
        '</div>';
    }

    state.detailEl.innerHTML = html;
  }

  function animate() {
    if (!state.renderer || !state.threeScene || !state.camera) return;
    state.renderer.setAnimationLoop(function () {
      if (state.autoRotate && state.sandtable && !state.xrSession) {
        state.sandtable.rotation.z += 0.0016;
      }
      updateLabels();
      state.renderer.render(state.threeScene, state.camera);
    });
  }

  function updateLabels() {
    if (!state.labelLayer || !state.camera || !state.canvas || !global.THREE) return;
    var labels = getCities().map(function (city) {
      var mesh = state.cityMeshes.find(function (item) {
        return item.userData && item.userData.type === "city" && item.userData.city.name === city.name;
      });
      if (!mesh) return "";
      var vector = mesh.position.clone();
      vector.y += (mesh.userData.height || 1) * 0.52 + 0.25;
      state.sandtable.localToWorld(vector);
      vector.project(state.camera);
      var x = (vector.x * 0.5 + 0.5) * state.canvas.clientWidth;
      var y = (-vector.y * 0.5 + 0.5) * state.canvas.clientHeight;
      var visible = vector.z < 1 && x > -60 && x < state.canvas.clientWidth + 60 && y > -40 && y < state.canvas.clientHeight + 40;
      if (!visible) return "";
      return '<button type="button" class="ar-city-label' +
        (city.name === state.selectedCity ? " active" : "") +
        '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) +
        'px" data-ar-city="' + escapeAttr(city.name) + '">' +
        escapeHtml(city.name) +
        '<small>' + formatCompact(city.gmv) + '</small></button>';
    }).join("");
    state.labelLayer.innerHTML = labels;
    Array.prototype.forEach.call(state.labelLayer.querySelectorAll("[data-ar-city]"), function (btn) {
      btn.onclick = function () { selectCity(btn.getAttribute("data-ar-city")); };
    });
  }

  function enterXR() {
    if (!state.renderer) return Promise.reject(new Error("3D 沙盘还没有初始化。"));
    if (!navigator.xr) {
      return Promise.reject(new Error("当前浏览器不支持 WebXR AR。请用 Android Chrome 或支持 WebXR 的移动浏览器访问 localhost/HTTPS。"));
    }
    return navigator.xr.isSessionSupported("immersive-ar").then(function (supported) {
      if (!supported) throw new Error("当前设备不支持 immersive-ar。桌面可继续使用 3D 沙盘预览。");
      return navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["hit-test", "dom-overlay"],
        domOverlay: state.container ? { root: state.container } : undefined
      });
    }).then(function (session) {
      state.xrSession = session;
      setStatus("WebXR AR 已启动：把手机对准桌面，3D 中国沙盘会悬浮在前方。");
      if (state.sandtable) {
        state.sandtable.scale.set(0.26, 0.26, 0.26);
        state.sandtable.position.set(0, -0.65, -1.15);
        state.sandtable.rotation.set(0, 0, -0.08);
      }
      session.addEventListener("end", function () {
        state.xrSession = null;
        setStatus("已退出 WebXR AR。");
        reset();
      });
      return state.renderer.xr.setSession(session);
    });
  }

  function enterMarkerAR() {
    if (!global.THREEx) {
      return Promise.reject(new Error("AR.js 脚本未加载成功。当前可先用 WebXR AR；如部署到 HTTPS，我可以继续接 Hiro/自定义 marker 识别。"));
    }
    return Promise.reject(new Error("AR.js Marker 模式已完成能力检测入口，下一步需要确认 marker 类型（Hiro 或品牌自定义图）和相机权限策略。当前版本优先使用 WebXR 真 AR。"));
  }

  function resize() {
    if (!state.renderer || !state.camera || !state.canvas) return;
    var rect = state.canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || state.canvas.clientWidth || 640);
    var height = Math.max(280, rect.height || state.canvas.clientHeight || 420);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height, false);
  }

  function getCities() {
    return (state.sceneData && state.sceneData.cities) || [];
  }

  function getDistricts() {
    return (state.sceneData && state.sceneData.districts) || [];
  }

  function getPois() {
    return (state.sceneData && state.sceneData.pois) || [];
  }

  function project(coord) {
    coord = coord || [105, 35];
    return {
      x: (Number(coord[0]) - 105) * 0.16,
      z: -(Number(coord[1]) - 34) * 0.18
    };
  }

  function extractRings(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return geometry.coordinates || [];
    if (geometry.type === "MultiPolygon") {
      return (geometry.coordinates || []).reduce(function (rings, polygon) {
        return rings.concat(polygon || []);
      }, []);
    }
    return [];
  }

  function simplifyRing(ring, step) {
    if (!ring || ring.length < 2) return [];
    var result = [];
    var sample = Math.max(1, step || 1);
    for (var i = 0; i < ring.length; i += sample) result.push(ring[i]);
    result.push(ring[ring.length - 1]);
    return result;
  }

  function clearGroup(group) {
    if (!group) return;
    while (group.children.length) {
      var child = group.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(function (mat) { mat.dispose(); });
        else child.material.dispose();
      }
    }
  }

  function setStatus(text) {
    if (!state.statusEl) return;
    state.statusEl.textContent = text || "";
    state.statusEl.classList.toggle("visible", Boolean(text));
  }

  function metricCard(label, value) {
    return '<div class="store-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function formatCompact(value) {
    var n = Number(value || 0);
    if (n >= 100000000) return (n / 100000000).toFixed(2).replace(/\.0+$/, "") + "亿";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    return Math.round(n).toLocaleString("zh-CN");
  }

  function formatNumber(value, digits) {
    var n = Number(value || 0);
    return n.toLocaleString("zh-CN", {
      maximumFractionDigits: digits == null ? 1 : digits,
      minimumFractionDigits: 0
    });
  }

  function formatPercent(value) {
    return ((Number(value || 0) * 100).toFixed(1)).replace(/\.0$/, "") + "%";
  }

  function shortName(value) {
    return String(value || "").replace(/^海底捞/, "").replace(/火锅/g, "").slice(0, 12) || "门店";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(text) {
    return escapeHtml(text);
  }

  global.BrandPilotAR = {
    init: init,
    update: update,
    reset: reset,
    resize: resize,
    enterXR: enterXR,
    enterMarkerAR: enterMarkerAR,
    getSceneData: function () {
      return state.sceneData;
    }
  };
})(window);
