alter table public.wifi_auth_traces
  add column if not exists redirect_mode text,
  add column if not exists verify_attempts integer,
  add column if not exists release_result text,
  add column if not exists edge_route_id text;

create index if not exists wifi_auth_traces_redirect_mode_created_idx
  on public.wifi_auth_traces (redirect_mode, created_at desc);

create index if not exists wifi_auth_traces_release_result_created_idx
  on public.wifi_auth_traces (release_result, created_at desc);
