# Batesford Pub Wi-Fi Admin

Admin web app for managing guest Wi-Fi submissions, tags, notes, and marketing campaigns.

## Stack
- Vite + React + TypeScript
- Tailwind CSS
- Supabase Auth + Postgres
- Netlify Functions for email sending

## Local development
1. Install dependencies
   npm install
2. Create a .env file
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_ADMIN_ALLOWLIST=admin@example.com,manager@example.com
3. Run the app
   npm run dev

## Docker captive portal
The production captive portal path should now run as a dedicated server app instead of the Netlify portal page.

### Files
- `portal-server/server.mjs`: Express captive portal server
- `portal-server/Dockerfile`: container build for the portal service
- `docker-compose.portal.yml`: Portainer stack file
- `.env.portal.example`: required environment variables

### Local portal development
1. Install dependencies
   npm install
2. Copy `.env.portal.example` to `.env.portal` and fill in the real secrets
3. Start the portal service
   npm run portal:dev
4. Open
   `http://localhost:3000/portal?site=xlgkkyrq&id=62:b7:88:d6:e1:6f&ap=f4:e2:c6:e3:94:c0&t=test-token&ssid=Steven%20Guest&url=http://captive.apple.com/hotspot-detect.html`

### Portainer stack deployment
Use Portainer `Create stack` with:
- `Repository URL`: your GitHub repo URL
- `Repository reference`: `refs/heads/main`
- `Compose path`: `docker-compose.portal.yml`

Set these stack environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WIFI_CONNECT_FUNCTION_URL`
- `PORTAL_DEFAULT_WEBSITE_URL`
- `PORTAL_BRAND_NAME`
- `PORTAL_SESSION_WINDOW_MINUTES`
- `PORTAL_SITE_MAP`
- `PROXY_NETWORK`

Example `PORTAL_SITE_MAP`:
```json
{"xlgkkyrq":{"label":"Madi House","brandName":"Steven Guest","heroTitle":"Guest Wi-Fi Connect","websiteUrl":"https://www.thebatesfordhotel.com.au/","continueUrl":"http://neverssl.com/"}}
```

Set `PROXY_NETWORK=proxy` when Nginx Proxy Manager is already attached to your shared Docker `proxy` network.

### Reverse proxy
Put Nginx in front of the container and point a stable hostname such as `batesfordguestwifi.gearedit.com.au` to the `wifi-portal` container on port `3000`.

Example config:
- `portal-server/nginx.portal.conf.example`

Recommended UniFi target:
- `https://batesfordguestwifi.gearedit.com.au/guest/s/xlgkkyrq/`

Fallback target if you prefer query-based routing:
- `https://batesfordguestwifi.gearedit.com.au/portal?site=xlgkkyrq`

### Required database change
Apply the migration:
- `supabase/migrations/20260518093000_portal_sessions.sql`

This creates `public.portal_sessions`, which is the backend source of truth for captive progress and recovery.

## Supabase setup
1. Run the migration in supabase/migrations to create admin tables and policies.
2. Create an admin profile for each staff member.

Example SQL:
insert into admin_profiles (user_id, full_name, role)
values ('<auth_user_id>', 'Staff Name', 'manager');

## Netlify setup
Set the following environment variables in Netlify:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_ADMIN_ALLOWLIST (optional, comma-separated emails)
- SUPABASE_SERVICE_ROLE_KEY
- EMAIL_PROVIDER (SMTP2GO or RESEND)
- SMTP2GO_API_KEY (if using SMTP2GO)
- RESEND_API_KEY (if using Resend)
- DEFAULT_FROM_EMAIL (recommend marketing@thebatesfordhotel.com.au)
- DEFAULT_FROM_NAME
- APP_BASE_URL

Deploy:
- Build command: npm run build
- Publish directory: dist
- Functions directory: netlify/functions

## Email sending
The function /.netlify/functions/sendCampaign sends email from a campaign.
- It verifies the Supabase JWT and checks the admin profile table.
- It resolves the segment, creates email_sends rows, then sends via SMTP2GO or Resend.

## Supabase Edge Functions
The send-campaign-email function (used for test/single sends) requires:
- RESEND_API_KEY
- RESEND_FROM (marketing@thebatesfordhotel.com.au)

## Merge tags
Use these in campaign HTML:
- {{first_name}}
- {{email}}
- {{venue_name}}

## Notes
- contact_submissions is read-only for admins.
- contact_tags and contact_notes are editable by admins.
- Use the Supabase SQL editor or a secure admin script to insert admin_profiles entries.
- Netlify SPA refresh: keep `public/_redirects` with `/* /index.html 200` or equivalent in `netlify.toml`.
- Supabase auth redirect URLs should include:
  - https://admin.batesfordpub.netlify.app
  - https://admin.batesfordpub.netlify.app/login
