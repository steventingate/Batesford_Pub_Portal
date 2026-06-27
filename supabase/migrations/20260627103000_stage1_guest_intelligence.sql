create extension if not exists "pgcrypto";

alter table public.guests
  add column if not exists marketing_consent boolean,
  add column if not exists consent_timestamp timestamptz,
  add column if not exists consent_source text,
  add column if not exists privacy_policy_version text,
  add column if not exists unsubscribe_status boolean not null default false,
  add column if not exists unsubscribe_timestamp timestamptz,
  add column if not exists unsubscribe_source text;

create table if not exists public.guest_tags (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  tag text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint guest_tags_guest_id_tag_key unique (guest_id, tag)
);

create table if not exists public.guest_notes (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.report_preferences (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  enabled boolean not null default false,
  frequency text not null default 'manual',
  recipient_emails text[] not null default '{}'::text[],
  send_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_preferences_report_type_key unique (report_type)
);

create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guest_tags_guest_id_idx on public.guest_tags (guest_id);
create index if not exists guest_tags_tag_idx on public.guest_tags (tag);
create index if not exists guest_notes_guest_id_idx on public.guest_notes (guest_id, created_at desc);
create index if not exists guests_marketing_consent_idx on public.guests (marketing_consent, unsubscribe_status);
create index if not exists guests_postcode_idx on public.guests (postcode);
create index if not exists report_snapshots_period_idx on public.report_snapshots (report_type, period_start desc, period_end desc);

alter table public.guest_tags enable row level security;
alter table public.guest_notes enable row level security;
alter table public.report_preferences enable row level security;
alter table public.report_snapshots enable row level security;

drop policy if exists "Admins can manage guest tags" on public.guest_tags;
create policy "Admins can manage guest tags" on public.guest_tags
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage guest notes" on public.guest_notes;
create policy "Admins can manage guest notes" on public.guest_notes
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage report preferences" on public.report_preferences;
create policy "Admins can manage report preferences" on public.report_preferences
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage report snapshots" on public.report_snapshots;
create policy "Admins can manage report snapshots" on public.report_snapshots
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.guest_tags to authenticated;
grant select, insert, update, delete on public.guest_notes to authenticated;
grant select, insert, update, delete on public.report_preferences to authenticated;
grant select, insert, update, delete on public.report_snapshots to authenticated;

insert into public.app_settings (key, value)
values
  ('venue_name', 'Batesford Hotel'),
  ('privacy_policy_url', 'https://www.thebatesfordhotel.com.au/privacy-policy'),
  ('marketing_sender_name', 'Batesford Hotel'),
  ('default_timezone', 'Australia/Melbourne'),
  ('default_report_schedule', 'weekly'),
  ('business_opening_hours', '{"mon":"10:00-23:00","tue":"10:00-23:00","wed":"10:00-23:00","thu":"10:00-23:00","fri":"10:00-01:00","sat":"10:00-01:00","sun":"10:00-22:00"}'),
  ('event_categories', 'trivia,live music,sport,special,private')
on conflict (key) do nothing;

create or replace view public.guest_summary_view
with (security_invoker = true) as
select
  gs.guest_id,
  gs.email,
  gs.full_name,
  gs.mobile,
  gs.postcode,
  gs.segment,
  gs.visit_count,
  gs.first_seen_at,
  gs.last_seen_at,
  gs.visits_by_weekday,
  gs.visits_by_hour,
  gs.last_device_type,
  gs.last_os_family,
  gs.last_user_agent,
  g.marketing_consent,
  g.consent_timestamp,
  g.consent_source,
  g.privacy_policy_version,
  g.unsubscribe_status,
  g.unsubscribe_timestamp,
  g.unsubscribe_source,
  coalesce(tags.tags, '{}'::text[]) as tags
from public.guest_segments gs
join public.guests g
  on g.id = gs.guest_id
left join lateral (
  select array_agg(distinct gt.tag order by gt.tag) as tags
  from public.guest_tags gt
  where gt.guest_id = gs.guest_id
) tags on true;

create or replace view public.visit_daily_counts
with (security_invoker = true) as
select
  date_trunc('day', w.connected_at)::date as visit_date,
  count(*)::int as visits,
  count(distinct w.guest_id)::int as unique_guests
from public.wifi_connections w
group by 1
order by 1 desc;

grant select on public.guest_summary_view to authenticated;
grant select on public.visit_daily_counts to authenticated;
