-- One-off cleanup for historical portal-session guest artifacts.
-- These are MAC-only sessions that never captured an email/phone and only
-- surface as placeholder "Guest" rows in admin-facing guest reports.

-- Preview the rows first.
select
  id,
  session_key,
  site_slug,
  client_mac,
  status,
  guest_name,
  guest_email,
  guest_phone,
  submitted_at,
  authorized_at,
  completed_at,
  updated_at
from public.portal_sessions
where coalesce(nullif(trim(guest_email), ''), nullif(trim(guest_phone), '')) is null
  and coalesce(nullif(trim(guest_name), ''), 'Guest') = 'Guest'
  and status in ('presented', 'submitting', 'completed')
  and updated_at < now() - interval '1 hour'
order by updated_at desc;

-- Delete the same rows once the preview looks correct.
with deleted as (
  delete from public.portal_sessions
  where coalesce(nullif(trim(guest_email), ''), nullif(trim(guest_phone), '')) is null
    and coalesce(nullif(trim(guest_name), ''), 'Guest') = 'Guest'
    and status in ('presented', 'submitting', 'completed')
    and updated_at < now() - interval '1 hour'
  returning id, session_key, site_slug, client_mac, status, updated_at
)
select count(*) as deleted_rows
from deleted;
