-- Phase 3: White-label branding per organization
-- Run this in Supabase SQL Editor AFTER phase2_organizations.sql

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Org branding table
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.org_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text,
  logo_url text,
  accent_color text,      -- hex value, e.g. "#0bd2b5"
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. RLS
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.org_branding enable row level security;

-- Anyone can read branding (needed for public shared trip pages)
create policy "Public read branding"
  on public.org_branding for select
  using (true);

-- Owners/admins can manage branding
create policy "Admins can manage branding"
  on public.org_branding for insert
  with check (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can update branding"
  on public.org_branding for update
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Auto-update timestamp
-- ══════════════════════════════════════════════════════════════════════════════

drop trigger if exists org_branding_updated_at on public.org_branding;

create trigger org_branding_updated_at
  before update on public.org_branding
  for each row execute procedure public.update_updated_at();
