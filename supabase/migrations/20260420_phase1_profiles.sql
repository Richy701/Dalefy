-- Phase 1: Profiles table linked to Supabase Auth
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Profiles table
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'Trip Manager',
  avatar text not null default '',
  initials text not null default '?',
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. RLS policies
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Users can insert their own profile (for signup)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Auto-create profile on signup via trigger
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_name text;
  computed_initials text;
  parts text[];
begin
  raw_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  -- Compute initials from name
  parts := string_to_array(trim(raw_name), ' ');
  if array_length(parts, 1) >= 2 then
    computed_initials := upper(left(parts[1], 1) || left(parts[array_length(parts, 1)], 1));
  else
    computed_initials := upper(left(raw_name, 1));
  end if;

  insert into public.profiles (id, name, email, role, initials)
  values (
    new.id,
    raw_name,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'Trip Manager'),
    computed_initials
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if re-running
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Updated_at auto-update
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();
