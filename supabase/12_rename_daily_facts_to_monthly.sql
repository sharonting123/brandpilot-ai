-- 将原 daily 事实表统一为 monthly 命名，并将 date 列改为 month（月末日期口径）
-- 已在 2026-07-07 同步至线上 Supabase

alter table if exists public.fact_search_keyword_daily rename to fact_search_keyword_monthly;
alter table if exists public.fact_poi_daily rename to fact_poi_monthly;
alter table if exists public.fact_deal_campaign_daily rename to fact_deal_campaign_monthly;

alter table if exists public.fact_search_keyword_monthly rename column date to month;
alter table if exists public.fact_poi_monthly rename column date to month;
alter table if exists public.fact_deal_campaign_monthly rename column date to month;

-- 修正历史非月末日期（闰年 2 月等）
update public.fact_brand_monthly
set month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
where month <> (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date;

update public.fact_city_brand_monthly
set month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
where month <> (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date;

update public.fact_competitor_benchmark_monthly
set month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
where month <> (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date;

update public.fact_search_keyword_monthly
set month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
where month <> (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date;

update public.fact_poi_monthly
set month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
where month <> (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date;

update public.fact_deal_campaign_monthly
set month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
where month <> (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date;

-- 验证：各表 month 均应为月末
select 'fact_brand_monthly' as tbl, count(*) filter (
  where month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
) as month_end_rows, count(*) as total from public.fact_brand_monthly
union all
select 'fact_poi_monthly', count(*) filter (
  where month = (date_trunc('month', month::timestamp) + interval '1 month - 1 day')::date
), count(*) from public.fact_poi_monthly;
