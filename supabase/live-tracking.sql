-- Run this in Supabase: SQL Editor. This is the minimal live-location table for Routewise.
create table if not exists public.driver_locations (
  driver_id text primary key,
  driver_name text not null,
  vehicle text not null,
  lat double precision not null,
  lng double precision not null,
  speed double precision default 0,
  heading double precision default 0,
  is_online boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.driver_locations enable row level security;

grant select, insert, update on table public.driver_locations to anon;

-- MVP policies: the public dispatcher page can read online drivers and a driver app can update a location.
-- Replace these with authenticated, organization-scoped policies before production use.
drop policy if exists "Routewise dispatcher reads driver locations" on public.driver_locations;
drop policy if exists "Routewise driver publishes location" on public.driver_locations;
drop policy if exists "Routewise driver updates location" on public.driver_locations;

create policy "Routewise dispatcher reads driver locations"
on public.driver_locations for select to anon using (true);

create policy "Routewise driver publishes location"
on public.driver_locations for insert to anon with check (true);

create policy "Routewise driver updates location"
on public.driver_locations for update to anon using (true) with check (true);
