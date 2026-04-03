create extension if not exists "pgcrypto";

create table if not exists public.wifi_authorization_events (
  id uuid primary key default gen_random_uuid(),
  client_mac text not null,
  unifi_site text,
  unifi_t text,
  authorized_at timestamptz not null default now()
);

create index if not exists wifi_authorization_events_lookup_idx
  on public.wifi_authorization_events (client_mac, unifi_t, authorized_at desc);
