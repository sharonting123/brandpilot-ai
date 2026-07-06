/**
 * BrandPilot 数字人播报层（百炼 DashScope）
 * - Qwen-TTS 语音合成
 * - wan2.2-s2v 对口型视频
 * - 字幕叠加与分镜脚本
 */
(function (global) {
  "use strict";

  var state = {
    canvas: null,
    ctx: null,
    videoEl: null,
    audioEl: null,
    videoShell: null,
    anchorPreview: null,
    subtitleOverlay: null,
    script: null,
    sceneIndex: 0,
    statusEl: null,
    subtitleEl: null,
    scriptEl: null,
    dashscopeConfigured: false,
    pollTimer: null,
    subtitleTimer: null,
    currentTaskId: null,
    currentVideoUrl: null,
    currentAudioUrl: null,
    currentSubtitles: [],
    generating: false
  };

  function init(options) {
    state.canvas = options.canvas || null;
    state.videoEl = options.videoEl || null;
    state.audioEl = options.audioEl || null;
    state.videoShell = options.videoShell || null;
    state.anchorPreview = options.anchorPreview || null;
    state.subtitleOverlay = options.subtitleOverlay || null;
    state.statusEl = options.statusEl;
    state.subtitleEl = options.subtitleEl;
    state.scriptEl = options.scriptEl;

    if (state.canvas) {
      state.ctx = state.canvas.getContext("2d");
      state.canvas.classList.remove("visible");
    }
    hideVideo();
    loadRuntimeConfig();
    bindMediaEvents();
  }

  function loadRuntimeConfig() {
    fetch("/api/config")
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        state.dashscopeConfigured = Boolean(data.dashscopeConfigured);
        if (data.digitalHumanAvatarUrl && state.anchorPreview) {
          state.anchorPreview.src = "assets/digital-human-anchor.jpg";
        }
        if (state.dashscopeConfigured) {
          var specs = data.digitalHumanAvatarSpecs;
          var specHint = specs
            ? "（参考图 " + specs.currentSize + "，支持 " + specs.minEdgePx + "–" + specs.maxEdgePx + "px）"
            : "";
          setStatus("主播形象已就绪" + specHint + " · 点击「生成百炼数字人」");
        } else {
          setStatus("未配置 DASHSCOPE_API_KEY · 仅可试听浏览器 TTS");
        }
      })
      .catch(function () {
        setStatus("无法读取配置，百炼状态未知");
      });
  }

  function bindMediaEvents() {
    if (state.videoEl) {
      state.videoEl.addEventListener("play", function () {
        startSubtitleSync(state.videoEl);
      });
      state.videoEl.addEventListener("pause", stopSubtitleSync);
      state.videoEl.addEventListener("ended", function () {
        stopSubtitleSync();
        setStatus("视频播放完成");
      });
    }
    if (state.audioEl) {
      state.audioEl.addEventListener("play", function () {
        startSubtitleSync(state.audioEl);
      });
      state.audioEl.addEventListener("pause", stopSubtitleSync);
      state.audioEl.addEventListener("ended", stopSubtitleSync);
    }
  }

  function setScript(liveScript) {
    state.script = liveScript || null;
    state.sceneIndex = 0;
    renderScriptPanel(liveScript);
    setSubtitle(
      liveScript && liveScript.scenes && liveScript.scenes[0]
        ? liveScript.scenes[0].narration
        : "等待口播内容…"
    );
    if (liveScript) {
      setStatus(state.dashscopeConfigured ? "脚本就绪 · 点击「生成百炼数字人」" : "脚本就绪");
    }
  }

  function renderScriptPanel(liveScript) {
    if (!state.scriptEl) return;
    if (!liveScript) {
      state.scriptEl.innerHTML = "<p class='dh-empty'>生成提案或完成分析后，这里会出现数字人口播脚本。</p>";
      return;
    }

    var html = "<h3>" + escapeHtml(liveScript.title || "数字人口播") + "</h3>";
    html += "<p class='dh-meta'>总时长约 " + (liveScript.totalDurationSec || 0) + " 秒 · " +
      ((liveScript.scenes || []).length) + " 个分镜 · 单段生成限约 20 秒</p>";
    html += "<ol class='dh-scene-list'>";
    (liveScript.scenes || []).forEach(function (scene, index) {
      html += "<li data-index='" + index + "'><button type='button' class='dh-scene-btn' data-index='" +
        index + "'>生成此镜</button><strong>" + escapeHtml(scene.title) +
        "</strong><span>" + escapeHtml(scene.narration) + "</span></li>";
    });
    html += "</ol>";
    state.scriptEl.innerHTML = html;

    state.scriptEl.querySelectorAll(".dh-scene-btn").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        var idx = Number(btn.getAttribute("data-index"));
        if (!Number.isFinite(idx)) return;
        state.sceneIndex = idx;
        highlightScene(idx);
        generate({ sceneIndex: idx });
      });
    });
  }

  function parseApiResponse(resp) {
    return resp.text().then(function (text) {
      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          if (resp.status === 504 || resp.status === 502) {
            throw new Error("数字人服务超时（" + resp.status + "），请稍后重试。");
          }
          if (resp.status >= 500) {
            throw new Error("数字人服务异常（" + resp.status + "），请稍后重试。");
          }
          throw new Error((text.slice(0, 160) || "服务器返回异常") + "（非 JSON 响应）");
        }
      } else {
        data = {};
      }
      if (!resp.ok) {
        throw new Error((data && data.message) || (data && data.error) || "请求失败 (" + resp.status + ")");
      }
      return data;
    });
  }

  function proxiedMediaUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    if (global.location && global.location.protocol === "https:" && /^http:\/\//i.test(rawUrl)) {
      return "/api/digital-human-media?u=" + encodeURIComponent(rawUrl);
    }
    return rawUrl;
  }

  function generate(options) {
    options = options || {};
    if (!state.script) {
      setStatus("请先完成一次分析，获取口播脚本");
      return;
    }
    if (!state.dashscopeConfigured) {
      setStatus("未配置 DASHSCOPE_API_KEY，无法调用百炼");
      return;
    }
    if (state.generating) {
      setStatus("正在生成中，请稍候…");
      return;
    }

    stop();
    state.generating = true;
    state.currentTaskId = null;
    state.currentVideoUrl = null;
    state.currentSubtitles = [];
    hideVideo();
    if (state.canvas) state.canvas.classList.remove("visible");
    if (state.anchorPreview) state.anchorPreview.classList.add("visible");
    drawFallback("生成中");
    setStatus("正在调用百炼 TTS + wan2.2-s2v…");

    var sceneIndex = Number.isFinite(options.sceneIndex) ? options.sceneIndex : state.sceneIndex;
    highlightScene(sceneIndex);

    fetch("/api/digital-human", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liveScript: state.script,
        sceneIndex: sceneIndex
      })
    })
      .then(function (resp) {
        return parseApiResponse(resp);
      })
      .then(function (data) {
        state.currentTaskId = data.taskId;
        state.currentAudioUrl = data.audioUrl || null;
        state.currentSubtitles = data.subtitles || [];
        if (data.text) setSubtitle(data.text);

        if (state.currentAudioUrl && state.audioEl) {
          state.audioEl.src = proxiedMediaUrl(state.currentAudioUrl);
          state.audioEl.classList.add("visible");
        }

        setStatus("任务已提交，百炼正在生成对口型视频（约 5–10 分钟），请勿关闭页面…");
        pollTask(data.taskId, Number(data.pollIntervalSec) || 15);
      })
      .catch(function (err) {
        state.generating = false;
        setStatus("生成失败：" + (err.message || "未知错误"));
        drawFallback("失败");
      });
  }

  function pollTask(taskId, intervalSec) {
    clearPoll();
    if (!taskId) {
      state.generating = false;
      return;
    }

    var tick = function () {
      fetch("/api/digital-human?taskId=" + encodeURIComponent(taskId))
        .then(function (resp) {
          return parseApiResponse(resp);
        })
        .then(function (data) {
          var status = data.taskStatus || "UNKNOWN";
          if (status === "PENDING" || status === "RUNNING") {
            setStatus("百炼生成中… " + status + "（约每 " + intervalSec + " 秒刷新）");
            drawFallback(status);
            return;
          }

          clearPoll();
          state.generating = false;

          if (status === "SUCCEEDED" && data.videoUrl) {
            showVideo(data.videoUrl);
            setStatus("对口型视频已生成");
            if (state.currentSubtitles.length) {
              startSubtitleSync(state.videoEl);
            }
            return;
          }

          var msg = data.message || status;
          setStatus("生成未成功：" + msg);
          drawFallback("失败");
        })
        .catch(function (err) {
          setStatus("轮询失败：" + (err.message || "网络错误") + "，将继续重试…");
        });
    };

    tick();
    state.pollTimer = global.setInterval(tick, intervalSec * 1000);
  }

  function clearPoll() {
    if (state.pollTimer) {
      global.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function showVideo(url) {
    state.currentVideoUrl = url;
    if (!state.videoEl) return;
    var playUrl = proxiedMediaUrl(url);
    state.videoEl.src = playUrl;
    state.videoEl.classList.add("visible");
    if (state.audioEl) {
      state.audioEl.pause();
      state.audioEl.classList.remove("visible");
    }
    if (state.canvas) state.canvas.classList.remove("visible");
    if (state.anchorPreview) state.anchorPreview.classList.remove("visible");
    if (state.videoShell) state.videoShell.classList.add("has-video");

    state.videoEl.load();
    state.videoEl.play().catch(function () {
      setStatus("对口型视频已生成，请点击播放器播放");
    });
  }

  function hideVideo() {
    if (state.videoEl) {
      state.videoEl.pause();
      state.videoEl.removeAttribute("src");
      state.videoEl.classList.remove("visible");
    }
    if (state.canvas) state.canvas.classList.remove("visible");
    if (state.anchorPreview) state.anchorPreview.classList.add("visible");
    if (state.videoShell) state.videoShell.classList.remove("has-video");
  }

  function speak() {
    if (state.currentAudioUrl && state.audioEl) {
      state.audioEl.src = proxiedMediaUrl(state.currentAudioUrl);
      state.audioEl.play().catch(function (err) {
        setStatus("音频播放失败：" + err.message);
      });
      setStatus("正在播放 TTS 预览（无口型，对口型请等视频生成完成）");
      return;
    }

    if (!state.script || !state.script.scenes || !state.script.scenes.length) {
      setStatus("请先完成一次分析，获取口播脚本");
      return;
    }
    if (!global.speechSynthesis) {
      setStatus("当前浏览器不支持语音合成");
      return;
    }

    stopTts();
    var scene = state.script.scenes[state.sceneIndex] || state.script.scenes[0];
    setSubtitle(scene.narration);
    setStatus("浏览器 TTS 试听：" + scene.title);
    drawFallback("试听");

    var utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.lang = "zh-CN";
    utterance.onend = function () {
      setStatus("试听结束");
      drawFallback("待命");
    };
    global.speechSynthesis.speak(utterance);
  }

  function stop() {
    clearPoll();
    stopSubtitleSync();
    stopTts();
    state.generating = false;
    if (state.videoEl) state.videoEl.pause();
    if (state.audioEl) state.audioEl.pause();
    setStatus("已停止");
    drawFallback("待命");
  }

  function stopTts() {
    if (global.speechSynthesis) global.speechSynthesis.cancel();
  }

  function downloadVideo() {
    if (!state.currentVideoUrl) {
      setStatus("暂无视频可下载，请先生成百炼数字人");
      return;
    }
    var a = document.createElement("a");
    a.href = proxiedMediaUrl(state.currentVideoUrl);
    a.download = "BrandPilot_DigitalHuman_" + new Date().toISOString().slice(0, 10) + ".mp4";
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
    setStatus("已开始下载视频");
  }

  function startSubtitleSync(mediaEl) {
    stopSubtitleSync();
    if (!mediaEl || !state.currentSubtitles.length) return;

    var tick = function () {
      if (!mediaEl || mediaEl.paused) return;
      var t = mediaEl.currentTime || 0;
      var line = findSubtitleLine(t);
      if (line) {
        setOverlaySubtitle(line.text);
        setSubtitle(line.text);
      }
    };

    tick();
    state.subtitleTimer = global.setInterval(tick, 200);
  }

  function stopSubtitleSync() {
    if (state.subtitleTimer) {
      global.clearInterval(state.subtitleTimer);
      state.subtitleTimer = null;
    }
    setOverlaySubtitle("");
  }

  function findSubtitleLine(timeSec) {
    var list = state.currentSubtitles || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (timeSec >= item.startSec && timeSec < item.endSec) return item;
    }
    return list.length ? list[list.length - 1] : null;
  }

  function setOverlaySubtitle(text) {
    if (state.subtitleOverlay) {
      state.subtitleOverlay.textContent = text || "";
      state.subtitleOverlay.classList.toggle("visible", Boolean(text));
    }
  }

  function highlightScene(index) {
    if (!state.scriptEl) return;
    state.scriptEl.querySelectorAll(".dh-scene-list li").forEach(function (item) {
      item.classList.toggle("active", Number(item.getAttribute("data-index")) === index);
    });
  }

  function drawFallback(badge) {
    if (!state.ctx || !state.canvas || state.videoEl && state.videoEl.classList.contains("visible")) return;
    var ctx = state.ctx;
    var w = state.canvas.width;
    var h = state.canvas.height;

    var gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e293b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px Microsoft YaHei, sans-serif";
    ctx.fillText("BrandPilot 百炼数字人 · " + badge, 40, 48);

    ctx.fillStyle = "#64748b";
    ctx.font = "14px Microsoft YaHei, sans-serif";
    wrapText(ctx, "配置 DASHSCOPE_API_KEY 后，将使用 Qwen-TTS + wan2.2-s2v 生成对口型视频。", 40, h * 0.42, w - 80, 22);

    if (state.generating) {
      ctx.fillStyle = "#34d399";
      ctx.font = "13px Microsoft YaHei, sans-serif";
      ctx.fillText("生成中，请勿关闭页面…", 40, h - 48);
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var chars = String(text || "").split("");
    var line = "";
    var lineCount = 0;
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lineCount * lineHeight);
        line = chars[i];
        lineCount += 1;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }

  function setSubtitle(text) {
    if (state.subtitleEl) state.subtitleEl.textContent = text || "";
  }

  function setStatus(text) {
    if (state.statusEl) state.statusEl.textContent = text || "";
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  global.BrandPilotDigitalHuman = {
    init: init,
    setScript: setScript,
    generate: generate,
    speak: speak,
    stop: stop,
    downloadVideo: downloadVideo
  };
})(window);
