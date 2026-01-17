begin;

create extension if not exists "pgcrypto";

alter table if exists public.admin_profiles
  add column if not exists id uuid,
  add column if not exists email text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id);

alter table public.admin_profiles
  alter column id set default gen_random_uuid();

update public.admin_profiles
  set id = gen_random_uuid()
  where id is null;

alter table public.admin_profiles
  alter column role set default 'admin';

alter table public.admin_profiles
  alter column user_id set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'admin_profiles_pkey'
  ) then
    alter table public.admin_profiles drop constraint admin_profiles_pkey;
  end if;
end $$;

alter table public.admin_profiles
  add constraint admin_profiles_pkey primary key (id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_profiles_user_id_key'
  ) then
    alter table public.admin_profiles add constraint admin_profiles_user_id_key unique (user_id);
  end if;
end $$;

create or replace function public.is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_profiles where user_id = uid and revoked_at is null
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin(auth.uid());
$$;

alter table public.admin_profiles enable row level security;

drop policy if exists "Admins can manage profiles" on public.admin_profiles;
drop policy if exists "Users can read own profile" on public.admin_profiles;
drop policy if exists "Users can update own profile" on public.admin_profiles;

create policy "Admins can read admin profiles" on public.admin_profiles
  for select
  using (public.is_admin(auth.uid()));

create policy "Admins can insert admin profiles" on public.admin_profiles
  for insert
  with check (public.is_admin(auth.uid()));

create policy "Admins can update admin profiles" on public.admin_profiles
  for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create or replace function public.bootstrap_admin()
returns public.admin_profiles
language plpgsql
security definer
set search_path = public as $$
declare
  inserted_row public.admin_profiles;
  target_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.admin_profiles where revoked_at is null) then
    return null;
  end if;

  select email into target_email from auth.users where id = auth.uid();

  insert into public.admin_profiles (user_id, email, role, created_at, created_by)
  values (auth.uid(), target_email, 'admin', now(), auth.uid())
  returning * into inserted_row;

  return inserted_row;
end;
$$;

revoke all on function public.bootstrap_admin() from public;
grant execute on function public.bootstrap_admin() to authenticated;

commit;