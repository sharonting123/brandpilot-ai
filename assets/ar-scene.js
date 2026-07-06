/**
 * BrandPilot AR 城市展厅
 * Three.js 渲染城市柱 + 漏斗塔；支持桌面拖拽相机，以及 WebXR immersive-vr。
 */
(function (global) {
  "use strict";

  var state = {
    renderer: null,
    scene: null,
    camera: null,
    root: null,
    animationId: null,
    container: null,
    dragging: false,
    prevX: 0,
    prevY: 0,
    theta: 0.8,
    phi: 0.9,
    radius: 10,
    currentScene: null
  };

  function init(container) {
    if (!global.THREE) {
      console.warn("Three.js 未加载，AR 展厅不可用");
      return false;
    }
    if (state.renderer) {
      resize();
      return true;
    }

    state.container = container;
    var width = container.clientWidth || 640;
    var height = container.clientHeight || 480;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.xr.enabled = true;
    renderer.setClearColor(0x0b1220, 1);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1220, 12, 28);

    var camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(6, 5, 8);

    var ambient = new THREE.AmbientLight(0x9db7ff, 0.7);
    var key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(6, 10, 4);
    scene.add(ambient, key);

    var grid = new THREE.GridHelper(20, 20, 0x335577, 0x1b2a40);
    scene.add(grid);

    var floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x132033, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);

    var root = new THREE.Group();
    scene.add(root);

    state.renderer = renderer;
    state.scene = scene;
    state.camera = camera;
    state.root = root;

    bindPointer(renderer.domElement);
    global.addEventListener("resize", resize);
    animate();
    return true;
  }

  function bindPointer(el) {
    el.addEventListener("pointerdown", function (e) {
      state.dragging = true;
      state.prevX = e.clientX;
      state.prevY = e.clientY;
    });
    el.addEventListener("pointerup", function () {
      state.dragging = false;
    });
    el.addEventListener("pointerleave", function () {
      state.dragging = false;
    });
    el.addEventListener("pointermove", function (e) {
      if (!state.dragging) return;
      var dx = e.clientX - state.prevX;
      var dy = e.clientY - state.prevY;
      state.prevX = e.clientX;
      state.prevY = e.clientY;
      state.theta -= dx * 0.005;
      state.phi = Math.max(0.2, Math.min(1.4, state.phi + dy * 0.005));
      updateCamera();
    });
    el.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        state.radius = Math.max(5, Math.min(18, state.radius + e.deltaY * 0.01));
        updateCamera();
      },
      { passive: false }
    );
  }

  function updateCamera() {
    var x = state.radius * Math.sin(state.phi) * Math.cos(state.theta);
    var y = state.radius * Math.cos(state.phi);
    var z = state.radius * Math.sin(state.phi) * Math.sin(state.theta);
    state.camera.position.set(x, y, z);
    state.camera.lookAt(0, 1.2, 0);
  }

  function clearRoot() {
    if (!state.root) return;
    while (state.root.children.length) {
      var child = state.root.children[0];
      state.root.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
        else child.material.dispose();
      }
    }
  }

  function makeLabel(text, color) {
    var canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(10,18,32,0.75)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = color || "#4fd1c5";
    ctx.strokeRect(1, 1, 254, 62);
    ctx.fillStyle = "#e8f4ff";
    ctx.font = "24px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text || "").slice(0, 12), 128, 32);
    var texture = new THREE.CanvasTexture(canvas);
    var material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    var sprite = new THREE.Sprite(material);
    sprite.scale.set(1.8, 0.45, 1);
    return sprite;
  }

  function update(sceneData) {
    if (!state.root || !sceneData) return;
    state.currentScene = sceneData;
    clearRoot();

    var cities = sceneData.cities || [];
    var maxGmv = cities.reduce(function (m, c) { return Math.max(m, c.gmv || 0); }, 1);

    cities.forEach(function (city) {
      var height = 0.6 + ((city.gmv || 0) / maxGmv) * 3.5;
      var color = (city.roi || 0) >= 3 ? 0x22c55e : (city.roi || 0) >= 2 ? 0x3b82f6 : 0xf59e0b;
      var mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, height, 20),
        new THREE.MeshStandardMaterial({ color: color, roughness: 0.35, metalness: 0.25 })
      );
      var pos = city.position || { x: 0, y: 0, z: 0 };
      mesh.position.set(pos.x, height / 2, pos.z);
      state.root.add(mesh);

      var label = makeLabel(city.name + " " + Math.round((city.gmv || 0) / 10000) + "万", "#93c5fd");
      label.position.set(pos.x, height + 0.35, pos.z);
      state.root.add(label);
    });

    var funnel = sceneData.funnel || [];
    if (funnel.length) {
      var maxVal = funnel.reduce(function (m, f) { return Math.max(m, f.value || 0); }, 1);
      funnel.forEach(function (stage, index) {
        var ratio = Math.max(0.15, (stage.value || 0) / maxVal);
        var radius = 1.8 * ratio;
        var y = 0.35 + index * 0.55;
        var ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.08, 10, 40),
          new THREE.MeshStandardMaterial({
            color: 0xa78bfa,
            emissive: 0x4c1d95,
            emissiveIntensity: 0.35
          })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(-4.5, y, -3.2);
        state.root.add(ring);
      });

      var funnelLabel = makeLabel("搜索→核销 漏斗塔", "#c4b5fd");
      funnelLabel.position.set(-4.5, funnel.length * 0.55 + 0.8, -3.2);
      state.root.add(funnelLabel);
    }

    (sceneData.pois || []).forEach(function (poi) {
      var dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xf472b6, emissive: 0x9d174d, emissiveIntensity: 0.3 })
      );
      var pos = poi.position || { x: 0, y: 0.2, z: 0 };
      dot.position.set(pos.x + 4.2, pos.y + 0.2, pos.z + 2.4);
      state.root.add(dot);
    });

    var score = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x065f46,
        emissiveIntensity: 0.4,
        wireframe: false
      })
    );
    score.position.set(0, 4.2, 0);
    state.root.add(score);

    var scoreLabel = makeLabel("机会分 " + (sceneData.opportunityScore || 0), "#6ee7b7");
    scoreLabel.position.set(0, 5.0, 0);
    state.root.add(scoreLabel);

    updateCamera();
  }

  function animate() {
    state.animationId = state.renderer.setAnimationLoop(function () {
      if (state.root) state.root.rotation.y += 0.0015;
      state.renderer.render(state.scene, state.camera);
    });
  }

  function resize() {
    if (!state.renderer || !state.container) return;
    var width = state.container.clientWidth || 640;
    var height = state.container.clientHeight || 480;
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height);
  }

  async function enterXR() {
    if (!navigator.xr || !state.renderer) {
      throw new Error("当前浏览器不支持 WebXR，可在桌面继续拖拽漫游。");
    }
    var supported = await navigator.xr.isSessionSupported("immersive-vr");
    if (!supported) {
      throw new Error("设备不支持 immersive-vr 会话。");
    }
    var session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor"]
    });
    await state.renderer.xr.setSession(session);
  }

  function dispose() {
    if (state.renderer) {
      state.renderer.setAnimationLoop(null);
      state.renderer.dispose();
    }
    state.renderer = null;
    state.scene = null;
    state.camera = null;
    state.root = null;
  }

  global.BrandPilotAR = {
    init: init,
    update: update,
    enterXR: enterXR,
    resize: resize,
    dispose: dispose,
    getSceneData: function () {
      return state.currentScene;
    }
  };
})(window);
