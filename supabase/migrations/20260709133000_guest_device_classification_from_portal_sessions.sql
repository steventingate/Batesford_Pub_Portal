create or replace view public.guest_summary_view
with (security_invoker = true) as
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
) tags on true;

grant select on public.guest_summary_view to authenticated;
