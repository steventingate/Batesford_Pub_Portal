create extension if not exists "pgcrypto";

create or replace function public.detect_device_type(ua text)
returns text
language plpgsql
immutable
as $$
declare
  agent text := coalesce(ua, '');
begin
  if agent ~* 'iPad' then
    return 'tablet';
  elsif agent ~* 'iPhone|iPod' then
    return 'mobile';
  elsif agent ~* 'Android' then
    if agent ~* 'Mobile' then
      return 'mobile';
    end if;
    return 'tablet';
  elsif agent ~* 'Windows|Mac OS X|Linux' then
    return 'desktop';
  end if;
  return 'unknown';
end;
$$;

create or replace function public.detect_os_family(ua text)
returns text
language plpgsql
immutable
as $$
declare
  agent text := coalesce(ua, '');
begin
  if agent ~* 'iPhone|iPad|iPod' then
    return 'ios';
  elsif agent ~* 'Android' then
    return 'android';
  elsif agent ~* 'Windows' then
    return 'windows';
  elsif agent ~* 'Mac OS X' then
    return 'macos';
  elsif agent ~* 'Linux' then
    return 'linux';
  end if;
  return 'unknown';
end;
$$;

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  mobile text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint guests_email_lowercase check (email = lower(email))
);

create table if not exists wifi_connections (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  connected_at timestamptz default now(),
  user_agent text,
  device_type text not null default 'unknown',
  os_family text not null default 'unknown',
  weekday smallint not null default 0,
  hour smallint not null default 0
);

create index if not exists guests_email_idx on guests(email);
create index if not exists wifi_connections_guest_connected_idx on wifi_connections(guest_id, connected_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger guests_set_updated_at
before update on guests
for each row execute function public.set_updated_at();

create or replace function public.handle_contact_submission()
returns trigger
language plpgsql
as $$
declare
  guest_uuid uuid;
  cleaned_email text;
  cleaned_name text;
  cleaned_mobile text;
  connected_at timestamptz;
begin
  cleaned_email := lower(trim(new.email));
  if cleaned_email is null or cleaned_email = '' then
    return new;
  end if;

  cleaned_name := nullif(trim(new.full_name), '');
  cleaned_mobile := nullif(trim(new.phone), '');
  connected_at := coalesce(new.created_at, now());

  insert into guests (email, full_name, mobile)
  values (cleaned_email, cleaned_name, cleaned_mobile)
  on conflict (email)
  do update set
    full_name = coalesce(excluded.full_name, guests.full_name),
    mobile = coalesce(excluded.mobile, guests.mobile),
    updated_at = now()
  returning id into guest_uuid;

  insert into wifi_connections (guest_id, connected_at, user_agent, device_type, os_family)
  values (
    guest_uuid,
    connected_at,
    new.user_agent,
    public.detect_device_type(new.user_agent),
    public.detect_os_family(new.user_agent)
  );

  return new;
end;
$$;

create or replace function public.set_wifi_connection_time_parts()
returns trigger
language plpgsql
as $$
begin
  new.weekday := extract(dow from new.connected_at)::smallint;
  new.hour := extract(hour from new.connected_at)::smallint;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'wifi_connections_time_parts'
  ) then
    create trigger wifi_connections_time_parts
    before insert or update of connected_at on public.wifi_connections
    for each row execute function public.set_wifi_connection_time_parts();
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'contact_submissions'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'contact_submissions_to_guest'
    ) then
      create trigger contact_submissions_to_guest
      after insert on public.contact_submissions
      for each row execute function public.handle_contact_submission();
    end if;
  end if;
end $$;

create or replace view guest_profiles as
select
  g.id as guest_id,
  g.email,
  g.full_name,
  g.mobile,
  count(w.id) as visit_count,
  min(w.connected_at) as first_seen_at,
  max(w.connected_at) as last_seen_at,
  weekday_counts.weekday_json as visits_by_weekday,
  hour_counts.hour_json as visits_by_hour,
  last_conn.device_type as last_device_type,
  last_conn.os_family as last_os_family,
  last_conn.user_agent as last_user_agent
from guests g
left join wifi_connections w on w.guest_id = g.id
left join lateral (
  select jsonb_object_agg(day_key, count_val) as weekday_json
  from (
    select gs::text as day_key, coalesce(count(w2.*), 0) as count_val
    from generate_series(0, 6) gs
    left join wifi_connections w2
      on w2.guest_id = g.id and w2.weekday = gs
    group by gs
    order by gs
  ) days
) weekday_counts on true
left join lateral (
  select jsonb_object_agg(hour_key, count_val) as hour_json
  from (
    select gs::text as hour_key, coalesce(count(w2.*), 0) as count_val
    from generate_series(0, 23) gs
    left join wifi_connections w2
      on w2.guest_id = g.id and w2.hour = gs
    group by gs
    order by gs
  ) hours
) hour_counts on true
left join lateral (
  select w3.device_type, w3.os_family, w3.user_agent
  from wifi_connections w3
  where w3.guest_id = g.id
  order by w3.connected_at desc
  limit 1
) last_conn on true
group by
  g.id,
  g.email,
  g.full_name,
  g.mobile,
  weekday_counts.weekday_json,
  hour_counts.hour_json,
  last_conn.device_type,
  last_conn.os_family,
  last_conn.user_agent;

insert into guests (email, full_name, mobile)
select distinct
  lower(trim(cs.email)) as email,
  nullif(trim(cs.full_name), '') as full_name,
  nullif(trim(cs.phone), '') as mobile
from contact_submissions cs
where cs.email is not null and trim(cs.email) <> ''
on conflict (email)
do update set
  full_name = coalesce(excluded.full_name, guests.full_name),
  mobile = coalesce(excluded.mobile, guests.mobile),
  updated_at = now();

insert into wifi_connections (guest_id, connected_at, user_agent, device_type, os_family)
select
  g.id,
  coalesce(cs.created_at, now()),
  cs.user_agent,
  public.detect_device_type(cs.user_agent),
  public.detect_os_family(cs.user_agent)
from contact_submissions cs
join guests g on g.email = lower(trim(cs.email))
where cs.email is not null and trim(cs.email) <> '';

alter table guests enable row level security;
alter table wifi_connections enable row level security;

create policy "Admins can manage guests" on guests
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage wifi connections" on wifi_connections
  for all
  using (public.is_admin())
  with check (public.is_admin());
