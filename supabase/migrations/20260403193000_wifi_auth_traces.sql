create extension if not exists "pgcrypto";

create table if not exists public.wifi_auth_traces (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null unique,
  venue_slug text,
  site_id text,
  client_mac text,
  ssid text,
  ap_mac text,
  request_url text,
  user_agent text,
  device_os text,
  client_platform text,
  captive_context text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  total_duration_ms integer,
  backend_duration_ms integer,
  frontend_duration_ms integer,
  outcome text not null default 'in_progress',
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.wifi_auth_trace_events (
  id bigserial primary key,
  trace_id text not null references public.wifi_auth_traces(trace_id) on delete cascade,
  stage_name text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms integer,
  status text not null default 'ok',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wifi_auth_trace_events_unique unique (trace_id, stage_name, started_at)
);

create index if not exists wifi_auth_traces_created_idx
  on public.wifi_auth_traces (created_at desc);

create index if not exists wifi_auth_traces_venue_created_idx
  on public.wifi_auth_traces (venue_slug, created_at desc);

create index if not exists wifi_auth_traces_site_created_idx
  on public.wifi_auth_traces (site_id, created_at desc);

create index if not exists wifi_auth_traces_outcome_created_idx
  on public.wifi_auth_traces (outcome, created_at desc);

create index if not exists wifi_auth_traces_total_duration_idx
  on public.wifi_auth_traces (total_duration_ms desc);

create index if not exists wifi_auth_trace_events_trace_created_idx
  on public.wifi_auth_trace_events (trace_id, created_at desc);

create index if not exists wifi_auth_trace_events_stage_started_idx
  on public.wifi_auth_trace_events (stage_name, started_at desc);

alter table public.wifi_auth_traces enable row level security;
alter table public.wifi_auth_trace_events enable row level security;

drop policy if exists "Admins can read wifi auth traces" on public.wifi_auth_traces;
create policy "Admins can read wifi auth traces"
  on public.wifi_auth_traces
  for select
  using (public.is_admin(auth.uid()));

drop policy if exists "Admins can read wifi auth trace events" on public.wifi_auth_trace_events;
create policy "Admins can read wifi auth trace events"
  on public.wifi_auth_trace_events
  for select
  using (public.is_admin(auth.uid()));
