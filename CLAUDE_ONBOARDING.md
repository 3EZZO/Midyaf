# Midyaf (مضياف) — Full Project Onboarding for Claude

You are working on **Midyaf** (مضياف) — a logistics/hospitality-operations executive platform used by owners, organization admins, field coordinators, and drivers to monitor contracts, payments, commission rates, and live field activity for sovereign VIP events in Riyadh, Saudi Arabia.

The repo is at: `https://github.com/3EZZO/midyaf.git`
The development environment is **Windows** (PowerShell).
The project is deployed on **Render** (render.yaml in the root).

---

## 1. TECH STACK

| Layer | Tech |
|---|---|
| **Runtime** | Node.js (v24+), ESM (`"type": "module"` in package.json) |
| **Language** | TypeScript (strict mode, `ES2022` target) |
| **Frontend** | React 19 + Vite 6 + Tailwind CSS 3.4 (no Next.js, no router — single-page portal switching) |
| **Fonts** | Self-hosted via `@fontsource` — IBM Plex Sans Arabic (Arabic UI) + Inter Variable (Latin). Imported in `client/src/main.tsx`; no Google Fonts. |
| **Theme** | **Dark-only.** `<html data-theme="dark">` is permanent; Tailwind `darkMode` is keyed to that selector. There is no light mode and no theme toggle. |
| **Language** | **Arabic default.** Persisted in `localStorage["midyaf.lang"]`; `<html lang/dir>` is set by an inline boot script in `client/index.html` and by i18n's `languageChanged` listener. |
| **Backend** | Express.js + Socket.IO (real-time events) |
| **Database** | PostgreSQL via Prisma ORM |
| **Auth** | JWT (access + refresh tokens, bcryptjs) |
| **i18n** | react-i18next (Arabic-first, bilingual AR/EN) |
| **Maps** | Leaflet (NOT Google Maps) — used in `RiyadhMap.tsx` |
| **Icons** | Lucide React (every icon in the app is from lucide-react) |
| **AI** | OpenAI API (GPT-4o) for logistics planning |
| **PDF** | PDFKit (server-side PDF generation) |
| **Styling** | Tailwind CSS + custom CSS variables in `client/src/styles/index.css` |
| **PWA** | vite-plugin-pwa |
| **Testing** | Vitest |

### Key Commands
```bash
npm run dev          # Start both server (tsx watch) and client (vite) concurrently
npm run check        # TypeScript type-check (server + client) — RUN THIS BEFORE COMMITTING
npm run build        # Production build (prisma generate → tsc → vite build)
npm run db:seed      # Seed the database with demo data
npm run db:push      # Push Prisma schema to database
npm run db:migrate   # Run Prisma migrations
npm run test         # Run Vitest tests
```

---

## 2. PROJECT STRUCTURE

