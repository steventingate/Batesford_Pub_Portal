-- Captive release diagnostics for network-first Wi-Fi testing.
-- Use this after onsite tests to prove whether the portal released quickly
-- and whether the remaining delay happened after the OS probe redirect.

with latest_sessions as (
  select
    ps.session_key,
    ps.trace_id,
    ps.site_slug,
    ps.client_mac,
    ps.ssid,
    ps.ap_mac,
    ps.redirect_url,
    ps.status,
    ps.release_mode,
    ps.release_result,
    ps.submitted_at,
    ps.authorized_at,
    ps.release_attempted_at,
    ps.completed_at,
    ps.updated_at,
    extract(epoch from (ps.authorized_at - ps.submitted_at)) * 1000 as submit_to_authorized_ms,
    extract(epoch from (ps.release_attempted_at - ps.authorized_at)) * 1000 as authorized_to_release_ms,
    extract(epoch from (ps.release_attempted_at - ps.submitted_at)) * 1000 as submit_to_release_ms
  from public.portal_sessions ps
  where ps.updated_at >= now() - interval '24 hours'
),
event_pivot as (
  select
    e.trace_id,
    min(e.started_at) filter (where e.stage_name = 'portal_submit') as portal_submit_at,
    min(e.started_at) filter (where e.stage_name = 'unifi_authorized') as unifi_authorized_at,
    min(e.started_at) filter (where e.stage_name = 'post_auth_redirect_issued') as post_auth_redirect_at,
    min(e.started_at) filter (where e.stage_name = 'release_route_received') as release_route_received_at,
    min(e.started_at) filter (where e.stage_name = 'probe_release_redirect') as probe_release_redirect_at,
    min(e.started_at) filter (where e.stage_name = 'page_hidden') as page_hidden_at,
    min(e.started_at) filter (where e.stage_name = 'manual_website_clicked') as manual_website_clicked_at
  from public.wifi_auth_trace_events e
  where e.created_at >= now() - interval '24 hours'
  group by e.trace_id
)
select
  s.updated_at,
  s.site_slug,
  s.ssid,
  s.client_mac,
  s.ap_mac,
  s.redirect_url,
  s.status,
  s.release_mode,
  s.release_result,
  round(s.submit_to_authorized_ms::numeric, 0) as submit_to_authorized_ms,
  round(s.authorized_to_release_ms::numeric, 0) as authorized_to_release_ms,
  round(s.submit_to_release_ms::numeric, 0) as submit_to_release_ms,
  round((extract(epoch from (e.probe_release_redirect_at - e.portal_submit_at)) * 1000)::numeric, 0) as event_submit_to_probe_ms,
  round((extract(epoch from (e.page_hidden_at - e.probe_release_redirect_at)) * 1000)::numeric, 0) as event_probe_to_page_hidden_ms,
  case
    when e.probe_release_redirect_at is null then 'no_probe_release_recorded'
    when extract(epoch from (e.probe_release_redirect_at - e.portal_submit_at)) * 1000 <= 4000
      and e.page_hidden_at is null then 'portal_released_fast_check_network_or_ios'
    when e.page_hidden_at is not null
      and extract(epoch from (e.page_hidden_at - e.probe_release_redirect_at)) * 1000 > 15000 then 'post_probe_release_slow'
    else 'release_path_ok'
  end as diagnosis,
  s.session_key,
  s.trace_id
from latest_sessions s
left join event_pivot e on e.trace_id = s.trace_id
order by s.updated_at desc;

-- Aggregate view for comparing our portal against a Spotipo trial window.
with release_runs as (
  select
    ps.site_slug,
    ps.ssid,
    ps.client_mac,
    ps.trace_id,
    extract(epoch from (ps.authorized_at - ps.submitted_at)) * 1000 as submit_to_authorized_ms,
    extract(epoch from (ps.release_attempted_at - ps.submitted_at)) * 1000 as submit_to_release_ms
  from public.portal_sessions ps
  where ps.submitted_at >= now() - interval '7 days'
    and ps.authorized_at is not null
)
select
  site_slug,
  ssid,
  count(*) as runs,
  round(percentile_cont(0.50) within group (order by submit_to_authorized_ms)::numeric, 0) as p50_submit_to_authorized_ms,
  round(percentile_cont(0.95) within group (order by submit_to_authorized_ms)::numeric, 0) as p95_submit_to_authorized_ms,
  round(percentile_cont(0.50) within group (order by submit_to_release_ms)::numeric, 0) as p50_submit_to_release_ms,
  round(percentile_cont(0.95) within group (order by submit_to_release_ms)::numeric, 0) as p95_submit_to_release_ms
from release_runs
group by site_slug, ssid
order by p95_submit_to_release_ms desc nulls last;
