/**
 * 沙盘下钻数据：品牌 → 城市 → 商圈 → 门店
 * 统计周期默认 2024-01-01 至 2026-06-30
 */

const DATE_RANGE = {
  from: "2024-01-01",
  to: "2026-06-30",
  label: "2024年1月至2026年6月",
  range: "2024-01-01 至 2026-06-30"
};

const BRAND_ID = "haidilao";
const BRAND_NAME = "海底捞";

const DRILL_CATALOG = [
  {
    city: "上海",
    districts: [
      { area: "静安大悦城", district: "静安", stores: ["海底捞上海静安大悦城店", "海底捞上海南京西路店"] },
      { area: "陆家嘴", district: "浦东", stores: ["海底捞上海陆家嘴店"] }
    ]
  },
  {
    city: "北京",
    districts: [
      { area: "朝阳合生汇", district: "朝阳", stores: ["海底捞北京朝阳合生汇店", "海底捞北京三里屯店"] },
      { area: "西单大悦城", district: "西城", stores: ["海底捞北京西单店"] }
    ]
  },
  {
    city: "深圳",
    districts: [
      { area: "万象天地", district: "南山", stores: ["海底捞深圳南山万象天地店", "海底捞深圳海岸城店"] },
      { area: "福田COCO", district: "福田", stores: ["海底捞深圳福田店"] }
    ]
  },
  {
    city: "成都",
    districts: [
      { area: "春熙路", district: "锦江", stores: ["海底捞成都春熙路店", "海底捞成都IFS店"] },
      { area: "太古里", district: "武侯", stores: ["海底捞成都太古里店"] }
    ]
  },
  {
    city: "杭州",
    districts: [
      { area: "滨江龙湖", district: "滨江", stores: ["海底捞杭州滨江龙湖店", "海底捞杭州万象城店"] },
      { area: "湖滨银泰", district: "上城", stores: ["海底捞杭州湖滨店"] }
    ]
  },
  {
    city: "广州",
    districts: [
      { area: "天河城", district: "天河", stores: ["海底捞广州天河城店", "海底捞广州正佳店"] },
      { area: "北京路", district: "越秀", stores: ["海底捞广州北京路店"] }
    ]
  },
  {
    city: "南京",
    districts: [
      { area: "新街口", district: "秦淮", stores: ["海底捞南京新街口店", "海底捞南京德基店"] },
      { area: "河西万达", district: "建邺", stores: ["海底捞南京河西店"] }
    ]
  },
  {
    city: "武汉",
    districts: [
      { area: "江汉路", district: "江汉", stores: ["海底捞武汉江汉路店", "海底捞武汉国际广场店"] },
      { area: "光谷", district: "东湖高新", stores: ["海底捞武汉光谷店"] }
    ]
  },
  {
    city: "重庆",
    districts: [
      { area: "解放碑", district: "渝中", stores: ["海底捞重庆解放碑店", "海底捞重庆来福士店"] },
      { area: "观音桥", district: "江北", stores: ["海底捞重庆观音桥店"] }
    ]
  },
  {
    city: "西安",
    districts: [
      { area: "钟楼", district: "碑林", stores: ["海底捞西安钟楼店", "海底捞西安大悦城店"] },
      { area: "小寨", district: "雁塔", stores: ["海底捞西安小寨店"] }
    ]
  }
];

