/**
 * 品牌 / 城市 / 平台 颜色注册表
 * 图表与 3D 沙盘统一按实体名称取色，未知实体用稳定哈希色。
 */
(function (global) {
  "use strict";

  var FALLBACK_PALETTE = [
    "#2563EB",
    "#F97316",
    "#16A34A",
    "#DC2626",
    "#7C3AED",
    "#0891B2",
    "#CA8A04",
    "#BE185D"
  ];

  var SEMANTIC = {
    previous: "#64748B",
    current: "#F97316",
    map: "#FFC300",
    selected: "#FF6633"
  };

  var BRANDS = {
    haidilao: { id: "haidilao", name: "海底捞", color: "#E53935", aliases: ["海底捞", "Haidilao"] },
    xiabuxiabu: { id: "xiabuxiabu", name: "呷哺呷哺", color: "#FF8F00", aliases: ["呷哺呷哺", "呷哺", "Xiabuxiabu"] }
  };

  var PLATFORMS = {
    meituan: { id: "meituan", name: "美团", color: "#FFC300", aliases: ["美团", "美团到餐", "Meituan"] },
    douyin: { id: "douyin", name: "抖音", color: "#111111", aliases: ["抖音", "Douyin", "TikTok"] },
    eleme: { id: "eleme", name: "饿了么", color: "#0097FF", aliases: ["饿了么", "Eleme"] }
  };

  var CITIES = {
    北京: { name: "北京", color: "#2563EB" },
    上海: { name: "上海", color: "#7C3AED" },
    深圳: { name: "深圳", color: "#0891B2" },
    广州: { name: "广州", color: "#F97316" },
    成都: { name: "成都", color: "#16A34A" },
    杭州: { name: "杭州", color: "#0EA5E9" },
    南京: { name: "南京", color: "#DC2626" },
    武汉: { name: "武汉", color: "#CA8A04" },
    重庆: { name: "重庆", color: "#9333EA" },
    西安: { name: "西安", color: "#BE185D" }
  };

  var PERIOD_LABELS = {
    previous: ["上期", "上月", "前期", "去年", "去年同期", "previous"],
    current: ["当期", "本月", "本期", "current"]
  };

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function hashColor(text) {
    var input = String(text || "default");
    var hash = 0;
    for (var i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
  }

  function hexToRgb(hex) {
    var normalized = String(hex || "").replace("#", "");
    if (normalized.length !== 6) return null;
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  function hexToRgba(hex, alpha) {
    var rgb = hexToRgb(hex);
    if (!rgb) return "rgba(37, 99, 235, " + alpha + ")";
    return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
  }

  function hexToThree(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) return 0x2563eb;
    return (rgb.r << 16) + (rgb.g << 8) + rgb.b;
  }

  function brighten(hex, amount) {
    var rgb = hexToRgb(hex);
    if (!rgb) return hex;
    var mix = amount == null ? 0.22 : amount;
    function channel(value) {
      if (mix < 0) return Math.max(0, Math.round(value * (1 + mix)));
      return Math.min(255, Math.round(value + (255 - value) * mix));
    }
    function toHex(value) {
      return value.toString(16).padStart(2, "0");
    }
    return (
      "#" +
      toHex(channel(rgb.r)) +
      toHex(channel(rgb.g)) +
      toHex(channel(rgb.b))
    );
  }

  function matchRegistryEntry(label, registry) {
    var text = String(label || "").trim();
    if (!text) return null;
    var normalized = normalizeText(text);

    var keys = Object.keys(registry);
    for (var i = 0; i < keys.length; i++) {
      var entry = registry[keys[i]];
      if (!entry) continue;
      if (normalizeText(entry.name) === normalized || normalizeText(keys[i]) === normalized) {
        return entry.color;
      }
      var aliases = entry.aliases || [];
      for (var j = 0; j < aliases.length; j++) {
        if (normalizeText(aliases[j]) === normalized || text.indexOf(aliases[j]) >= 0) {
          return entry.color;
        }
      }
    }
    return null;
  }

  function matchCity(label) {
    var text = String(label || "").trim();
    if (!text) return null;
    if (CITIES[text]) return CITIES[text].color;
    var keys = Object.keys(CITIES);
    for (var i = 0; i < keys.length; i++) {
      if (text.indexOf(keys[i]) >= 0) return CITIES[keys[i]].color;
    }
    return null;
  }

  function brandColor(brandIdOrName) {
    return (
      matchRegistryEntry(brandIdOrName, BRANDS) ||
      (BRANDS[brandIdOrName] && BRANDS[brandIdOrName].color) ||
      hashColor(brandIdOrName)
    );
  }

  function platformColor(platformName) {
    return matchRegistryEntry(platformName, PLATFORMS) || hashColor(platformName);
  }

  function cityColor(cityName) {
    return matchCity(cityName) || hashColor(cityName);
  }

  function isPeriodPrevious(label) {
    var text = String(label || "");
    return PERIOD_LABELS.previous.some(function (item) {
      return text.indexOf(item) >= 0;
    });
  }

  function isPeriodCurrent(label) {
    var text = String(label || "");
    return PERIOD_LABELS.current.some(function (item) {
      return text.indexOf(item) >= 0;
    });
  }

  function resolveChartColor(label, options) {
    options = options || {};
    var text = String(label || "").trim();
    if (!text) return null;

    if (options.isRateChart) {
      var city = matchCity(text);
      if (city) return hexToRgba(city, 0.9);
    }

    var platform = matchRegistryEntry(text, PLATFORMS);
    if (platform) return platform;

    var brand = matchRegistryEntry(text, BRANDS);
    if (brand) return brand;

    var cityMatched = matchCity(text);
    if (cityMatched) return cityMatched;

    if (options.isPeriodCompare) {
      if (isPeriodPrevious(text)) return SEMANTIC.previous;
      if (isPeriodCurrent(text)) {
        return brandColor(options.activeBrandId || "haidilao");
      }
      if (options.barIndex === options.barCount - 1) {
        return brandColor(options.activeBrandId || "haidilao");
      }
      if (options.barCount === 2) return SEMANTIC.previous;
    }

    if (options.isCompare && options.barCount === 2 && !matchCity(text) && !matchRegistryEntry(text, PLATFORMS)) {
      if (options.barIndex === options.barCount - 1) {
        return brandColor(options.activeBrandId || "haidilao");
      }
      return SEMANTIC.previous;
    }

    if (options.fallbackIndex != null) {
      return FALLBACK_PALETTE[options.fallbackIndex % FALLBACK_PALETTE.length];
    }

    return hashColor(text);
  }

  function resolveLineColor(label, index, activeBrandId) {
    return (
      resolveChartColor(label, { activeBrandId: activeBrandId, fallbackIndex: index }) ||
      FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
    );
  }

  /** 多系列柱状图：整组系列使用同一主色（按系列名 / 品牌 / 平台解析） */
  function resolveSeriesColor(seriesLabel, index, activeBrandId) {
    return (
      resolveChartColor(seriesLabel, {
        activeBrandId: activeBrandId,
        fallbackIndex: index
      }) || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
    );
  }

  global.BrandPilotColors = {
    BRANDS: BRANDS,
    PLATFORMS: PLATFORMS,
    CITIES: CITIES,
    SEMANTIC: SEMANTIC,
    FALLBACK_PALETTE: FALLBACK_PALETTE,
    brandColor: brandColor,
    platformColor: platformColor,
    cityColor: cityColor,
    resolveChartColor: resolveChartColor,
    resolveLineColor: resolveLineColor,
    resolveSeriesColor: resolveSeriesColor,
    hashColor: hashColor,
    hexToRgba: hexToRgba,
    hexToThree: hexToThree,
    brighten: brighten
  };
})(typeof window !== "undefined" ? window : globalThis);
