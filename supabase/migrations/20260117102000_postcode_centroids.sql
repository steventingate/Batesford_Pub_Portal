create table if not exists public.postcode_centroids (
  postcode text primary key,
  suburb text,
  state text,
  lat double precision not null,
  lon double precision not null
);

alter table public.postcode_centroids enable row level security;

drop policy if exists postcode_centroids_select on public.postcode_centroids;
create policy postcode_centroids_select on public.postcode_centroids
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists postcode_centroids_write on public.postcode_centroids;
create policy postcode_centroids_write on public.postcode_centroids
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace view public.guest_postcode_counts as
select
  postcode,
  count(*)::int as guests
from public.guests
where postcode is not null and btrim(postcode) <> ''
group by postcode;

create or replace view public.guest_postcode_centroid_counts as
select
  pc.postcode,
  pc.lat,
  pc.lon,
  count(g.id)::int as guests
from public.guests g
join public.postcode_centroids pc on pc.postcode = g.postcode
where g.postcode is not null and btrim(g.postcode) <> ''
group by pc.postcode, pc.lat, pc.lon;

grant select on public.guest_postcode_counts to authenticated;
grant select on public.guest_postcode_centroid_counts to authenticated;
