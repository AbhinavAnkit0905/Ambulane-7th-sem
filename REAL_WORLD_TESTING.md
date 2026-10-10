# 📱 Real-World Device Testing Guide
## Smart Ambulance Emergency Mobility Platform

This guide outlines the end-to-end setup and execution of the **controlled real-world multi-device test** using physical smartphones and computers connected to a live backend.

---

## ⚠️ Important Safety Protocol (Requirement 33)

> [!CAUTION]
> **This test must be conducted strictly in a safe, controlled environment.**
> - **DO NOT** speed, tailgate, drive aggressively, or run traffic signals.
> - **DO NOT** intentionally obstruct live ambulances or simulate fake emergencies in public that might confuse first responders.
> - The application only advises: *"Please give way when safe and legal to do so."* It never commands drivers to violate traffic laws.
> - Recommended test setting: Two test walkers/cyclists in an open public park, university campus, or a private parking facility.

---

## 📐 Multi-Device Architecture (Requirement 2 & 58)

```
       PHONE 1: AMBULANCE DRIVER
       (Live Device GPS: 3-5s)
                  │
                  ▼ [HTTPS / WSS]
       ┌────────────────────────┐
       │     BACKEND SERVER     │
       │   (Cloud / Tunnel URL) │
       │  • Geo Corridor Engine │
       │  • Deduplication       │
       │  • RBAC & State Machine│
       └───────────┬────────────┘
                   │ [Socket.IO Rooms]
          ┌────────┴────────┐
          ▼                 ▼
   PHONE 2: NORMAL DRIVER   LAPTOP: ADMIN CONTROL
   (Targeted Passage Alert) (Live Incident Telemetry)
```

---

## 1. Backend Deployment & Public Access (Requirement 3)

Physical phones on cellular networks or different Wi-Fi networks **cannot connect to `http://localhost:5000`**. You must expose the backend with an HTTPS URL.

### Option A: Local Tunnel (Free & Fast for Field Tests)

Using **Cloudflare Tunnel** or **ngrok**:

```bash
# Terminal 1: Run your local backend API
npm run dev:api

# Terminal 2: Expose port 5000 via Cloudflare Tunnel
npx cloudflared tunnel --url http://localhost:5000
# Or using ngrok:
# ngrok http 5000
```
*Note your public HTTPS URL* (e.g. `https://smart-ambulance-api.trycloudflare.com`).

### Option B: Cloud Deployment (Render / Railway / Fly.io)

