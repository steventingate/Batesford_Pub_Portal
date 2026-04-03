with base as (
  select
    date_trunc('day', coalesce(t_submit, t_submit_clicked, created_at))::date as day,
    extract(epoch from (coalesce(t_connect_response, t_connect_success) - coalesce(t_submit, t_submit_clicked))) * 1000 as ms_submit_to_connect_response,
    extract(epoch from (t_strict_poll_end - t_strict_poll_start)) * 1000 as ms_strict_poll_window,
    extract(epoch from (t_probe_end - t_probe_start)) * 1000 as ms_probe_window,
    extract(epoch from (coalesce(t_redirect_called, t_website_redirect) - coalesce(t_submit, t_submit_clicked))) * 1000 as ms_submit_to_redirect,
    server_login_ms,
    server_authorize_ms,
    server_status_ms,
    server_total_ms
  from public.wifi_portal_attempt_traces
  where coalesce(t_submit, t_submit_clicked, created_at) >= now() - interval '7 days'
)
select
  day,
  count(*) as samples,
  round(percentile_cont(0.50) within group (order by ms_submit_to_connect_response)::numeric, 0) as p50_submit_to_connect_response_ms,
  round(percentile_cont(0.95) within group (order by ms_submit_to_connect_response)::numeric, 0) as p95_submit_to_connect_response_ms,
  round(percentile_cont(0.50) within group (order by ms_submit_to_redirect)::numeric, 0) as p50_submit_to_redirect_ms,
  round(percentile_cont(0.95) within group (order by ms_submit_to_redirect)::numeric, 0) as p95_submit_to_redirect_ms,
  round(percentile_cont(0.50) within group (order by ms_probe_window)::numeric, 0) as p50_probe_window_ms,
  round(percentile_cont(0.95) within group (order by ms_probe_window)::numeric, 0) as p95_probe_window_ms,
  round(percentile_cont(0.50) within group (order by ms_strict_poll_window)::numeric, 0) as p50_strict_poll_window_ms,
  round(percentile_cont(0.95) within group (order by ms_strict_poll_window)::numeric, 0) as p95_strict_poll_window_ms,
  round(percentile_cont(0.50) within group (order by server_login_ms)::numeric, 0) as p50_server_login_ms,
  round(percentile_cont(0.95) within group (order by server_login_ms)::numeric, 0) as p95_server_login_ms,
  round(percentile_cont(0.50) within group (order by server_authorize_ms)::numeric, 0) as p50_server_authorize_ms,
  round(percentile_cont(0.95) within group (order by server_authorize_ms)::numeric, 0) as p95_server_authorize_ms,
  round(percentile_cont(0.50) within group (order by server_status_ms)::numeric, 0) as p50_server_status_ms,
  round(percentile_cont(0.95) within group (order by server_status_ms)::numeric, 0) as p95_server_status_ms,
  round(percentile_cont(0.50) within group (order by server_total_ms)::numeric, 0) as p50_server_total_ms,
  round(percentile_cont(0.95) within group (order by server_total_ms)::numeric, 0) as p95_server_total_ms
from base
group by day
order by day desc;
