insert into storage.buckets (id, name, public)
values ('campaign-images', 'campaign-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists campaign_images_read on storage.objects;
create policy campaign_images_read on storage.objects
for select to authenticated
using (bucket_id = 'campaign-images');

drop policy if exists campaign_images_insert on storage.objects;
create policy campaign_images_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'campaign-images' and public.is_admin(auth.uid()));

drop policy if exists campaign_images_update on storage.objects;
create policy campaign_images_update on storage.objects
for update to authenticated
using (bucket_id = 'campaign-images' and public.is_admin(auth.uid()));

drop policy if exists campaign_images_delete on storage.objects;
create policy campaign_images_delete on storage.objects
for delete to authenticated
using (bucket_id = 'campaign-images' and public.is_admin(auth.uid()));
