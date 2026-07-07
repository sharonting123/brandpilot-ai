-- ==== supabase\01_core_tables.sql ====
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

create table if not exists public.fact_search_keyword_monthly (
  month date not null,
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
  primary key (month, brand_id, search_word, source)
);

create table if not exists public.fact_poi_monthly (
  month date not null,
  poi_id text not null references public.dim_poi(poi_id) on delete cascade,
  exposure integer not null default 0,
  visits integer not null default 0,
  search_visits integer not null default 0,
  recommend_visits integer not null default 0,
  deal_clicks integer not null default 0,
  favorite_count integer not null default 0,
  navigate_clicks integer not null default 0,
  phone_clicks integer not null default 0,
  avg_stay_seconds numeric(10, 2) not null default 0,
  primary key (month, poi_id)
);

create table if not exists public.fact_deal_campaign_monthly (
  month date not null,
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
  primary key (month, deal_id, campaign_id, source)
);

create table if not exists public.fact_brand_monthly (
  month date not null,
  brand_id text not null references public.dim_brand(brand_id) on delete cascade,
  active_users integer not null default 0,
  purchase_frequency numeric(10, 2) not null default 0,
  avg_order_value numeric(12, 2) not null default 0,
  gtv numeric(16, 2) not null default 0,
  paid_orders integer not null default 0,
  verified_orders integer not null default 0,
  repeat_purchase_rate numeric(8, 4) not null default 0,
  commission_revenue numeric(14, 2) not null default 0,
  ad_revenue numeric(14, 2) not null default 0,
  merchant_revenue numeric(14, 2) not null default 0,
  subsidy_amount numeric(14, 2) not null default 0,
  operating_cost numeric(14, 2) not null default 0,
  ad_merchant_penetration numeric(8, 4) not null default 0,
  take_rate numeric(8, 4) not null default 0,
  subsidy_rate numeric(8, 4) not null default 0,
  data_confidence text not null default 'demo_model',
  notes text,
  primary key (month, brand_id)
);

create table if not exists public.fact_city_brand_monthly (
  month date not null,
  brand_id text not null references public.dim_brand(brand_id) on delete cascade,
  city text not null,
  store_count integer not null default 0,
  search_impressions integer not null default 0,
  recommend_impressions integer not null default 0,
  poi_visits integer not null default 0,
  paid_orders integer not null default 0,
  verified_orders integer not null default 0,
  gmv numeric(14, 2) not null default 0,
  coupon_reduce_amount numeric(14, 2) not null default 0,
  ad_spend numeric(14, 2) not null default 0,
  roi numeric(10, 2) not null default 0,
  avg_order_value numeric(12, 2) not null default 0,
  primary key (month, brand_id, city)
);

