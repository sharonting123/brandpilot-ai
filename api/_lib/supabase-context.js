const { getSupabaseConfig } = require("./env");
const { DATE_RANGE, generateHaidilaoDrillFixture, filterByDateRange, filterMonthsByRange } = require("./drill-data");

async function loadSupabaseContext(config = getSupabaseConfig(process.env), options = {}) {
  const brandId = options.brandId || "haidilao";
  if (!config.configured) {
    return withFixture({
      connected: false,
      dataMode: "fixture",
      errors: ["SUPABASE_URL or SUPABASE_ANON_KEY is not configured"],
      warnings: ["使用内置海底捞演示数据，不能代表真实生产底表。"]
    });
  }

  const endpoint = config.url.replace(/\/$/, "");
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    "Content-Type": "application/json"
  };
  const dateFrom = options.dateFrom || DATE_RANGE.from;
  const dateTo = options.dateTo || DATE_RANGE.to;
  const queries = {
    brandProfile: `${endpoint}/rest/v1/dim_brand?brand_id=eq.${encodeURIComponent(brandId)}&select=*&limit=1`,
    pois: `${endpoint}/rest/v1/dim_poi?brand_id=eq.${encodeURIComponent(brandId)}&select=*&limit=200`,
    deals: `${endpoint}/rest/v1/dim_deal?brand_id=eq.${encodeURIComponent(brandId)}&select=*&limit=50`,
    funnelEvents: `${endpoint}/rest/v1/vw_meituan_funnel_demo?select=*&order=occurred_at.asc&limit=30`,
    searchFacts: `${endpoint}/rest/v1/fact_search_keyword_daily?brand_id=eq.${encodeURIComponent(brandId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=*&order=date.desc&limit=500`,
    poiFacts: `${endpoint}/rest/v1/fact_poi_daily?date=gte.${dateFrom}&date=lte.${dateTo}&select=*&order=date.desc&limit=2000`,
    campaignFacts: `${endpoint}/rest/v1/fact_deal_campaign_daily?date=gte.${dateFrom}&date=lte.${dateTo}&select=*&order=date.desc&limit=500`,
    brandMonthly: `${endpoint}/rest/v1/fact_brand_monthly?brand_id=eq.${encodeURIComponent(brandId)}&month=gte.${dateFrom}&month=lte.${dateTo}&select=*&order=month.asc&limit=80`,
    cityMonthly: `${endpoint}/rest/v1/fact_city_brand_monthly?brand_id=eq.${encodeURIComponent(brandId)}&month=gte.${dateFrom}&month=lte.${dateTo}&select=*&order=month.asc&limit=500`,
    competitorBenchmarks: `${endpoint}/rest/v1/fact_competitor_benchmark_monthly?brand_id=eq.${encodeURIComponent(brandId)}&month=gte.${dateFrom}&month=lte.${dateTo}&select=*&order=month.desc&limit=80`,
    peerBrandProfile: `${endpoint}/rest/v1/dim_brand?brand_id=eq.xiabuxiabu&select=*&limit=1`,
    peerBrandMonthly: `${endpoint}/rest/v1/fact_brand_monthly?brand_id=eq.xiabuxiabu&month=gte.${dateFrom}&month=lte.${dateTo}&select=*&order=month.desc&limit=80`,
    peerCityMonthly: `${endpoint}/rest/v1/fact_city_brand_monthly?brand_id=eq.xiabuxiabu&month=gte.${dateFrom}&month=lte.${dateTo}&select=*&order=month.asc&limit=500`,
    assets: `${endpoint}/rest/v1/brand_assets?brand_id=eq.${encodeURIComponent(brandId)}&select=asset_type,title,content,metadata&order=created_at.desc&limit=10`
  };

  const entries = await Promise.all(
    Object.entries(queries).map(async ([key, url]) => [key, await supabaseGet(url, headers, config.timeoutMs)])
  );
  const rowsByKey = Object.fromEntries(entries.map(([key, result]) => [key, result.rows]));
  const errors = entries.flatMap(([key, result]) => (result.error ? [`${key}: ${result.error}`] : []));
  const hasData = entries.some(([, result]) => result.rows.length > 0);

  const poiIds = new Set((rowsByKey.pois || []).map((row) => row.poi_id));
  const poiFacts = (rowsByKey.poiFacts || []).filter((row) => poiIds.has(row.poi_id));

  const context = {
    connected: errors.length < entries.length,
    dataMode: hasData ? "supabase" : "fixture",
    errors,
    warnings: hasData ? [] : ["Supabase 未返回可用数据，已降级到内置海底捞演示数据。"],
    dateRange: { from: dateFrom, to: dateTo },
    brandProfile: rowsByKey.brandProfile?.[0] || null,
    pois: rowsByKey.pois || [],
    deals: rowsByKey.deals || [],
    funnelEvents: rowsByKey.funnelEvents || [],
    dailyFacts: {
      searchFacts: filterByDateRange(rowsByKey.searchFacts || [], dateFrom, dateTo),
      poiFacts: filterByDateRange(poiFacts, dateFrom, dateTo),
      campaignFacts: filterByDateRange(rowsByKey.campaignFacts || [], dateFrom, dateTo)
    },
    monthlyFacts: filterMonthsByRange(rowsByKey.brandMonthly || [], dateFrom, dateTo),
    cityMonthlyFacts: filterMonthsByRange(rowsByKey.cityMonthly || [], dateFrom, dateTo),
    competitorBenchmarks: filterMonthsByRange(rowsByKey.competitorBenchmarks || [], dateFrom, dateTo),
    peerBrandProfile: rowsByKey.peerBrandProfile?.[0] || null,
    peerBrandMonthlyFacts: rowsByKey.peerBrandMonthly || [],
    peerCityMonthlyFacts: rowsByKey.peerCityMonthly || [],
    assets: rowsByKey.assets || []
  };

  return withPeerFixture(hasData ? context : withFixture(context));
}

