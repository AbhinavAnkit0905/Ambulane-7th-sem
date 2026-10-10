# 🚑 Smart Ambulance Emergency Mobility Platform

A **real-time emergency mobility platform** that connects ambulance drivers, normal road users, and an admin control center through a live **Emergency Passage Network** — automatically detecting drivers in an ambulance's path and alerting them to give way.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🚦 Emergency Passage Network | Corridor algorithm identifies drivers within 150 m of the ambulance's route polyline and sends targeted alerts |
| 🗺️ Live GPS Tracking | Real-time ambulance location updates via Socket.IO, broadcast to admin map |
| 🏥 Smart Hospital Recommendation | Multi-factor scoring (distance 40 %, ED availability 25 %, ICU 15 %, beds 10 %, capacity 10 %) |
| 🔒 Role-Based Access Control | ADMIN / AMBULANCE_DRIVER / NORMAL_USER / HOSPITAL_OPERATOR — enforced server-side |
| 🔔 Emergency Alerts | Targeted per-user Socket.IO delivery with auto-expiry when ambulance passes |
| 📡 Provider Abstractions | Map, Routing, Traffic, Geocoding, Weather, News, Notifications — all behind interfaces |
| 🧪 Demo Mode | Automated GPS simulation replay that walks through the full emergency lifecycle |

---

## 📁 Monorepo Structure

```
ambulane-web-app/
├── apps/
│   ├── api/          # Express + Socket.IO + TypeScript backend
│   ├── web/          # Next.js 14 + Tailwind CSS web app
│   └── mobile/       # React Native + Expo mobile app
├── packages/
│   ├── shared/       # Domain types, state machine, geo utilities
│   └── database/     # Prisma schema, client singleton, seed script
└── docs/             # Architecture and design documents
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14 running on `localhost:5432`
- Database `smart_ambulance` created

### 1 — Install dependencies

```bash
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, etc.
```

### 3 — Push schema & seed data

```bash
npx prisma db push --schema=packages/database/prisma/schema.prisma
npx tsx packages/database/src/seed.ts
```

### 4 — Start the API server

```bash
# Development (tsx watch)
npm run dev:api

# Or directly
npx tsx apps/api/src/index.ts
```

### 5 — Start the web app

```bash
# Development
npx --workspace=apps/web next dev

# Production build
npx --workspace=apps/web next build
npx --workspace=apps/web next start
```

### 6 — Start the mobile app (optional)

```bash
cd apps/mobile
npx expo start
```

---

## 🌐 URLs

| Service | URL |
|---|---|
| Web App | http://localhost:3000 |
| API | http://localhost:5000 |
| Swagger UI | http://localhost:5000/api-docs |
| Health Check | http://localhost:5000/health |

---

## 🔑 Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ambulane.emergency` | `password123` |
| Ambulance Driver | `driver@ambulane.emergency` | `password123` |
| Normal User (on route) | `driver_a@user.test` | `password123` |
| Normal User (on route) | `driver_b@user.test` | `password123` |
| Normal User (out of range) | `driver_c@user.test` | `password123` |
| Hospital Operator | `operator@hospital.test` | `password123` |

---

## 🧠 Emergency Passage Network Algorithm

When an ambulance updates its GPS position, the passage network service:

1. Loads all `NORMAL_USER` `UserLocation` records from PostgreSQL.
2. For each user, calls `evaluateCorridorProximity()` from `packages/shared/src/geo.ts`:
   - **Condition A** — User must be within **2000 m** of the ambulance (Haversine geofence).
   - **Condition B** — User must be within **150 m** of the route polyline (per-segment cross-track distance).
   - **Condition C** — User must be in the ambulance's **forward arc** (bearing within ±105°).
3. Eligible users receive an `EmergencyAlertPayload` via their `user:{id}` Socket.IO room.
4. Alerts are upserted (idempotent) — no duplicate alerts for the same emergency.
5. When the ambulance passes a user (they are no longer in corridor), the alert transitions to `PASSED` and an `emergency:alert_expired` event is emitted.

```
packages/shared/src/geo.ts → evaluateCorridorProximity()
apps/api/src/services/passage-network.service.ts → PassageNetworkService
```

---

## 🗺️ Provider Abstraction

All external services are behind interfaces defined in `apps/api/src/providers/interfaces.ts`:

