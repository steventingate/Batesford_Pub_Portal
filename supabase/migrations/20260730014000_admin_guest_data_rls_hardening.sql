begin;

create or replace function public.is_admin(user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.user_id = $1
      and ap.revoked_at is null
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin(auth.uid());
$$;

alter view public.guest_profiles set (security_invoker = true, security_barrier = true);
alter view public.guest_segments set (security_invoker = true, security_barrier = true);
alter view public.guest_segment_counts set (security_invoker = true, security_barrier = true);
alter view public.guest_summary_view set (security_invoker = true, security_barrier = true);

revoke all on
  public.guest_profiles,
  public.guest_segments,
  public.guest_segment_counts,
  public.guest_summary_view,
  public.guests,
  public.wifi_connections,
  public.portal_sessions,
  public.guest_tags
from anon;

revoke insert, update, delete, truncate, references, trigger on
  public.guest_profiles,
  public.guest_segments,
  public.guest_segment_counts,
  public.guest_summary_view
from authenticated;

grant select on
  public.guest_profiles,
  public.guest_segments,
  public.guest_segment_counts,
  public.guest_summary_view,
  public.guests,
  public.wifi_connections,
  public.portal_sessions
to authenticated;

grant select, insert, update, delete on public.guest_tags to authenticated;

drop policy if exists guests_select on public.guests;
drop policy if exists guests_update on public.guests;
drop policy if exists "Admins can manage guests" on public.guests;
create policy "Admins can manage guests" on public.guests
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists wifi_connections_select on public.wifi_connections;
drop policy if exists wifi_connections_insert on public.wifi_connections;
drop policy if exists "Admins can manage wifi connections" on public.wifi_connections;
create policy "Admins can manage wifi connections" on public.wifi_connections
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage portal sessions" on public.portal_sessions;
create policy "Admins can manage portal sessions" on public.portal_sessions
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create or replace view public.guest_summary_view
with (security_invoker = true, security_barrier = true) as
select
  gs.guest_id,
  gs.email,
  gs.full_name,
  gs.mobile,
  gs.postcode,
  gs.segment,
  gs.visit_count,
  gs.first_seen_at,
  nullif(
    greatest(
      coalesce(gs.last_seen_at, '-infinity'::timestamptz),
      coalesce(portal_activity.last_portal_seen_at, '-infinity'::timestamptz)
    ),
    '-infinity'::timestamptz
  ) as last_seen_at,
  gs.visits_by_weekday,
  gs.visits_by_hour,
  case
    when coalesce(gs.last_device_type, 'unknown') <> 'unknown' then gs.last_device_type
    when coalesce(portal_device.device_type, 'unknown') <> 'unknown' then portal_device.device_type
    else gs.last_device_type
  end as last_device_type,
  case
    when coalesce(gs.last_os_family, 'unknown') <> 'unknown' then gs.last_os_family
    when coalesce(portal_device.os_family, 'unknown') <> 'unknown' then portal_device.os_family
    else gs.last_os_family
  end as last_os_family,
  coalesce(
    nullif(gs.last_user_agent, ''),
    nullif(portal_device.user_agent, ''),
    gs.last_user_agent
  ) as last_user_agent,
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
  select max(activity_at) as last_portal_seen_at
  from (
    select greatest(
      coalesce(ps.submitted_at, '-infinity'::timestamptz),
      coalesce(ps.authorized_at, '-infinity'::timestamptz),
      coalesce(ps.completed_at, '-infinity'::timestamptz),
      coalesce(ps.updated_at, '-infinity'::timestamptz)
    ) as activity_at
    from public.portal_sessions ps
    where (
      g.email is not null
      and lower(trim(coalesce(ps.guest_email, ''))) = lower(trim(g.email))
    ) or (
      g.mobile is not null
      and regexp_replace(coalesce(ps.guest_phone, ''), '\D', '', 'g') <> ''
      and regexp_replace(coalesce(ps.guest_phone, ''), '\D', '', 'g') = regexp_replace(coalesce(g.mobile, ''), '\D', '', 'g')
    )
  ) portal_matches
) portal_activity on true
left join lateral (
  select
    public.detect_device_type(ps.user_agent) as device_type,
    public.detect_os_family(ps.user_agent) as os_family,
    ps.user_agent
  from public.portal_sessions ps
  where nullif(trim(coalesce(ps.user_agent, '')), '') is not null
    and (
      (
        g.email is not null
        and lower(trim(coalesce(ps.guest_email, ''))) = lower(trim(g.email))
      ) or (
        g.mobile is not null
        and regexp_replace(coalesce(ps.guest_phone, ''), '\D', '', 'g') <> ''
        and regexp_replace(coalesce(ps.guest_phone, ''), '\D', '', 'g') = regexp_replace(coalesce(g.mobile, ''), '\D', '', 'g')
      )
    )
  order by greatest(
    coalesce(ps.submitted_at, '-infinity'::timestamptz),
    coalesce(ps.authorized_at, '-infinity'::timestamptz),
    coalesce(ps.completed_at, '-infinity'::timestamptz),
    coalesce(ps.updated_at, '-infinity'::timestamptz)
  ) desc
  limit 1
) portal_device on true
left join lateral (
  select array_agg(distinct gt.tag order by gt.tag) as tags
  from public.guest_tags gt
  where gt.guest_id = gs.guest_id
) tags on true
where public.is_admin(auth.uid());

grant select on public.guest_summary_view to authenticated;

commit;
