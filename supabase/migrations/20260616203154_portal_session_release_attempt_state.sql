alter table public.portal_sessions
  add column if not exists release_attempted_at timestamptz,
  add column if not exists release_result text,
  add column if not exists release_attempt_count integer not null default 0;

create index if not exists portal_sessions_release_attempted_idx
  on public.portal_sessions (release_attempted_at desc);

create index if not exists portal_sessions_release_result_idx
  on public.portal_sessions (release_result, updated_at desc);
