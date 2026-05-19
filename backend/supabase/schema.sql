-- Supabase/Postgres schema for kwork-test backend
-- Run in Supabase SQL Editor once.

create table if not exists public.users (
  id text primary key,
  email text not null unique,
  display_name text not null default '',
  password_hash text not null,
  role text not null default 'user',
  is_pro boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.sessions (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_sessions_access_expires on public.sessions(access_expires_at);
create index if not exists idx_sessions_refresh_expires on public.sessions(refresh_expires_at);

create table if not exists public.tests (
  id text primary key,
  title text not null,
  description text not null,
  status text not null,
  access text not null,
  source text not null,
  payload_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_tests_status_access on public.tests(status, access);

create table if not exists public.attempts (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  test_id text not null references public.tests(id) on delete cascade,
  task1 double precision not null,
  task2 double precision not null,
  task3 double precision not null,
  total_score double precision not null,
  score_source text not null default 'unverified',
  created_at timestamptz not null
);

create index if not exists idx_attempts_user_created on public.attempts(user_id, created_at desc);

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at bigint not null
);

create index if not exists idx_rate_limits_reset_at on public.rate_limits(reset_at);

create table if not exists public.billing_payments (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  provider text not null,
  plan_code text not null,
  amount_value text not null,
  amount_currency text not null,
  status text not null,
  paid boolean not null default false,
  confirmation_url text not null default '',
  return_url text not null default '',
  idempotence_key text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists idx_billing_payments_user_created
  on public.billing_payments(user_id, created_at desc);
create index if not exists idx_billing_payments_status
  on public.billing_payments(status);

