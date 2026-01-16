create table if not exists public.campaign_template_defaults (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  subject text not null,
  body_html text not null,
  body_text text not null,
  hero_image_path text,
  footer_image_path text,
  inline_images jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists campaign_template_defaults_name_key
  on public.campaign_template_defaults (name);

alter table public.campaign_template_defaults enable row level security;

drop policy if exists campaign_template_defaults_select on public.campaign_template_defaults;
create policy campaign_template_defaults_select on public.campaign_template_defaults
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists campaign_template_defaults_insert on public.campaign_template_defaults;
create policy campaign_template_defaults_insert on public.campaign_template_defaults
for insert to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists campaign_template_defaults_update on public.campaign_template_defaults;
create policy campaign_template_defaults_update on public.campaign_template_defaults
for update to authenticated
using (public.is_admin(auth.uid()));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'campaign_template_defaults_set_updated_at') then
    create trigger campaign_template_defaults_set_updated_at
    before update on public.campaign_template_defaults
    for each row
    execute function public.set_updated_at();
  end if;
end $$;