create table if not exists public.fact_competitor_benchmark_monthly (
  month date not null,
  brand_id text not null references public.dim_brand(brand_id) on delete cascade,
  competitor text not null,
  market_share numeric(8, 4) not null default 0,
  avg_order_value numeric(12, 2) not null default 0,
  verification_rate numeric(8, 4) not null default 0,
  subsidy_rate numeric(8, 4) not null default 0,
  ad_take_rate numeric(8, 4) not null default 0,
  content_share numeric(8, 4) not null default 0,
  data_confidence text not null default 'modeled_directional',
  primary key (month, brand_id, competitor)
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


-- ==== supabase\02_rls_policies_indexes.sql ====
alter table public.dim_brand enable row level security;
alter table public.dim_poi enable row level security;
alter table public.dim_deal enable row level security;
alter table public.fact_search_keyword_monthly enable row level security;
alter table public.fact_poi_monthly enable row level security;
alter table public.fact_deal_campaign_monthly enable row level security;
alter table public.fact_brand_monthly enable row level security;
alter table public.fact_city_brand_monthly enable row level security;
alter table public.fact_competitor_benchmark_monthly enable row level security;
alter table public.fact_meituan_funnel_events enable row level security;
alter table public.brand_proposals enable row level security;
alter table public.agent_events enable row level security;
alter table public.brand_assets enable row level security;

drop policy if exists "demo read dim brand" on public.dim_brand;
drop policy if exists "demo read dim poi" on public.dim_poi;
drop policy if exists "demo read dim deal" on public.dim_deal;
drop policy if exists "demo read search keyword monthly" on public.fact_search_keyword_monthly;
drop policy if exists "demo read poi monthly" on public.fact_poi_monthly;
drop policy if exists "demo read deal campaign monthly" on public.fact_deal_campaign_monthly;
drop policy if exists "demo read brand monthly" on public.fact_brand_monthly;
drop policy if exists "demo read city brand monthly" on public.fact_city_brand_monthly;
drop policy if exists "demo read competitor benchmark monthly" on public.fact_competitor_benchmark_monthly;
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

create policy "demo read search keyword monthly"
  on public.fact_search_keyword_monthly for select
  to anon
  using (true);

create policy "demo read poi monthly"
  on public.fact_poi_monthly for select
  to anon
  using (true);

create policy "demo read deal campaign monthly"
  on public.fact_deal_campaign_monthly for select
  to anon
  using (true);

create policy "demo read brand monthly"
  on public.fact_brand_monthly for select
  to anon
  using (true);

create policy "demo read city brand monthly"
  on public.fact_city_brand_monthly for select
  to anon
  using (true);

create policy "demo read competitor benchmark monthly"
  on public.fact_competitor_benchmark_monthly for select
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

create index if not exists idx_brand_monthly_brand_month
  on public.fact_brand_monthly(brand_id, month desc);

create index if not exists idx_city_brand_monthly_brand_city
  on public.fact_city_brand_monthly(brand_id, city, month desc);

create index if not exists idx_competitor_benchmark_brand_month
  on public.fact_competitor_benchmark_monthly(brand_id, month desc);

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

grant usage on schema public to anon, authenticated;

grant select on
  public.dim_brand,
  public.dim_poi,
  public.dim_deal,
  public.fact_search_keyword_monthly,
  public.fact_poi_monthly,
  public.fact_deal_campaign_monthly,
  public.fact_brand_monthly,
  public.fact_city_brand_monthly,
  public.fact_competitor_benchmark_monthly,
  public.fact_meituan_funnel_events,
  public.brand_proposals,
  public.agent_events,
  public.brand_assets,
  public.vw_meituan_funnel_demo
to anon, authenticated;

grant insert on
  public.fact_meituan_funnel_events,
  public.brand_proposals,
  public.agent_events,
  public.brand_assets
to anon, authenticated;


-- ==== supabase\03_seed_dimensions.sql ====
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
  ('hdl-sh-jingan-001', 'haidilao', '海底捞上海静安大悦城店', '上海', '静安', '静安大悦城', '火锅', 'Demo：上海核心商圈门店', 'active'),
  ('hdl-bj-chaoyang-001', 'haidilao', '海底捞北京朝阳合生汇店', '北京', '朝阳', '朝阳合生汇', '火锅', 'Demo：北京核心商圈门店', 'active'),
  ('hdl-sz-nanshan-001', 'haidilao', '海底捞深圳南山万象天地店', '深圳', '南山', '万象天地', '火锅', 'Demo：深圳白领商圈门店', 'active'),
  ('hdl-cd-jinjiang-001', 'haidilao', '海底捞成都春熙路店', '成都', '锦江', '春熙路', '火锅', 'Demo：成都休闲商圈门店', 'active'),
  ('hdl-hz-binjiang-001', 'haidilao', '海底捞杭州滨江龙湖店', '杭州', '滨江', '滨江龙湖', '火锅', 'Demo：杭州高新商圈门店', 'active')
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
  ('hdl-family-499', 'hdl-sh-jingan-001', 'haidilao', '4人家庭聚餐套餐', '多人套餐', 'hdl-2026h1-family', 568.00, 499.00, 69.00, true),
  ('hdl-weekday-199', 'hdl-bj-chaoyang-001', 'haidilao', '工作日双人错峰套餐', '错峰套餐', 'hdl-2026h1-weekday', 238.00, 199.00, 39.00, true),
  ('hdl-member-299', 'hdl-sz-nanshan-001', 'haidilao', '会员日双人火锅套餐', '会员日套餐', 'hdl-2026h1-member', 338.00, 299.00, 39.00, true),
  ('hdl-night-259', 'hdl-cd-jinjiang-001', 'haidilao', '夜宵场景双人套餐', '夜宵套餐', 'hdl-2026h1-night', 298.00, 259.00, 39.00, true),
  ('hdl-student-159', 'hdl-hz-binjiang-001', 'haidilao', '学生工作餐双人套餐', '轻量套餐', 'hdl-2026h1-student', 188.00, 159.00, 29.00, true)
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


-- ==== supabase\04_seed_daily_facts.sql ====
insert into public.fact_search_keyword_monthly (
  month,
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
    '2026-01-31',
    'haidilao',
    'haidilao',
    'mt_search_poi',
    'demo-query-hdl-202601',
    'demo-global-hdl-202601',
    980000,
    85260,
    33800,
    12840,
    4860,
    3120,
    2589,
    1025232.00
  ),
  (
    '2026-02-28',
    'haidilao',
    '海底捞',
    'mt_search_poi',
    'demo-query-hdl-202602',
    'demo-global-hdl-202602',
    1086000,
    97900,
    40200,
    15820,
    6020,
    3875,
    3255,
    1328350.00
  ),
  (
    '2026-03-31',
    'haidilao',
    '海底捞火锅',
    'mt_search_poi',
    'demo-query-hdl-202603',
    'demo-global-hdl-202603',
    1128000,
    103220,
    42980,
    17420,
    6410,
    4122,
    3462,
    1312510.00
  ),
  (
    '2026-04-30',
    'haidilao',
    '海底捞团购',
    'mt_search_deal',
    'demo-query-hdl-202604',
    'demo-global-hdl-202604',
    1046000,
    93460,
    38610,
    18130,
    6680,
    4318,
    3660,
    1324210.60
  ),
  (
    '2026-05-31',
    'haidilao',
    '海底捞生日',
    'mt_search_poi',
    'demo-query-hdl-202605',
    'demo-global-hdl-202605',
    1215000,
    113800,
    47200,
    20980,
    7810,
    5028,
    4284,
    1579441.80
  ),
  (
    '2026-06-30',
    'haidilao',
    'haidilao',
    'mt_search_poi',
    'demo-query-hdl-202606',
    'demo-global-hdl-202606',
    1280000,
    121600,
    51200,
    23640,
    8460,
    5415,
    4620,
    1730634.00
  ),
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
on conflict (month, brand_id, search_word, source) do update
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

insert into public.fact_poi_monthly (
  month,
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
  ('2026-05-31', 'hdl-sh-jingan-001', 318000, 53200, 11800, 5240, 2180, 1260, 610, 112.0),
  ('2026-05-31', 'hdl-bj-chaoyang-001', 286000, 47600, 10640, 4680, 1960, 1115, 588, 108.0),
  ('2026-05-31', 'hdl-sz-nanshan-001', 226000, 38200, 8420, 3560, 1480, 910, 430, 101.0),
  ('2026-05-31', 'hdl-cd-jinjiang-001', 198000, 33600, 7820, 3320, 1320, 820, 398, 96.0),
  ('2026-05-31', 'hdl-hz-binjiang-001', 164000, 28400, 6120, 2760, 1090, 690, 322, 93.0),
  ('2026-06-30', 'hdl-sh-jingan-001', 342000, 57800, 12840, 5910, 2360, 1380, 655, 116.0),
  ('2026-06-30', 'hdl-bj-chaoyang-001', 306000, 51400, 11620, 5260, 2110, 1220, 618, 111.0),
  ('2026-06-30', 'hdl-sz-nanshan-001', 244000, 41800, 9340, 4210, 1640, 1010, 455, 103.0),
  ('2026-06-30', 'hdl-cd-jinjiang-001', 214000, 36800, 8540, 3740, 1460, 892, 410, 98.0),
  ('2026-06-30', 'hdl-hz-binjiang-001', 178000, 30600, 7060, 3180, 1210, 738, 350, 95.0),
  (current_date, '1287671875', 18600, 2410, 436, 172, 83, 46, 18, 89.0)
on conflict (month, poi_id) do update
set
  exposure = excluded.exposure,
  visits = excluded.visits,
  search_visits = excluded.search_visits,
  deal_clicks = excluded.deal_clicks,
  favorite_count = excluded.favorite_count,
  navigate_clicks = excluded.navigate_clicks,
  phone_clicks = excluded.phone_clicks,
  avg_stay_seconds = excluded.avg_stay_seconds;

insert into public.fact_deal_campaign_monthly (
  month,
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
  (
    '2026-05-31',
    'hdl-family-499',
    'hdl-2026h1-family',
    'mt_search_poi',
    318000,
    5240,
    3220,
    1850,
    1206,
    1025,
    601794.00,
    83120.00,
    38
  ),
  (
    '2026-05-31',
    'hdl-weekday-199',
    'hdl-2026h1-weekday',
    'mt_search_poi',
    242000,
    4680,
    2910,
    1680,
    1098,
    938,
    218502.00,
    42822.00,
    31
  ),
  (
    '2026-05-31',
    'hdl-member-299',
    'hdl-2026h1-member',
    'mt_search_poi',
    210000,
    3560,
    2240,
    1320,
    868,
    738,
    259532.00,
    33852.00,
    24
  ),
  (
    '2026-06-30',
    'hdl-family-499',
    'hdl-2026h1-family',
    'mt_search_poi',
    356000,
    5910,
    3720,
    2140,
    1394,
    1205,
    695606.00,
    96186.00,
    41
  ),
  (
    '2026-06-30',
    'hdl-weekday-199',
    'hdl-2026h1-weekday',
    'mt_search_poi',
    266000,
    5260,
    3340,
    1920,
    1258,
    1082,
    250342.00,
    49062.00,
    34
  ),
  (
    '2026-06-30',
    'hdl-member-299',
    'hdl-2026h1-member',
    'mt_search_poi',
    238000,
    4210,
    2680,
    1580,
    1032,
    884,
    308568.00,
    40248.00,
    28
  ),
  (
    current_date,
    '1651151438',
    '1151457400',
    'mt_search_poi',
    3220,
    172,
    91,
    64,
    41,
    29,
    14690.30,
    1258.70,
    2
  )
on conflict (month, deal_id, campaign_id, source) do update
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


-- ==== supabase\05_seed_funnel_events_assets.sql ====
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
      '优先投向搜索广告产品、商户广告教育、场景化套餐和 AI 经营复盘工具，用资源分配解释下半年增长路径。',
      '{"source":"html_reference","framework":"resource_allocation"}'::jsonb
    )
) as assets(brand_id, asset_type, title, content, metadata)
where not exists (
  select 1 from public.brand_assets existing
  where existing.brand_id = assets.brand_id
    and existing.asset_type = assets.asset_type
    and existing.title = assets.title
);


-- ==== supabase\07_seed_h1_enriched_metrics.sql ====
insert into public.fact_brand_monthly (
  month,
  brand_id,
  active_users,
  purchase_frequency,
  avg_order_value,
  gtv,
  paid_orders,
  verified_orders,
  repeat_purchase_rate,
  commission_revenue,
  ad_revenue,
  merchant_revenue,
  subsidy_amount,
  operating_cost,
  ad_merchant_penetration,
  take_rate,
  subsidy_rate,
  data_confidence,
  notes
)
values
  ('2026-01-31', 'haidilao', 185000, 1.42, 328.60, 86264820.00, 262522, 217894, 0.2380, 3191800.00, 1213400.00, 4405200.00, 1725300.00, 1184200.00, 0.1640, 0.0511, 0.0200, 'demo_model', '春节前聚餐需求抬升，补贴率触及 2% 警戒线。'),
  ('2026-02-28', 'haidilao', 202000, 1.36, 342.80, 94213440.00, 274834, 230861, 0.2510, 3485900.00, 1322800.00, 4808700.00, 1695842.00, 1256100.00, 0.1710, 0.0510, 0.0180, 'demo_model', '春节家庭聚餐高客单，核销率恢复。'),
  ('2026-03-31', 'haidilao', 214000, 1.31, 318.50, 89255590.00, 280238, 235400, 0.2660, 3302450.00, 1459800.00, 4762250.00, 1517345.00, 1200800.00, 0.1840, 0.0534, 0.0170, 'demo_model', '会员日素材拉动广告收入，变现率改善。'),
  ('2026-04-30', 'haidilao', 226000, 1.28, 306.70, 88710560.00, 289219, 244390, 0.2740, 3282300.00, 1586400.00, 4868700.00, 1419369.00, 1193600.00, 0.1960, 0.0549, 0.0160, 'demo_model', '淡季错峰套餐提升频次，补贴率下降。'),
  ('2026-05-31', 'haidilao', 241000, 1.33, 314.20, 100726126.00, 320580, 273294, 0.2920, 3726860.00, 1814200.00, 5541060.00, 1510892.00, 1310500.00, 0.2140, 0.0550, 0.0150, 'demo_model', '五一聚餐与搜索广告共振，GTV 与广告收入双升。'),
  ('2026-06-30', 'haidilao', 256000, 1.35, 319.60, 110453760.00, 345600, 294912, 0.3080, 4086780.00, 2069500.00, 6156280.00, 1546353.00, 1394200.00, 0.2280, 0.0557, 0.0140, 'demo_model', 'H1 收官月广告渗透继续提升，核销闭环稳定。')
on conflict (month, brand_id) do update
set
  active_users = excluded.active_users,
  purchase_frequency = excluded.purchase_frequency,
  avg_order_value = excluded.avg_order_value,
  gtv = excluded.gtv,
  paid_orders = excluded.paid_orders,
  verified_orders = excluded.verified_orders,
  repeat_purchase_rate = excluded.repeat_purchase_rate,
  commission_revenue = excluded.commission_revenue,
  ad_revenue = excluded.ad_revenue,
  merchant_revenue = excluded.merchant_revenue,
  subsidy_amount = excluded.subsidy_amount,
  operating_cost = excluded.operating_cost,
  ad_merchant_penetration = excluded.ad_merchant_penetration,
  take_rate = excluded.take_rate,
  subsidy_rate = excluded.subsidy_rate,
  data_confidence = excluded.data_confidence,
  notes = excluded.notes;

insert into public.fact_city_brand_monthly (
  month,
  brand_id,
  city,
  store_count,
  search_impressions,
  poi_visits,
  paid_orders,
  verified_orders,
  gmv,
  coupon_reduce_amount,
  ad_spend,
  roi,
  avg_order_value
)
values
  ('2026-06-30', 'haidilao', '上海', 86, 1280000, 214000, 73600, 64032, 24729600.00, 321500.00, 418000.00, 59.16, 336.00),
  ('2026-06-30', 'haidilao', '北京', 92, 1165000, 190400, 68100, 57900, 22473000.00, 298400.00, 386000.00, 58.22, 330.00),
  ('2026-06-30', 'haidilao', '深圳', 58, 882000, 148900, 51200, 43520, 16435200.00, 223100.00, 294000.00, 55.90, 321.00),
  ('2026-06-30', 'haidilao', '成都', 64, 760000, 132600, 48600, 42282, 14580000.00, 185600.00, 242000.00, 60.25, 300.00),
  ('2026-06-30', 'haidilao', '杭州', 49, 625000, 103500, 34200, 28728, 10944000.00, 154300.00, 206000.00, 53.13, 320.00),
  ('2026-05-31', 'haidilao', '上海', 86, 1195000, 199800, 68400, 58140, 22982400.00, 344200.00, 392000.00, 58.63, 336.00),
  ('2026-05-31', 'haidilao', '北京', 92, 1088000, 178600, 62200, 52870, 20526000.00, 318800.00, 361000.00, 56.86, 330.00),
  ('2026-05-31', 'haidilao', '深圳', 58, 830000, 139200, 47400, 40290, 15215400.00, 238900.00, 278000.00, 54.73, 321.00),
  ('2026-05-31', 'haidilao', '成都', 64, 718000, 124800, 45800, 38930, 13740000.00, 198000.00, 230000.00, 59.74, 300.00),
  ('2026-05-31', 'haidilao', '杭州', 49, 584000, 96000, 32780, 27535, 10489600.00, 162500.00, 195000.00, 53.79, 320.00)
on conflict (month, brand_id, city) do update
set
  store_count = excluded.store_count,
  search_impressions = excluded.search_impressions,
  poi_visits = excluded.poi_visits,
  paid_orders = excluded.paid_orders,
  verified_orders = excluded.verified_orders,
  gmv = excluded.gmv,
  coupon_reduce_amount = excluded.coupon_reduce_amount,
  ad_spend = excluded.ad_spend,
  roi = excluded.roi,
  avg_order_value = excluded.avg_order_value;

insert into public.fact_competitor_benchmark_monthly (
  month,
  brand_id,
  competitor,
  market_share,
  avg_order_value,
  verification_rate,
  subsidy_rate,
  ad_take_rate,
  content_share,
  data_confidence
)
values
  ('2026-06-30', 'haidilao', '美团到餐', 0.6000, 319.60, 0.8530, 0.0140, 0.0187, 0.2800, 'demo_directional'),
  ('2026-06-30', 'haidilao', '抖音到店', 0.3000, 286.00, 0.5700, 0.0260, 0.0095, 0.5200, 'demo_directional'),
  ('2026-06-30', 'haidilao', '私域会员', 0.1000, 352.00, 0.9100, 0.0060, 0.0000, 0.2000, 'demo_directional'),
  ('2026-05-31', 'haidilao', '美团到餐', 0.5900, 314.20, 0.8520, 0.0150, 0.0180, 0.2700, 'demo_directional'),
  ('2026-05-31', 'haidilao', '抖音到店', 0.3100, 279.00, 0.5500, 0.0280, 0.0090, 0.5400, 'demo_directional'),
  ('2026-05-31', 'haidilao', '私域会员', 0.1000, 346.00, 0.9050, 0.0060, 0.0000, 0.1900, 'demo_directional')
on conflict (month, brand_id, competitor) do update
set
  market_share = excluded.market_share,
  avg_order_value = excluded.avg_order_value,
  verification_rate = excluded.verification_rate,
  subsidy_rate = excluded.subsidy_rate,
  ad_take_rate = excluded.ad_take_rate,
  content_share = excluded.content_share,
  data_confidence = excluded.data_confidence;


