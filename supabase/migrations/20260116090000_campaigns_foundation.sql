create extension if not exists pgcrypto;

create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  subject text not null,
  body_html text not null,
  body_text text not null,
  created_at timestamptz default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid references public.campaign_templates(id),
  channel text not null default 'email',
  created_at timestamptz default now()
);

create table if not exists public.campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id),
  sent_at timestamptz,
  scheduled_for timestamptz null,
  recipient_count integer not null default 0,
  status text not null default 'draft'
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_run_id uuid references public.campaign_runs(id),
  guest_id uuid references public.guests(id),
  email text not null,
  sent_at timestamptz null,
  opened_at timestamptz null
);

alter table public.campaign_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_runs enable row level security;
alter table public.campaign_recipients enable row level security;

drop policy if exists campaign_templates_select on public.campaign_templates;
create policy campaign_templates_select on public.campaign_templates
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaign_templates_insert on public.campaign_templates;
create policy campaign_templates_insert on public.campaign_templates
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists campaign_templates_update on public.campaign_templates;
create policy campaign_templates_update on public.campaign_templates
for update to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
for update to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaign_runs_select on public.campaign_runs;
create policy campaign_runs_select on public.campaign_runs
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaign_runs_insert on public.campaign_runs;
create policy campaign_runs_insert on public.campaign_runs
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists campaign_runs_update on public.campaign_runs;
create policy campaign_runs_update on public.campaign_runs
for update to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaign_recipients_select on public.campaign_recipients;
create policy campaign_recipients_select on public.campaign_recipients
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaign_recipients_insert on public.campaign_recipients;
create policy campaign_recipients_insert on public.campaign_recipients
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists campaign_recipients_update on public.campaign_recipients;
create policy campaign_recipients_update on public.campaign_recipients
for update to authenticated
using (public.is_admin(auth.uid()));