1. Deploy the backend using the Dockerfile at `apps/api/Dockerfile`.
2. Set environment variables on your cloud provider:
   - `DATABASE_URL`: Hosted PostgreSQL connection string (e.g. Supabase, Neon, or Railway PG).
   - `JWT_SECRET`: Your production secret key.
   - `PORT`: `5000` (or provider's `$PORT`).
3. Verify public health check:
   ```bash
   curl https://<your-backend-domain>/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "database": "connected",
     "socket": "active",
     "service": "Smart Ambulance Emergency Mobility Platform API"
   }
   ```

---

## 2. Environment Variables Configuration (Requirement 35)

Update your mobile and web client URLs:

### Web App (`.env` or `apps/web/.env.local`)
```env
NEXT_PUBLIC_API_URL=https://<your-backend-domain>/api
NEXT_PUBLIC_SOCKET_URL=https://<your-backend-domain>
```

### Mobile App (`apps/mobile/.env` or shell environment)
```env
EXPO_PUBLIC_API_URL=https://<your-backend-domain>/api
EXPO_PUBLIC_SOCKET_URL=https://<your-backend-domain>
```

---

## 3. Device Setup & Permissions (Requirements 4, 5, 6, 20)

### Phone 1: Ambulance Driver
1. Open Expo Go or the installed standalone app.
2. Log in as: `driver@ambulane.emergency` / `password123`.
3. **Permissions required**:
   - **Foreground Location**: Grant "While Using App" (Precise GPS).
   - **Background Location**: Grant "Allow All the Time" (allows 3-5s GPS tracking while phone screen is locked or navigation runs in background).
   - **Notifications**: Allow high-priority alert banners.

### Phone 2: Normal Driver / Road User
1. Open Expo Go or the web app on mobile browser (`http://<your-web-url>`).
2. Log in as: `driver_a@user.test` / `password123`.
3. **Permissions required**:
   - **Location**: Grant "While Using App".
   - **Notifications**: Grant notification permission so emergency corridor alerts pop up even if app is minimized.

### Laptop: Emergency Dispatcher (Admin)
1. Open browser to: `http://localhost:3000` (or your deployed web URL).
2. Switch role in top navbar to **Admin Center** (`admin@ambulane.emergency`).
3. Observe live KPI cards, fleet availability, and real-time passage corridor map.

---

## 4. Controlled Real-World Test Procedure (Requirement 32)

### Step 1 — Standby & Pre-Flight Check
1. On **Phone 1 (Ambulance)**, open the **GPS Diagnostics** screen. Verify:
   - Permission: `granted`
   - Accuracy: `< 15m`
   - Socket: `CONNECTED`
2. On **Phone 2 (Normal Driver)**, open the map. Verify your GPS icon appears at your current physical location.

### Step 2 — Dispatch & Route Calculation
1. On **Phone 1 (Ambulance)**, tap **START EMERGENCY**.
2. The backend calculates the emergency route via OSRM using Phone 1's real GPS coordinates.
3. Phone 1 begins high-frequency GPS tracking (every 3–4 seconds).

### Step 3 — Admin Live Tracking
1. Look at the **Laptop (Admin)** screen without refreshing.
2. The ambulance marker moves in real time as Phone 1 physically moves.
3. The "Users Alerted" counter displays `0` initially while Phone 2 is outside the 2 km geofence or off-corridor.

### Step 4 — Corridor Entry & Alert Trigger
1. Have Phone 1 physically move towards Phone 2 along the planned corridor.
2. When Phone 1 is within **2000 m** AND inside the **150 m route corridor** ahead:
   - Phone 2 receives a single audio chime.
   - An in-app alert card pops up:
     ```
     🚨 EMERGENCY AMBULANCE APPROACHING
     Ambulance EMERG-911
     Distance: 620 m · ETA: ~1 min
     "Please give way and allow the ambulance to pass when safe and legal to do so."
     ```
   - On the Admin dashboard, "Users Alerted" increments to `1`.

### Step 5 — Real-Time Silent Distance Updates
1. As Phone 1 continues approaching:
   - Phone 2's displayed distance counts down (`550m` → `400m` → `280m`).
   - Updates happen **silently** over Socket.IO without playing repeating alert chimes.

### Step 6 — Ambulance Passes (Alert Expiry)
1. Phone 1 physically moves past Phone 2.
2. The backend corridor algorithm detects that Phone 2 is now in the ambulance's rear arc.
3. Phone 2 automatically receives `emergency:alert_expired` and the alert card disappears.
4. On Admin dashboard, "Users Alerted" decrements to `0`.

### Step 7 — Patient Arrival & Hospital Route
1. On Phone 1, tap **ARRIVED AT PATIENT**.
2. Tap **PATIENT PICKED UP**.
3. Select the recommended destination hospital (ranked by distance, ICU beds, and ED availability).
4. Tap **CONFIRM & START ROUTE**. A new live route from the ambulance's current location to the hospital is calculated.

### Step 8 — Arrival & Completion
1. On Phone 1, tap **ARRIVED AT HOSPITAL**.
2. Tap **COMPLETE EMERGENCY**.
3. High-frequency GPS tracking stops immediately to save battery. The emergency is logged in the database for analytics.

---

## 5. Troubleshooting & Diagnostics (Requirements 37–42)

| Issue | Cause | Solution |
|---|---|---|
| Phone shows `Socket: DISCONNECTED` | Incorrect `EXPO_PUBLIC_SOCKET_URL` or SSL mismatch | Ensure public URL uses `https://` / `wss://`. Verify backend `/health` is reachable from phone browser. |
| Alert does not appear on Phone 2 | Normal user is > 150m off route corridor or behind vehicle | Check bearing and cross-track distance. Ensure Phone 2 is ahead along the route line. |
| GPS says `Accuracy: ±65m` | Indoor testing / weak satellite signal | Step outdoors into clear sky view. The app displays a low accuracy warning if accuracy > 50m. |
| Push notification doesn't arrive | Notification permissions denied in OS settings | Go to Phone Settings → Apps → Ambulane → Notifications → Allow. Foreground Socket alert will still display. |
| Route fails with "Unable to route" | OSRM rate limit or no road connectivity | Check internet connection or tap retry. OSRM uses open road networks. |
