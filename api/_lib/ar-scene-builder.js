/**
 * 商圈地图场景：品牌 → 城市 → 商圈 → 门店 下钻，与统计周期联动
 */

const { workflowLabel } = require("./intent-router");
const { resolvePoiCoordinates, resolveBusinessAreaName, centroidFromPois, cityMapPosition } = require("./poi-coordinates");
const { buildPlatformBenchmarks, buildBrandPeerBenchmarks, detectComparisonFocus } = require("./brand-peer");
const {
  DATE_RANGE,
  buildDrillMetrics,
  resolveDrillScope,
  scaleFunnelForScope,
  resolveMetricsPeriod,
  pickLatestMonthKey
} = require("./drill-data");

const KNOWN_CITIES = ["上海", "北京", "深圳", "广州", "成都", "杭州", "南京", "武汉", "重庆", "西安"];
const REGION_CITY_PATTERN = /(上海|北京|深圳|广州|成都|杭州|南京|武汉|重庆|西安|三河)/;
const REGION_KEYWORDS =
  /城市|商圈|门店|地区|区域|省份|全国分布|下沉|一线|二线|三线|地图|沙盘|下钻|poi|经纬|城市对比|同城市|重点城市|城市分层|分城市|各城|哪个城市|核心商圈|区县|大区|片区|选址|布局/i;

/**
 * 问题是否涉及地区/城市/商圈/门店维度 — 仅此类问题进入 AR 沙盘
 */
function involvesRegionAnalysis(message, workflow, intentParams = {}, scene = null) {
  const text = String(message || "");
  if (intentParams?.city || detectCity(message, intentParams)) return true;
  if (REGION_CITY_PATTERN.test(text)) return true;
  if (REGION_KEYWORDS.test(text)) return true;
  if (scene?.focusCity) return true;
  // 竞品/经营分析含城市维度对比，启用 AR 联动钻取
  if (workflow === "competitor_benchmark") return true;
  if (workflow === "annual_proposal") return true;
  if (workflow === "data_query" && /城市|gmv|核销|roi|商圈|门店/i.test(text)) return true;

  return false;
}

function parseMonthFromMessage(message) {
  const text = String(message || "");
  const cnMatch = text.match(/(?:^|[^\d])(1[0-2]|[1-9])月/);
  if (cnMatch) return Number(cnMatch[1]);
  const isoMatch = text.match(/202[4-6]-(\d{2})/);
  if (isoMatch) return Number(isoMatch[1]);
  return null;
}

function parseMonthFromPeriod(period) {
  if (!period) return null;
  const cnMatch = String(period).match(/(1[0-2]|[1-9])月/);
  if (cnMatch) return Number(cnMatch[1]);
  return null;
}

function detectCity(message, intentParams) {
  if (intentParams && intentParams.city) return intentParams.city;
  const m = String(message || "").match(/(上海|北京|深圳|广州|成都|杭州|南京|武汉|重庆|西安)/);
  return m ? m[1] : null;
}

function deriveTopicContext(message, workflow, intentParams, dateRange) {
  const monthNum = parseMonthFromMessage(message) ?? parseMonthFromPeriod(intentParams?.period);
  const city = detectCity(message, intentParams);
  const wfLabel = workflowLabel(workflow);
  const monthLabel = monthNum ? `${monthNum}月` : dateRange.label;
  const text = String(message || "");

  let topicLabel = wfLabel;
  let topicHint = `统计周期 ${dateRange.range} · 支持品牌→城市→商圈→门店下钻`;

  if (workflow === "data_query") {
    if (city) {
      topicLabel = `${city} · 累计经营数据`;
      topicHint = `${dateRange.range} 内 ${city} 城市/商圈/门店指标，选中城市后上方数据联动`;
    } else if (/gmv|gtv|流水|营业额|交易额/i.test(text)) {
      topicLabel = `GMV 与城市对比`;
      topicHint = `${dateRange.range} 各城市 GMV、核销率与 ROI`;
    } else {
      topicLabel = `${wfLabel} · 城市下钻`;
    }
  } else if (workflow === "funnel_diagnosis") {
    topicLabel = "转化链路 · 城市损耗";
    topicHint = city
      ? `${city} 门店链路指标（${dateRange.range}）`
      : "按城市/商圈/门店查看链路损耗";
  } else if (workflow === "competitor_benchmark") {
    const focus = detectComparisonFocus(message, intentParams);
    if (focus === "platform") {
      topicLabel = "竞对对比 · 平台";
      topicHint = "美团 vs 抖音（渠道份额、核销率、客单价）";
    } else if (focus === "brand") {
      topicLabel = "竞对对比 · 品牌";
      topicHint = "海底捞 vs 呷哺呷哺";
    } else {
      topicLabel = "竞对对比 · 平台与品牌";
      topicHint = "平台对比（美团 vs 抖音）与品牌竞品（海底捞 vs 呷哺呷哺）";
    }
  } else if (workflow === "annual_proposal") {
    topicLabel = "经营分析 · 重点城市";
    topicHint = `${dateRange.range} 高 GMV 城市与核心商圈`;
  }

  if (city && !topicLabel.includes(city)) {
    topicLabel = `${city} · ${topicLabel}`;
  }

  return { monthNum, monthLabel, city, topicLabel, topicHint, workflow, dateRange };
}

