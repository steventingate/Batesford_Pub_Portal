begin;

create index if not exists portal_sessions_guest_email_lookup_idx
  on public.portal_sessions (lower(trim(coalesce(guest_email, ''))));

create index if not exists portal_sessions_guest_phone_lookup_idx
  on public.portal_sessions (regexp_replace(coalesce(guest_phone, ''), '\D', '', 'g'));

drop policy if exists "Admins can manage guests" on public.guests;
create policy "Admins can manage guests" on public.guests
  for all
  to authenticated
  using ((select public.is_admin(auth.uid())))
  with check ((select public.is_admin(auth.uid())));

drop policy if exists "Admins can manage wifi connections" on public.wifi_connections;
create policy "Admins can manage wifi connections" on public.wifi_connections
  for all
  to authenticated
  using ((select public.is_admin(auth.uid())))
  with check ((select public.is_admin(auth.uid())));

drop policy if exists "Admins can manage portal sessions" on public.portal_sessions;
create policy "Admins can manage portal sessions" on public.portal_sessions
  for all
  to authenticated
  using ((select public.is_admin(auth.uid())))
  with check ((select public.is_admin(auth.uid())));

drop policy if exists "Admins can manage guest tags" on public.guest_tags;
create policy "Admins can manage guest tags" on public.guest_tags
  for all
  to authenticated
  using ((select public.is_admin(auth.uid())))
  with check ((select public.is_admin(auth.uid())));

select pg_notify('pgrst', 'reload schema');

commit;
