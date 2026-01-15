create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_profiles where user_id = auth.uid()
  );
$$;

create policy "Users can read own profile" on admin_profiles
  for select
  using (user_id = auth.uid());

create policy "Users can update own profile" on admin_profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
