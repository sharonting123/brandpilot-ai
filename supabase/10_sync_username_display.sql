-- 修复早期注册把昵称写入 display_name、或与 username 对调的历史数据
-- 执行后：display_name 与 username 保持一致，右上角只显示登录用户名

update public.app_users
set display_name = lower(username)
where display_name is distinct from lower(username);

-- 若 username 存的是昵称、display_name 才是登录名，需按实际数据手工修正，例如：
-- update public.app_users
-- set username = lower(display_name),
--     display_name = lower(display_name)
-- where lower(username) = '1111111' and lower(display_name) = '121212';
