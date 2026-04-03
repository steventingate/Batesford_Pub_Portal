with samples as (
  select
    date_trunc('day', coalesce(t_submit_clicked, created_at))::date as day,
    extract(epoch from (t_connect_success - t_submit_clicked)) as submit_to_connect_seconds,
    extract(epoch from (t_strict_ready - t_submit_clicked)) as submit_to_strict_seconds,
    extract(epoch from (t_website_redirect - t_submit_clicked)) as submit_to_website_seconds
  from public.wifi_portal_timings
)
select
  day,
  count(*) filter (where submit_to_connect_seconds is not null) as samples_connect,
  percentile_cont(0.5) within group (order by submit_to_connect_seconds)
    filter (where submit_to_connect_seconds is not null) as p50_submit_to_connect_seconds,
  percentile_cont(0.95) within group (order by submit_to_connect_seconds)
    filter (where submit_to_connect_seconds is not null) as p95_submit_to_connect_seconds,
  count(*) filter (where submit_to_strict_seconds is not null) as samples_strict,
  percentile_cont(0.5) within group (order by submit_to_strict_seconds)
    filter (where submit_to_strict_seconds is not null) as p50_submit_to_strict_seconds,
  percentile_cont(0.95) within group (order by submit_to_strict_seconds)
    filter (where submit_to_strict_seconds is not null) as p95_submit_to_strict_seconds,
  count(*) filter (where submit_to_website_seconds is not null) as samples_website,
  percentile_cont(0.5) within group (order by submit_to_website_seconds)
    filter (where submit_to_website_seconds is not null) as p50_submit_to_website_seconds,
  percentile_cont(0.95) within group (order by submit_to_website_seconds)
    filter (where submit_to_website_seconds is not null) as p95_submit_to_website_seconds
from samples
group by day
order by day desc;