| Provider | Default Implementation | Fallback |
|---|---|---|
| Routing | OSRM (public endpoint) | Geometric straight-line |
| Geocoding | Nominatim (OSM) | Local landmark cache |
| Traffic | `LiveTrafficProvider` / `SimulationTrafficProvider` | `UnavailableTrafficProvider` |
| Weather | Open-Meteo (free, no key) | Cached last reading |
| News | DB-cached news articles | Seeded articles |
| Notifications | Expo Push (stub) | Console log |
| Maps | OpenStreetMap tiles (Leaflet) | — |

Configure via `.env`:

```env
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
WEATHER_PROVIDER=open-meteo
TRAFFIC_PROVIDER=unavailable   # or: simulation | live
```

---

## 🔄 Emergency State Machine

Valid transitions (enforced server-side):

```
CREATED → ASSIGNED → EN_ROUTE_TO_PATIENT → AT_PATIENT
        → PATIENT_PICKED_UP → EN_ROUTE_TO_HOSPITAL
        → AT_HOSPITAL → COMPLETED

Any non-COMPLETED state → CANCELLED
```

---

## 🛡️ Security

- JWT-based authentication (access token + refresh token model)
- Passwords hashed with **bcryptjs** (cost factor 12)
- Role enforcement with `requireRole()` middleware — roles are never trusted from the client
- Helmet, CORS, and rate limiting on all routes
- Zod schema validation on all request bodies

---

## 🧪 Running Tests

```bash
npm run test --workspace=apps/api
```

13 tests cover:
- Auth & RBAC
- Emergency state machine transitions
- Routing (no fake traffic assertion)
- Corridor look-ahead algorithm
- Alert deduplication across 20 GPS updates
- Emergency completion lifecycle
- Hospital multi-criteria recommendation

---

## 📡 Key Socket Events

| Event | Direction | Description |
|---|---|---|
| `ambulance:location_updated` | Server → Clients | Live ambulance GPS broadcast |
| `emergency:alert` | Server → User | Passage network alert for a specific driver |
| `emergency:alert_expired` | Server → User | Alert cleared (ambulance passed) |
| `emergency:status_changed` | Server → All | Emergency state machine transition |
| `emergency:started` | Server → Admin | Emergency activated |
| `emergency:completed` | Server → All | Emergency finished |

---

## 📚 Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and component overview |
| [ROUTING.md](docs/ROUTING.md) | Routing provider details and no-fake-traffic policy |
| [DATABASE.md](docs/DATABASE.md) | Prisma schema and entity relationships |
| [EMERGENCY_ALERTS.md](docs/EMERGENCY_ALERTS.md) | Passage network algorithm deep-dive |

---

## 📱 Mobile App

The React Native / Expo mobile app (`apps/mobile`) provides:

- **Ambulance Driver**: Full-screen navigation HUD with state machine buttons, live GPS sharing, hospital selection
- **Normal User**: Background GPS tracking, push notification alerts, emergency passage information

### Running the mobile app

```bash
cd apps/mobile
npm install
npx expo start
# Scan QR code with Expo Go on your device
```

Set the API endpoint in `apps/mobile/src/services/api.ts`:

```ts
const API_BASE = 'http://<your-local-ip>:5000/api';
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Web Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui, Zustand |
| Maps | Leaflet + React-Leaflet, OpenStreetMap tiles |
| Mobile | React Native, Expo, Expo Location, Expo Notifications |
| Backend | Node.js, Express, TypeScript, Socket.IO |
| Database | PostgreSQL, Prisma ORM |
| Auth | JWT, bcryptjs |
| Routing | OSRM (OpenStreetMap-based, free) |
| Geocoding | Nominatim (free, rate-limited) |
| Weather | Open-Meteo (free, no API key) |
| Realtime | Socket.IO (WebSocket + polling fallback) |

---

## ⚠️ API Rate Limits (Nominatim)

Nominatim's terms of service require **≤ 1 request/second** and a proper User-Agent. The `NominatimProvider` in this project enforces a 1100 ms minimum interval between requests and caches results for 1 hour. Do not use Nominatim for high-volume production — consider a self-hosted instance or a commercial geocoder.

---

*Built as a production-structured prototype. All external services use free/open-source endpoints with proper fallbacks.*
