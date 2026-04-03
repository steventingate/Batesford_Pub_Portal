create table if not exists public.wifi_portal_timings (
  client_mac text not null,
  unifi_t text not null,
  unifi_site text,
  device_user_agent text,
  t_submit_clicked timestamptz,
  t_connect_success timestamptz,
  t_strict_ready timestamptz,
  t_probe_redirect timestamptz,
  t_website_redirect timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_mac, unifi_t)
);

create index if not exists wifi_portal_timings_created_at_idx
  on public.wifi_portal_timings (created_at desc);

create index if not exists wifi_portal_timings_site_created_idx
  on public.wifi_portal_timings (unifi_site, created_at desc);

alter table public.wifi_portal_timings enable row level security;
