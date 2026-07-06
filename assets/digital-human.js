/**
 * BrandPilot 数字人播报层
 * - 浏览器 TTS（speechSynthesis）
 * - 口播脚本分镜字幕
 * - Canvas 虚拟形象动画
 * - MediaRecorder 视频导出（含字幕画面）
 */
(function (global) {
  "use strict";

  var state = {
    canvas: null,
    ctx: null,
    script: null,
    sceneIndex: 0,
    speaking: false,
    utterance: null,
    animId: null,
    pulse: 0,
    recorder: null,
    chunks: [],
    recording: false,
    statusEl: null,
    subtitleEl: null,
    scriptEl: null
  };

  function init(options) {
    state.canvas = options.canvas;
    state.ctx = state.canvas.getContext("2d");
    state.statusEl = options.statusEl;
    state.subtitleEl = options.subtitleEl;
    state.scriptEl = options.scriptEl;
    drawFrame("待命");
    loop();
  }

  function setScript(liveScript) {
    state.script = liveScript || null;
    state.sceneIndex = 0;
    if (state.scriptEl) {
      if (!liveScript) {
        state.scriptEl.innerHTML = "<p class='dh-empty'>生成提案或完成分析后，这里会出现数字人口播脚本。</p>";
      } else {
        var html = "<h3>" + escapeHtml(liveScript.title || "数字人口播") + "</h3>";
        html += "<p class='dh-meta'>总时长约 " + (liveScript.totalDurationSec || 0) + " 秒 · " +
          ((liveScript.scenes || []).length) + " 个分镜</p>";
        html += "<ol class='dh-scene-list'>";
        (liveScript.scenes || []).forEach(function (scene, index) {
          html += "<li data-index='" + index + "'><strong>" + escapeHtml(scene.title) +
            "</strong><span>" + escapeHtml(scene.narration) + "</span></li>";
        });
        html += "</ol>";
        state.scriptEl.innerHTML = html;
      }
    }
    setSubtitle(liveScript && liveScript.scenes && liveScript.scenes[0]
      ? liveScript.scenes[0].narration
      : "等待口播内容…");
    setStatus(liveScript ? "脚本就绪" : "未加载脚本");
  }

  function speak() {
    if (!state.script || !state.script.scenes || !state.script.scenes.length) {
      setStatus("请先完成一次分析，获取口播脚本");
      return;
    }
    if (!global.speechSynthesis) {
      setStatus("当前浏览器不支持语音合成");
      return;
    }
    stop();
    state.speaking = true;
    state.sceneIndex = 0;
    speakScene(0);
  }

  function speakScene(index) {
    var scenes = state.script.scenes;
    if (index >= scenes.length) {
      state.speaking = false;
      setStatus("播报完成");
      drawFrame("完成");
      return;
    }

    state.sceneIndex = index;
    highlightScene(index);
    var scene = scenes[index];
    setSubtitle(scene.narration);
    setStatus("正在播报：" + scene.title);
    drawFrame(scene.title);

    var utterance = new SpeechSynthesisUtterance(scene.narration);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = function () {
      if (!state.speaking) return;
      speakScene(index + 1);
    };
    utterance.onerror = function () {
      state.speaking = false;
      setStatus("播报中断");
    };
    state.utterance = utterance;
    global.speechSynthesis.speak(utterance);
  }

  function stop() {
    state.speaking = false;
    if (global.speechSynthesis) global.speechSynthesis.cancel();
    setStatus("已停止");
  }

  function startRecording() {
    if (!state.canvas || !state.canvas.captureStream) {
      setStatus("当前环境不支持视频导出");
      return;
    }
    if (state.recording) return;

    state.chunks = [];
    var stream = state.canvas.captureStream(30);
    var options = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      options.mimeType = "video/webm;codecs=vp9";
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      options.mimeType = "video/webm";
    }

    try {
      state.recorder = new MediaRecorder(stream, options);
    } catch (err) {
      setStatus("无法创建录制器：" + err.message);
      return;
    }

    state.recorder.ondataavailable = function (event) {
      if (event.data && event.data.size > 0) state.chunks.push(event.data);
    };
    state.recorder.onstop = function () {
      var blob = new Blob(state.chunks, { type: state.recorder.mimeType || "video/webm" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "BrandPilot_DigitalHuman_" + new Date().toISOString().slice(0, 10) + ".webm";
      a.click();
      URL.revokeObjectURL(url);
      state.recording = false;
      setStatus("视频已导出");
    };

    state.recorder.start(200);
    state.recording = true;
    setStatus("正在录制画面…建议同步点击“开始播报”");
    speak();
  }

  function stopRecording() {
    if (state.recorder && state.recording) {
      state.recorder.stop();
      stop();
    }
  }

  function loop() {
    state.pulse += 0.08;
    drawFrame(state.speaking ? "播报中" : "待命");
    state.animId = global.requestAnimationFrame(loop);
  }

  function drawFrame(badge) {
    if (!state.ctx || !state.canvas) return;
    var ctx = state.ctx;
    var w = state.canvas.width;
    var h = state.canvas.height;

    var gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e293b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // glow orb
    var cx = w * 0.5;
    var cy = h * 0.42;
    var radius = 70 + Math.sin(state.pulse) * (state.speaking ? 10 : 4);
    var glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius + 40);
    glow.addColorStop(0, state.speaking ? "rgba(52,211,153,0.55)" : "rgba(96,165,250,0.4)");
    glow.addColorStop(1, "rgba(15,23,42,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = state.speaking ? "#34d399" : "#60a5fa";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // face
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(cx - 22, cy - 10, 8, 0, Math.PI * 2);
    ctx.arc(cx + 22, cy - 10, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (state.speaking) {
      ctx.ellipse(cx, cy + 22, 18, 8 + Math.abs(Math.sin(state.pulse * 2)) * 6, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, cy + 18, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();

    // subtitle area
    ctx.fillStyle = "rgba(2,6,23,0.72)";
    ctx.fillRect(24, h - 110, w - 48, 78);
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.strokeRect(24, h - 110, w - 48, 78);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "16px Microsoft YaHei, sans-serif";
    wrapText(ctx, currentSubtitle(), 40, h - 80, w - 80, 22);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px Microsoft YaHei, sans-serif";
    ctx.fillText("BrandPilot 数字人 · " + badge, 40, 36);

    if (state.recording) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(w - 36, 32, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fecaca";
      ctx.fillText("REC", w - 70, 36);
    }
  }

  function currentSubtitle() {
    if (state.subtitleEl) return state.subtitleEl.textContent || "";
    return "";
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
        if (lineCount >= 2) {
          ctx.fillText(line + "…", x, y + lineCount * lineHeight);
          return;
        }
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }

  function highlightScene(index) {
    if (!state.scriptEl) return;
    var items = state.scriptEl.querySelectorAll("li");
    items.forEach(function (item) {
      item.classList.toggle("active", Number(item.getAttribute("data-index")) === index);
    });
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
    speak: speak,
    stop: stop,
    startRecording: startRecording,
    stopRecording: stopRecording
  };
})(window);
