# Routing Engine & OSRM Integration

## 1. Overview
Routing calculations are managed server-side by the `RoutingService` and wrapped under the `IRoutingProvider` abstraction. The frontend never directly contains routing business logic.

```
Client App
   ↓ (POST /api/routes/emergency)
RoutesController
   ↓
RoutingService
   ↓
OSRMProvider (https://router.project-osrm.org)
   ↓
TrafficProvider (Annotations & Delays)
   ↓
Client Response (Geometry, Steps, Emergency Duration, Traffic Message)
```

## 2. Dual Routing Modes (Requirement 18)

### A. Normal User Mode (`POST /api/routes/normal`)
* Standard driving routing profiles.
* Baseline estimated travel duration.
* No emergency priority speed modifiers.

### B. Emergency Vehicle Mode (`POST /api/routes/emergency`)
* Emergency priority travel speed calculation (incorporating green passage corridor factors, reducing expected duration by ~22%).
* Turn-by-turn maneuver instruction mapping for driver navigation HUD.
* Emergency look-ahead corridor projection.

## 3. Resilient Fallback (Requirement 63 & 83)
If the public OSRM network service times out (6-second threshold) or encounters network partitioning:
* The system activates the `Internal Geometric Resilient Provider` which interpolates coordinates along the vector path.
* Explicitly returns `isTrafficLive: false` with notice `Live traffic unavailable (Direct estimate)`.
* Guarantees emergency vehicles never face application halts or white screens.
