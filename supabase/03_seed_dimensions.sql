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
  ('hdl-sh-jingan-001', 'haidilao', '海底捞上海静安大悦城店', '上海', '静安', '南京西路', '火锅', 'Demo：上海核心商圈门店', 'active'),
  ('hdl-bj-chaoyang-001', 'haidilao', '海底捞北京朝阳合生汇店', '北京', '朝阳', '国贸双井', '火锅', 'Demo：北京核心商圈门店', 'active'),
  ('hdl-sz-nanshan-001', 'haidilao', '海底捞深圳南山万象天地店', '深圳', '南山', '科技园', '火锅', 'Demo：深圳白领商圈门店', 'active'),
  ('hdl-cd-jinjiang-001', 'haidilao', '海底捞成都春熙路店', '成都', '锦江', '春熙路', '火锅', 'Demo：成都休闲商圈门店', 'active'),
  ('hdl-hz-binjiang-001', 'haidilao', '海底捞杭州滨江龙湖店', '杭州', '滨江', '滨江高新', '火锅', 'Demo：杭州高新商圈门店', 'active')
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
  ('hdl-family-499', 'hdl-sh-jingan-001', 'haidilao', '4人家庭聚餐套餐', '多人套餐', 'hdl-2026h1-family', 568.00, 499.00, 69.00, true),
  ('hdl-weekday-199', 'hdl-bj-chaoyang-001', 'haidilao', '工作日双人错峰套餐', '错峰套餐', 'hdl-2026h1-weekday', 238.00, 199.00, 39.00, true),
  ('hdl-member-299', 'hdl-sz-nanshan-001', 'haidilao', '会员日双人火锅套餐', '会员日套餐', 'hdl-2026h1-member', 338.00, 299.00, 39.00, true),
  ('hdl-night-259', 'hdl-cd-jinjiang-001', 'haidilao', '夜宵场景双人套餐', '夜宵套餐', 'hdl-2026h1-night', 298.00, 259.00, 39.00, true),
  ('hdl-student-159', 'hdl-hz-binjiang-001', 'haidilao', '学生工作餐双人套餐', '轻量套餐', 'hdl-2026h1-student', 188.00, 159.00, 29.00, true)
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
