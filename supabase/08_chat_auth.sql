-- 用户账号 + 对话会话 + 消息（需配合服务端 SUPABASE_SERVICE_ROLE_KEY 访问）

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  display_name text,
  created_at timestamptz not null default now(),
  constraint app_users_username_len check (char_length(username) between 3 and 32),
  constraint app_users_username_format check (username ~ '^[a-zA-Z0-9_]+$')
);

create unique index if not exists idx_app_users_username_lower
  on public.app_users (lower(username));

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  brand_id text not null default 'haidilao',
  title text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_user_updated
  on public.chat_sessions (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_session_created
  on public.chat_messages (session_id, created_at asc);

-- 仅服务端 service role 访问；匿名客户端不可读写
alter table public.app_users enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "service only app_users" on public.app_users;
drop policy if exists "service only chat_sessions" on public.chat_sessions;
drop policy if exists "service only chat_messages" on public.chat_messages;

create policy "service only app_users"
  on public.app_users for all
  using (false) with check (false);

create policy "service only chat_sessions"
  on public.chat_sessions for all
  using (false) with check (false);

create policy "service only chat_messages"
  on public.chat_messages for all
  using (false) with check (false);
