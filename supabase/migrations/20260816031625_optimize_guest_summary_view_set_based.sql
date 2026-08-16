begin;

create or replace view public.guest_summary_view
with (security_invoker = true, security_barrier = true) as
with portal_matches as (
  select
    g.id as guest_id,
    greatest(
      coalesce(ps.submitted_at, '-infinity'::timestamptz),
      coalesce(ps.authorized_at, '-infinity'::timestamptz),
      coalesce(ps.completed_at, '-infinity'::timestamptz),
      coalesce(ps.updated_at, '-infinity'::timestamptz)
    ) as activity_at,
    ps.user_agent
  from public.guests g
  join public.portal_sessions ps
    on lower(trim(coalesce(ps.guest_email, ''))) = lower(trim(g.email))
  where g.email is not null
    and nullif(trim(coalesce(ps.guest_email, '')), '') is not null

  union all

  select
    g.id as guest_id,
    greatest(
      coalesce(ps.submitted_at, '-infinity'::timestamptz),
      coalesce(ps.authorized_at, '-infinity'::timestamptz),
      coalesce(ps.completed_at, '-infinity'::timestamptz),
      coalesce(ps.updated_at, '-infinity'::timestamptz)
    ) as activity_at,
    ps.user_agent
  from public.guests g
  join public.portal_sessions ps
    on regexp_replace(coalesce(ps.guest_phone, ''), '\D', '', 'g') = regexp_replace(coalesce(g.mobile, ''), '\D', '', 'g')
  where g.mobile is not null
    and regexp_replace(coalesce(ps.guest_phone, ''), '\D', '', 'g') <> ''
),
portal_activity as (
  select
    guest_id,
    max(activity_at) as last_portal_seen_at
  from portal_matches
  group by guest_id
),
portal_device as (
  select distinct on (guest_id)
    guest_id,
    public.detect_device_type(user_agent) as device_type,
    public.detect_os_family(user_agent) as os_family,
    user_agent
  from portal_matches
  where nullif(trim(coalesce(user_agent, '')), '') is not null
  order by guest_id, activity_at desc
),
tags as (
  select
    gt.guest_id,
    array_agg(distinct gt.tag order by gt.tag) as tags
  from public.guest_tags gt
  group by gt.guest_id
)
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
left join portal_activity
  on portal_activity.guest_id = gs.guest_id
left join portal_device
  on portal_device.guest_id = gs.guest_id
left join tags
  on tags.guest_id = gs.guest_id
where (select public.is_admin(auth.uid()));

grant select on public.guest_summary_view to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
