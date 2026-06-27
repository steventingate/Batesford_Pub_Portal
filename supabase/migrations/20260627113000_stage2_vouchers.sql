create extension if not exists "pgcrypto";

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  discount_type text not null default 'custom',
  discount_value numeric,
  start_at timestamptz,
  end_at timestamptz,
  max_redemptions integer,
  per_guest_limit integer,
  status text not null default 'active',
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  redeemed_by text,
  estimated_revenue numeric,
  notes text
);

alter table public.campaigns
  add column if not exists linked_voucher_id uuid references public.vouchers(id) on delete set null;

create index if not exists vouchers_status_idx on public.vouchers (status, end_at desc);
create index if not exists voucher_redemptions_voucher_idx on public.voucher_redemptions (voucher_id, redeemed_at desc);
create index if not exists voucher_redemptions_guest_idx on public.voucher_redemptions (guest_id, redeemed_at desc);

alter table public.vouchers enable row level security;
alter table public.voucher_redemptions enable row level security;

drop policy if exists vouchers_select on public.vouchers;
create policy vouchers_select on public.vouchers
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists vouchers_insert on public.vouchers;
create policy vouchers_insert on public.vouchers
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists vouchers_update on public.vouchers;
create policy vouchers_update on public.vouchers
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists voucher_redemptions_select on public.voucher_redemptions;
create policy voucher_redemptions_select on public.voucher_redemptions
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists voucher_redemptions_insert on public.voucher_redemptions;
create policy voucher_redemptions_insert on public.voucher_redemptions
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists voucher_redemptions_update on public.voucher_redemptions;
create policy voucher_redemptions_update on public.voucher_redemptions
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.vouchers to authenticated;
grant select, insert, update, delete on public.voucher_redemptions to authenticated;
