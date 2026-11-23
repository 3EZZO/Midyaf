# MIDYAF Event-Day Production Runbook ($0 Stack)

**Plan:** `PLAN_READY_1` (Sprint 4 — Event-Day Hardening & Dress Rehearsal)  
**Target Capacity:** 50–300 guests (~50–150 concurrent active users on Render Free; upgrade single web service to Render Starter `$7/mo` for 500+ concurrent summits).

---

## 1. Live vs. Demo Environment Separation ($0)

Never run real VIP guests on a database or service with demo switchers enabled.

1. **Neon Free clean branch for live event data:**
   - In Neon Console → **Branches** → create a fresh branch (e.g., `live-event-<slug>`) or clean database, keeping the investor demo database completely separate.
   - Apply the Prisma schema cleanly before event setup (`npx prisma db push` ONLY on the brand-new empty live branch; never push blindly onto a populated production DB).
   - Provision real Super Admin, Logistics Manager, Organizer, Coordinator, and Captain accounts with unique 16+ character passwords (never reuse demo credentials).
2. **Render environment settings for the live service:**
   - Set `DEMO_MODE_ENABLED=false` (hides one-click investor demo switcher and `/api/demo/*` returns `404`).
   - Confirm `NODE_ENV=production`.
   - Confirm `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are distinct 64-byte random hex secrets.
   - Confirm `CLIENT_ORIGIN=https://midyaf.onrender.com` (or your custom live domain).
   - Verify **ClientDashboard** displays real org/event timeline updates and persisted `MessagesCenter` with zero demo banners.

---

## 2. Zero-Sleep Keep-Alive (`event mode` / `event done`)

Midyaf includes `.github/workflows/event-keepalive.yml` (PR #14), which pings `/health` every 5 minutes on Render Free **only** while `EVENT_MODE=on`. No external UptimeRobot account is required.

- **Turn ON (24h before doors open):**
  ```powershell
  gh variable set EVENT_MODE --body on -R 3EZZO/Midyaf
  gh workflow enable event-keepalive.yml -R 3EZZO/Midyaf
  gh workflow run event-keepalive.yml -R 3EZZO/Midyaf
  ```
- **Turn OFF (after final guest departure):**
  ```powershell
  gh variable set EVENT_MODE --body off -R 3EZZO/Midyaf
  gh workflow disable event-keepalive.yml -R 3EZZO/Midyaf
  ```
- **Quick health check:** `curl -fsS https://midyaf.onrender.com/api/health` → must return HTTP `200` with database connected.

---

## 3. Pre-Event & Daily Database Backups (`pg_dump`)

In addition to Neon Free's 24-hour point-in-time history, take a local encrypted-storage backup before the event and once daily during event week using `scripts/ops/backup-db.mjs`:

```powershell
# Dry-run first (verifies pg_dump, safe non-OneDrive destination, and masks secrets):
node scripts/ops/backup-db.mjs --dry-run

# Real snapshot (writes outside the repo and outside OneDrive sync):
$env:BACKUP_DATABASE_URL = "<neon-direct-postgres-url>"
node scripts/ops/backup-db.mjs --label pre-event
```

**Safety guarantees built into `backup-db.mjs`:**
- Refuses to write inside the Git repository or inside any OneDrive-synced folder (prevents accidental secret/PII sync or commits).
- Never prints `DATABASE_URL` or credentials to stdout/stderr; the password reaches `pg_dump` only through its environment (`PGPASSWORD`), never the process list.
- Accepts the Prisma-style URL as-is: `schema=midyaf` becomes `--schema=midyaf`, Prisma-only params are dropped, and a Neon `-pooler` host is switched to the direct endpoint (pg_dump must not run through PgBouncer).
- Writes a compressed custom-format dump (restore with `pg_restore`) and a `.sha256` integrity checksum.

---

## 4. Optional Crash & Error Alerting (Sentry Free — 5K errors/month)

1. Create a free project at `https://sentry.io` (Node.js + React) or monitor Render Logs directly during event hours.
2. Watch for any HTTP `5xx`, unhandled promise rejections, or repeated `429` login lockouts (ops can unblock any locked user in 5 seconds via **Admin → Account Access Recovery → Reset link → Send via WhatsApp**).

---

## 5. 30-Minute Real-Phone Dress Rehearsal (5 Phones on 4G/5G)

Run 24–48 hours before the live event using **real mobile data (4G/5G)** — not office Wi-Fi:

| # | Device / Role | Verification Steps | Pass Criteria |
|---|---|---|---|
| 1 | **Ops / Super Admin** (Desktop or Tablet) | Open Admin Dashboard, check live Open-Meteo Riyadh weather on Radar, verify `DEMO_MODE_ENABLED=false`, issue a 15-min password reset link (`/#resetToken=...`) for a test account & confirm single-use redemption. | Live Riyadh temp/wind shown; reset link works once and rejects replay; zero demo widgets. |
| 2 | **Client Executive** (Phone 1) | Sign in as Client, approve a draft plan in 1 click, check Live Event Timeline (`/events/:id/updates`), send a persisted message in Logistics Chat. | Zero `DEFAULT_*` demo data; timeline shows real approval event; message persists on reload. |
| 3 | **Captain A** (Phone 2, Android/iOS PWA) | Install PWA to Home Screen (verify v2 Open-Door M icon), share GPS position, advance trip status (`ASSIGNED → EN_ROUTE → ARRIVED → PICKED_UP → COMPLETED`), lock screen for 2 min and reopen. | Sticky action bar unobstructed above mobile dock; GPS updates on Ops Radar; Socket.IO reconnects cleanly. |
| 4 | **Captain B** (Phone 3, Outdoor Sunlight) | Verify high-contrast status buttons outdoors, tap **WhatsApp** handoff link from Coordinator dispatch. | Readable in sunlight; `wa.me` opens with pre-filled Arabic/English dispatch details. |
| 5 | **VIP Guest** (Phone 4, iOS/Android) | Open Guest Journey, view 3-card itinerary, trigger Bright QR curbside pass, tap **WhatsApp Captain** button. | Bright QR scans cleanly; `wa.me` pre-fills gate & arrival status; zero console/5xx errors. |

---

## 6. Event-Day Emergency Playbook

- **Locked-out Captain / VIP / Supplier:** Super Admin → **Account Access Recovery** → search user → **Reset link (15m)** → **Send via WhatsApp**. Link uses `/#resetToken=...` (never logged on server) and clears login rate-limit on completion.
- **Open-Meteo weather outage:** Server negative-caches failures for 60s and displays `Weather: unavailable` without stalling radar polling.
- **Traffic spike (>150 concurrent users):** Upgrade the single Render web service to Starter (`$7/mo`) from Render Dashboard → Instance Type (zero code change, ~60s zero-downtime rollover).
