create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  url text not null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.brand_assets enable row level security;

create or replace function public.set_brand_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_brand_assets_updated_at') then
    create trigger set_brand_assets_updated_at
    before update on public.brand_assets
    for each row
    execute function public.set_brand_assets_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'brand_assets'
      and policyname = 'Admins can manage brand assets'
  ) then
    create policy "Admins can manage brand assets"
      on public.brand_assets
      for all
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can manage brand assets bucket'
  ) then
    create policy "Admins can manage brand assets bucket"
      on storage.objects
      for all
      using (bucket_id = 'brand-assets' and public.is_admin(auth.uid()))
      with check (bucket_id = 'brand-assets' and public.is_admin(auth.uid()));
  end if;
end $$;
