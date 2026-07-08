-- 下半年资源分配建议：补充「推荐广告」投向
update public.brand_assets
set content = '优先投向搜索广告产品、推荐广告、商户广告教育、场景化套餐和 AI 经营复盘工具，用资源分配解释下半年增长路径。'
where brand_id = 'haidilao'
  and asset_type = 'resource_allocation'
  and title = '下半年资源分配建议';
