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
- DEFAULT_FROM_EMAIL
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
