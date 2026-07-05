insert into public.fact_search_keyword_daily (
  date,
  brand_id,
  search_word,
  source,
  query_id,
  global_id,
  impressions,
  clicks,
  poi_clicks,
  deal_clicks,
  order_submits,
  paid_orders,
  verified_orders,
  gmv
)
values
  (
    current_date,
    'haidilao',
    'haidilao',
    'mt_search_poi',
    'demo-query-hdl',
    'demo-global-hdl',
    12800,
    1140,
    436,
    172,
    64,
    41,
    29,
    14690.30
  )
on conflict (date, brand_id, search_word, source) do update
set
  query_id = excluded.query_id,
  global_id = excluded.global_id,
  impressions = excluded.impressions,
  clicks = excluded.clicks,
  poi_clicks = excluded.poi_clicks,
  deal_clicks = excluded.deal_clicks,
  order_submits = excluded.order_submits,
  paid_orders = excluded.paid_orders,
  verified_orders = excluded.verified_orders,
  gmv = excluded.gmv;

insert into public.fact_poi_daily (
  date,
  poi_id,
  exposure,
  visits,
  search_visits,
  deal_clicks,
  favorite_count,
  navigate_clicks,
  phone_clicks,
  avg_stay_seconds
)
values
  (current_date, '1287671875', 18600, 2410, 436, 172, 83, 46, 18, 89.0)
on conflict (date, poi_id) do update
set
  exposure = excluded.exposure,
  visits = excluded.visits,
  search_visits = excluded.search_visits,
  deal_clicks = excluded.deal_clicks,
  favorite_count = excluded.favorite_count,
  navigate_clicks = excluded.navigate_clicks,
  phone_clicks = excluded.phone_clicks,
  avg_stay_seconds = excluded.avg_stay_seconds;

insert into public.fact_deal_campaign_daily (
  date,
  deal_id,
  campaign_id,
  source,
  impressions,
  detail_views,
  buy_clicks,
  order_submits,
  paid_orders,
  verified_orders,
  pay_gmv,
  coupon_reduce_amount,
  refunds
)
values
  (
    current_date,
    '1651151438',
    '1151457400',
    'mt_search_poi',
    3220,
    172,
    91,
    64,
    41,
    29,
    14690.30,
    1258.70,
    2
  )
on conflict (date, deal_id, campaign_id, source) do update
set
  impressions = excluded.impressions,
  detail_views = excluded.detail_views,
  buy_clicks = excluded.buy_clicks,
  order_submits = excluded.order_submits,
  paid_orders = excluded.paid_orders,
  verified_orders = excluded.verified_orders,
  pay_gmv = excluded.pay_gmv,
  coupon_reduce_amount = excluded.coupon_reduce_amount,
  refunds = excluded.refunds;
