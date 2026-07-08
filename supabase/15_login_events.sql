-- 用户登录 / 注册行为审计（服务端 service role 写入）

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  username text not null,
  event_type text not null check (event_type in ('login_success', 'login_failed', 'register')),
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_events_user_created
  on public.login_events (user_id, created_at desc);

create index if not exists idx_login_events_created
  on public.login_events (created_at desc);

create index if not exists idx_login_events_username_created
  on public.login_events (lower(username), created_at desc);

create index if not exists idx_login_events_type_created
  on public.login_events (event_type, created_at desc);

alter table public.login_events enable row level security;

drop policy if exists "service only login_events" on public.login_events;

create policy "service only login_events"
  on public.login_events for all
  using (false) with check (false);
