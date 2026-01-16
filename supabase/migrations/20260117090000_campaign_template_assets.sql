alter table public.campaign_templates
  add column if not exists hero_image_path text,
  add column if not exists footer_image_path text,
  add column if not exists inline_images jsonb,
  add column if not exists updated_at timestamptz default now();

alter table public.campaigns
  add column if not exists hero_image_path text,
  add column if not exists footer_image_path text,
  add column if not exists inline_images jsonb,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'campaign_templates_set_updated_at') then
    create trigger campaign_templates_set_updated_at
    before update on public.campaign_templates
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'campaigns_set_updated_at') then
    create trigger campaigns_set_updated_at
    before update on public.campaigns
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('campaign-assets', 'campaign-assets', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can read campaign assets'
  ) then
    create policy "Public can read campaign assets"
      on storage.objects
      for select
      to public
      using (bucket_id = 'campaign-assets');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can manage campaign assets'
  ) then
    create policy "Admins can manage campaign assets"
      on storage.objects
      for all
      using (bucket_id = 'campaign-assets' and public.is_admin(auth.uid()))
      with check (bucket_id = 'campaign-assets' and public.is_admin(auth.uid()));
  end if;
end $$;