```
MIDYAF/
├── client/                        # Frontend (Vite + React)
│   ├── src/
│   │   ├── App.tsx                # THE MAIN FILE (~1800 lines). Contains:
│   │   │                          #   - Login form
│   │   │                          #   - ShellFrame (sidebar, header, portal tabs)
│   │   │                          #   - Portal routing logic (not react-router — manual state)
│   │   │                          #   - portalsByRole mapping
│   │   │                          #   - Socket.IO connection
│   │   ├── components/
│   │   │   ├── AdminExecutiveDashboard.tsx   # Owner/Admin dashboard (KPIs, audit trail, complaints)
│   │   │   ├── SilaOperationsDashboard.tsx   # Unified Logistics+Events ops dashboard
│   │   │   ├── ClientDashboard.tsx           # Client-facing portal
│   │   │   ├── AiPanel.tsx                   # AI chat assistant panel
│   │   │   ├── RiyadhMap.tsx                 # Leaflet map with geofence radar
│   │   │   ├── SovereignCommandBridge.tsx    # "War Room" fullscreen overlay
│   │   │   ├── LogisticsMetricModal.tsx      # Drill-down modal for KPI cards
│   │   │   ├── QuickNavigator.tsx            # Ctrl+K command palette
│   │   │   ├── Badge.tsx                     # Semantic badge component
│   │   │   ├── Section.tsx                   # Content section wrapper
│   │   │   ├── MetricCard.tsx                # KPI metric card (uses RoyalCard)
│   │   │   ├── RoyalCard.tsx                 # Base card with 3D tilt effect
│   │   │   ├── PortalHero.tsx                # Page title header (minimal now)
│   │   │   ├── IntakeWorkflowStepper.tsx     # Multi-step workflow stepper
│   │   │   ├── SupplierContractWorkflow.tsx  # Contract management workflow
│   │   │   ├── CategoryPriceRangeCard.tsx    # Pricing category card
│   │   │   ├── DashboardJumpDock.tsx         # Quick navigation dock
│   │   │   ├── PwaUpdateBanner.tsx           # PWA update notification
│   │   │   └── TacticalToast.tsx             # Toast notification system
│   │   ├── pages/
│   │   │   ├── OperationsPortals.tsx         # MASSIVE FILE (~278KB). Contains:
│   │   │   │                                 #   CompanyDashboard, ActivityIntakePage,
│   │   │   │                                 #   CaptainsApp, CoordinatorsApp, GuestJourneyApp
│   │   │   ├── GuestSelfOnboarding.tsx       # Guest self-registration portal (#onboarding hash)
│   │   │   └── types.ts                      # Page-level type definitions
│   │   │   # NOTE: the Guest/Captain/Coordinator portals live INSIDE OperationsPortals.tsx.
│   │   │   # Older standalone DriverApp/GuestApp/OrganizerDashboard/SuperAdmin/SupplierMarketplace
│   │   │   # pages were dead code and were deleted (see git history if needed).
│   │   ├── lib/
│   │   │   ├── api.ts                        # API client (login, getBootstrap, apiFetch, apiUploadFile)
│   │   │   ├── format.ts                     # Money, date, percent formatters (uses ar-SA-u-nu-latn)
│   │   │   ├── localize.ts                   # ~60KB localization dictionary (isArabicLanguage, pickText, etc.)
│   │   │   ├── localizeDomain.ts             # Domain-specific localization helpers
│   │   │   ├── useLiveDemoSimulation.ts      # Investor demo simulation hook (~43KB)
│   │   │   ├── planExport.ts                 # Plan export to PDF
│   │   │   ├── tacticalAudio.ts              # Audio feedback system
│   │   │   ├── telemetryCodec.ts             # Telemetry data encoding/decoding
│   │   │   ├── navigation.ts                 # Navigation helpers
│   │   │   ├── useSocket.ts                  # The ONE Socket.IO connection (+ SocketContext, status, typed server events)
│   │   │   ├── use3DTilt.ts                  # 3D card tilt effect hook
│   │   │   └── useLiveLocation.ts            # Geolocation hook
│   │   ├── i18n/index.ts                     # i18next config (AR + EN translations)
│   │   ├── styles/index.css                  # Master CSS (design tokens, component styles)
│   │   └── main.tsx                          # React entry point
│   └── vite.config.ts
├── server/
│   └── src/
│       ├── index.ts                          # Express server entry (mounts all routes + Socket.IO)
│       ├── db.ts                             # Prisma client instance
│       ├── env.ts                            # Environment variable loader (Zod validated)
│       ├── routes/
│       │   ├── auth.ts                       # Login, token refresh
│       │   ├── bootstrap.ts                  # GET /api/bootstrap — loads ALL data for the logged-in user
│       │   ├── events.ts                     # Event CRUD
│       │   ├── drivers.ts                    # Driver management
│       │   ├── tasks.ts                      # Task assignment and status
│       │   ├── operations.ts                 # Operational endpoints (~44KB)
│       │   ├── suppliers.ts                  # Supplier management
│       │   ├── bookings.ts                   # Booking management
│       │   ├── uploads.ts                    # File upload handling
│       │   ├── ai.ts                         # AI endpoint (OpenAI integration)
│       │   ├── users.ts                      # User management
│       │   ├── auditLogs.ts                  # Audit log queries
│       │   ├── notifications.ts              # Push notification endpoints
│       │   ├── communications.ts             # Client messaging
│       │   └── riders.ts                     # Rider/guest endpoints
│       ├── services/
│       │   ├── ai.ts                         # OpenAI logistics planning service (~39KB)
│       │   ├── geofenceEngine.ts             # Geofence detection engine
│       │   ├── telemetryBuffer.ts            # Real-time telemetry buffering
│       │   ├── delayMonitor.ts               # Task delay monitoring
│       │   ├── auditLog.ts                   # Audit log writer
│       │   ├── logisticsRules.ts             # Business rule engine
│       │   ├── notificationDelivery.ts       # Notification dispatch
│       │   └── pdf.ts                        # PDF generation service
│       ├── middleware/                        # Auth middleware, error handlers
│       ├── types/                            # Server-specific type definitions
│       └── utils/                            # HTTP helpers, etc.
├── shared/
│   ├── domain.ts                             # ALL shared TypeScript types (Role, PortalKey, Event, Driver, Task, etc.)
│   └── constants.ts                          # Shared constants (PORTALS array, RIYADH coords, CONCENTRIC_GEOFENCES, supplier categories)
├── prisma/
│   ├── schema.prisma                         # Database schema (PostgreSQL)
│   └── seed.ts                               # Database seed script
├── tailwind.config.cjs                       # Tailwind configuration
├── tsconfig.json                             # Root TypeScript config
├── render.yaml                               # Render deployment config
├── docker-compose.yml                        # Docker config for local PostgreSQL
├── start.mjs                                 # Production start script
└── package.json                              # Dependencies and scripts
```

