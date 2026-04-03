create table if not exists public.wifi_portal_attempt_traces (
  client_mac text not null,
  unifi_t text not null,
  unifi_site text,
  session_id text not null,
  attempt_no integer not null default 0,
  device_user_agent text,
  last_action text,
  t_submit timestamptz,
  t_submit_clicked timestamptz,
  t_connect_response timestamptz,
  t_connect_success timestamptz,
  t_strict_poll_start timestamptz,
  t_strict_poll_end timestamptz,
  t_strict_ready timestamptz,
  t_probe_start timestamptz,
  t_probe_end timestamptz,
  t_probe_redirect timestamptz,
  t_redirect_called timestamptz,
  t_website_redirect timestamptz,
  t_page_hidden timestamptz,
  t_page_unload timestamptz,
  server_login_ms integer,
  server_authorize_ms integer,
  server_status_ms integer,
  server_total_ms integer,
  status_endpoint_used text,
  cookie_cache_hit boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_mac, unifi_t, session_id, attempt_no)
);

create index if not exists wifi_portal_attempt_traces_created_at_idx
  on public.wifi_portal_attempt_traces (created_at desc);

create index if not exists wifi_portal_attempt_traces_site_created_idx
  on public.wifi_portal_attempt_traces (unifi_site, created_at desc);

create index if not exists wifi_portal_attempt_traces_session_idx
  on public.wifi_portal_attempt_traces (session_id, attempt_no, created_at desc);

alter table public.wifi_portal_attempt_traces enable row level security;
