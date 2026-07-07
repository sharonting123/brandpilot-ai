-- 呷哺呷哺竞品品牌数据（竞对基准表保留 美团到餐 / 抖音到店 / 私域会员）

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
  ('xiabuxiabu', '呷哺呷哺', '小火锅', '全国连锁', '北京', 900, 'KA 城市经理', '稳定合作')
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
  ('xb-sh-jingan-001', 'xiabuxiabu', '呷哺呷哺上海静安大悦城店', '上海', '静安', '静安大悦城', '小火锅', 'Demo：上海核心商圈门店', 'active'),
  ('xb-bj-chaoyang-001', 'xiabuxiabu', '呷哺呷哺北京朝阳合生汇店', '北京', '朝阳', '朝阳合生汇', '小火锅', 'Demo：北京核心商圈门店', 'active'),
  ('xb-sz-nanshan-001', 'xiabuxiabu', '呷哺呷哺深圳南山万象天地店', '深圳', '南山', '万象天地', '小火锅', 'Demo：深圳白领商圈门店', 'active'),
  ('xb-cd-jinjiang-001', 'xiabuxiabu', '呷哺呷哺成都春熙路店', '成都', '锦江', '春熙路', '小火锅', 'Demo：成都休闲商圈门店', 'active'),
  ('xb-hz-binjiang-001', 'xiabuxiabu', '呷哺呷哺杭州滨江龙湖店', '杭州', '滨江', '滨江龙湖', '小火锅', 'Demo：杭州高新商圈门店', 'active')
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
  data_confidence
)
values
  ('2026-06-30', 'xiabuxiabu', 168000, 1.22, 203.40, 75682320, 372100, 299601, 0.2410, 2812400, 1185600, 3998000, 1281600, 986000, 0.1860, 0.0528, 0.0170, 'demo_model')
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
  data_confidence = excluded.data_confidence;

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
  ('2026-06-30', 'xiabuxiabu', '上海', 72, 920000, 148600, 49800, 39840, 16800000, 286400, 268000, 48.60, 208.00),
  ('2026-06-30', 'xiabuxiabu', '北京', 78, 860000, 136200, 46200, 36960, 15240000, 251800, 246000, 47.80, 205.00),
  ('2026-06-30', 'xiabuxiabu', '深圳', 48, 640000, 101800, 34600, 27340, 11280000, 198600, 186000, 46.20, 198.00),
  ('2026-06-30', 'xiabuxiabu', '成都', 52, 548000, 89600, 31800, 25440, 9840000, 168400, 158000, 49.10, 192.00),
  ('2026-06-30', 'xiabuxiabu', '杭州', 40, 462000, 74200, 22600, 18080, 7420000, 132600, 124000, 45.40, 195.00)
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

-- 竞对基准仅保留 canonical 平台名（美团到餐 / 抖音到店 / 私域会员），去掉与短名重复的数据
delete from public.fact_competitor_benchmark_monthly
where competitor in ('美团', '抖音');
