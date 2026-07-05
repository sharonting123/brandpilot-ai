select 'dim_brand' as table_name, count(*) as row_count from public.dim_brand
union all
select 'dim_poi', count(*) from public.dim_poi
union all
select 'dim_deal', count(*) from public.dim_deal
union all
select 'fact_search_keyword_daily', count(*) from public.fact_search_keyword_daily
union all
select 'fact_poi_daily', count(*) from public.fact_poi_daily
union all
select 'fact_deal_campaign_daily', count(*) from public.fact_deal_campaign_daily
union all
select 'fact_brand_monthly', count(*) from public.fact_brand_monthly
union all
select 'fact_city_brand_monthly', count(*) from public.fact_city_brand_monthly
union all
select 'fact_competitor_benchmark_monthly', count(*) from public.fact_competitor_benchmark_monthly
union all
select 'fact_meituan_funnel_events', count(*) from public.fact_meituan_funnel_events
union all
select 'brand_assets', count(*) from public.brand_assets;

select
  event_type,
  mrn_entry,
  mrn_component,
  source,
  search_word,
  poi_id,
  deal_id,
  campaign_id,
  button_type,
  pay_price,
  coupon_reduce,
  page_stay_duration_ms
from public.vw_meituan_funnel_demo
where session_id = 'demo-hdl-search-session'
order by occurred_at;

select
  month,
  brand_id,
  gtv,
  take_rate,
  subsidy_rate,
  ad_merchant_penetration,
  verified_orders
from public.fact_brand_monthly
where brand_id = 'haidilao'
order by month;

select
  month,
  city,
  gmv,
  roi,
  verified_orders
from public.fact_city_brand_monthly
where brand_id = 'haidilao'
order by month desc, gmv desc
limit 10;
