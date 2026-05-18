create extension if not exists "pgcrypto";

create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  site_slug text not null,
  client_mac text not null,
  ap_mac text,
  ssid text,
  unifi_t text,
  redirect_url text,
  user_agent text,
  status text not null default 'presented',
  trace_id text,
  guest_name text,
  guest_email text,
  guest_phone text,
  guest_postcode text,
  release_target text,
  continue_target text,
  secondary_target text,
  final_redirect_url text,
  website_url text,
  release_mode text,
  last_error text,
  submitted_at timestamptz,
  authorized_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_sessions_site_mac_idx
  on public.portal_sessions (site_slug, client_mac, updated_at desc);

create index if not exists portal_sessions_unifi_t_idx
  on public.portal_sessions (unifi_t);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'portal_sessions_set_updated_at'
  ) then
    create trigger portal_sessions_set_updated_at
    before update on public.portal_sessions
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.portal_sessions enable row level security;

grant select, insert, update, delete on public.portal_sessions to service_role;

create policy "Admins can manage portal sessions" on public.portal_sessions
  for all
  using (public.is_admin())
  with check (public.is_admin());
