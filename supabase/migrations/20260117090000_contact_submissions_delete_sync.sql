create or replace function public.handle_contact_submission_delete()
returns trigger
language plpgsql
as $$
declare
  guest_uuid uuid;
  cleaned_email text;
  matched_id uuid;
begin
  cleaned_email := lower(trim(old.email));
  if cleaned_email is null or cleaned_email = '' then
    return old;
  end if;

  select id into guest_uuid
  from public.guests
  where email = cleaned_email;

  if guest_uuid is null then
    return old;
  end if;

  if old.created_at is not null then
    delete from public.wifi_connections
    where guest_id = guest_uuid
      and connected_at = old.created_at
      and (old.user_agent is null or user_agent = old.user_agent);
  else
    select id into matched_id
    from public.wifi_connections
    where guest_id = guest_uuid
      and (old.user_agent is null or user_agent = old.user_agent)
    order by connected_at desc
    limit 1;

    if matched_id is not null then
      delete from public.wifi_connections where id = matched_id;
    end if;
  end if;

  if not exists (
    select 1 from public.wifi_connections where guest_id = guest_uuid
  ) then
    delete from public.guests where id = guest_uuid;
  end if;

  return old;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'contact_submissions'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'contact_submissions_delete_guest'
    ) then
      create trigger contact_submissions_delete_guest
      after delete on public.contact_submissions
      for each row execute function public.handle_contact_submission_delete();
    end if;
  end if;
end $$;
