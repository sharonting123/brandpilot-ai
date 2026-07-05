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
