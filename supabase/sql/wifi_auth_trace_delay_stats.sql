-- Daily timing summary for captive auth traces (all venues)
select
  date_trunc('day', created_at) as day,
  count(*) as traces,
  round(avg(total_duration_ms)::numeric, 0) as avg_total_ms,
  percentile_cont(0.50) within group (order by total_duration_ms) as p50_total_ms,
  percentile_cont(0.95) within group (order by total_duration_ms) as p95_total_ms,
  max(total_duration_ms) as max_total_ms,
  round(avg(backend_duration_ms)::numeric, 0) as avg_backend_ms,
  round(avg(frontend_duration_ms)::numeric, 0) as avg_frontend_ms
from public.wifi_auth_traces
where created_at >= now() - interval '14 days'
  and total_duration_ms is not null
group by 1
order by 1 desc;

-- Venue breakdown (same period)
select
  coalesce(nullif(venue_slug, ''), site_id, 'unknown') as venue,
  count(*) as traces,
  round(avg(total_duration_ms)::numeric, 0) as avg_total_ms,
  percentile_cont(0.95) within group (order by total_duration_ms) as p95_total_ms,
  max(total_duration_ms) as max_total_ms
from public.wifi_auth_traces
where created_at >= now() - interval '14 days'
  and total_duration_ms is not null
group by 1
order by avg_total_ms desc;
