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

## Docker captive portal and self-hosted admin
The production deployment can now run both:
- the captive portal routes, and
- the `/admin` React app

from the same `portal-server` container.

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
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UNIFI_AUTH_BACKEND` (`auto` recommended; direct auth is used when the UniFi URL, username, and password are present)
- `UNIFI_BASE_URL` (example: `https://unifi.gearedit.com.au:8443`)
- `UNIFI_USERNAME`
- `UNIFI_PASSWORD`
- `UNIFI_SITE_NAME` (`xlgkkyrq` for the Batesford/Hotel hosted-controller site; omit for route-driven site selection)
- `UNIFI_ALLOW_INVALID_TLS` (`true` only when the UniFi controller uses a self-signed/invalid cert)
- `WIFI_CONNECT_FUNCTION_URL` (rollback only when `UNIFI_AUTH_BACKEND=edge`)
- `PORTAL_DEFAULT_WEBSITE_URL`
- `PORTAL_BRAND_NAME`
- `PORTAL_SESSION_WINDOW_MINUTES`
- `PORTAL_SITE_MAP`
- `PROXY_NETWORK`

Example `PORTAL_SITE_MAP`:
```json
{"xlgkkyrq":{"label":"Madi House","brandName":"Steven Guest","heroTitle":"Guest Wi-Fi Connect","websiteUrl":"https://www.thebatesfordhotel.com.au/"}}
```

Set `PROXY_NETWORK=proxy` when Nginx Proxy Manager is already attached to your shared Docker `proxy` network.

Important:
- `SUPABASE_URL` and `VITE_SUPABASE_URL` should normally be the same value.
- `VITE_SUPABASE_ANON_KEY` is required at build time so the admin SPA can be bundled into the container.
- After changing any `VITE_*` value in Portainer, redeploy with a rebuild, not just restart.

### Reverse proxy
Put Nginx Proxy Manager or Cloudflare Tunnel in front of the container and point `batesfordguestwifi.gearedit.com.au` to the `wifi-portal` container on port `3000`.

Example config:
- `portal-server/nginx.portal.conf.example`

Recommended UniFi target:
- `https://batesfordguestwifi.gearedit.com.au/guest/s/xlgkkyrq/`

Fallback target if you prefer query-based routing:
- `https://batesfordguestwifi.gearedit.com.au/portal?site=xlgkkyrq`

Recommended Nginx Proxy Manager setup:
- `batesfordguestwifi.gearedit.com.au`
  - HTTPS enabled
  - Force SSL enabled

Recommended Nginx Proxy Manager proxy host values:
- Domain Names: `batesfordguestwifi.gearedit.com.au`
- Scheme: `http`
- Forward Hostname / IP: `wifi-portal`
- Forward Port: `3000`
- Cache Assets: off
- Block Common Exploits: on
- Websockets Support: on

With the current server build, no custom rewrite rules are required for `/admin`. The Express app now serves:
- `/admin`
- `/admin/*`
- `/assets/*`

directly from the same container.

### Cloudflare Tunnel and certificates
If Cloudflare Tunnel fronts the site, point the public hostname to Nginx Proxy Manager, not directly to `wifi-portal`.

Recommended flow:
- Public hostname: `batesfordguestwifi.gearedit.com.au`
- Cloudflare Tunnel origin target: `http://<npm-host-or-container>:80`
- Nginx Proxy Manager upstream target: `http://wifi-portal:3000`

If you still want a certificate inside Nginx Proxy Manager:
- use a Cloudflare DNS challenge certificate in NPM, or
- use a Cloudflare Origin Certificate in NPM

The tunnel itself does not remove the need for correct app routing, but it does mean `/admin` can stay on the same hostname as the guest portal.

The portal no longer needs `release.batesfordguestwifi.gearedit.com.au`. After UniFi authorization, the server performs one internal `/release` hop and then sends a `303` redirect to the original OS captive probe URL from UniFi's `url` parameter.

Do not use the Netlify `/connect.html` or `/guest/*` static path as the production captive portal. Netlify is optional once the self-hosted `/admin` build is enabled in `portal-server`.

