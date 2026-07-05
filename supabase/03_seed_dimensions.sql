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
