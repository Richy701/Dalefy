-- Quick-fix: scope trips to their creator so users only see their own data.
-- Run this BEFORE or INSTEAD of the full phase2 migration.
-- Safe to run even if the phase2 migration is applied later.

-- 1. Add user_id column (nullable — existing rows get NULL)
alter table public.trips
  add column if not exists user_id uuid references auth.users(id);

-- 2. Backfill: assign all existing trips to your user so you don't lose them.
--    Replace YOUR_USER_ID below with your actual auth.users id, e.g.:
--    update public.trips set user_id = '2d4d4cf0-194b-4c4b-b54a-c9c3b71ec10d' where user_id is null;

-- 3. Drop the wide-open policy
drop policy if exists "Allow all access" on public.trips;

-- 4. Users can read/manage their own trips
create policy "Users can read own trips"
  on public.trips for select
  using (user_id = auth.uid());

create policy "Users can insert own trips"
  on public.trips for insert
  with check (user_id = auth.uid());

create policy "Users can update own trips"
  on public.trips for update
  using (user_id = auth.uid());

create policy "Users can delete own trips"
  on public.trips for delete
  using (user_id = auth.uid());

-- 5. Anyone can still read published trips (for shared links)
create policy "Anyone can read published trips"
  on public.trips for select
  using (status = 'Published');

-- 6. Index for fast lookup
create index if not exists trips_user_id_idx on public.trips (user_id);
