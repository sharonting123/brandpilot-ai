-- 修正演示门店 business_area，与门店名称/商场一致
update public.dim_poi set business_area = '静安大悦城' where poi_id = 'hdl-sh-jingan-001';
update public.dim_poi set business_area = '朝阳合生汇' where poi_id = 'hdl-bj-chaoyang-001';
update public.dim_poi set business_area = '万象天地' where poi_id = 'hdl-sz-nanshan-001';
update public.dim_poi set business_area = '春熙路' where poi_id = 'hdl-cd-jinjiang-001';
update public.dim_poi set business_area = '滨江龙湖' where poi_id = 'hdl-hz-binjiang-001';
