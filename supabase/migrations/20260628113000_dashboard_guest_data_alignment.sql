create table if not exists public.wifi_access_points (
  ap_mac text primary key,
  site_slug text,
  area_name text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wifi_access_points_site_idx on public.wifi_access_points (site_slug, area_name);
create index if not exists portal_sessions_status_updated_idx on public.portal_sessions (status, updated_at desc);
create index if not exists portal_sessions_authorized_updated_idx on public.portal_sessions (authorized_at desc, updated_at desc);

alter table public.wifi_access_points enable row level security;

drop policy if exists "Admins can manage wifi access points" on public.wifi_access_points;
create policy "Admins can manage wifi access points" on public.wifi_access_points
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.wifi_access_points to authenticated;

insert into public.wifi_access_points (ap_mac, site_slug, area_name, display_name, is_active)
select distinct
  lower(trim(ps.ap_mac)) as ap_mac,
  nullif(trim(ps.site_slug), '') as site_slug,
  'Access Point ' || upper(right(replace(lower(trim(ps.ap_mac)), ':', ''), 4)) as area_name,
  null::text as display_name,
  true as is_active
from public.portal_sessions ps
where ps.ap_mac is not null
  and trim(ps.ap_mac) <> ''
on conflict (ap_mac) do update
set
  site_slug = coalesce(public.wifi_access_points.site_slug, excluded.site_slug),
  area_name = coalesce(nullif(public.wifi_access_points.area_name, ''), excluded.area_name),
  is_active = true,
  updated_at = now();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'contact_submissions'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contact_submissions'
      and column_name = 'consent'
  ) then
    execute $sql$
      update public.guests g
      set
        marketing_consent = true,
        consent_timestamp = coalesce(g.consent_timestamp, cs.created_at, now()),
        consent_source = coalesce(g.consent_source, 'portal_form'),
        updated_at = now()
      from (
        select lower(trim(email)) as email, max(created_at) as created_at
        from public.contact_submissions
        where email is not null
          and trim(email) <> ''
          and consent = true
        group by lower(trim(email))
      ) cs
      where g.email = cs.email
        and coalesce(g.marketing_consent, false) = false
    $sql$;
  end if;
end $$;
