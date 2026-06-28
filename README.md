# Midyaf (مضياف)

AI-powered logistics operations platform for Riyadh entertainment activities and
hospitality programs.

Midyaf is modeled around the actual operating flow:

1. The organizing company submits the activity requirements.
2. Midyaf AI prepares the logistics plan.
3. Vendors send hotel, ticket, and car quotations.
4. The logistics manager confirms contracts and commissions.
5. Guest, captain, coordinator, logistics, and company portals open for live
   operations.

## Stack

- React 19, TypeScript, Vite, Tailwind, react-i18next
- Node, Express, TypeScript, Socket.IO
- PostgreSQL, Prisma
- JWT auth, OpenAI GPT-4o integration, and deterministic logistics rules when
  external AI credentials are not configured
- Stubs/config for Google Maps API, AWS S3, Firebase FCM, HyperPay

## Portals

- Activity Intake: activity name/place, visitor counts, VIP/normal split,
  transportation, ticket, hotel, and car preferences.
- تطبيق الضيف: visa/ticket delivery, promotional videos, arrival updates,
  captain/car details, event transport requests, notes, complaints, departure
  confirmation.
- تطبيق الكباتن: shifts, tasks, routes, captain type, active/overtime status,
  car info, visit count, and task feedback.
- تطبيق المنسقين: airport/hotel/venue movement view, guest car requests,
  supervisor escalation, and coordinator feedback.
- لوحة المنظم: logistics manager control for tasks, owners, deadlines,
  supervisors, captains, vendor quotes, contracts, commissions, and reports.
- لوحة الشركة المنظمة: confirmed reports, KPI visibility, and new task/data
  submissions to the logistics manager.

## Structure

- `client/` - React portals and Riyadh operations UI
- `server/` - Express API, Socket.IO, JWT auth, AI endpoints
- `prisma/` - schema and Riyadh seed data
- `shared/` - shared domain types and constants

## Quick Start

```bash
npm install
copy .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:4000`

PostgreSQL is required. The app does not open a local sample workspace when the
database is unavailable.

## Local Production Launch

```powershell
$env:NODE_ENV="production"
$env:PORT="5005"
$env:CLIENT_ORIGIN="http://localhost:5005"
npm run build
npm run start
```

Open `http://localhost:5005`.

## Docker

```bash
docker compose up --build
```

The app is served at `http://localhost:4000` in production mode.

## Seeded Local Accounts

All seeded users use password `Midyaf@2026`.

- Organizing company: `company@midyaf.local`
- Logistics manager: `organizer@midyaf.local`
- Coordinator: `coordinator@midyaf.local`
- Guest VIP: `guest.vip@midyaf.local`
- Captain: `driver@midyaf.local`
- Supplier: `supplier@midyaf.local`

## API Routes

Routes are available under both `/api/...` and the plain path from the spec:

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`
- `CRUD /events`, `GET /events/:id/guests`,
  `POST /events/:id/guests/invite`
- `GET|POST /drivers`, `PUT /drivers/:id/location`,
  `GET /drivers/:id/tasks`
- `GET|POST /tasks`, `PUT /tasks/:id/status`,
  `POST /tasks/:id/reassign`
- `GET|POST /suppliers`, `GET /suppliers/:id`
- `POST /bookings`, `GET /bookings/:eventId`
- `POST /ai/chat`, `POST /ai/plan-event`,
  `POST /ai/analyze-suppliers`
- `GET /notifications`, `PUT /notifications/:id/read`
- `GET /bootstrap` includes activity intakes, AI plans, quotes, contracts,
  guest journeys, coordinator requests, and company reports.
- `CRUD /activity-intakes`, `POST /activity-intakes/:id/analyze`
- `GET|POST /ai-plans`, `PUT /ai-plans/:id/confirm`
- `GET|POST|PUT|DELETE /vendor-quotes`,
  `PUT /vendor-quotes/:id/approve`
- `GET|POST|PUT /contracts`, `PUT /contracts/:id/approve`
- `GET|POST|PUT /guest-journeys`
- `GET|POST|PUT /coordinator-requests`
- `GET|POST /company-reports`, `PUT /company-reports/:id/confirm`,
  `GET /company-reports/:id/pdf`
- `POST /uploads` for visas, tickets, guest photos, driver photos, promo videos
- `POST /communications/send` for SMS, WhatsApp, FCM, and in-app notification
  queueing

## Socket.IO Events

- `driver:location_update`
- `task:status_change`
- `guest:arrived`
- `alert:delay`

Clients join `event:{eventId}` and `user:{userId}` rooms. Logistics users also
join the `organizers` room.

## Riyadh Launch Configuration

- Map center: `24.7136, 46.6753`, zoom `12`
- Timezone: `Asia/Riyadh`
- Currency: `SAR`
- VAT: `15%`
- Driver zones: North, Central, East, West, South Riyadh, Diriyah corridor
- Commission: `10-15%`
- VIP rule: one dedicated car for the full stay
- Normal guest rule: grouped shuttle movement, usually 3-4 guests per vehicle
- Data region preference: AWS `me-south-1`

## Useful Commands

```bash
npm run check
npm run build
npm test
npm run db:generate
npm run db:push
npm run db:seed
```
