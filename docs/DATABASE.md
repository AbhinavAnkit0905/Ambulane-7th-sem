# Database Schema & Entity Relationships

## 1. Overview
The database layer is built on PostgreSQL with Prisma ORM.

```
       +------------------+             +-------------------+
       |     Hospital     |             |       User        |
       +------------------+             +-------------------+
       | id               |             | id                |
       | name             |<-- staff ---| role              |
       | emergencyDeptOpen|             | email             |
       | icuBeds          |             +---------+---------+
       | totalBeds        |                       |
       +--------+---------+                       | driver
                |                                 |
                | receiving                       v
                v                       +-------------------+
       +------------------+             |     Ambulance     |
       |    Emergency     |<-- fleet ---+-------------------+
       +------------------+             | id                |
       | id               |             | registrationNumber|
       | emergencyNumber  |             | status            |
       | status           |             | latitude, longitude
       | priority         |             +---------+---------+
       | pickupLat, Lng   |                       |
       +--------+---------+                       v
                |                       +-------------------+
                |                       | AmbulanceLocation |
                +------- routes ------->| (Time-series GPS) |
                |                       +-------------------+
                |
                +------- alerts ------->+-------------------+
                |                       |  EmergencyAlert   |
                |                       | (Deduplicated)    |
                |                       +-------------------+
                |
                +------- trip --------->+-------------------+
                                        |       Trip        |
                                        | (Audit Analytics) |
                                        +-------------------+
```

## 2. Models
* **User:** Multi-role identity (ADMIN, AMBULANCE_DRIVER, NORMAL_USER, HOSPITAL_OPERATOR).
* **Ambulance:** Operational status (AVAILABLE, ASSIGNED, EN_ROUTE_TO_PATIENT, AT_PATIENT, PATIENT_ONBOARD, EN_ROUTE_TO_HOSPITAL, AT_HOSPITAL, OFFLINE, MAINTENANCE).
* **Hospital:** Emergency trauma availability, ICU beds count, available bed count, receiving capacity.
* **Emergency:** Incident workflow lifecycle state machine with start, arrival, pickup, and completion timestamps.
* **EmergencyRoute:** Polyline coordinates, maneuvers, emergency routing mode, distance, duration.
* **UserLocation:** Low-latency coordinates of connected motorists for spatial corridor matching.
* **EmergencyAlert:** Targeted passage notification state (`ACTIVE`, `UPDATED`, `PASSED`, `EXPIRED`, `DISMISSED`) ensuring strict alert deduplication.
* **Trip:** Trip duration, response time in seconds, number of motorists alerted, total distance.
* **NewsArticle:** 20-minute cached municipal and emergency road news feed.
* **AuditLog:** Structured operational accountability audit trail.
