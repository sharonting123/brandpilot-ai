delete from public.fact_meituan_funnel_events
where session_id = 'demo-hdl-search-session';

insert into public.fact_meituan_funnel_events (
  session_id,
  event_type,
  activity_class,
  route_uri,
  mrn_biz,
  mrn_entry,
  mrn_component,
  source,
  mt_source,
  search_word,
  query_id,
  global_id,
  poi_id,
  deal_id,
  campaign_id,
  button_type,
  pay_price,
  coupon_reduce,
  page_stay_duration_ms,
  payload
)
values
  (
    'demo-hdl-search-session',
    'home_open',
    'com.meituan.android.pt.homepage.activity.MainActivity',
    'imeituan://www.meituan.com/',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    '{"stage":"首页"}'
  ),
  (
    'demo-hdl-search-session',
    'search_result',
    'com.sankuai.meituan.search.result.SearchResultActivity',
    'imeituan://www.meituan.com/search/result',
    null,
    null,
    null,
    'mt_search_poi',
    null,
    'haidilao',
    'demo-query-hdl',
    'demo-global-hdl',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    '{"stage":"搜索结果"}'
  ),
  (
    'demo-hdl-search-session',
    'poi_view',
    'com.meituan.android.mrn.container.MRNBaseActivity',
    'imeituan://www.meituan.com/mrn?mrn_biz=meishi&mrn_entry=food-poi&mrn_component=food-poi',
    'meishi',
    'food-poi',
    'food-poi',
    'mt_search_poi',
    'mt_search',
    'haidilao',
    'demo-query-hdl',
    'demo-global-hdl',
    '1287671875',
    null,
    null,
    null,
    null,
    null,
    null,
    '{"stage":"POI 门店页"}'
  ),
  (
    'demo-hdl-search-session',
    'deal_view',
    'com.meituan.android.mrn.container.MRNStandardActivity',
    'imeituan://www.meituan.com/standardmrn?mrn_entry=food-deal&mrn_component=food-deal',
    'meishi',
    'food-deal',
    'food-deal',
    'mt_search_poi',
    null,
    'haidilao',
    'demo-query-hdl',
    'demo-global-hdl',
    '1287671875',
    '1651151438',
    '1151457400',
    null,
    358.30,
    30.70,
    88996,
    '{"stage":"套餐/券详情","isMarketingDeal":true}'
  ),
  (
    'demo-hdl-search-session',
    'order_submit',
    'com.meituan.android.mrn.container.MRNStandardActivity',
    'imeituan://www.meituan.com/standardmrn?mrn_entry=c-group-order-submit&mrn_component=GroupOrderSubmit',
    'meishi',
    'c-group-order-submit',
    'GroupOrderSubmit',
    'mt_search_poi',
    null,
    'haidilao',
    'demo-query-hdl',
    'demo-global-hdl',
    '1287671875',
    '1651151438',
    '1151457400',
    'buy',
    358.30,
    30.70,
    88996,
    '{"stage":"下单确认","stopBeforePayment":true}'
  );

insert into public.brand_assets (brand_id, asset_type, title, content, metadata)
select
  'tea-east',
  'case',
  '华东茶饮连锁午高峰增长案例',
  'CBD 与高校商圈使用门店分层券包，优先拉动新客首购与 14 日复购。',
  '{"source":"demo_seed","scenario":"brand_proposal"}'::jsonb
where not exists (
  select 1 from public.brand_assets
  where brand_id = 'tea-east'
    and asset_type = 'case'
    and title = '华东茶饮连锁午高峰增长案例'
);

insert into public.brand_assets (brand_id, asset_type, title, content, metadata)
select
  'food-south',
  'case',
  '华南轻食品牌履约效率案例',
  '按商圈和配送半径拆解履约波动，配合周期购套餐提升晚高峰复购。',
  '{"source":"demo_seed","scenario":"brand_proposal"}'::jsonb
where not exists (
  select 1 from public.brand_assets
  where brand_id = 'food-south'
    and asset_type = 'case'
    and title = '华南轻食品牌履约效率案例'
);

insert into public.brand_assets (brand_id, asset_type, title, content, metadata)
select
  'haidilao',
  'funnel_case',
  '海底捞搜索到核销归因样例',
  '搜索词进入 POI，点击营销套餐，进入下单确认页，后续用支付和核销补齐闭环。',
  '{"source":"adb_observation","scenario":"meituan_local_life_funnel"}'::jsonb
where not exists (
  select 1 from public.brand_assets
  where brand_id = 'haidilao'
    and asset_type = 'funnel_case'
    and title = '海底捞搜索到核销归因样例'
);

insert into public.brand_assets (brand_id, asset_type, title, content, metadata)
select *
from (
  values
    (
      'haidilao',
      'analysis_framework',
      '经分框架：GTV 三因子拆解',
      '半年度复盘按交易用户数、购买频次、客单价拆解 GTV，并区分自然增长、活动拉动和套餐结构变化。',
      '{"source":"html_reference","framework":"gtv_three_factor"}'::jsonb
    ),
    (
      'haidilao',
      'analysis_framework',
      '经分框架：变现率结构性置换',
      '提案需同时观察佣金收入、广告收入、商户广告渗透率和综合 take rate，避免只用交易额判断经营质量。',
      '{"source":"html_reference","framework":"take_rate_mix"}'::jsonb
    ),
    (
      'haidilao',
      'analysis_framework',
      '经分框架：UE 与 LTV/CAC',
      '单店 UE 关注 GTV、佣金、广告收入、补贴和运营成本；单用户 UE 关注获客成本、回本周期、复购和 LTV/CAC。',
      '{"source":"html_reference","framework":"unit_economics"}'::jsonb
    ),
    (
      'haidilao',
      'risk_threshold',
      '经分预警线：补贴率、广告渗透、核销率',
      '补贴率接近 2% 代表竞争烈度抬升；广告商户渗透低于 15% 代表商户投放意愿不足；核销率跌破 78% 代表购买决策质量下降。',
      '{"source":"html_reference","framework":"kpi_guardrail"}'::jsonb
    ),
    (
      'haidilao',
      'resource_allocation',
      '下半年资源分配建议',
      '优先投向搜索广告产品、推荐广告、商户广告教育、场景化套餐和 AI 经营复盘工具，用资源分配解释下半年增长路径。',
      '{"source":"html_reference","framework":"resource_allocation"}'::jsonb
    )
) as assets(brand_id, asset_type, title, content, metadata)
where not exists (
  select 1 from public.brand_assets existing
  where existing.brand_id = assets.brand_id
    and existing.asset_type = assets.asset_type
    and existing.title = assets.title
);
