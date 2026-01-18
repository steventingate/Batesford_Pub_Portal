insert into public.app_settings (key, value)
values
  ('facebook_enabled', 'true'),
  ('instagram_enabled', 'true'),
  ('tiktok_enabled', 'true'),
  ('x_enabled', 'true'),
  ('linkedin_enabled', 'true')
on conflict (key) do nothing;
