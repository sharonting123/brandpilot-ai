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
