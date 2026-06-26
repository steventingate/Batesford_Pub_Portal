# Guest Wi-Fi Network-First Runbook

This runbook is for proving whether captive portal delay is in the portal app or in UniFi/network captive release.

## Current Expected Flow

1. Device joins guest SSID.
2. UniFi opens `https://batesfordguestwifi.gearedit.com.au/guest/s/xlgkkyrq/`.
3. Guest submits details.
4. `portal-server` calls `wifi-connect`.
5. UniFi authorizes the client MAC.
6. `portal-server` redirects directly to `/guest/s/xlgkkyrq/release?session_key=...`.
7. `/release` redirects to the original OS probe URL, for example `http://captive.apple.com/hotspot-detect.html`.
8. iOS/Android should mark Wi-Fi connected and close or tick the captive window.

If steps 1-7 complete quickly but step 8 is slow, fix UniFi/firewall/DNS behavior, not the portal UI.

## Required Production Settings

- UniFi external portal URL/domain: `https://batesfordguestwifi.gearedit.com.au/guest/s/xlgkkyrq/`
- External Portal Server: use the static public IP address of the portal reverse proxy.
- Domain / Secure Portal: `batesfordguestwifi.gearedit.com.au`
- HTTPS Redirection Support: enabled.
- Secure Portal: enabled.
- Encrypted URL: disabled unless UniFi encrypted URL support has been deliberately implemented.
- Pre-auth walled garden:
  - Static portal server IP address.
  - `batesfordguestwifi.gearedit.com.au`
- Post-auth restrictions if guests should not reach LAN/private networks:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
- Do not use Netlify as the production captive URL.
- Do not pre-auth allow Apple, Google, Microsoft captive probe hosts, Supabase, or the venue website.
- Disable HTTPS interception or HTTPS redirect before authorization.
- Confirm post-auth clients can immediately resolve and access:
  - `http://captive.apple.com/hotspot-detect.html`
  - `http://connectivitycheck.gstatic.com/generate_204`
  - `http://clients3.google.com/generate_204`
  - `http://www.msftconnecttest.com/connecttest.txt`

## Supabase / UniFi API Settings

Prefer UniFi External Hotspot API v1 when the controller supports it:

```text
UNIFI_AUTH_MODE=v1
UNIFI_V1_API_KEY=<controller api key>
UNIFI_V1_SITE_ID=xlgkkyrq
UNIFI_BASE_URL=https://<controller>:8443
```

`UNIFI_AUTH_MODE=auto` will now prefer v1 whenever `UNIFI_V1_API_KEY` is present.

Keep legacy username/password auth configured only as rollback. Legacy auth must keep passing `ap_mac`.

## Test Matrix

Run each test after clearing the guest authorization for that device MAC.

| Device | Browser/CNA | Expected |
| --- | --- | --- |
| iPhone | iOS Captive Wi-Fi assistant | Blue tick under 8s typical, 15s worst-case |
| Android | Android captive assistant | Captive page closes or marks connected without cert prompt |
| Mac | macOS captive assistant | Connected without manual reconnect |
| Windows | NCSI browser/check | Internet available after submit |

## Per-Test Procedure

1. Forget the guest SSID on the test device.
2. Confirm private/random MAC state and record the MAC shown in UniFi.
3. Clear guest authorization in UniFi.
4. Join guest SSID.
5. Submit the portal form once.
6. Record stopwatch times:
   - submit clicked
   - UniFi shows API authorized
   - captive assistant blue tick / closes
7. If iOS stalls after submit, open `http://captive.apple.com/hotspot-detect.html` inside the captive window.
8. Record whether it shows Apple success, redirects to portal, loops, or errors.
9. Check `/admin/traces` and the SQL diagnostic query.

## Reading Results

Good portal/app path:

```text
portal_submit
unifi_authorized
post_auth_redirect_issued
release_route_received
probe_release_redirect
```

If `probe_release_redirect` is under 4 seconds but the blue tick takes 30-45 seconds:

- The portal did its job.
- Check AP/controller propagation, guest VLAN firewall, DNS filtering, HTTPS interception, and captive probe passthrough.

If `probe_release_redirect` is missing:

- Check that UniFi passed a valid `url` parameter.
- Check the portal route is direct to `batesfordguestwifi.gearedit.com.au`, not Netlify or stale `/connect`.

If `unifi_authorized` is slow:

- Check `UNIFI_AUTH_MODE`.
- Prefer v1 API if available.
- Check Cloudflare Tunnel/controller API latency.

## Spotipo Trial Benchmark

Use Spotipo as a same-network benchmark, not as the first replacement.

The relevant Spotipo pattern to mirror is:

- External Portal Server uses a static IP address.
- Authorization Access allows both the portal server IP and the secure portal domain before auth.
- HTTPS Redirection Support, Domain, and Secure Portal are enabled.
- Post-Authorization Restrictions block private networks.

1. Configure Spotipo on the same UniFi controller, AP, VLAN, and equivalent SSID settings.
2. Run the same device matrix.
3. Compare stopwatch times and UniFi authorization state.
4. If Spotipo is instant on the same network:
   - Capture UniFi hotspot settings, walled garden entries, auth method, and post-auth redirects.
   - Mirror the operational differences in our portal setup.
5. If Spotipo is also slow:
   - The issue is UniFi/network dataplane or client captive probe behavior.

## SQL Diagnostics

Run:

```text
supabase/sql/captive_release_network_diagnostics.sql
```

Key diagnosis values:

- `release_path_ok`: portal release looks healthy.
- `portal_released_fast_check_network_or_ios`: backend released quickly but no close/tick event was recorded.
- `post_probe_release_slow`: probe release happened but captive page stayed open too long.
- `no_probe_release_recorded`: app did not release to an OS probe URL.

## References

- Apple captive network guidance: https://developer.apple.com/news/?id=q78sq5rv
- UniFi External Hotspot API v1: https://help.ui.com/hc/en-us/articles/31228198640023-External-Hotspot-API-for-Authorization-Clients
- Spotipo UniFi external portal model: https://www.spotipo.com/integration/unifi-external-captive-portal
- Spotipo UniFi captive portal guide: https://www.spotipo.com/post/unifi-hotspot-captive-portal-how-to-part1
- StayFi UniFi guide: https://stayfi.com/guides/ubiquiti/
