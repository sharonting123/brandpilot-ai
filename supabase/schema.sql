create extension if not exists pgcrypto;

create table if not exists public.dim_brand (
  brand_id text primary key,
  brand_name text not null,
  category text not null,
  brand_level text,
  headquarter_city text,
  store_count integer,
  ka_owner text,
  cooperation_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.dim_poi (
  poi_id text primary key,
  brand_id text references public.dim_brand(brand_id) on delete set null,
  poi_name text not null,
  city text,
  district text,
  business_area text,
  category text,
  address text,
  lat numeric(10, 6),
  lng numeric(10, 6),
  poi_status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.dim_deal (
  deal_id text primary key,
  poi_id text references public.dim_poi(poi_id) on delete set null,
  brand_id text references public.dim_brand(brand_id) on delete set null,
  deal_name text not null,
  deal_type text not null,
  campaign_id text,
  list_price numeric(12, 2),
  pay_price numeric(12, 2),
  coupon_reduce numeric(12, 2),
  is_marketing_deal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.fact_search_keyword_daily (
  date date not null,
  brand_id text not null references public.dim_brand(brand_id) on delete cascade,
  search_word text not null,
  source text not null,
  query_id text,
  global_id text,
  impressions integer not null default 0,
  clicks integer not null default 0,
  poi_clicks integer not null default 0,
  deal_clicks integer not null default 0,
  order_submits integer not null default 0,
  paid_orders integer not null default 0,
  verified_orders integer not null default 0,
  gmv numeric(14, 2) not null default 0,
  primary key (date, brand_id, search_word, source)
);

create table if not exists public.fact_poi_daily (
  date date not null,
  poi_id text not null references public.dim_poi(poi_id) on delete cascade,
  exposure integer not null default 0,
  visits integer not null default 0,
  search_visits integer not null default 0,
  deal_clicks integer not null default 0,
  favorite_count integer not null default 0,
  navigate_clicks integer not null default 0,
  phone_clicks integer not null default 0,
  avg_stay_seconds numeric(10, 2) not null default 0,
  primary key (date, poi_id)
);

create table if not exists public.fact_deal_campaign_daily (
  date date not null,
  deal_id text not null references public.dim_deal(deal_id) on delete cascade,
  campaign_id text not null,
  source text not null,
  impressions integer not null default 0,
  detail_views integer not null default 0,
  buy_clicks integer not null default 0,
  order_submits integer not null default 0,
  paid_orders integer not null default 0,
  verified_orders integer not null default 0,
  pay_gmv numeric(14, 2) not null default 0,
  coupon_reduce_amount numeric(14, 2) not null default 0,
  refunds integer not null default 0,
  primary key (date, deal_id, campaign_id, source)
);

create table if not exists public.fact_meituan_funnel_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  session_id text not null,
  event_type text not null,
  activity_class text not null,
  route_uri text,
  mrn_biz text,
  mrn_entry text,
  mrn_component text,
  source text,
  mt_source text,
  search_word text,
  query_id text,
  global_id text,
  poi_id text references public.dim_poi(poi_id) on delete set null,
  deal_id text references public.dim_deal(deal_id) on delete set null,
  campaign_id text,
  button_type text,
  pay_price numeric(12, 2),
  coupon_reduce numeric(12, 2),
  page_stay_duration_ms integer,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.brand_proposals (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  brand_name text not null,
  title text not null,
  opportunity_score integer check (opportunity_score between 0 and 100),
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.brand_proposals(id) on delete cascade,
  agent_name text not null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  asset_type text not null,
  title text not null,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dim_brand enable row level security;
alter table public.dim_poi enable row level security;
alter table public.dim_deal enable row level security;
alter table public.fact_search_keyword_daily enable row level security;
alter table public.fact_poi_daily enable row level security;
alter table public.fact_deal_campaign_daily enable row level security;
alter table public.fact_meituan_funnel_events enable row level security;
alter table public.brand_proposals enable row level security;
alter table public.agent_events enable row level security;
alter table public.brand_assets enable row level security;

drop policy if exists "demo read dim brand" on public.dim_brand;
drop policy if exists "demo read dim poi" on public.dim_poi;
drop policy if exists "demo read dim deal" on public.dim_deal;
drop policy if exists "demo read search keyword daily" on public.fact_search_keyword_daily;
drop policy if exists "demo read poi daily" on public.fact_poi_daily;
drop policy if exists "demo read deal campaign daily" on public.fact_deal_campaign_daily;
drop policy if exists "demo read meituan funnel events" on public.fact_meituan_funnel_events;
drop policy if exists "demo insert meituan funnel events" on public.fact_meituan_funnel_events;
drop policy if exists "demo read brand proposals" on public.brand_proposals;
drop policy if exists "demo insert brand proposals" on public.brand_proposals;
drop policy if exists "demo read agent events" on public.agent_events;
drop policy if exists "demo insert agent events" on public.agent_events;
drop policy if exists "demo read brand assets" on public.brand_assets;
drop policy if exists "demo insert brand assets" on public.brand_assets;

create policy "demo read dim brand"
  on public.dim_brand for select
  to anon
  using (true);

create policy "demo read dim poi"
  on public.dim_poi for select
  to anon
  using (true);

create policy "demo read dim deal"
  on public.dim_deal for select
  to anon
  using (true);

create policy "demo read search keyword daily"
  on public.fact_search_keyword_daily for select
  to anon
  using (true);

create policy "demo read poi daily"
  on public.fact_poi_daily for select
  to anon
  using (true);

create policy "demo read deal campaign daily"
  on public.fact_deal_campaign_daily for select
  to anon
  using (true);

create policy "demo read meituan funnel events"
  on public.fact_meituan_funnel_events for select
  to anon
  using (true);

create policy "demo insert meituan funnel events"
  on public.fact_meituan_funnel_events for insert
  to anon
  with check (true);

create policy "demo read brand proposals"
  on public.brand_proposals for select
  to anon
  using (true);

create policy "demo insert brand proposals"
  on public.brand_proposals for insert
  to anon
  with check (true);

create policy "demo read agent events"
  on public.agent_events for select
  to anon
  using (true);

create policy "demo insert agent events"
  on public.agent_events for insert
  to anon
  with check (true);

create policy "demo read brand assets"
  on public.brand_assets for select
  to anon
  using (true);

create policy "demo insert brand assets"
  on public.brand_assets for insert
  to anon
  with check (true);

create index if not exists idx_brand_proposals_created_at
  on public.brand_proposals(created_at desc);

create index if not exists idx_brand_assets_brand_id
  on public.brand_assets(brand_id);

create index if not exists idx_dim_poi_brand_id
  on public.dim_poi(brand_id);

create index if not exists idx_dim_deal_brand_id
  on public.dim_deal(brand_id);

create index if not exists idx_funnel_session
  on public.fact_meituan_funnel_events(session_id, occurred_at);

create index if not exists idx_funnel_poi_deal
  on public.fact_meituan_funnel_events(poi_id, deal_id);

create or replace view public.vw_meituan_funnel_demo as
select
  occurred_at,
  session_id,
  event_type,
  activity_class,
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
  page_stay_duration_ms
from public.fact_meituan_funnel_events;

insert into public.dim_brand (
  brand_id,
  brand_name,
  category,
  brand_level,
  headquarter_city,
  store_count,
  ka_owner,
  cooperation_status
)
values
  ('haidilao', '海底捞', '火锅', '全国 KA', '北京', 1400, 'KA 城市经理', '深度合作')
on conflict (brand_id) do update
set
  brand_name = excluded.brand_name,
  category = excluded.category,
  brand_level = excluded.brand_level,
  headquarter_city = excluded.headquarter_city,
  store_count = excluded.store_count,
  ka_owner = excluded.ka_owner,
  cooperation_status = excluded.cooperation_status;

insert into public.dim_poi (
  poi_id,
  brand_id,
  poi_name,
  city,
  district,
  business_area,
  category,
  address,
  poi_status
)
values
  (
    '1287671875',
    'haidilao',
    '海底捞火锅示例门店',
    '三河',
    '燕郊',
    '示例商圈',
    '火锅',
    '由真实 App 链路脱敏生成的 Demo POI',
    'active'
  )
on conflict (poi_id) do update
set
  brand_id = excluded.brand_id,
  poi_name = excluded.poi_name,
  city = excluded.city,
  district = excluded.district,
  business_area = excluded.business_area,
  category = excluded.category,
  address = excluded.address,
  poi_status = excluded.poi_status;

insert into public.dim_deal (
  deal_id,
  poi_id,
  brand_id,
  deal_name,
  deal_type,
  campaign_id,
  list_price,
  pay_price,
  coupon_reduce,
  is_marketing_deal
)
values
  (
    '1651151438',
    '1287671875',
    'haidilao',
    '海底捞营销套餐示例',
    '团购套餐',
    '1151457400',
    389.00,
    358.30,
    30.70,
    true
  )
on conflict (deal_id) do update
set
  poi_id = excluded.poi_id,
  brand_id = excluded.brand_id,
  deal_name = excluded.deal_name,
  deal_type = excluded.deal_type,
  campaign_id = excluded.campaign_id,
  list_price = excluded.list_price,
  pay_price = excluded.pay_price,
  coupon_reduce = excluded.coupon_reduce,
  is_marketing_deal = excluded.is_marketing_deal;

insert into public.fact_search_keyword_daily (
  date,
  brand_id,
  search_word,
  source,
  query_id,
  global_id,
  impressions,
  clicks,
  poi_clicks,
  deal_clicks,
  order_submits,
  paid_orders,
  verified_orders,
  gmv
)
values
  (
    current_date,
    'haidilao',
    'haidilao',
    'mt_search_poi',
    'demo-query-hdl',
    'demo-global-hdl',
    12800,
    1140,
    436,
    172,
    64,
    41,
    29,
    14690.30
  )
on conflict (date, brand_id, search_word, source) do update
set
  query_id = excluded.query_id,
  global_id = excluded.global_id,
  impressions = excluded.impressions,
  clicks = excluded.clicks,
  poi_clicks = excluded.poi_clicks,
  deal_clicks = excluded.deal_clicks,
  order_submits = excluded.order_submits,
  paid_orders = excluded.paid_orders,
  verified_orders = excluded.verified_orders,
  gmv = excluded.gmv;

insert into public.fact_poi_daily (
  date,
  poi_id,
  exposure,
  visits,
  search_visits,
  deal_clicks,
  favorite_count,
  navigate_clicks,
  phone_clicks,
  avg_stay_seconds
)
values
  (current_date, '1287671875', 18600, 2410, 436, 172, 83, 46, 18, 89.0)
on conflict (date, poi_id) do update
set
  exposure = excluded.exposure,
  visits = excluded.visits,
  search_visits = excluded.search_visits,
  deal_clicks = excluded.deal_clicks,
  favorite_count = excluded.favorite_count,
  navigate_clicks = excluded.navigate_clicks,
  phone_clicks = excluded.phone_clicks,
  avg_stay_seconds = excluded.avg_stay_seconds;

insert into public.fact_deal_campaign_daily (
  date,
  deal_id,
  campaign_id,
  source,
  impressions,
  detail_views,
  buy_clicks,
  order_submits,
  paid_orders,
  verified_orders,
  pay_gmv,
  coupon_reduce_amount,
  refunds
)
values
  (current_date, '1651151438', '1151457400', 'mt_search_poi', 3220, 172, 91, 64, 41, 29, 14690.30, 1258.70, 2)
on conflict (date, deal_id, campaign_id, source) do update
set
  impressions = excluded.impressions,
  detail_views = excluded.detail_views,
  buy_clicks = excluded.buy_clicks,
  order_submits = excluded.order_submits,
  paid_orders = excluded.paid_orders,
  verified_orders = excluded.verified_orders,
  pay_gmv = excluded.pay_gmv,
  coupon_reduce_amount = excluded.coupon_reduce_amount,
  refunds = excluded.refunds;

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
values
  (
    'tea-east',
    'case',
    '华东茶饮连锁午高峰增长案例',
    'CBD 与高校商圈使用门店分层券包，优先拉动新客首购与 14 日复购。',
    '{"source":"demo_seed","scenario":"brand_proposal"}'
  ),
  (
    'food-south',
    'case',
    '华南轻食品牌履约效率案例',
    '按商圈和配送半径拆解履约波动，配合周期购套餐提升晚高峰复购。',
    '{"source":"demo_seed","scenario":"brand_proposal"}'
  ),
  (
    'haidilao',
    'funnel_case',
    '海底捞搜索到核销归因样例',
    '搜索词进入 POI，点击营销套餐，进入下单确认页，后续用支付和核销补齐闭环。',
    '{"source":"adb_observation","scenario":"meituan_local_life_funnel"}'
  )
on conflict do nothing;
