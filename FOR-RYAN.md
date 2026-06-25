# Curb Crew: handoff for Ryan

Everything you need to access and work on the Curb Crew site, the deploy pipeline, and the backend.

## The links

- **Live site:** https://curbcrews.com
- **Signup page (QR lands here):** https://curbcrews.com/join.html
- **Bulk pickup quote:** https://curbcrews.com/bulk.html
- **Customer portal (demo):** https://curbcrews.com/portal.html
- **GitHub repo:** https://github.com/BrandonVetB/curb-crew
- **Clone URL:** https://github.com/BrandonVetB/curb-crew.git
- **Branch that deploys:** `main`

## How the pieces fit together

- **Frontend:** plain static HTML/CSS/JS with GSAP. No build step.
- **Hosting:** Vercel, project `curb-crew`. It auto-deploys on every push to `main` on GitHub. No manual deploy.
- **Backend:** Supabase project `curb-crew` (Postgres + Auth + REST API). Captures signups, bulk requests, and holds the schema for the portal.

## Getting access (Brandon does these once)

- **GitHub:** repo > Settings > Collaborators > add Ryan's GitHub username/email. Ryan accepts the email invite, then he can push to `main`.
- **Vercel:** vercel.com > the `curb-crew` project (or team) > Settings > Members > invite Ryan. He'll see deployments and logs. (Hobby projects may require moving to a team to add members.)
- **Supabase:** supabase.com > the `curb-crew` project > Settings > Team / Members (or org > Members) > invite Ryan. That is also where he gets the secret keys; never paste those in chat or commit them.

## Run it locally

```bash
git clone https://github.com/BrandonVetB/curb-crew.git
cd curb-crew
npx serve .        # or: python3 -m http.server
```
Open the served URL. No keys needed to run the frontend.

## Deploy

Push to `main`, Vercel rebuilds and the live URL updates in under a minute.
```bash
git add .
git commit -m "your change"
git push origin main
```
For bigger changes, branch and open a pull request instead of pushing straight to `main`.

## File map

- `index.html` / `styles.css` / `main.js` — the marketing homepage (hero isometric scene, pricing, FAQ, etc.)
- `join.html` / `join.css` / `join.js` — QR signup landing page
- `bulk.html` / `bulk.css` / `bulk.js` — bulk/junk pickup quote tool + city schedule lookup
- `portal.html` / `portal.css` / `portal.js` — customer portal (currently a DEMO with sample data)
- `curb-crew-logo.png` — header/footer logo
- `curb-crew-bin.png` — the bin used in the hero animation and How-it-works
- `curb-crew-favicon.png` — browser tab icon
- `curb-crew-qr.png` — the QR code (points to join.html)
- `README.md` — quick project notes

## Supabase backend

- **Project ref:** `hezahtnfyhqfucixzqxi`
- **API URL:** https://hezahtnfyhqfucixzqxi.supabase.co
- **Publishable (anon) key** (safe, already in the frontend JS, protected by row-level security):
  `sb_publishable_9l4_Bqgjg7qBapvYlLPJSA_pHOk0nMB`
- **Secret keys (service role, DB password):** NOT in this doc on purpose. Get them from the Supabase dashboard after you're added as a member.

Tables (all have row-level security on):
- `leads` — homepage ZIP captures and join-page signups (anon insert only)
- `bulk_requests` — bulk/junk quote requests
- `city_bulk_schedules` — city bulk/brush/yard-waste calendar (public read; Austin seeded as a sample)
- `profiles`, `service_addresses`, `subscriptions`, `pickups`, `service_events`, `invoices` — schema for the real portal/auth/billing (Stripe-ready fields exist; nothing connected yet)

## What's real vs not (so you don't get surprised)

- **Real and live:** homepage signup capture, join-page signup capture, bulk quote + request capture, city schedule lookup. All write to Supabase.
- **Demo only:** the customer portal shows hardcoded sample data and a fake login. Wiring it to Supabase Auth and real data is the next backend task.
- **Not connected:** Stripe (schema is ready, no keys). Email/SMS alerts (planned via Supabase Edge Function + Resend/Twilio).
- **Invented:** the stats on the homepage (homes served, etc.) are placeholders. The "we serve everyone" coverage check is not real yet.

## Customize quickly

- **Colors:** top of `styles.css`, `:root` (`--black`, `--white`, `--blue`).
- **Pricing / add-ons:** `#pricing` in `index.html`, and the plan logic in `join.js`.
- **Bulk prices:** per-item `data-unit` values (in cents) in `bulk.html`, plus `TRIP_FEE` in `bulk.js`.
- **City schedules:** rows in the Supabase `city_bulk_schedules` table.
