# Batesford Single-Host Setup

This deployment serves both:
- the guest Wi-Fi portal, and
- the admin console at `/admin`

from the same Portainer stack and the same domain.

## 1. Portainer stack env vars

Set these values in the Portainer stack before deploy:

```env
SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
UNIFI_AUTH_BACKEND=auto
UNIFI_BASE_URL=https://unifi.example.com:8443
UNIFI_USERNAME=admin
UNIFI_PASSWORD=your-unifi-password
UNIFI_SITE_NAME=xlgkkyrq
UNIFI_ALLOW_INVALID_TLS=true
WIFI_CONNECT_FUNCTION_URL=https://your-project.supabase.co/functions/v1/wifi-connect
PORTAL_DEFAULT_WEBSITE_URL=https://www.thebatesfordhotel.com.au/
PORTAL_BRAND_NAME=Batesford Guest Wi-Fi
PORTAL_SESSION_WINDOW_MINUTES=20
PORTAL_MAX_AUTO_RELEASE_ATTEMPTS=20
PORTAL_RELEASE_RETRY_DELAY_MS=3000
PORTAL_SITE_MAP={"xlgkkyrq":{"label":"Madi House","brandName":"Steven Guest","heroTitle":"Guest Wi-Fi Connect","websiteUrl":"https://www.thebatesfordhotel.com.au/"}}
PROXY_NETWORK=proxy
```

Notes:
- `VITE_SUPABASE_URL` should match `SUPABASE_URL`.
- `VITE_SUPABASE_ANON_KEY` is required because the admin app is built into the Docker image.
- After changing `VITE_*` variables, redeploy with rebuild.

## 2. Nginx Proxy Manager

Create a Proxy Host with:

- Domain Names: `batesfordguestwifi.gearedit.com.au`
- Scheme: `http`
- Forward Hostname / IP: `wifi-portal`
- Forward Port: `3000`
- Cache Assets: `Off`
- Block Common Exploits: `On`
- Websockets Support: `On`

No custom rewrite is needed for `/admin`. The app container now serves:

- `/guest/...`
- `/portal`
- `/admin`
- `/admin/*`
- `/assets/*`

## 3. SSL in NPM

If using Cloudflare-managed DNS:

Option A:
- NPM SSL tab
- Request a new SSL certificate
- Use DNS Challenge
- Provider: Cloudflare

Option B:
- Generate a Cloudflare Origin Certificate
- Import it into NPM as a custom certificate

Recommended NPM SSL toggles:
- Force SSL: `On`
- HTTP/2 Support: `On`
- HSTS: optional

## 4. Cloudflare Tunnel

Point the Cloudflare Tunnel public hostname to NPM, not directly to the app container.

Recommended target:

```text
http://<npm-hostname-or-ip>:80
```

Flow:

```text
Cloudflare hostname
-> Cloudflare Tunnel
-> Nginx Proxy Manager
-> wifi-portal:3000
```

## 5. Supabase auth redirects

Add these to Supabase Auth redirect URLs:

- `https://batesfordguestwifi.gearedit.com.au/admin`
- `https://batesfordguestwifi.gearedit.com.au/admin/login`

## 6. Expected results

After deploy:

- `https://batesfordguestwifi.gearedit.com.au/portal?site=xlgkkyrq` should open the guest portal
- `https://batesfordguestwifi.gearedit.com.au/admin` should open the admin SPA
- refreshing deep admin routes such as `/admin/contacts` should work
