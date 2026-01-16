alter table public.campaign_runs
  add column if not exists run_type text not null default 'bulk';

alter table public.campaign_recipients
  add column if not exists recipient_type text not null default 'guest',
  add column if not exists recipient_name text;
