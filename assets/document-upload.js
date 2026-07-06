/**
 * 聊天区文档上传与解析
 */
(function (global) {
  "use strict";

  var MAX_FILES = 3;
  var MAX_FILE_BYTES = 6 * 1024 * 1024;
  var TEXT_EXT = /\.(txt|md|markdown|html?|csv|json)$/i;

  var state = {
    items: []
  };

  function uid() {
    return "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("读取文件失败：" + file.name)); };
      reader.readAsText(file, "utf-8");
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var value = String(reader.result || "");
        var comma = value.indexOf(",");
        resolve(comma >= 0 ? value.slice(comma + 1) : value);
      };
      reader.onerror = function () { reject(new Error("读取文件失败：" + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  function stripHtml(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeLocalText(filename, text) {
    if (/\.html?$/i.test(filename)) return stripHtml(text);
    return String(text || "").replace(/\u0000/g, "").trim();
  }

  function parseLocally(file, text) {
    var normalized = normalizeLocalText(file.name, text);
    if (!normalized) throw new Error("未能从文档中提取文本：" + file.name);
    return {
      filename: file.name,
      format: (file.name.split(".").pop() || "txt").toLowerCase(),
      text: normalized,
      truncated: normalized.length > 48000,
      charCount: normalized.length
    };
  }

  function parseOnServer(file, contentBase64) {
    var headers = { "Content-Type": "application/json" };
    if (global.BrandPilotAuth && typeof global.BrandPilotAuth.authHeaders === "function") {
      headers = global.BrandPilotAuth.authHeaders(headers);
    }
    return fetch("/api/documents/parse", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        filename: file.name,
        contentBase64: contentBase64
      })
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) {
          throw new Error((data && data.message) || "文档解析失败");
        }
        return data;
      });
    });
  }

  function parseFile(file) {
    if (!file) return Promise.reject(new Error("未选择文件"));
    if (file.size > MAX_FILE_BYTES) {
      return Promise.reject(new Error(file.name + " 超过 6MB 上限"));
    }
    if (TEXT_EXT.test(file.name)) {
      return readFileAsText(file).then(function (text) {
        return parseLocally(file, text);
      });
    }
    return readFileAsBase64(file).then(function (base64) {
      return parseOnServer(file, base64);
    });
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.resolve([]);
    if (state.items.length >= MAX_FILES) {
      return Promise.reject(new Error("最多上传 " + MAX_FILES + " 个文档"));
    }

    var available = MAX_FILES - state.items.length;
    var batch = files.slice(0, available);
    return Promise.all(
      batch.map(function (file) {
        return parseFile(file).then(function (parsed) {
          var item = {
            id: uid(),
            filename: parsed.filename || file.name,
            format: parsed.format || "",
            text: parsed.text || "",
            charCount: parsed.charCount || (parsed.text || "").length,
            truncated: Boolean(parsed.truncated)
          };
          state.items.push(item);
          return item;
        });
      })
    );
  }

  function removeAttachment(id) {
    state.items = state.items.filter(function (item) { return item.id !== id; });
  }

  function clearAttachments() {
    state.items = [];
  }

  function getAttachments() {
    return state.items.map(function (item) {
      return {
        filename: item.filename,
        name: item.filename,
        format: item.format,
        text: item.text,
        charCount: item.charCount,
        truncated: item.truncated
      };
    });
  }

  function renderChips(container) {
    if (!container) return;
    if (!state.items.length) {
      container.innerHTML = "";
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.innerHTML = state.items.map(function (item) {
      var meta = item.format.toUpperCase() + " · " + item.charCount.toLocaleString("zh-CN") + " 字";
      if (item.truncated) meta += " · 已截断";
      return (
        '<span class="doc-chip" data-doc-id="' + escapeAttr(item.id) + '">' +
        '<span class="doc-chip-name" title="' + escapeAttr(item.filename) + '">' + escapeHtml(item.filename) + "</span>" +
        '<span class="doc-chip-meta">' + escapeHtml(meta) + "</span>" +
        '<button type="button" class="doc-chip-remove" data-doc-remove="' + escapeAttr(item.id) + '" aria-label="移除文档">×</button>' +
        "</span>"
      );
    }).join("");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  global.BrandPilotDocuments = {
    addFiles: addFiles,
    removeAttachment: removeAttachment,
    clearAttachments: clearAttachments,
    getAttachments: getAttachments,
    renderChips: renderChips,
    maxFiles: MAX_FILES
  };
})(typeof window !== "undefined" ? window : global);
