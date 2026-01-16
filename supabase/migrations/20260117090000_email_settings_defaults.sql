insert into public.app_settings (key, value)
values
  ('booking_link', 'https://www.thebatesfordhotel.com.au/'),
  ('venue_address', '700 Ballarat Road, Batesford VIC 3213'),
  ('website_link', 'https://www.thebatesfordhotel.com.au/')
on conflict (key) do nothing;
