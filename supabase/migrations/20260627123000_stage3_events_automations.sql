create extension if not exists "pgcrypto";

create table if not exists public.venue_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'other',
  start_at timestamptz not null,
  end_at timestamptz not null,
  description text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  voucher_id uuid references public.vouchers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null,
  channel text not null default 'email',
  segment_definition jsonb not null default '{}'::jsonb,
  template jsonb not null default '{}'::jsonb,
  linked_voucher_id uuid references public.vouchers(id) on delete set null,
  enabled boolean not null default false,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'queued',
  result jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  automation_run_id uuid references public.automation_runs(id) on delete set null,
  guest_id uuid not null references public.guests(id) on delete cascade,
  channel text not null,
  status text not null default 'queued',
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists venue_events_window_idx on public.venue_events (start_at desc, end_at desc);
create index if not exists automations_enabled_idx on public.automations (enabled, trigger_type);
create index if not exists automation_runs_automation_idx on public.automation_runs (automation_id, started_at desc);
create index if not exists automation_deliveries_guest_idx on public.automation_deliveries (guest_id, automation_id, created_at desc);

alter table public.venue_events enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_deliveries enable row level security;

drop policy if exists venue_events_select on public.venue_events;
create policy venue_events_select on public.venue_events
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists venue_events_insert on public.venue_events;
create policy venue_events_insert on public.venue_events
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists venue_events_update on public.venue_events;
create policy venue_events_update on public.venue_events
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists automations_select on public.automations;
create policy automations_select on public.automations
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists automations_insert on public.automations;
create policy automations_insert on public.automations
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists automations_update on public.automations;
create policy automations_update on public.automations
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists automation_runs_insert on public.automation_runs;
create policy automation_runs_insert on public.automation_runs
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists automation_runs_update on public.automation_runs;
create policy automation_runs_update on public.automation_runs
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists automation_deliveries_select on public.automation_deliveries;
create policy automation_deliveries_select on public.automation_deliveries
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists automation_deliveries_insert on public.automation_deliveries;
create policy automation_deliveries_insert on public.automation_deliveries
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists automation_deliveries_update on public.automation_deliveries;
create policy automation_deliveries_update on public.automation_deliveries
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.venue_events to authenticated;
grant select, insert, update, delete on public.automations to authenticated;
grant select, insert, update, delete on public.automation_runs to authenticated;
grant select, insert, update, delete on public.automation_deliveries to authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'venue_events_set_updated_at') then
    create trigger venue_events_set_updated_at
    before update on public.venue_events
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'automations_set_updated_at') then
    create trigger automations_set_updated_at
    before update on public.automations
    for each row execute function public.set_updated_at();
  end if;
end $$;
