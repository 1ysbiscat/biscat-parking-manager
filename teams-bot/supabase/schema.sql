create extension if not exists pgcrypto;

create table if not exists public.parking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_name text not null,
  slot_no integer not null check (slot_no in (1, 2)),
  status text not null check (status in ('checked_in', 'checked_out')),
  checkin_type text not null default 'user' check (checkin_type in ('user', 'manual')),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  checked_out_by text,
  note text
);

create unique index if not exists parking_sessions_one_active_per_user
  on public.parking_sessions (user_id)
  where status = 'checked_in';

create unique index if not exists parking_sessions_one_active_per_slot
  on public.parking_sessions (slot_no)
  where status = 'checked_in';

create index if not exists parking_sessions_active_idx
  on public.parking_sessions (status, slot_no, checked_in_at);

create table if not exists public.parking_bot_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.parking_sessions enable row level security;
alter table public.parking_bot_state enable row level security;

create policy "service role can manage parking sessions"
  on public.parking_sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "service role can manage parking bot state"
  on public.parking_bot_state
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
