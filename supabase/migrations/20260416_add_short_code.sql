-- Add a 4-digit numeric short code to trips so travelers can type it
-- directly (iOS number pad, no paste needed). Stored as text to preserve
-- leading zeros (e.g. "0423").

alter table public.trips
  add column if not exists short_code varchar(4);

-- Only enforce uniqueness for non-null codes so existing rows without a
-- code don't conflict. Partial unique index.
create unique index if not exists trips_short_code_unique
  on public.trips (short_code)
  where short_code is not null;

-- Fast lookup when resolving a code to a trip id.
create index if not exists trips_short_code_idx
  on public.trips (short_code);
