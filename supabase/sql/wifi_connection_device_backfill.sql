with candidate_matches as (
  select
    w.id as wifi_connection_id,
    ps_match.user_agent,
    public.detect_device_type(ps_match.user_agent) as device_type,
    public.detect_os_family(ps_match.user_agent) as os_family
  from public.wifi_connections w
  join public.guests g
    on g.id = w.guest_id
  join lateral (
    select
      ps.user_agent,
      greatest(
        coalesce(ps.submitted_at, '-infinity'::timestamptz),
        coalesce(ps.authorized_at, '-infinity'::timestamptz),
        coalesce(ps.completed_at, '-infinity'::timestamptz),
        coalesce(ps.updated_at, '-infinity'::timestamptz)
      ) as activity_at
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
    order by abs(extract(epoch from (
      greatest(
        coalesce(ps.submitted_at, '-infinity'::timestamptz),
        coalesce(ps.authorized_at, '-infinity'::timestamptz),
        coalesce(ps.completed_at, '-infinity'::timestamptz),
        coalesce(ps.updated_at, '-infinity'::timestamptz)
      ) - w.connected_at
    ))) asc
    limit 1
  ) ps_match on true
  where (
    coalesce(w.device_type, 'unknown') = 'unknown'
    or coalesce(w.os_family, 'unknown') = 'unknown'
    or nullif(trim(coalesce(w.user_agent, '')), '') is null
  )
    and (
      public.detect_device_type(ps_match.user_agent) <> 'unknown'
      or public.detect_os_family(ps_match.user_agent) <> 'unknown'
    )
),
updated as (
  update public.wifi_connections w
  set
    user_agent = case
      when nullif(trim(coalesce(w.user_agent, '')), '') is null
        or coalesce(w.device_type, 'unknown') = 'unknown'
        or coalesce(w.os_family, 'unknown') = 'unknown'
      then candidate_matches.user_agent
      else w.user_agent
    end,
    device_type = case
      when coalesce(w.device_type, 'unknown') = 'unknown'
      then candidate_matches.device_type
      else w.device_type
    end,
    os_family = case
      when coalesce(w.os_family, 'unknown') = 'unknown'
      then candidate_matches.os_family
      else w.os_family
    end
  from candidate_matches
  where w.id = candidate_matches.wifi_connection_id
  returning w.id, w.guest_id, w.connected_at, w.device_type, w.os_family
)
select count(*)::int as updated_rows
from updated;
