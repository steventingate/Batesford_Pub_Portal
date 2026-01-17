insert into public.app_settings (key, value)
values
  ('facebook_link', 'https://www.facebook.com/'),
  ('instagram_link', 'https://www.instagram.com/'),
  ('tiktok_link', 'https://www.tiktok.com/'),
  ('x_link', 'https://x.com/'),
  ('linkedin_link', 'https://www.linkedin.com/')
on conflict (key) do nothing;
