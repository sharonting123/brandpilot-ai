-- 搜索 / 推荐 双路径：POI 推荐访问、城市推荐曝光
alter table if exists public.fact_poi_monthly
  add column if not exists recommend_visits integer not null default 0;

alter table if exists public.fact_city_brand_monthly
  add column if not exists recommend_impressions integer not null default 0;

comment on column public.fact_poi_monthly.recommend_visits is '推荐/Feed 路径 POI 访问（search_visits + recommend_visits = visits 口径）';
comment on column public.fact_city_brand_monthly.recommend_impressions is '推荐/Feed 路径曝光（search_impressions + recommend_impressions = 总曝光）';

-- 历史行：推荐量 = 总量 - 搜索量（无负值）
update public.fact_poi_monthly
set recommend_visits = greatest(0, visits - search_visits)
where recommend_visits = 0 and visits > search_visits;

update public.fact_city_brand_monthly
set recommend_impressions = greatest(0, round(search_impressions * 0.42))
where recommend_impressions = 0 and search_impressions > 0;
