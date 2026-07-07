(function () {
  "use strict";

  var AR_SCENE_STORAGE_KEY = "brandpilot_ar_scene";
  var SESSION_STORAGE_KEY = "bp_current_session_id";
  var arStage = document.getElementById("arStage");
  var arMeta = document.getElementById("arMeta");
  var sandboxEmpty = document.getElementById("sandboxEmpty");
  var sandboxStagePanel = document.getElementById("sandboxStagePanel");
  var enterXrButton = document.getElementById("enterXrButton");
  var enterMarkerArButton = document.getElementById("enterMarkerArButton");
  var resetArButton = document.getElementById("resetArButton");

  function loadScenePayload() {
    try {
      var raw = sessionStorage.getItem(AR_SCENE_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function updateMeta(scene, payload) {
    if (!arMeta || !scene) return;
    var cityCount = scene.cities ? scene.cities.length : 0;
    var poiCount = scene.pois ? scene.pois.length : 0;
    var period = scene.dateRange && scene.dateRange.label ? scene.dateRange.label : "当前统计周期";
    var workflow = payload && payload.workflowLabel ? payload.workflowLabel + " · " : "";
    arMeta.textContent =
      workflow +
      (scene.brandName || "品牌") +
      " · " +
      period +
      " · " +
      cityCount +
      " 个城市柱 · " +
      poiCount +
      " 个门店点，可拖拽旋转、滚轮缩放、点击城市下钻。";
  }

  function bindControls() {
    if (enterXrButton) {
      enterXrButton.addEventListener("click", function () {
        if (!window.BrandPilotAR) return;
        window.BrandPilotAR.enterXR().catch(function (error) {
          alert(error.message || "当前设备暂不支持 WebXR AR。");
        });
      });
    }

    if (enterMarkerArButton) {
      enterMarkerArButton.addEventListener("click", function () {
        if (!window.BrandPilotAR) return;
        window.BrandPilotAR.enterMarkerAR().catch(function (error) {
          alert(error.message || "当前环境无法启动 Marker AR。");
        });
      });
    }

    if (resetArButton) {
      resetArButton.addEventListener("click", function () {
        if (window.BrandPilotAR && typeof window.BrandPilotAR.reset === "function") {
          window.BrandPilotAR.reset();
        }
      });
    }

    window.addEventListener("resize", function () {
      if (window.BrandPilotAR && typeof window.BrandPilotAR.resize === "function") {
        window.BrandPilotAR.resize();
      }
    });
  }

  function bindBackLink() {
    var backLink = document.getElementById("sandboxBackLink");
    var emptyLink = document.querySelector(".sandbox-empty .primary-button");
    [backLink, emptyLink].forEach(function (link) {
      if (!link || link.dataset.bound === "1") return;
      link.dataset.bound = "1";
      link.addEventListener("click", function (event) {
        event.preventDefault();
        window.location.href = "/";
      });
    });
  }

  function init() {
    bindControls();
    bindBackLink();

    var payload = loadScenePayload();
    var scene = payload && payload.scene;
    if (!scene || !window.BrandPilotAR || !arStage) {
      if (sandboxEmpty) sandboxEmpty.hidden = false;
      if (sandboxStagePanel) sandboxStagePanel.hidden = true;
      return;
    }

    if (sandboxEmpty) sandboxEmpty.hidden = true;
    if (sandboxStagePanel) sandboxStagePanel.hidden = false;

    window.BrandPilotAR.init(arStage);
    window.BrandPilotAR.update(scene);
    updateMeta(scene, payload);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