---

## 3. ARCHITECTURE & DATA FLOW

### How routing works (NO react-router)
The app uses **manual portal switching** via React state in `App.tsx`:
```
App.tsx → session state → portalsByRole[session.user.role] → portal state → renders the matching dashboard component
```
There is NO react-router. The `portal` state variable (type `PortalKey`) determines which dashboard renders. The `portalsByRole` record maps each `Role` to allowed `PortalKey[]`.

### Role → Portal Mapping
```typescript
const portalsByRole: Record<Role, PortalKey[]> = {
  GUEST: ["guest"],
  DRIVER: ["captain"],
  ORGANIZER: [...PORTALS],         // all portals
  SUPPLIER: ["company"],
  SUPER_ADMIN: [...PORTALS],       // all portals
  COORDINATOR: ["coordinator"],
  LOGISTICS_MANAGER: ["sila_operations", "company", "coordinator", "intake"],
  COMPANY_ORGANIZER: ["company", "client", "intake", "sila_operations"],
  EVENT_MANAGER: ["sila_operations", "coordinator"],
  CLIENT: ["client"]
};
```

### Bootstrap Pattern
On login, the client calls `GET /api/bootstrap` which returns a **single massive `MidyafData` object** containing all events, drivers, tasks, guests, contracts, activity intakes, company reports, complaints, audit logs, etc. This is kept in React state and mutated locally via Socket.IO events. There is no client-side caching or SWR.

### Demo Login Credentials
```
admin@midyaf.local     / Midyaf@2026   → SUPER_ADMIN (sees everything)
company@midyaf.local   / Midyaf@2026   → COMPANY_ORGANIZER
logistics@midyaf.local / Midyaf@2026   → LOGISTICS_MANAGER
driver@midyaf.local    / Midyaf@2026   → DRIVER
guest@midyaf.local     / Midyaf@2026   → GUEST
```

---

## 4. DESIGN SYSTEM — "Obsidian Command Center"

The UI has been redesigned with a bespoke dark aesthetic. This is NOT generic SaaS — it's meant to feel like a financial/operational command center.

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| `--m-purple` / `midyaf-purple` | `#090C15` | Primary background (Obsidian Space) |
| `--m-purple-light` / `midyaf-purple-light` | `#121626` | Card/surface background (Midnight Edge) |
| `--m-purple-dark` | `#05070D` | Deepest background |
| `--m-gold` / `midyaf-gold` | `#D4AF37` | Brand accent, active states, focus rings |
| `--m-gold-light` | `#F2D575` | Hover gold |
| `--m-gold-dark` | `#A88820` | Pressed gold |
| Text primary | `#F8FAFC` | White for data/labels |
| Text secondary | `#94A3B8` | Muted for metadata |
| Semantic green | `emerald-400/500` | Healthy, completed |
| Semantic amber | `amber-400/500` | Pending, attention |
| Semantic red | `rose-400/500` | Critical, alert |

### Typography
- **Arabic**: IBM Plex Sans Arabic / Tajawal
- **English**: Inter
- **Numerals**: ALWAYS Western (0-9), enforced via `ar-SA-u-nu-latn` BCP47 locale extension