function seedHash(input) {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededUnit(key, min = 0, max = 1) {
  const span = max - min;
  return min + (seedHash(key) % 10000) / 10000 * span;
}

const { monthEndDates, normalizeMonthEnd } = require("./month-end");

function slugify(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_");
}

function poiIdFor(city, area, storeName, index) {
  return "hdl-" + slugify(city) + "-" + slugify(area) + "-" + String(index + 1).padStart(2, "0");
}

function inDateRange(date, from, to) {
  const d = String(date || "");
  return d >= from && d <= to;
}

function filterByDateRange(rows, from, to, dateField = "month") {
  return (rows || []).filter((row) => inDateRange(row[dateField], from, to));
}

function filterMonthsByRange(rows, from, to, dateField = "month") {
  return (rows || []).filter((row) => inDateRange(row[dateField], from, to));
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

function detectYear(message, intentParams) {
  const text = String(message || "") + String(intentParams?.period || "");
  const match = text.match(/(202[4-6])/);
  return match ? Number(match[1]) : 2026;
}

function monthRangeLabel(year, monthNum) {
  const pad = String(monthNum).padStart(2, "0");
  const lastDay = new Date(year, monthNum, 0).getDate();
  return {
    label: `${year}年${monthNum}月`,
    range: `${year}-${pad}-01 至 ${year}-${pad}-${String(lastDay).padStart(2, "0")}`,
    grain: "自然月"
  };
}

function pickLatestMonthKey(rows) {
  const months = [...new Set((rows || []).map((row) => String(row.month)))].sort();
  return months.length ? months[months.length - 1] : null;
}

function pickMonthKeyFromRows(rows, monthNum, year) {
  if (!monthNum) return pickLatestMonthKey(rows);
  const pad = String(monthNum).padStart(2, "0");
  const prefix = `${year}-${pad}`;
  const candidates = [...new Set((rows || []).map((row) => String(row.month)))].sort();
  return candidates.find((month) => month.startsWith(prefix)) || null;
}

function isHalfYearScope(message, workflow, intentParams) {
  if (workflow === "annual_proposal") return true;
  const text = String(message || "") + String(intentParams?.period || "");
  return /上半年|下半年|H1|H2|h1|h2|1-6月|半年/.test(text);
}

/**
 * 与问题、dataSpec 对齐的展示统计周期（避免多月 GTV 误累加）
 */
function resolveMetricsPeriod(options = {}) {
  const { message = "", workflow = "", intentParams = {}, dataSpec = null, ctx = null } = options;
  const monthlyRows = ctx?.monthlyFacts || [];

  if (dataSpec?.period?.grain === "自然月") {
    const monthNum =
      parseMonthFromMessage(message) ??
      parseMonthFromPeriod(intentParams.period) ??
      (dataSpec.period.monthKey ? parseInt(String(dataSpec.period.monthKey).split("-")[1], 10) : null);
    const year = dataSpec.period.monthKey
      ? parseInt(String(dataSpec.period.monthKey).split("-")[0], 10)
      : detectYear(message, intentParams);
    const monthKey = pickMonthKeyFromRows(monthlyRows, monthNum, year);
    if (monthKey) {
      const parts = monthKey.split("-");
      const labelInfo = monthRangeLabel(Number(parts[0]), parseInt(parts[1], 10));
      return {
        mode: "month",
        monthKey,
        label: dataSpec.period.label || labelInfo.label,
        range: dataSpec.period.range || labelInfo.range,
        grain: "自然月"
      };
    }
  }

  if (dataSpec?.period?.grain === "半年度" || isHalfYearScope(message, workflow, intentParams)) {
    return {
      mode: "cumulative",
      from: "2026-01-01",
      to: "2026-06-30",
      label: dataSpec?.period?.label || "2026年上半年",
      range: dataSpec?.period?.range || "2026-01-01 至 2026-06-30",
      grain: "半年度累计"
    };
  }

  const monthNum = parseMonthFromMessage(message) ?? parseMonthFromPeriod(intentParams?.period);
  const year = detectYear(message, intentParams);

  if (monthNum) {
    const monthKey = pickMonthKeyFromRows(monthlyRows, monthNum, year);
    const labelInfo = monthRangeLabel(year, monthNum);
    return {
      mode: "month",
      monthKey,
      label: labelInfo.label,
      range: labelInfo.range,
      grain: "自然月"
    };
  }

  const latestKey = pickLatestMonthKey(monthlyRows);
  if (latestKey) {
    const parts = latestKey.split("-");
    const labelInfo = monthRangeLabel(Number(parts[0]), parseInt(parts[1], 10));
    return {
      mode: "month",
      monthKey: latestKey,
      label: labelInfo.label,
      range: labelInfo.range,
      grain: "自然月"
    };
  }

  return {
    mode: "cumulative",
    from: DATE_RANGE.from,
    to: DATE_RANGE.to,
    label: DATE_RANGE.label + "（累计）",
    range: DATE_RANGE.range,
    grain: "累计"
  };
}

function filterPoiFactsByMonth(rows, monthKey) {
  if (!monthKey) return rows || [];
  const prefix = String(monthKey).slice(0, 7);
  return (rows || []).filter((row) => String(row.month || "").startsWith(prefix));
}

function aggregateBrandMonth(rows, monthKey) {
  const row = (rows || []).find((item) => String(item.month) === monthKey) || {};
  return {
    brandId: BRAND_ID,
    brandName: BRAND_NAME,
    gtv: Number(row.gtv || 0),
    gmv: Math.round(Number(row.gtv || 0) / 8.6),
    paidOrders: Number(row.paid_orders || 0),
    verifiedOrders: Number(row.verified_orders || 0),
    verifiedRate: row.paid_orders ? Number(row.verified_orders) / Number(row.paid_orders) : 0,
    avgOrderValue: Number(row.avg_order_value || 0),
    storeCount: null,
    months: 1
  };
}

function aggregateCityMonth(rows, monthKey) {
  return (rows || [])
    .filter((row) => String(row.month) === monthKey)
    .map((row) => ({
      city: row.city,
      store_count: row.store_count || 0,
      gmv: Number(row.gmv || 0),
      paid_orders: Number(row.paid_orders || 0),
      verified_orders: Number(row.verified_orders || 0),
      ad_spend: Number(row.ad_spend || 0),
      verifiedRate: row.paid_orders ? Number(row.verified_orders) / Number(row.paid_orders) : 0,
      roi: row.ad_spend ? Number(row.gmv) / Number(row.ad_spend) : 0,
      avgOrderValue: row.avg_order_value || (row.paid_orders ? Number(row.gmv) / Number(row.paid_orders) : 0)
    }));
}

function sumRows(rows, fields) {
  return fields.reduce((acc, field) => {
    acc[field] = rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
    return acc;
  }, {});
}

function buildCityMonthlyRow(month, city, storeCount, scale) {
  const baseGmv = 6800000 + seededUnit(city + month, 0, 4200000) * scale;
  const growth = 1 + (month.slice(0, 4) === "2024" ? 0 : month.slice(0, 4) === "2025" ? 0.12 : 0.22);
  const gmv = Math.round(baseGmv * growth);
  const paidOrders = Math.round(gmv / (310 + seededUnit(city + "aov" + month, 0, 40)));
  const verifiedOrders = Math.round(paidOrders * (0.82 + seededUnit(city + "vr" + month, 0, 0.06)));
  const adSpend = Math.round(gmv * (0.018 + seededUnit(city + "ad" + month, 0, 0.008)));
  return {
    month,
    brand_id: BRAND_ID,
    city,
    store_count: storeCount,
    search_impressions: Math.round(gmv * 0.95),
    poi_visits: Math.round(gmv * 0.14),
    paid_orders: paidOrders,
    verified_orders: verifiedOrders,
    gmv,
    coupon_reduce_amount: Math.round(gmv * 0.018),
    ad_spend: adSpend,
    roi: Number((gmv / Math.max(adSpend, 1)).toFixed(2)),
    avg_order_value: Number((gmv / Math.max(paidOrders, 1)).toFixed(2))
  };
}

function buildBrandMonthlyRow(month, cityRows) {
  const totals = sumRows(cityRows, [
    "gmv",
    "paid_orders",
    "verified_orders",
    "search_impressions",
    "poi_visits"
  ]);
  const gtv = Math.round(totals.gmv * 8.6);
  const scale = month.slice(0, 4) === "2024" ? 0.72 : month.slice(0, 4) === "2025" ? 0.88 : 1;
  return {
    month,
    brand_id: BRAND_ID,
    active_users: Math.round(180000 * scale + seededUnit(month, 0, 40000)),
    purchase_frequency: Number((1.28 + seededUnit(month + "pf", 0, 0.12)).toFixed(2)),
    avg_order_value: Number((totals.gmv / Math.max(totals.paid_orders, 1)).toFixed(2)),
    gtv,
    paid_orders: totals.paid_orders,
    verified_orders: totals.verified_orders,
    repeat_purchase_rate: Number((0.22 + seededUnit(month + "rp", 0, 0.08)).toFixed(4)),
    commission_revenue: Math.round(gtv * 0.036),
    ad_revenue: Math.round(gtv * 0.018),
    merchant_revenue: Math.round(gtv * 0.052),
    subsidy_amount: Math.round(gtv * 0.014),
    operating_cost: Math.round(gtv * 0.012),
    ad_merchant_penetration: Number((0.16 + seededUnit(month + "pen", 0, 0.08)).toFixed(4)),
    take_rate: 0.052,
    subsidy_rate: 0.014,
    data_confidence: "demo_model"
  };
}

function buildPoiDailyRow(month, poiId, city, area, share) {
  const monthScale = month.slice(0, 4) === "2024" ? 0.7 : month.slice(0, 4) === "2025" ? 0.9 : 1;
  const exposure = Math.round((180000 + seededUnit(poiId + month, 0, 120000)) * share * monthScale);
  const visits = Math.round(exposure * (0.14 + seededUnit(poiId + "v" + month, 0, 0.04)));
  const dealClicks = Math.round(visits * (0.09 + seededUnit(poiId + "d" + month, 0, 0.03)));
  return {
    month: normalizeMonthEnd(month),
    poi_id: poiId,
    city,
    business_area: area,
    exposure,
    visits,
    search_visits: Math.round(visits * 0.22),
    deal_clicks: dealClicks,
    favorite_count: Math.round(visits * 0.04),
    navigate_clicks: Math.round(visits * 0.024),
    phone_clicks: Math.round(visits * 0.011),
    avg_stay_seconds: Math.round(95 + seededUnit(poiId + month + "stay", 0, 35))
  };
}

function generateHaidilaoDrillFixture() {
  const months = monthEndDates(DATE_RANGE.from, DATE_RANGE.to);
  const pois = [];
  const poiFacts = [];
  const cityMonthlyFacts = [];

  DRILL_CATALOG.forEach((cityEntry) => {
    const cityStoreCount = cityEntry.districts.reduce((sum, d) => sum + d.stores.length, 0);
    months.forEach((month) => {
      const scale = cityEntry.city === "上海" || cityEntry.city === "北京" ? 1.15 : 1;
      cityMonthlyFacts.push(buildCityMonthlyRow(month, cityEntry.city, cityStoreCount, scale));
    });

    cityEntry.districts.forEach((districtEntry) => {
      const areaShare = 1 / districtEntry.stores.length;
      districtEntry.stores.forEach((storeName, storeIndex) => {
        const poiId = poiIdFor(cityEntry.city, districtEntry.area, storeName, storeIndex);
        pois.push({
          poi_id: poiId,
          brand_id: BRAND_ID,
          poi_name: storeName,
          city: cityEntry.city,
          district: districtEntry.district,
          business_area: districtEntry.area,
          category: "火锅",
          poi_status: "active",
          address: "Demo：" + cityEntry.city + districtEntry.area
        });
        months.forEach((month) => {
          poiFacts.push(buildPoiDailyRow(month, poiId, cityEntry.city, districtEntry.area, areaShare));
        });
      });
    });
  });

  const brandMonthlyFacts = months.map((month) => {
    const cityRows = cityMonthlyFacts.filter((row) => row.month === month);
    return buildBrandMonthlyRow(month, cityRows);
  });

  const latestMonth = months[months.length - 1];
  const latestBrand = brandMonthlyFacts.find((row) => row.month === latestMonth) || brandMonthlyFacts[brandMonthlyFacts.length - 1];
  const totalStores = pois.length;

  return {
    brandProfile: {
      brand_id: BRAND_ID,
      brand_name: BRAND_NAME,
      category: "火锅",
      brand_level: "全国 KA",
      headquarter_city: "北京",
      store_count: totalStores,
      ka_owner: "KA 城市经理",
      cooperation_status: "深度合作"
    },
    pois,
    deals: [],
    dailyFacts: {
      searchFacts: [],
      poiFacts,
      campaignFacts: []
    },
    monthlyFacts: brandMonthlyFacts,
    cityMonthlyFacts,
    competitorBenchmarks: [],
    assets: [],
    drillCatalog: DRILL_CATALOG,
    dateRange: DATE_RANGE,
    summary: {
      brandGmv: cityMonthlyFacts
        .filter((row) => inDateRange(row.month, DATE_RANGE.from, DATE_RANGE.to))
        .reduce((sum, row) => sum + Number(row.gmv || 0), 0),
      brandGtv: brandMonthlyFacts
        .filter((row) => inDateRange(row.month, DATE_RANGE.from, DATE_RANGE.to))
        .reduce((sum, row) => sum + Number(row.gtv || 0), 0),
      latestBrand,
      months
    }
  };
}

function aggregatePoiFactsInRange(rows, from, to) {
  return filterByDateRange(rows, from, to).reduce((acc, row) => {
    const id = row.poi_id;
    if (!id) return acc;
    const current = acc[id] || {
      exposure: 0,
      visits: 0,
      search_visits: 0,
      deal_clicks: 0,
      favorite_count: 0,
      navigate_clicks: 0,
      phone_clicks: 0,
      avg_stay_seconds: 0,
      samples: 0,
      city: row.city,
      business_area: row.business_area
    };
    current.exposure += Number(row.exposure || 0);
    current.visits += Number(row.visits || 0);
    current.search_visits += Number(row.search_visits || 0);
    current.deal_clicks += Number(row.deal_clicks || 0);
    current.favorite_count += Number(row.favorite_count || 0);
    current.navigate_clicks += Number(row.navigate_clicks || 0);
    current.phone_clicks += Number(row.phone_clicks || 0);
    current.avg_stay_seconds += Number(row.avg_stay_seconds || 0);
    current.samples += 1;
    acc[id] = current;
    return acc;
  }, {});
}

function aggregateCityMonthlyInRange(rows, from, to) {
  const filtered = filterMonthsByRange(rows, from, to);
  const grouped = filtered.reduce((acc, row) => {
    const city = row.city;
    if (!city) return acc;
    const current = acc[city] || {
      city,
      store_count: row.store_count || 0,
      gmv: 0,
      paid_orders: 0,
      verified_orders: 0,
      ad_spend: 0,
      search_impressions: 0,
      poi_visits: 0,
      months: 0
    };
    current.gmv += Number(row.gmv || 0);
    current.paid_orders += Number(row.paid_orders || 0);
    current.verified_orders += Number(row.verified_orders || 0);
    current.ad_spend += Number(row.ad_spend || 0);
    current.search_impressions += Number(row.search_impressions || 0);
    current.poi_visits += Number(row.poi_visits || 0);
    current.months += 1;
    current.store_count = Math.max(current.store_count, Number(row.store_count || 0));
    acc[city] = current;
    return acc;
  }, {});

  return Object.values(grouped).map((item) => ({
    ...item,
    verifiedRate: item.paid_orders ? item.verified_orders / item.paid_orders : 0,
    roi: item.ad_spend ? item.gmv / item.ad_spend : 0,
    avgOrderValue: item.paid_orders ? item.gmv / item.paid_orders : 0
  }));
}

function aggregateBrandMonthlyInRange(rows, from, to) {
  const filtered = filterMonthsByRange(rows, from, to);
  const totals = sumRows(filtered, ["gtv", "paid_orders", "verified_orders"]);
  const gmvProxy = filtered.reduce((sum, row) => sum + Number(row.gtv || 0) / 8.6, 0);
  const avgOrderValue = totals.paid_orders ? gmvProxy / totals.paid_orders : 0;
  return {
    brandId: BRAND_ID,
    brandName: BRAND_NAME,
    gtv: totals.gtv,
    gmv: Math.round(gmvProxy),
    paidOrders: totals.paid_orders,
    verifiedOrders: totals.verified_orders,
    verifiedRate: totals.paid_orders ? totals.verified_orders / totals.paid_orders : 0,
    avgOrderValue,
    storeCount: filtered.length ? null : 0,
    months: filtered.length
  };
}

function buildDrillMetrics(ctx, options = {}) {
  const period =
    options.period ||
    resolveMetricsPeriod({
      message: options.message,
      workflow: options.workflow,
      intentParams: options.intentParams,
      dataSpec: options.dataSpec,
      ctx
    });
  const brandName = (ctx.brandProfile && ctx.brandProfile.brand_name) || BRAND_NAME;

  let brandRow;
  let cityRows;
  let poiFactRows;

  if (period.mode === "month" && period.monthKey) {
    brandRow = aggregateBrandMonth(ctx.monthlyFacts || [], period.monthKey);
    cityRows = aggregateCityMonth(ctx.cityMonthlyFacts || [], period.monthKey);
    poiFactRows = filterPoiFactsByMonth(ctx.dailyFacts && ctx.dailyFacts.poiFacts, period.monthKey);
  } else {
    brandRow = aggregateBrandMonthlyInRange(
      ctx.monthlyFacts || [],
      period.from || DATE_RANGE.from,
      period.to || DATE_RANGE.to
    );
    cityRows = aggregateCityMonthlyInRange(
      ctx.cityMonthlyFacts || [],
      period.from || DATE_RANGE.from,
      period.to || DATE_RANGE.to
    );
    poiFactRows = filterByDateRange(
      ctx.dailyFacts && ctx.dailyFacts.poiFacts,
      period.from || DATE_RANGE.from,
      period.to || DATE_RANGE.to
    );
  }

  brandRow.brandName = brandName;
  brandRow.storeCount = (ctx.pois || []).length;

  const poiFactsById = aggregatePoiFactsInRange(poiFactRows, period.from || DATE_RANGE.from, period.to || DATE_RANGE.to);
  const pois = (ctx.pois || []).map((poi) => {
    const metrics = poiFactsById[poi.poi_id] || {};
    const avgStaySeconds = metrics.samples ? metrics.avg_stay_seconds / metrics.samples : 0;
    return {
      id: poi.poi_id,
      name: poi.poi_name,
      city: poi.city,
      district: poi.district,
      businessArea: poi.business_area,
      brandId: poi.brand_id || BRAND_ID,
      brandName,
      metrics: {
        exposure: metrics.exposure || 0,
        visits: metrics.visits || 0,
        dealClicks: metrics.deal_clicks || 0,
        navigateClicks: metrics.navigate_clicks || 0,
        phoneClicks: metrics.phone_clicks || 0,
        avgStaySeconds,
        visitRate: metrics.exposure ? (metrics.visits || 0) / metrics.exposure : 0,
        dealClickRate: metrics.visits ? (metrics.deal_clicks || 0) / metrics.visits : 0
      }
    };
  });

  const districtMap = new Map();
  pois.forEach((poi) => {
    const key = poi.city + "::" + (poi.businessArea || "核心商圈");
    const current = districtMap.get(key) || {
      id: slugify(poi.city + "_" + poi.businessArea),
      name: poi.businessArea || "核心商圈",
      city: poi.city,
      district: poi.district,
      storeCount: 0,
      exposure: 0,
      visits: 0,
      dealClicks: 0,
      navigateClicks: 0,
      phoneClicks: 0,
      pois: []
    };
    current.storeCount += 1;
    current.exposure += poi.metrics.exposure || 0;
    current.visits += poi.metrics.visits || 0;
    current.dealClicks += poi.metrics.dealClicks || 0;
    current.navigateClicks += poi.metrics.navigateClicks || 0;
    current.phoneClicks += poi.metrics.phoneClicks || 0;
    current.pois.push(poi.id);
    districtMap.set(key, current);
  });

  const districts = [...districtMap.values()].map((item) => ({
    ...item,
    visitRate: item.exposure ? item.visits / item.exposure : 0,
    dealClickRate: item.visits ? item.dealClicks / item.visits : 0
  }));

  const cities = cityRows.map((row, index) => ({
    id: "city_" + index,
    name: row.city,
    gmv: row.gmv,
    roi: row.roi,
    verifiedRate: row.verifiedRate,
    storeCount: row.store_count,
    paidOrders: row.paid_orders,
    verifiedOrders: row.verified_orders,
    adSpend: row.ad_spend,
    avgOrderValue: row.avgOrderValue
  }));

  return {
    dateRange: {
      from: period.from || period.monthKey,
      to: period.to || period.monthKey,
      label: period.label,
      range: period.range,
      grain: period.grain,
      monthKey: period.monthKey || null
    },
    displayPeriod: period,
    brand: brandRow,
    cities,
    districts,
    pois
  };
}

function resolveDrillScope(drillMetrics, selection = {}) {
  const level = selection.level || "brand";
  const brand = drillMetrics.brand || {};
  const dateRange = drillMetrics.dateRange || DATE_RANGE;

  if (level === "poi" && selection.poiId) {
    const poi = (drillMetrics.pois || []).find((item) => item.id === selection.poiId);
    if (!poi) return null;
    const district = (drillMetrics.districts || []).find((item) => item.pois.includes(poi.id));
    return {
      level: "poi",
      label: poi.name,
      breadcrumb: [brand.brandName, poi.city, district && district.name, poi.name].filter(Boolean).join(" / "),
      brandName: brand.brandName,
      city: poi.city,
      district: district && district.name,
      poi: poi.name,
      metrics: {
        exposure: poi.metrics.exposure,
        visits: poi.metrics.visits,
        dealClicks: poi.metrics.dealClicks,
        visitRate: poi.metrics.visitRate,
        dealClickRate: poi.metrics.dealClickRate,
        avgStaySeconds: poi.metrics.avgStaySeconds
      },
      dateRange
    };
  }

  if (level === "district" && selection.districtId) {
    const district = (drillMetrics.districts || []).find((item) => item.id === selection.districtId);
    if (!district) return null;
    return {
      level: "district",
      label: district.name,
      breadcrumb: [brand.brandName, district.city, district.name].filter(Boolean).join(" / "),
      brandName: brand.brandName,
      city: district.city,
      district: district.name,
      metrics: {
        storeCount: district.storeCount,
        exposure: district.exposure,
        visits: district.visits,
        dealClicks: district.dealClicks,
        visitRate: district.visitRate,
        dealClickRate: district.dealClickRate
      },
      dateRange
    };
  }

  if (level === "city" && selection.city) {
    const city = (drillMetrics.cities || []).find((item) => item.name === selection.city);
    if (!city) return null;
    return {
      level: "city",
      label: city.name,
      breadcrumb: [brand.brandName, city.name].join(" / "),
      brandName: brand.brandName,
      city: city.name,
      metrics: {
        gmv: city.gmv,
        roi: city.roi,
        verifiedRate: city.verifiedRate,
        storeCount: city.storeCount,
        paidOrders: city.paidOrders,
        verifiedOrders: city.verifiedOrders,
        avgOrderValue: city.avgOrderValue
      },
      dateRange
    };
  }

  return {
    level: "brand",
    label: brand.brandName || BRAND_NAME,
    breadcrumb: brand.brandName || BRAND_NAME,
    brandName: brand.brandName || BRAND_NAME,
      metrics: {
        gtv: brand.gtv,
        gmv: brand.gmv,
        verifiedRate: brand.verifiedRate,
        storeCount: brand.storeCount,
        paidOrders: brand.paidOrders,
        verifiedOrders: brand.verifiedOrders,
        avgOrderValue: brand.avgOrderValue
      },
    dateRange
  };
}

function scaleFunnelForScope(funnel, scope) {
  if (!funnel || !funnel.length || !scope) return funnel || [];
  if (scope.level === "brand") return funnel;
  const brandGmv = Number(scope.metrics && scope.metrics.gmv) || 0;
  const ratio =
    scope.level === "city"
      ? Math.min(0.35, Math.max(0.08, brandGmv / Math.max(funnel[0] && funnel[0].value || 1, 1)))
      : scope.level === "district"
        ? Math.min(0.12, Math.max(0.02, (scope.metrics.visits || 1) / Math.max(funnel[1] && funnel[1].value || 1, 1)))
        : Math.min(0.04, Math.max(0.005, (scope.metrics.visits || 1) / Math.max(funnel[1] && funnel[1].value || 1, 1)));
  return funnel.map((item) => ({
    stage: item.stage,
    value: Math.round(Number(item.value || 0) * ratio)
  }));
}

module.exports = {
  DATE_RANGE,
  BRAND_ID,
  BRAND_NAME,
  DRILL_CATALOG,
  generateHaidilaoDrillFixture,
  filterByDateRange,
  filterMonthsByRange,
  resolveMetricsPeriod,
  aggregatePoiFactsInRange,
  aggregateCityMonthlyInRange,
  aggregateBrandMonthlyInRange,
  buildDrillMetrics,
  resolveDrillScope,
  scaleFunnelForScope,
  monthEndDates,
  slugify,
  pickMonthKeyFromRows,
  pickLatestMonthKey
};