function withPeerFixture(context) {
  const peerFixture = getXiabuxiabuFixture();
  return {
    ...context,
    peerBrandProfile: context.peerBrandProfile || peerFixture.brandProfile,
    peerBrandMonthlyFacts: context.peerBrandMonthlyFacts?.length
      ? context.peerBrandMonthlyFacts
      : peerFixture.monthlyFacts,
    peerCityMonthlyFacts: context.peerCityMonthlyFacts?.length
      ? context.peerCityMonthlyFacts
      : peerFixture.cityMonthlyFacts
  };
}

async function supabaseGet(url, headers, timeoutMs) {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      return { rows: [], error: `HTTP ${response.status}` };
    }
    const rows = await response.json();
    return { rows: Array.isArray(rows) ? rows : [], error: null };
  } catch (error) {
    return { rows: [], error: error.cause?.code || error.message };
  }
}

function withFixture(context) {
  const fixture = getHaidilaoFixture();
  return {
    ...context,
    brandProfile: context.brandProfile || fixture.brandProfile,
    pois: context.pois?.length ? context.pois : fixture.pois,
    deals: context.deals?.length ? context.deals : fixture.deals,
    funnelEvents: context.funnelEvents?.length ? context.funnelEvents : fixture.funnelEvents,
    dailyFacts: {
      searchFacts: context.dailyFacts?.searchFacts?.length ? context.dailyFacts.searchFacts : fixture.dailyFacts.searchFacts,
      poiFacts: context.dailyFacts?.poiFacts?.length ? context.dailyFacts.poiFacts : fixture.dailyFacts.poiFacts,
      campaignFacts: context.dailyFacts?.campaignFacts?.length ? context.dailyFacts.campaignFacts : fixture.dailyFacts.campaignFacts
    },
    monthlyFacts: context.monthlyFacts?.length ? context.monthlyFacts : fixture.monthlyFacts,
    cityMonthlyFacts: context.cityMonthlyFacts?.length ? context.cityMonthlyFacts : fixture.cityMonthlyFacts,
    competitorBenchmarks: context.competitorBenchmarks?.length ? context.competitorBenchmarks : fixture.competitorBenchmarks,
    assets: context.assets?.length ? context.assets : fixture.assets
  };
}

