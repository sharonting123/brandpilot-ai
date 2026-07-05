alter table public.dim_brand enable row level security;
alter table public.dim_poi enable row level security;
alter table public.dim_deal enable row level security;
alter table public.fact_search_keyword_daily enable row level security;
alter table public.fact_poi_daily enable row level security;
alter table public.fact_deal_campaign_daily enable row level security;
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
drop policy if exists "demo read search keyword daily" on public.fact_search_keyword_daily;
drop policy if exists "demo read poi daily" on public.fact_poi_daily;
drop policy if exists "demo read deal campaign daily" on public.fact_deal_campaign_daily;
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
  public.fact_search_keyword_daily,
  public.fact_poi_daily,
  public.fact_deal_campaign_daily,
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