function sortCityRows(rows, workflow, message) {
  const copy = rows.slice();
  const text = String(message || "");

  if (workflow === "funnel_diagnosis") {
    return copy.sort((a, b) => (a.verifiedRate || 0) - (b.verifiedRate || 0));
  }
  if (/核销/.test(text) && workflow === "data_query") {
    return copy.sort((a, b) => (b.verifiedRate || 0) - (a.verifiedRate || 0));
  }
  if (/roi|投放|广告/.test(text)) {
    return copy.sort((a, b) => (b.roi || 0) - (a.roi || 0));
  }
  return copy.sort((a, b) => (b.gmv || 0) - (a.gmv || 0));
}

function buildDrillSource(ctx) {
  const months = [...new Set((ctx.monthlyFacts || []).map((row) => String(row.month)))].sort();
  return {
    monthlyFacts: ctx.monthlyFacts || [],
    cityMonthlyFacts: ctx.cityMonthlyFacts || [],
    poiFacts: (ctx.dailyFacts && ctx.dailyFacts.poiFacts) || [],
    poisCatalog: (ctx.pois || []).map((poi) => ({
      poi_id: poi.poi_id,
      poi_name: poi.poi_name,
      city: poi.city,
      district: poi.district,
      business_area: poi.business_area,
      brand_id: poi.brand_id
    })),
    brandProfile: ctx.brandProfile || null,
    peerBrandMonthlyFacts: ctx.peerBrandMonthlyFacts || [],
    peerCityMonthlyFacts: ctx.peerCityMonthlyFacts || [],
    peerBrandProfile: ctx.peerBrandProfile || null,
    competitorBenchmarks: ctx.competitorBenchmarks || [],
    availableMonths: months,
    dateBounds: {
      from: DATE_RANGE.from,
      to: DATE_RANGE.to,
      label: DATE_RANGE.label
    }
  };
}

function buildArScene(ctx, workflowResult, options = {}) {
  const { message = "", workflow = "", intentParams = {}, dataSpec = null } = options;
  const displayPeriod = resolveMetricsPeriod({ message, workflow, intentParams, dataSpec, ctx });
  const drillMetrics = buildDrillMetrics(ctx, {
    message,
    workflow,
    intentParams,
    dataSpec,
    period: displayPeriod
  });
  const topic = deriveTopicContext(message, workflow, intentParams, drillMetrics.dateRange);

  let cities = sortCityRows(drillMetrics.cities, workflow, message).map((c) => ({
    ...c,
    position: cityMapPosition(c.name)
  }));

  if (topic.city) {
    const focus = cities.find((c) => c.name === topic.city);
    cities = focus ? [focus, ...cities.filter((c) => c.name !== topic.city)] : cities;
  } else {
    cities = cities.slice(0, 10);
  }

  const cityNames = new Set(cities.map((c) => c.name));

  let funnel = [];
  const funnelChart = (workflowResult.charts || []).find((c) => c.type === "funnel");
  if (funnelChart && funnelChart.data) {
    funnel = (funnelChart.data.labels || []).map((label, index) => ({
      stage: label,
      value: funnelChart.data.datasets && funnelChart.data.datasets[0]
        ? funnelChart.data.datasets[0].data[index]
        : 0
    }));
  }

  const pois = drillMetrics.pois
    .filter((p) => !topic.city || p.city === topic.city)
    .filter((p) => !cityNames.size || cityNames.has(p.city))
    .map((poi, index) => {
      const coords = resolvePoiCoordinates({
        poi_id: poi.id,
        poi_name: poi.name,
        city: poi.city,
        district: poi.district,
        business_area: poi.businessArea
      });
      return {
        id: poi.id,
        name: poi.name,
        city: poi.city,
        district: poi.district || "核心城区",
        businessArea: resolveBusinessAreaName({
          business_area: poi.businessArea,
          poi_name: poi.name,
          city: poi.city
        }),
        brandId: poi.brandId,
        brandName: poi.brandName,
        category: "火锅",
        status: "active",
        lng: coords.lng,
        lat: coords.lat,
        metrics: poi.metrics,
        mapPosition: mapPositionForPoi(index)
      };
    });

  const districts = buildBusinessDistricts(pois, drillMetrics.districts);

  let platformBenchmarks = [];
  let brandPeerBenchmarks = null;
  const compareFocus =
    workflow === "competitor_benchmark" ? detectComparisonFocus(message, intentParams) : null;
  const benchMonth = displayPeriod.monthKey || pickLatestMonthKey(ctx.monthlyFacts);
  if (workflow === "competitor_benchmark") {
    if (compareFocus !== "brand") {
      platformBenchmarks = buildPlatformBenchmarks(ctx.competitorBenchmarks, benchMonth);
    }
    if (compareFocus !== "platform" && displayPeriod.mode === "month" && benchMonth) {
      brandPeerBenchmarks = buildBrandPeerBenchmarks(ctx, benchMonth);
    }
  }

  const defaultScope = resolveDrillScope(drillMetrics, {
    level: topic.city ? "city" : "brand",
    city: topic.city || null
  });

  const regionRelevant = involvesRegionAnalysis(message, workflow, intentParams, { focusCity: topic.city });

  return {
    brandName: drillMetrics.brand.brandName || "海底捞",
    brandId: drillMetrics.brand.brandId || "haidilao",
    regionRelevant,
    topicLabel: topic.topicLabel,
    topicHint: topic.topicHint,
    focusCity: topic.city,
    focusMonth: topic.monthLabel,
    workflow,
    compareFocus,
    dateRange: drillMetrics.dateRange,
    displayPeriod,
    drillMetrics,
    activeScope: defaultScope,
    cities,
    funnel,
    funnelBrand: funnel,
    competitors: platformBenchmarks,
    platformBenchmarks,
    brandPeerBenchmarks,
    pois,
    districts,
    opportunityScore:
      (workflowResult.proposal && workflowResult.proposal.opportunityScore) || 80,
    summary:
      (workflowResult.proposal && workflowResult.proposal.summary) ||
      String(workflowResult.answer || "").slice(0, 80),
    drillSource: buildDrillSource(ctx)
  };
}

