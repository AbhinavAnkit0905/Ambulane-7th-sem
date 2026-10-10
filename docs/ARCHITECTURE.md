# System Architecture Specification

## Smart Ambulance Emergency Mobility Platform

### 1. High-Level Overview

The Smart Ambulance Emergency Mobility Platform is a mission-critical, connected-vehicle emergency passage network that bridges:
1. **Ambulance Drivers (Emergency Responders)**
2. **Normal Road Users / Commuters**
3. **Emergency Control Center Dispatachers (Admin)**
4. **Hospital Trauma Operations Staff**

```
                       [ Emergency Mobility Cloud ]
                                    |
      +-----------------------------+-----------------------------+
      |                             |                             |
 [ Admin Web ]            [ Ambulance Mobile ]           [ Driver Mobile / Web ]
 Control Center            Responder Navigation          Give-Way Alerts HUD
      |                             |                             |
      +-----------------------------+-----------------------------+
                                    |
                            [ REST API & Socket.IO ]
                                    |
              +---------------------+---------------------+
              |                                           |
      [ PostgreSQL Database ]                     [ External Providers ]
      - Users & RBAC                              - OSRM Routing Provider
      - Ambulances & Fleet                        - Traffic Simulation / Live
      - Emergencies & Routes                      - Nominatim Geocoding
      - Targeted Passage Alerts                   - Open-Meteo Weather
      - Trip Audit Telemetry                      - Municipal News RSS Feed
```

### 2. Core Innovation: Emergency Passage Network

When an emergency response commences, conventional navigation platforms rely solely on radial circular geofences. The Smart Ambulance platform evaluates two simultaneous spatial predicates:

* **Condition A (Euclidean Proximity):** User is within a `2000m` radius of the ambulance.
* **Condition B (Road Corridor Ahead):** User is within a `100m - 200m` cross-track buffer of the upcoming polyline segments ahead of the ambulance vehicle.

Drivers travelling behind the emergency vehicle or in opposite disconnected corridors are filtered out to prevent alert fatigue.

### 3. Layer Separation

* **Presentation Layer:** Next.js 14 Web Portal, React Native (Expo) Mobile App.
* **Real-Time Communication Layer:** Socket.IO WebSocket rooms (`user:{id}`, `emergency:{id}`, `room:admin`, `hospital:{id}`).
* **Business Logic Layer:** Express.js REST Services, Emergency State Machine, Geolocation Corridor Engine.
* **Persistence Layer:** PostgreSQL with Prisma ORM.
* **Provider Abstraction Layer:** OpenStreetMap, OSRM, Open-Meteo, Nominatim, Expo Notifications.
