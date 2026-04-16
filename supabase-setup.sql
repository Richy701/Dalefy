-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

create table if not exists trips (
  id text primary key,
  name text not null,
  attendees text not null default '',
  destination text,
  pax_count text,
  trip_type text,
  budget text,
  currency text,
  start text not null,
  end_date text not null,
  status text not null default 'Draft',
  image text not null default '',
  events jsonb not null default '[]'::jsonb,
  media jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable realtime for the trips table
alter publication supabase_realtime add table trips;

-- Allow public read/write (for development — add RLS policies for production)
alter table trips enable row level security;

create policy "Allow all access" on trips
  for all
  using (true)
  with check (true);