function buildBusinessDistricts(pois, drillDistricts) {
  const drillMap = new Map((drillDistricts || []).map((d) => [d.id, d]));
  const grouped = new Map();

  pois.forEach((poi) => {
    const key = poi.city + "::" + (poi.businessArea || "核心商圈");
    const id = (drillDistricts || []).find(
      (d) => d.city === poi.city && d.name === poi.businessArea
    )?.id || slugify(poi.city + "_" + poi.businessArea);

    const drill = drillMap.get(id);
    const current = grouped.get(key) || {
      id,
      name: poi.businessArea || "核心商圈",
      city: poi.city,
      district: poi.district,
      storeCount: 0,
      exposure: drill?.exposure || 0,
      visits: drill?.visits || 0,
      dealClicks: drill?.dealClicks || 0,
      navigateClicks: drill?.navigateClicks || 0,
      phoneClicks: drill?.phoneClicks || 0,
      pois: []
    };
    current.storeCount += 1;
    if (!drill) {
      current.exposure += poi.metrics.exposure || 0;
      current.visits += poi.metrics.visits || 0;
      current.dealClicks += poi.metrics.dealClicks || 0;
      current.navigateClicks += poi.metrics.navigateClicks || 0;
      current.phoneClicks += poi.metrics.phoneClicks || 0;
    }
    current.pois.push(poi.id);
    grouped.set(key, current);
  });

  return [...grouped.values()].map((item, index) => {
    const districtPois = pois.filter((poi) => item.pois.includes(poi.id));
    const center = centroidFromPois(districtPois) || { lng: 116.4074, lat: 39.9042 };
    return {
      ...item,
      lng: center.lng,
      lat: center.lat,
      visitRate: item.exposure ? item.visits / item.exposure : 0,
      dealClickRate: item.visits ? item.dealClicks / item.visits : 0,
      mapPosition: districtMapPosition(index)
    };
  });
}

function mapPositionForPoi(index) {
  const base = districtMapPosition(index);
  const offsetX = ((index % 3) - 1) * 5;
  const offsetY = ((Math.floor(index / 3) % 3) - 1) * 4;
  return {
    x: Math.max(8, Math.min(92, base.x + offsetX)),
    y: Math.max(10, Math.min(88, base.y + offsetY))
  };
}

function districtMapPosition(index) {
  const presets = [
    { x: 28, y: 30 },
    { x: 58, y: 24 },
    { x: 73, y: 52 },
    { x: 42, y: 62 },
    { x: 23, y: 70 },
    { x: 64, y: 78 }
  ];
  return presets[index % presets.length];
}

function slugify(value) {
  return String(value || "district").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_");
}

function summarizeArScene(scene) {
  if (!scene) return "AR 展厅数据已就绪";
  const parts = [scene.topicLabel || "AR 经营沙盘"];
  if (scene.cities && scene.cities.length) {
    parts.push(scene.cities.length + " 座城市");
  }
  if (scene.districts && scene.districts.length) {
    parts.push(scene.districts.length + " 个商圈");
  }
  if (scene.pois && scene.pois.length) {
    parts.push(scene.pois.length + " 家门店");
  }
  return parts.join(" · ");
}

function resolveSceneScope(scene, selection) {
  if (!scene || !scene.drillMetrics) return scene?.activeScope || null;
  const scope = resolveDrillScope(scene.drillMetrics, selection);
  const funnel = scaleFunnelForScope(scene.funnelBrand || scene.funnel || [], scope);
  return { ...scope, funnel };
}

module.exports = {
  buildArScene,
  buildDrillSource,
  summarizeArScene,
  resolveSceneScope,
  involvesRegionAnalysis,
  detectCity,
  KNOWN_CITIES
};
