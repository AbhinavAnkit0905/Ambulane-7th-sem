# Emergency Passage Network & Alert Architecture

## 1. Overview
The Emergency Passage Network is the foundational differentiator of the Smart Ambulance Emergency Mobility Platform. Unlike standard navigation apps that notify motorists via blunt circular perimeters or post-incident reports, Ambulane builds a dynamic, low-latency road passage corridor ahead of the moving emergency vehicle.

```
                  Ambulance GPS Update (every 3-5s)
                                |
                                v
               Is Ambulance on Active Emergency?
                                |
                                v
                Retrieve Current Route Polyline
                                |
                                v
                Locate Vehicle on Polyline Segments
                                |
                                v
                Slice Ahead-Route Vector Corridor
                                |
        +-----------------------+-----------------------+
        |                                               |
        v                                               v
   Condition A:                                    Condition B:
   Within 2000m Radial Distance?                   Within 150m Cross-Track Road Buffer
        |                                          Ahead of Emergency Vehicle?
        +-----------------------+-----------------------+
                                |
                                v
                    Both Conditions Met?
                    /                  \
                  YES                   NO
                   |                     |
         Targeted Alert Active    Was Previously Alerted?
         (Priority Tiered)        /             \
                   |            YES              NO
         Alert Deduplication     |                |
         (Update Distance/ETA) Expire Alert    Ignore
                               (Ambulance Passed)
```

## 2. Priority Stratification (Requirement 33)
* `< 200m`: `EMERGENCY_VEHICLE_NEARBY` (Highest urgency, immediate yield required)
* `< 500m`: `AMBULANCE_VERY_CLOSE` (High priority, prepare to pull over safely)
* `500m - 1500m`: `AMBULANCE_APPROACHING` (Look-ahead alert, clear intersection)
* `> 1500m`: `AMBULANCE_NEARBY` (Informational awareness)

## 3. Safe Alert Phrasing (Requirement 34 & 35)
To safeguard motorist safety and comply with international road traffic laws:
* Mandatory Phrasing: *"Please give way and allow the ambulance to pass when safe and legal to do so."*
* Strictly Prohibited: Commands instructing motorists to mount curbs, run red lights, or execute emergency stops in active highway lanes.

## 4. Alert Lifecycle & Deduplication (Requirement 39, 40, 41, 76)
1. **Initial Trigger:** Dispatched on first entry into look-ahead corridor with one single audible tone.
2. **Periodic Updates:** As GPS telemetry updates every 3-5 seconds, the existing `EmergencyAlert` record is updated in-place with new distance and ETA. No new audio chime is generated.
3. **Automatic Expiration:** Once the ambulance crosses the motorist's road coordinate, the alert transitions to `PASSED` / `EXPIRED` and silently dismisses from the driver's HUD.
