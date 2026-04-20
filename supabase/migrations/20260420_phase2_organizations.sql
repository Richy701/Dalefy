-- Phase 2: Organizations, Multi-tenancy, and Trips RLS
-- Run this in Supabase SQL Editor AFTER phase1_profiles.sql

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Organizations table
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Org members (who belongs to which org, with what role)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  joined_at timestamptz not null default now(),
  unique(organization_id, user_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Add org FK columns
-- ══════════════════════════════════════════════════════════════════════════════

-- Trips belong to an org (nullable for backward compatibility)
alter table public.trips
  add column if not exists organization_id uuid references public.organizations(id);

-- Profiles track current active org
alter table public.profiles
  add column if not exists current_org_id uuid references public.organizations(id);

-- Index for fast lookups
create index if not exists trips_organization_id_idx on public.trips (organization_id);
create index if not exists org_members_user_idx on public.org_members (user_id);
create index if not exists org_members_org_idx on public.org_members (organization_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Organizations RLS
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.organizations enable row level security;

-- Members can read their own orgs
create policy "Members can read their org"
  on public.organizations for select
  using (
    id in (select organization_id from public.org_members where user_id = auth.uid())
  );

-- Authenticated users can create orgs
create policy "Authenticated can create org"
  on public.organizations for insert
  with check (auth.uid() is not null);

-- Only owners can update their org
create policy "Owners can update org"
  on public.organizations for update
  using (
    id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Org members RLS
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.org_members enable row level security;

-- Members can see fellow members in their orgs
create policy "Members can read fellow members"
  on public.org_members for select
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

-- Owners/admins can add members
create policy "Admins can insert members"
  on public.org_members for insert
  with check (
    -- Either creating yourself as owner of a new org, or you're an admin/owner
    auth.uid() = user_id
    or organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Owners/admins can remove members
create policy "Admins can delete members"
  on public.org_members for delete
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Updated trips RLS (replaces the old "Allow all access" policy)
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the old wide-open policy
drop policy if exists "Allow all access" on public.trips;

-- Anyone can read published trips (preserves public sharing via /shared/:tripId)
create policy "Anyone can read published trips"
  on public.trips for select
  using (status = 'Published');

-- Org members can read all trips in their org (including drafts)
create policy "Org members can read org trips"
  on public.trips for select
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

-- Legacy trips (no org) readable by any authenticated user
create policy "Authenticated can read legacy trips"
  on public.trips for select
  using (organization_id is null and auth.uid() is not null);

-- Org members can insert/update trips in their org
create policy "Org members can manage org trips"
  on public.trips for insert
  with check (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "Org members can update org trips"
  on public.trips for update
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

-- Only owners/admins can delete trips
create policy "Admins can delete org trips"
  on public.trips for delete
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Legacy trips (no org) can be managed by any authenticated user
create policy "Authenticated can manage legacy trips"
  on public.trips for insert
  with check (organization_id is null and auth.uid() is not null);

create policy "Authenticated can update legacy trips"
  on public.trips for update
  using (organization_id is null and auth.uid() is not null);

create policy "Authenticated can delete legacy trips"
  on public.trips for delete
  using (organization_id is null and auth.uid() is not null);
