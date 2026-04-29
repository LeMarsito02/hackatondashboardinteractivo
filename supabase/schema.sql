-- Core extension
create extension if not exists pgcrypto;

alter table if exists public.security_events
add column if not exists status text default 'pending',
add column if not exists reviewed boolean default false,
add column if not exists reviewed_at timestamptz,
add column if not exists reviewed_by text,
add column if not exists operator_notes text,
add column if not exists confirmed_threat boolean,
add column if not exists resolved_at timestamptz;

create table if not exists public.cameras (
  id text primary key,
  name text not null,
  description text,
  lat double precision,
  lon double precision,
  address text,
  zone text,
  source text,
  is_active boolean default true,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.camera_heartbeats (
  id uuid primary key default gen_random_uuid(),
  camera_id text references public.cameras(id) on delete cascade,
  created_at timestamptz default now(),
  status text default 'online',
  fps numeric,
  model_loaded boolean,
  gemini_enabled boolean,
  supabase_enabled boolean,
  error_message text
);

create index if not exists camera_heartbeats_camera_id_created_at_idx
on public.camera_heartbeats(camera_id, created_at desc);

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.security_events(id) on delete cascade,
  created_at timestamptz default now(),
  reviewer_name text,
  action text not null,
  notes text
);

create or replace view public.security_events_summary as
select
  camera_id,
  camera_name,
  count(*) as total_events,
  count(*) filter (where final_priority >= 4) as high_priority_events,
  count(*) filter (where false_positive = true) as false_positive_events,
  count(*) filter (where status = 'pending') as pending_events,
  max(created_at) as last_event_at
from public.security_events
group by camera_id, camera_name;

alter table public.security_events enable row level security;
alter table public.cameras enable row level security;
alter table public.event_reviews enable row level security;

create policy if not exists "Anon can read security events"
on public.security_events for select to anon using (true);

create policy if not exists "Anon can read cameras"
on public.cameras for select to anon using (true);

create policy if not exists "Anon can read event reviews"
on public.event_reviews for select to anon using (true);

create policy if not exists "Authenticated can update security events"
on public.security_events for update to authenticated using (true) with check (true);

create policy if not exists "Authenticated can insert reviews"
on public.event_reviews for insert to authenticated with check (true);