function getXiabuxiabuFixture() {
  return {
    brandProfile: {
      brand_id: "xiabuxiabu",
      brand_name: "呷哺呷哺",
      category: "小火锅",
      brand_level: "全国连锁",
      headquarter_city: "北京",
      store_count: 900,
      ka_owner: "KA 城市经理",
      cooperation_status: "稳定合作"
    },
    monthlyFacts: [
      { month: "2026-06-30", brand_id: "xiabuxiabu", active_users: 168000, purchase_frequency: 1.22, avg_order_value: 203.4, gtv: 75682320, paid_orders: 372100, verified_orders: 299601, repeat_purchase_rate: 0.241, commission_revenue: 2812400, ad_revenue: 1185600, merchant_revenue: 3998000, subsidy_amount: 1281600, operating_cost: 986000, ad_merchant_penetration: 0.186, take_rate: 0.0528, subsidy_rate: 0.017, data_confidence: "demo_model" }
    ],
    cityMonthlyFacts: [
      { month: "2026-06-30", brand_id: "xiabuxiabu", city: "上海", store_count: 72, search_impressions: 920000, poi_visits: 148600, paid_orders: 49800, verified_orders: 39840, gmv: 16800000, coupon_reduce_amount: 286400, ad_spend: 268000, roi: 48.6, avg_order_value: 208 },
      { month: "2026-06-30", brand_id: "xiabuxiabu", city: "北京", store_count: 78, search_impressions: 860000, poi_visits: 136200, paid_orders: 46200, verified_orders: 36960, gmv: 15240000, coupon_reduce_amount: 251800, ad_spend: 246000, roi: 47.8, avg_order_value: 205 },
      { month: "2026-06-30", brand_id: "xiabuxiabu", city: "深圳", store_count: 48, search_impressions: 640000, poi_visits: 101800, paid_orders: 34600, verified_orders: 27340, gmv: 11280000, coupon_reduce_amount: 198600, ad_spend: 186000, roi: 46.2, avg_order_value: 198 },
      { month: "2026-06-30", brand_id: "xiabuxiabu", city: "成都", store_count: 52, search_impressions: 548000, poi_visits: 89600, paid_orders: 31800, verified_orders: 25440, gmv: 9840000, coupon_reduce_amount: 168400, ad_spend: 158000, roi: 49.1, avg_order_value: 192 },
      { month: "2026-06-30", brand_id: "xiabuxiabu", city: "杭州", store_count: 40, search_impressions: 462000, poi_visits: 74200, paid_orders: 22600, verified_orders: 18080, gmv: 7420000, coupon_reduce_amount: 132600, ad_spend: 124000, roi: 45.4, avg_order_value: 195 }
    ]
  };
}

function getHaidilaoFixture() {
  return generateHaidilaoDrillFixture();
}

