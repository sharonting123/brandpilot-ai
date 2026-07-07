-- 竞对基准仅保留 canonical 平台名（美团到餐 / 抖音到店 / 私域会员）
-- 去掉与短名「美团」「抖音」重复的行（已在 2026-07-07 同步至线上 Supabase）

delete from public.fact_competitor_benchmark_monthly
where competitor in ('美团', '抖音');

-- 验证（海底捞 2026-05/06 各 3 行，共 6 行）
select brand_id, month, competitor
from public.fact_competitor_benchmark_monthly
order by brand_id, month desc, competitor;
