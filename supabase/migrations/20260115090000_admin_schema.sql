create extension if not exists "pgcrypto";

create table if not exists admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text default 'manager',
  created_at timestamptz default now()
);

create table if not exists contact_tags (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contact_submissions(id) on delete cascade,
  tag text not null,
  created_at timestamptz default now()
);

create table if not exists contact_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contact_submissions(id) on delete cascade,
  note text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  from_name text,
  from_email text,
  reply_to text,
  html_body text not null,
  segment_json jsonb,
  status text default 'draft',
  scheduled_for timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references email_campaigns(id) on delete cascade,
  contact_id uuid references contact_submissions(id) on delete cascade,
  to_email text,
  status text default 'queued',
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists contact_tags_contact_id_idx on contact_tags(contact_id);
create index if not exists contact_tags_tag_idx on contact_tags(tag);
create index if not exists contact_notes_contact_id_idx on contact_notes(contact_id);
create index if not exists email_sends_campaign_idx on email_sends(campaign_id);
create index if not exists email_sends_contact_idx on email_sends(contact_id);

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select exists (
    select 1 from public.admin_profiles where user_id = auth.uid()
  );
$$;

alter table admin_profiles enable row level security;
alter table contact_tags enable row level security;
alter table contact_notes enable row level security;
alter table email_campaigns enable row level security;
alter table email_sends enable row level security;

create policy "Admins can manage profiles" on admin_profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage tags" on contact_tags
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage notes" on contact_notes
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage campaigns" on email_campaigns
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage sends" on email_sends
  for all
  using (public.is_admin())
  with check (public.is_admin());

do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'contact_submissions'
  ) then
    execute 'alter table public.contact_submissions enable row level security';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_policies where policyname = 'Admins can read contact submissions'
  ) then
    null;
  else
    execute 'create policy "Admins can read contact submissions" on public.contact_submissions for select using (public.is_admin())';
  end if;
end $$;
