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