### Component Conventions
- Cards: `bg-[#121626] border border-white/5 rounded-lg shadow-sm` — NO glass effects, NO heavy gradients
- Tables: `bg-[#121626]` containers, `bg-[#090C15]` thead, `border-white/5` dividers
- Buttons: Flat, structural — no glowing shadows
- Badges: `rounded` (not `rounded-full`), `text-[10px] uppercase tracking-widest`, translucent fills
- Border radius: Maximum `rounded-lg` (8px). NO `rounded-2xl`, NO `rounded-3xl`
- Shadows: Minimal — `shadow-sm` only. NO `shadow-luxury`, NO `shadow-glow`

---

## 5. CRITICAL CONVENTIONS & GOTCHAS

### ⚠️ ARABIC TEXT & POWERSHELL ENCODING (CRITICAL)
**PowerShell on Windows CORRUPTS Arabic Unicode characters** when piped through stdout. Any operation that passes Arabic text through PowerShell (echo, cat, piped commands) will replace Arabic characters with `?` or mojibake.

**THE ONLY SAFE WAY** to write files containing Arabic text is:
```javascript
// Use Node.js fs.writeFileSync with explicit utf8 encoding
const fs = require('fs');
fs.writeFileSync('path/to/file.tsx', contentWithArabic, 'utf8');
```

If you need to do find-and-replace on files that contain Arabic strings, **read the file with Node, do the replacement in memory, and write it back with Node**. Never pipe content through PowerShell.

### Localization Pattern
The app uses TWO localization approaches simultaneously:
1. **react-i18next** (`useTranslation` / `t()`) — for framework-level strings (login, nav labels, common UI)
2. **Inline ternaries** — for component-level content:
   ```tsx
   {isArabic ? "نص عربي" : "English text"}
   ```
   The `isArabic` boolean is derived from `isArabicLanguage(i18n.language)` in `client/src/lib/localize.ts`.

There is also a large dictionary in `localize.ts` (~60KB) that maps English strings to Arabic.

### Number Formatting
ALL numbers must use Western digits (0-9), even in Arabic mode. The `format.ts` file uses `ar-SA-u-nu-latn` locale:
```typescript
function currentLocale() {
  if (document.documentElement.lang.startsWith("ar")) {
    return "ar-SA-u-nu-latn";  // Arabic labels + Western digits
  }
  return "en-SA";
}
```

### RTL Support
The app supports RTL (right-to-left) for Arabic. The `<html>` element gets `dir="rtl"` and `lang="ar"` when Arabic is active. Tailwind's logical properties (`ms-`, `me-`, `ps-`, `pe-`) should be used instead of `ml-`, `mr-`, `pl-`, `pr-`.

### Module System
The project uses ESM (`"type": "module"` in package.json). CommonJS files must use `.cjs` extension (e.g., `tailwind.config.cjs`, `postcss.config.cjs`).

### Path Aliases
- `@shared/domain` → `shared/domain.ts`
- `@shared/constants` → `shared/constants.ts`

### File Size Warning
Several files are VERY large:
- `OperationsPortals.tsx` — ~278KB (contains multiple dashboard page components in one file)
- `App.tsx` — ~67KB
- `LogisticsMetricModal.tsx` — ~58KB
- `localize.ts` — ~60KB
- `useLiveDemoSimulation.ts` — ~44KB

Be careful editing these files — small edits may have cascading effects.

---

## 6. DATABASE (Prisma + PostgreSQL)

Key models:
- `User` (roles: GUEST, DRIVER, ORGANIZER, SUPPLIER, SUPER_ADMIN, COORDINATOR, LOGISTICS_MANAGER, COMPANY_ORGANIZER)
- `Event` (status: DRAFT, PUBLISHED, LIVE, COMPLETED, CANCELLED)
- `Guest` (RSVP status tracking, journey stages)
- `Driver` (zone assignment, GPS coordinates, captain type)
- `Task` (status workflow: PENDING → ASSIGNED → EN_ROUTE → COMPLETED)
- `Booking`, `Supplier`, `Contract`
- `ActivityIntake` (event setup workflow)
- `AuditLog` (immutable audit trail)
- `CityConfig` (multi-city support, currently Riyadh only)
- `Notification`, `Message`, `FileAsset`

### Seeding
`prisma/seed.ts` creates demo users, events, drivers, guests, and sample data. All demo data uses Arabic names and descriptions.

---

## 7. REAL-TIME FEATURES