function getHaidilaoFixtureLegacy() {
  return {
    brandProfile: {
      brand_id: "haidilao",
      brand_name: "海底捞",
      category: "火锅",
      brand_level: "全国 KA",
      headquarter_city: "北京",
      store_count: 1400,
      ka_owner: "KA 城市经理",
      cooperation_status: "深度合作"
    },
    pois: [
      {
        poi_id: "1287671875",
        brand_id: "haidilao",
        poi_name: "海底捞火锅示例门店",
        city: "三河",
        district: "燕郊",
        business_area: "示例商圈",
        category: "火锅",
        poi_status: "active"
      },
      {
        poi_id: "hdl-sh-jingan-001",
        brand_id: "haidilao",
        poi_name: "海底捞上海静安大悦城店",
        city: "上海",
        district: "静安",
        business_area: "静安大悦城",
        category: "火锅",
        poi_status: "active"
      },
      {
        poi_id: "hdl-bj-chaoyang-001",
        brand_id: "haidilao",
        poi_name: "海底捞北京朝阳合生汇店",
        city: "北京",
        district: "朝阳",
        business_area: "朝阳合生汇",
        category: "火锅",
        poi_status: "active"
      },
      {
        poi_id: "hdl-sz-nanshan-001",
        brand_id: "haidilao",
        poi_name: "海底捞深圳南山万象天地店",
        city: "深圳",
        district: "南山",
        business_area: "万象天地",
        category: "火锅",
        poi_status: "active"
      }
    ],
    deals: [
      {
        deal_id: "1651151438",
        poi_id: "1287671875",
        brand_id: "haidilao",
        deal_name: "海底捞营销套餐示例",
        deal_type: "团购套餐",
        campaign_id: "1151457400",
        list_price: 389,
        pay_price: 358.3,
        coupon_reduce: 30.7,
        is_marketing_deal: true
      },
      {
        deal_id: "hdl-family-499",
        poi_id: "hdl-sh-jingan-001",
        brand_id: "haidilao",
        deal_name: "4人家庭聚餐套餐",
        deal_type: "多人套餐",
        campaign_id: "hdl-2026h1-family",
        list_price: 568,
        pay_price: 499,
        coupon_reduce: 69,
        is_marketing_deal: true
      },
      {
        deal_id: "hdl-weekday-199",
        poi_id: "hdl-bj-chaoyang-001",
        brand_id: "haidilao",
        deal_name: "工作日双人错峰套餐",
        deal_type: "错峰套餐",
        campaign_id: "hdl-2026h1-weekday",
        list_price: 238,
        pay_price: 199,
        coupon_reduce: 39,
        is_marketing_deal: true
      }
    ],
    dailyFacts: {
      searchFacts: [
        {
          date: "2026-07-05",
          brand_id: "haidilao",
          search_word: "haidilao",
          source: "mt_search_poi",
          query_id: "demo-query-hdl",
          global_id: "demo-global-hdl",
          impressions: 12800,
          clicks: 1140,
          poi_clicks: 436,
          deal_clicks: 172,
          order_submits: 64,
          paid_orders: 41,
          verified_orders: 29,
          gmv: 14690.3
        },
        {
          date: "2026-06-30",
          brand_id: "haidilao",
          search_word: "haidilao",
          source: "mt_search_poi",
          impressions: 1280000,
          clicks: 121600,
          poi_clicks: 51200,
          deal_clicks: 23640,
          order_submits: 8460,
          paid_orders: 5415,
          verified_orders: 4620,
          gmv: 1730634
        },
        {
          date: "2026-05-31",
          brand_id: "haidilao",
          search_word: "海底捞生日",
          source: "mt_search_poi",
          impressions: 1215000,
          clicks: 113800,
          poi_clicks: 47200,
          deal_clicks: 20980,
          order_submits: 7810,
          paid_orders: 5028,
          verified_orders: 4284,
          gmv: 1579441.8
        }
      ],
      poiFacts: [
        {
          date: "2026-07-05",
          poi_id: "1287671875",
          exposure: 18600,
          visits: 2410,
          search_visits: 436,
          deal_clicks: 172,
          favorite_count: 83,
          navigate_clicks: 46,
          phone_clicks: 18,
          avg_stay_seconds: 89
        },
        {
          date: "2026-06-30",
          poi_id: "hdl-sh-jingan-001",
          exposure: 342000,
          visits: 57800,
          search_visits: 12840,
          deal_clicks: 5910,
          favorite_count: 2360,
          navigate_clicks: 1380,
          phone_clicks: 655,
          avg_stay_seconds: 116
        },
        {
          date: "2026-06-30",
          poi_id: "hdl-bj-chaoyang-001",
          exposure: 306000,
          visits: 51400,
          search_visits: 11620,
          deal_clicks: 5260,
          favorite_count: 2110,
          navigate_clicks: 1220,
          phone_clicks: 618,
          avg_stay_seconds: 111
        }
      ],
      campaignFacts: [
        {
          date: "2026-07-05",
          deal_id: "1651151438",
          campaign_id: "1151457400",
          source: "mt_search_poi",
          impressions: 3220,
          detail_views: 172,
          buy_clicks: 91,
          order_submits: 64,
          paid_orders: 41,
          verified_orders: 29,
          pay_gmv: 14690.3,
          coupon_reduce_amount: 1258.7,
          refunds: 2
        },
        {
          date: "2026-06-30",
          deal_id: "hdl-family-499",
          campaign_id: "hdl-2026h1-family",
          source: "mt_search_poi",
          impressions: 356000,
          detail_views: 5910,
          buy_clicks: 3720,
          order_submits: 2140,
          paid_orders: 1394,
          verified_orders: 1205,
          pay_gmv: 695606,
          coupon_reduce_amount: 96186,
          refunds: 41
        },
        {
          date: "2026-06-30",
          deal_id: "hdl-weekday-199",
          campaign_id: "hdl-2026h1-weekday",
          source: "mt_search_poi",
          impressions: 266000,
          detail_views: 5260,
          buy_clicks: 3340,
          order_submits: 1920,
          paid_orders: 1258,
          verified_orders: 1082,
          pay_gmv: 250342,
          coupon_reduce_amount: 49062,
          refunds: 34
        }
      ]
    },
    monthlyFacts: [
      { month: "2026-01-31", brand_id: "haidilao", active_users: 185000, purchase_frequency: 1.42, avg_order_value: 328.6, gtv: 86264820, paid_orders: 262522, verified_orders: 217894, repeat_purchase_rate: 0.238, commission_revenue: 3191800, ad_revenue: 1213400, merchant_revenue: 4405200, subsidy_amount: 1725300, operating_cost: 1184200, ad_merchant_penetration: 0.164, take_rate: 0.0511, subsidy_rate: 0.02, data_confidence: "demo_model" },
      { month: "2026-02-28", brand_id: "haidilao", active_users: 202000, purchase_frequency: 1.36, avg_order_value: 342.8, gtv: 94213440, paid_orders: 274834, verified_orders: 230861, repeat_purchase_rate: 0.251, commission_revenue: 3485900, ad_revenue: 1322800, merchant_revenue: 4808700, subsidy_amount: 1695842, operating_cost: 1256100, ad_merchant_penetration: 0.171, take_rate: 0.051, subsidy_rate: 0.018, data_confidence: "demo_model" },
      { month: "2026-03-31", brand_id: "haidilao", active_users: 214000, purchase_frequency: 1.31, avg_order_value: 318.5, gtv: 89255590, paid_orders: 280238, verified_orders: 235400, repeat_purchase_rate: 0.266, commission_revenue: 3302450, ad_revenue: 1459800, merchant_revenue: 4762250, subsidy_amount: 1517345, operating_cost: 1200800, ad_merchant_penetration: 0.184, take_rate: 0.0534, subsidy_rate: 0.017, data_confidence: "demo_model" },
      { month: "2026-04-30", brand_id: "haidilao", active_users: 226000, purchase_frequency: 1.28, avg_order_value: 306.7, gtv: 88710560, paid_orders: 289219, verified_orders: 244390, repeat_purchase_rate: 0.274, commission_revenue: 3282300, ad_revenue: 1586400, merchant_revenue: 4868700, subsidy_amount: 1419369, operating_cost: 1193600, ad_merchant_penetration: 0.196, take_rate: 0.0549, subsidy_rate: 0.016, data_confidence: "demo_model" },
      { month: "2026-05-31", brand_id: "haidilao", active_users: 241000, purchase_frequency: 1.33, avg_order_value: 314.2, gtv: 100726126, paid_orders: 320580, verified_orders: 273294, repeat_purchase_rate: 0.292, commission_revenue: 3726860, ad_revenue: 1814200, merchant_revenue: 5541060, subsidy_amount: 1510892, operating_cost: 1310500, ad_merchant_penetration: 0.214, take_rate: 0.055, subsidy_rate: 0.015, data_confidence: "demo_model" },
      { month: "2026-06-30", brand_id: "haidilao", active_users: 256000, purchase_frequency: 1.35, avg_order_value: 319.6, gtv: 110453760, paid_orders: 345600, verified_orders: 294912, repeat_purchase_rate: 0.308, commission_revenue: 4086780, ad_revenue: 2069500, merchant_revenue: 6156280, subsidy_amount: 1546353, operating_cost: 1394200, ad_merchant_penetration: 0.228, take_rate: 0.0557, subsidy_rate: 0.014, data_confidence: "demo_model" }
    ],
    cityMonthlyFacts: [
      { month: "2026-06-30", brand_id: "haidilao", city: "上海", store_count: 86, search_impressions: 1280000, poi_visits: 214000, paid_orders: 73600, verified_orders: 64032, gmv: 24729600, coupon_reduce_amount: 321500, ad_spend: 418000, roi: 59.16, avg_order_value: 336 },
      { month: "2026-06-30", brand_id: "haidilao", city: "北京", store_count: 92, search_impressions: 1165000, poi_visits: 190400, paid_orders: 68100, verified_orders: 57900, gmv: 22473000, coupon_reduce_amount: 298400, ad_spend: 386000, roi: 58.22, avg_order_value: 330 },
      { month: "2026-06-30", brand_id: "haidilao", city: "深圳", store_count: 58, search_impressions: 882000, poi_visits: 148900, paid_orders: 51200, verified_orders: 43520, gmv: 16435200, coupon_reduce_amount: 223100, ad_spend: 294000, roi: 55.9, avg_order_value: 321 },
      { month: "2026-06-30", brand_id: "haidilao", city: "成都", store_count: 64, search_impressions: 760000, poi_visits: 132600, paid_orders: 48600, verified_orders: 42282, gmv: 14580000, coupon_reduce_amount: 185600, ad_spend: 242000, roi: 60.25, avg_order_value: 300 },
      { month: "2026-06-30", brand_id: "haidilao", city: "杭州", store_count: 49, search_impressions: 625000, poi_visits: 103500, paid_orders: 34200, verified_orders: 28728, gmv: 10944000, coupon_reduce_amount: 154300, ad_spend: 206000, roi: 53.13, avg_order_value: 320 }
    ],
    competitorBenchmarks: [
      { month: "2026-06-30", brand_id: "haidilao", competitor: "美团", market_share: 0.67, avg_order_value: 319.6, verification_rate: 0.853, subsidy_rate: 0.014, ad_take_rate: 0.0187, content_share: 0.28, data_confidence: "demo_directional" },
      { month: "2026-06-30", brand_id: "haidilao", competitor: "抖音", market_share: 0.33, avg_order_value: 286, verification_rate: 0.57, subsidy_rate: 0.026, ad_take_rate: 0.0095, content_share: 0.52, data_confidence: "demo_directional" },
      { month: "2026-05-31", brand_id: "haidilao", competitor: "美团", market_share: 0.66, avg_order_value: 314.2, verification_rate: 0.852, subsidy_rate: 0.015, ad_take_rate: 0.018, content_share: 0.27, data_confidence: "demo_directional" },
      { month: "2026-05-31", brand_id: "haidilao", competitor: "抖音", market_share: 0.34, avg_order_value: 279, verification_rate: 0.55, subsidy_rate: 0.028, ad_take_rate: 0.009, content_share: 0.54, data_confidence: "demo_directional" }
    ],
    funnelEvents: [
      { event_type: "home_open", activity_class: "MainActivity", route_uri: "imeituan://www.meituan.com/" },
      { event_type: "search_result", activity_class: "SearchResultActivity", route_uri: "imeituan://www.meituan.com/search/result", source: "mt_search_poi", search_word: "haidilao" },
      { event_type: "poi_view", activity_class: "MRNBaseActivity", mrn_biz: "meishi", mrn_entry: "food-poi", source: "mt_search_poi", mt_source: "mt_search", search_word: "haidilao", poi_id: "1287671875" },
      { event_type: "deal_view", activity_class: "MRNStandardActivity", mrn_biz: "meishi", mrn_entry: "food-deal", source: "mt_search_poi", search_word: "haidilao", poi_id: "1287671875", deal_id: "1651151438", campaign_id: "1151457400", pay_price: 358.3, coupon_reduce: 30.7 },
      { event_type: "order_submit", activity_class: "MRNStandardActivity", mrn_biz: "meishi", mrn_entry: "c-group-order-submit", source: "mt_search_poi", search_word: "haidilao", poi_id: "1287671875", deal_id: "1651151438", campaign_id: "1151457400", button_type: "buy", pay_price: 358.3, coupon_reduce: 30.7 }
    ],
    assets: [
      {
        asset_type: "funnel_case",
        title: "海底捞搜索到核销归因样例",
        content: "搜索词进入 POI，点击营销套餐，进入下单确认页，后续用支付和核销补齐闭环。",
        metadata: { source: "adb_observation", scenario: "meituan_local_life_funnel" }
      },
      {
        asset_type: "analysis_framework",
        title: "经分框架：GTV 三因子拆解",
        content: "半年度复盘按交易用户数、购买频次、客单价拆解 GTV，并区分自然增长、活动拉动和套餐结构变化。",
        metadata: { source: "html_reference", framework: "gtv_three_factor" }
      },
      {
        asset_type: "risk_threshold",
        title: "经分预警线：补贴率、广告渗透、核销率",
        content: "补贴率接近 2% 代表竞争烈度抬升；广告商户渗透低于 15% 代表商户投放意愿不足；核销率跌破 78% 代表购买决策质量下降。",
        metadata: { source: "html_reference", framework: "kpi_guardrail" }
      }
    ]
  };
}

module.exports = {
  getHaidilaoFixture,
  getXiabuxiabuFixture,
  loadSupabaseContext
};
