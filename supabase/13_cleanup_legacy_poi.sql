-- 清理 legacy POI ID（hdl-sh-* / hdl-bj-* 等），统一到沙盘 seed 的 canonical ID
-- 在 Supabase SQL Editor 执行；执行前请确认 09_drill_granular_seed 已写入 canonical 门店

-- legacy → canonical 映射
-- hdl-sh-jingan-001     → hdl-上海-静安大悦城-01
-- hdl-bj-chaoyang-001   → hdl-北京-朝阳合生汇-01
-- hdl-sz-nanshan-001    → hdl-深圳-万象天地-01
-- hdl-cd-jinjiang-001   → hdl-成都-春熙路-01
-- hdl-hz-binjiang-001   → hdl-杭州-滨江龙湖-01

begin;

-- 1) 套餐维表：改挂 canonical 门店
update public.dim_deal set poi_id = 'hdl-上海-静安大悦城-01' where poi_id = 'hdl-sh-jingan-001';
update public.dim_deal set poi_id = 'hdl-北京-朝阳合生汇-01' where poi_id = 'hdl-bj-chaoyang-001';
update public.dim_deal set poi_id = 'hdl-深圳-万象天地-01' where poi_id = 'hdl-sz-nanshan-001';
update public.dim_deal set poi_id = 'hdl-成都-春熙路-01' where poi_id = 'hdl-cd-jinjiang-001';
update public.dim_deal set poi_id = 'hdl-杭州-滨江龙湖-01' where poi_id = 'hdl-hz-binjiang-001';

-- 2) 链路事件：改挂 canonical 门店
update public.fact_meituan_funnel_events set poi_id = 'hdl-上海-静安大悦城-01' where poi_id = 'hdl-sh-jingan-001';
update public.fact_meituan_funnel_events set poi_id = 'hdl-北京-朝阳合生汇-01' where poi_id = 'hdl-bj-chaoyang-001';
update public.fact_meituan_funnel_events set poi_id = 'hdl-深圳-万象天地-01' where poi_id = 'hdl-sz-nanshan-001';
update public.fact_meituan_funnel_events set poi_id = 'hdl-成都-春熙路-01' where poi_id = 'hdl-cd-jinjiang-001';
update public.fact_meituan_funnel_events set poi_id = 'hdl-杭州-滨江龙湖-01' where poi_id = 'hdl-hz-binjiang-001';

-- 3) 删除 legacy POI 月表（canonical 已有 09 seed 全量数据）
delete from public.fact_poi_monthly
where poi_id in (
  'hdl-sh-jingan-001',
  'hdl-bj-chaoyang-001',
  'hdl-sz-nanshan-001',
  'hdl-cd-jinjiang-001',
  'hdl-hz-binjiang-001'
);

-- 4) 删除 legacy 门店维表
delete from public.dim_poi
where poi_id in (
  'hdl-sh-jingan-001',
  'hdl-bj-chaoyang-001',
  'hdl-sz-nanshan-001',
  'hdl-cd-jinjiang-001',
  'hdl-hz-binjiang-001'
);

commit;

-- 验证
select 'legacy_poi_remaining' as check_name, count(*) as cnt
from public.dim_poi
where poi_id ~ '^hdl-(sh|bj|sz|cd|hz)-';

select brand_id, count(*) as poi_count
from public.dim_poi
where brand_id = 'haidilao'
group by brand_id;

select city, business_area, count(*) as stores
from public.dim_poi
where brand_id = 'haidilao' and city = '上海'
group by city, business_area
order by business_area;