The app uses **Socket.IO** for real-time updates:
- Driver location telemetry
- Task status changes
- Geofence entry/exit events
- Live demo simulation events

The server emits events, and the client updates its local `MidyafData` state accordingly.

---

## 8. CURRENT STATE & RECENT WORK

### Completed
- ✅ Merged Logistics Manager & Event Manager into unified `SilaOperationsDashboard`
- ✅ Icon-based navigation across all dashboards (drill-down pattern)
- ✅ Investor Demo simulation flow (`useLiveDemoSimulation.ts`)
- ✅ Guest Self-Onboarding portal
- ✅ Complete Arabic localization
- ✅ Fixed corrupted Arabic strings in database seed
- ✅ **Full UI/UX redesign** — "Obsidian Command Center" aesthetic:
  - Two-zone header (identity + navigation)
  - Flat dark surfaces (#090C15 / #121626)
  - Semantic left-border KPI cards
  - Dark terminal-style data tables
  - Flattened badges, buttons, forms
  - Intelligence-feed style AI panel
  - Western numeral enforcement

### Next Priority Features (from Screen Recording Script)
These are investor demo features that need to be built:
1. **Concentric Geofence Radar** — 4 tactical rings (Approach/Staging/Curbside/Docking) with 15m deadband
2. **Triple-Key Security Vault** — Multi-party authorization for high-value procurement
3. **Zero-Touch Curbside Handshake** — Auto-notification when convoy hits innermost geofence
4. **Holographic Security Dossier** — Encrypted VIP profile card (Apple Wallet style)
5. **Emergency Rerouting (Sandstorm Simulator)** — AI override with autonomous route recalculation

---

## 9. ENVIRONMENT SETUP

```bash
# 1. Clone and install
git clone https://github.com/3EZZO/midyaf.git
cd midyaf
npm install

# 2. Database (needs PostgreSQL running)
# Option A: Docker
docker-compose up -d

# Option B: Local PostgreSQL
# Set DATABASE_URL in .env

# 3. Push schema and seed
npx prisma db push
npm run db:seed

# 4. Start dev server
npm run dev
# Server: http://localhost:5005
# Client: http://localhost:5173 (Vite dev server)
```

### Environment Variables (.env)
```
NODE_ENV=production
PORT=5005
CLIENT_ORIGIN=http://localhost:5005
DATABASE_URL=postgresql://midyaf:midyaf@localhost:5432/midyaf?schema=public
JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
OPENAI_API_KEY=     # Optional — AI features disabled without this
VITE_API_BASE_URL=/api
```

---

## 10. CODING STANDARDS

1. **Always run `npm run check` before committing** — TypeScript must compile clean
2. **Never use `rounded-2xl` or `rounded-3xl`** — max is `rounded-lg`
3. **Never use gradient backgrounds on structural elements** — use flat `bg-[#121626]` or `bg-[#090C15]`
4. **Never use `shadow-luxury`, `shadow-glow-purple`** — use `shadow-sm` or `shadow-none`
5. **Always use `border-white/5`** for subtle borders (not `border-slate-200` or `border-slate-100`)
6. **Arabic text preservation** — never pipe Arabic through PowerShell. Use Node.js `fs.writeFileSync`
7. **Preserve all existing Arabic copy** — do not change, remove, or re-translate existing Arabic strings
8. **RTL correctness** — use `ms-`/`me-`/`ps-`/`pe-` instead of `ml-`/`mr-`/`pl-`/`pr-`
9. **Accessibility** — maintain WCAG contrast ratios, visible keyboard focus states
10. **No decorative motion** — animation only for state changes (e.g., `transition-colors`), not hover effects
11. **Dark-only** — never add `light` theme branches or a theme toggle; `dark:` prefixes are inert-but-correct and may be stripped when a file is touched
12. **Nothing under 12px** — `text-xs` is the floor; do not add `text-[10px]`/`text-[11px]`
13. **Codemods live in `scripts/codemods/`** — bulk edits to files containing Arabic must be Node scripts (UTF-8, CRLF-aware), committed for review
14. **One socket** — never call `io()` outside `client/src/lib/useSocket.ts`; consume `useSocketContext()` instead
15. **Projector density** — Ctrl+Shift+P toggles `html[data-density="projector"]` (18px root). Size with rem/Tailwind scale, never fixed px, so this keeps working