Successful submissions should not stop on the `/progress` spinner page. After verified UniFi auth, `portal-server` redirects straight to `/guest/s/<site>/release`, which redirects to the original OS probe URL. If UniFi did not provide a safe probe URL, the portal infers one from the captive browser user-agent for iOS/macOS, Android, or Windows before falling back to the manual connected page.

### UniFi guest network settings
Use this external portal URL/domain:

`https://batesfordguestwifi.gearedit.com.au/guest/s/xlgkkyrq/`

Mirror the vendor-style UniFi settings shown by Spotipo:
- External Portal Server: the static public IP address of the portal reverse proxy, not a Cloudflare Tunnel-only hostname.
- Domain / Secure Portal: `batesfordguestwifi.gearedit.com.au`
- HTTPS Redirection Support: enabled.
- Secure Portal: enabled.
- Encrypted URL: leave disabled unless you have deliberately implemented UniFi encrypted URL support.

Pre-authorization allowances:
- Static portal server IP address.
- `batesfordguestwifi.gearedit.com.au`

Post-authorization restrictions:
- Add RFC1918/private networks if guests should not reach LAN infrastructure:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`

Do not pre-auth allow Supabase from the client. The portal server calls Supabase and UniFi server-side.

In direct auth mode, Supabase is not in the critical UniFi authorization path. The portal server:
- writes the portal session/guest details to Supabase,
- logs trace events to Supabase best-effort,
- logs into the UniFi controller directly,
- authorizes the client using `/api/s/<site>/cmd/stamgr`,
- verifies authorization, then releases the OS captive probe.

For self-hosted controllers with default UniFi certificates, set `UNIFI_ALLOW_INVALID_TLS=true` on the portal server. This intentionally allows the portal server to talk to `https://<controller>:8443` even when the certificate is self-signed or hostname-mismatched. Do not expose this setting to client-side code.

If the container starts with `auth_backend=edge`, Portainer is missing one of the direct UniFi variables. Add `UNIFI_BASE_URL`, `UNIFI_USERNAME`, and `UNIFI_PASSWORD` to the stack environment and redeploy.

If logs show `direct_unifi_authorize_response ... authorized=true` in under a few seconds, but iOS keeps loading the portal for 30-60 seconds, the portal has already authorized the client. At that point the delay is UniFi/AP captive release propagation or post-auth probe handling. The portal will keep retrying the original or inferred OS probe URL automatically; default retries are `PORTAL_MAX_AUTO_RELEASE_ATTEMPTS=20` every `PORTAL_RELEASE_RETRY_DELAY_MS=3000`.

For a single session summary, open `/debug/session/<session_key>`. It returns auth timing, selected probe URL, probe source, release attempts, and release result.

Disable any UniFi setting that redirects or intercepts HTTPS before authorization. HTTPS interception is what produces the certificate warnings on iOS and Android.

Do not pre-auth allow Apple, Google, Microsoft captive probe hosts, or the venue website. They should be blocked before auth and immediately reachable after UniFi marks the guest authorized. If iOS still takes 30-45 seconds after traces show `probe_release_redirect`, check post-auth DNS/firewall/content-filtering for `captive.apple.com` and the Google/Microsoft probe hosts.

Use `GUEST_WIFI_NETWORK_FIRST_RUNBOOK.md` for onsite validation and run `supabase/sql/captive_release_network_diagnostics.sql` after tests to separate portal timing from UniFi/network captive release delay.

For this deployment, prefer `portal-server` direct auth over Supabase Edge auth. Hosted Supabase Edge cannot proceed through an invalid UniFi TLS certificate, but the portal server can be configured to allow that only for the UniFi controller path. Legacy auth must continue passing the AP MAC (`ap_mac`) when used.

### Required database change
Apply these migrations:
- `supabase/migrations/20260518093000_portal_sessions.sql`
- `supabase/migrations/20260616203154_portal_session_release_attempt_state.sql`

These create and extend `public.portal_sessions`, which is the backend source of truth for captive progress, one-shot OS probe release, and recovery.

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
  - https://batesfordguestwifi.gearedit.com.au/admin
  - https://batesfordguestwifi.gearedit.com.au/admin/login
