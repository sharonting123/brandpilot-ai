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
  data_confidence,
  notes
)
values
  ('2026-01-31', 'haidilao', 185000, 1.42, 328.60, 86264820.00, 262522, 217894, 0.2380, 3191800.00, 1213400.00, 4405200.00, 1725300.00, 1184200.00, 0.1640, 0.0511, 0.0200, 'demo_model', '春节前聚餐需求抬升，补贴率触及 2% 警戒线。'),
  ('2026-02-28', 'haidilao', 202000, 1.36, 342.80, 94213440.00, 274834, 230861, 0.2510, 3485900.00, 1322800.00, 4808700.00, 1695842.00, 1256100.00, 0.1710, 0.0510, 0.0180, 'demo_model', '春节家庭聚餐高客单，核销率恢复。'),
  ('2026-03-31', 'haidilao', 214000, 1.31, 318.50, 89255590.00, 280238, 235400, 0.2660, 3302450.00, 1459800.00, 4762250.00, 1517345.00, 1200800.00, 0.1840, 0.0534, 0.0170, 'demo_model', '会员日素材拉动广告收入，变现率改善。'),
  ('2026-04-30', 'haidilao', 226000, 1.28, 306.70, 88710560.00, 289219, 244390, 0.2740, 3282300.00, 1586400.00, 4868700.00, 1419369.00, 1193600.00, 0.1960, 0.0549, 0.0160, 'demo_model', '淡季错峰套餐提升频次，补贴率下降。'),
  ('2026-05-31', 'haidilao', 241000, 1.33, 314.20, 100726126.00, 320580, 273294, 0.2920, 3726860.00, 1814200.00, 5541060.00, 1510892.00, 1310500.00, 0.2140, 0.0550, 0.0150, 'demo_model', '五一聚餐与搜索广告共振，GTV 与广告收入双升。'),
  ('2026-06-30', 'haidilao', 256000, 1.35, 319.60, 110453760.00, 345600, 294912, 0.3080, 4086780.00, 2069500.00, 6156280.00, 1546353.00, 1394200.00, 0.2280, 0.0557, 0.0140, 'demo_model', 'H1 收官月广告渗透继续提升，核销闭环稳定。')
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
  data_confidence = excluded.data_confidence,
  notes = excluded.notes;

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
  ('2026-06-30', 'haidilao', '上海', 86, 1280000, 214000, 73600, 64032, 24729600.00, 321500.00, 418000.00, 59.16, 336.00),
  ('2026-06-30', 'haidilao', '北京', 92, 1165000, 190400, 68100, 57900, 22473000.00, 298400.00, 386000.00, 58.22, 330.00),
  ('2026-06-30', 'haidilao', '深圳', 58, 882000, 148900, 51200, 43520, 16435200.00, 223100.00, 294000.00, 55.90, 321.00),
  ('2026-06-30', 'haidilao', '成都', 64, 760000, 132600, 48600, 42282, 14580000.00, 185600.00, 242000.00, 60.25, 300.00),
  ('2026-06-30', 'haidilao', '杭州', 49, 625000, 103500, 34200, 28728, 10944000.00, 154300.00, 206000.00, 53.13, 320.00),
  ('2026-05-31', 'haidilao', '上海', 86, 1195000, 199800, 68400, 58140, 22982400.00, 344200.00, 392000.00, 58.63, 336.00),
  ('2026-05-31', 'haidilao', '北京', 92, 1088000, 178600, 62200, 52870, 20526000.00, 318800.00, 361000.00, 56.86, 330.00),
  ('2026-05-31', 'haidilao', '深圳', 58, 830000, 139200, 47400, 40290, 15215400.00, 238900.00, 278000.00, 54.73, 321.00),
  ('2026-05-31', 'haidilao', '成都', 64, 718000, 124800, 45800, 38930, 13740000.00, 198000.00, 230000.00, 59.74, 300.00),
  ('2026-05-31', 'haidilao', '杭州', 49, 584000, 96000, 32780, 27535, 10489600.00, 162500.00, 195000.00, 53.79, 320.00)
on conflict (month, brand_id, city) do update
set
  store_count = excluded.store_count,
  search_impressions = excluded.search_impressions,
  poi_visits = excluded.poi_visits,
  paid_orders = excluded.paid_orders,
  verified_orders = exclyned.verified_orders,
  gmv = excluded.gmv,
  coupon_reduce_amount = excluded.coupon_reduce_amount,
  ad_spend = excluded.ad_spend,
  roi = excluded.roi,
  avg_order_value = excluded.avg_order_value;

insert into public.fact_competitor_benchmark_monthly (
  month,
  brand_id,
  competitor,
  market_share,
  avg_order_value,
  verification_rate,
  subsidy_rate,
  ad_take_rate,
  content_share,
  data_confidence
)
values
  ('2026-06-30', 'haidilao', '美团到餐', 0.6000, 319.60, 0.8530, 0.0140, 0.0187, 0.2800, 'demo_directional'),
  ('2026-06-30', 'haidilao', '抖音到店', 0.3000, 286.00, 0.5700, 0.0260, 0.0095, 0.5200, 'demo_directional'),
  ('2026-06-30', 'haidilao', '私域会员', 0.1000, 352.00, 0.9100, 0.0060, 0.0000, 0.2000, 'demo_directional'),
  ('2026-05-31', 'haidilao', '美团到餐', 0.5900, 314.20, 0.8520, 0.0150, 0.0180, 0.2700, 'demo_directional'),
  ('2026-05-31', 'haidilao', '抖音到店', 0.3100, 279.00, 0.5500, 0.0280, 0.0090, 0.5400, 'demo_directional'),
  ('2026-05-31', 'haidilao', '私域会员', 0.1000, 346.00, 0.9050, 0.0060, 0.0000, 0.1900, 'demo_directional')
on conflict (month, brand_id, competitor) do update
set
  market_share = excluded.market_share,
  avg_order_value = excluded.avg_order_value,
  verification_rate = excluded.verification_rate,
  subsidy_rate = excluded.subsidy_rate,
  ad_take_rate = excluded.ad_take_rate,
  content_share = excluded.content_share,
  data_confidence = excluded.data_confidence;
