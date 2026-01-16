alter table public.guests
  add column if not exists postcode text;

alter table public.guests
  add column if not exists postcode_updated_at timestamptz;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.app_settings enable row level security;

create or replace function public.set_app_settings_updated_at()
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
  if not exists (select 1 from pg_trigger where tgname = 'set_app_settings_updated_at') then
    create trigger set_app_settings_updated_at
    before update on public.app_settings
    for each row
    execute function public.set_app_settings_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'Admins can manage app settings'
  ) then
    create policy "Admins can manage app settings"
      on public.app_settings
      for all
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

insert into public.app_settings (key, value)
values ('local_postcodes', '3213,3220,3218,3216,3214,3228')
on conflict (key) do nothing;

create or replace function public.get_local_postcodes()
returns text[]
language plpgsql
stable
as $$
declare
  v text;
begin
  select value into v from public.app_settings where key = 'local_postcodes';
  if v is null or btrim(v) = '' then
    return array['3213','3220','3218','3216','3214','3228'];
  end if;
  return regexp_split_to_array(replace(v, ' ', ''), ',');
end;
$$;

create or replace view public.guest_segments as
select
  gp.guest_id,
  gp.email,
  gp.full_name,
  gp.mobile,
  gp.visit_count,
  gp.first_seen_at,
  gp.last_seen_at,
  gp.visits_by_weekday,
  gp.visits_by_hour,
  gp.last_device_type,
  gp.last_os_family,
  gp.last_user_agent,
  g.postcode,
  case
    when g.postcode is null or btrim(g.postcode) = '' then 'unknown'
    when g.postcode = any (public.get_local_postcodes()) then 'local'
    else 'visitor'
  end as segment
from public.guest_profiles gp
join public.guests g on g.id = gp.guest_id;

create or replace view public.guest_segment_counts as
select segment, count(*)::int as total
from public.guest_segments
group by segment;
