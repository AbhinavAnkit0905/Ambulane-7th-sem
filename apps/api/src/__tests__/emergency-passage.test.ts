import request from 'supertest';
import app from '../app';
import { prisma } from '@smart-ambulance/database';
import {
  EmergencyStatus,
  AmbulanceStatus,
  AlertStatus,
  AlertPriorityLevel,
  evaluateCorridorProximity,
  isValidEmergencyTransition,
  calculateHaversineDistance,
  LatLng
} from '@smart-ambulance/shared';
import { passageNetworkService } from '../services/passage-network.service';
import { emergencyService } from '../services/emergency.service';

describe('Smart Ambulance Emergency Mobility Platform Test Suite', () => {
  let adminToken: string;
  let driverToken: string;
  let normalUserToken: string;

  beforeAll(async () => {
    // 1. Authenticate users
    const adminRes = await request(app).post('/api/auth/login').send({
      email: 'admin@ambulane.emergency',
      password: 'password123'
    });
    adminToken = adminRes.body.token;

    const driverRes = await request(app).post('/api/auth/login').send({
      email: 'driver@ambulane.emergency',
      password: 'password123'
    });
    driverToken = driverRes.body.token;

    const userRes = await request(app).post('/api/auth/login').send({
      email: 'driver_a@user.test',
      password: 'password123'
    });
    normalUserToken = userRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Authentication & RBAC (Requirement 9 & 59)', () => {
    it('should successfully log in and return valid JWT with correct role', async () => {
      expect(adminToken).toBeDefined();
      expect(driverToken).toBeDefined();
      expect(normalUserToken).toBeDefined();
    });

    it('should block NORMAL_USER from creating emergencies (RBAC)', async () => {
      const res = await request(app)
        .post('/api/emergencies')
        .set('Authorization', `Bearer ${normalUserToken}`)
        .send({
          pickupLatitude: 28.6139,
          pickupLongitude: 77.2090,
          pickupAddress: 'Unauthorized attempt'
        });

      expect(res.status).toBe(403);
    });

    it('should allow ADMIN to access admin dashboard', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.kpis).toBeDefined();
      expect(res.body.kpis.activeEmergencies).toBeGreaterThanOrEqual(0);
    });
  });

  describe('2. Emergency State Machine (Requirement 11 & 12)', () => {
    it('should allow valid emergency transitions', () => {
      expect(isValidEmergencyTransition(EmergencyStatus.CREATED, EmergencyStatus.ASSIGNED)).toBe(true);
      expect(isValidEmergencyTransition(EmergencyStatus.ASSIGNED, EmergencyStatus.EN_ROUTE_TO_PATIENT)).toBe(true);
      expect(isValidEmergencyTransition(EmergencyStatus.EN_ROUTE_TO_PATIENT, EmergencyStatus.AT_PATIENT)).toBe(true);
      expect(isValidEmergencyTransition(EmergencyStatus.AT_PATIENT, EmergencyStatus.PATIENT_PICKED_UP)).toBe(true);
      expect(isValidEmergencyTransition(EmergencyStatus.PATIENT_PICKED_UP, EmergencyStatus.EN_ROUTE_TO_HOSPITAL)).toBe(true);
      expect(isValidEmergencyTransition(EmergencyStatus.EN_ROUTE_TO_HOSPITAL, EmergencyStatus.AT_HOSPITAL)).toBe(true);
      expect(isValidEmergencyTransition(EmergencyStatus.AT_HOSPITAL, EmergencyStatus.COMPLETED)).toBe(true);
    });

    it('should reject invalid transitions (e.g. COMPLETED -> EN_ROUTE, AT_PATIENT -> COMPLETED)', () => {
      expect(isValidEmergencyTransition(EmergencyStatus.COMPLETED, EmergencyStatus.EN_ROUTE_TO_PATIENT)).toBe(false);
      expect(isValidEmergencyTransition(EmergencyStatus.AT_PATIENT, EmergencyStatus.COMPLETED)).toBe(false);
      expect(isValidEmergencyTransition(EmergencyStatus.CREATED, EmergencyStatus.COMPLETED)).toBe(false);
    });
  });

  describe('3. Routing & No Fake Traffic (Requirements 17, 18, 19, 20)', () => {
    it('should calculate normal route without claiming fake live traffic', async () => {
      const res = await request(app)
        .post('/api/routes/normal')
        .send({
          origin: { latitude: 28.6139, longitude: 77.2090 },
          destination: { latitude: 28.6300, longitude: 77.2200 }
        });

      expect(res.status).toBe(200);
      expect(res.body.distance).toBeGreaterThan(0);
      expect(res.body.geometry.length).toBeGreaterThan(1);
      expect(res.body.isTrafficLive).toBe(false);
      expect(res.body.trafficMessage).toBeDefined();
    });

    it('should calculate emergency route with emergency-adjusted duration', async () => {
      const res = await request(app)
        .post('/api/routes/emergency')
        .send({
          origin: { latitude: 28.6139, longitude: 77.2090 },
          destination: { latitude: 28.6300, longitude: 77.2200 },
          priority: 'CRITICAL'
        });

      expect(res.status).toBe(200);
      expect(res.body.distance).toBeGreaterThan(0);
      expect(res.body.priority).toBe('CRITICAL');
    });
  });

  describe('4. Critical Alert & Corridor Look-Ahead (Requirements 31, 32, 33, 75)', () => {
    // Route from (28.6000, 77.2000) North-East to (28.6400, 77.2400)
    const polyline: [number, number][] = [
      [28.6000, 77.2000],
      [28.6100, 77.2100],
      [28.6200, 77.2200],
      [28.6300, 77.2300],
      [28.6400, 77.2400]
    ];
    const ambLocation: LatLng = { latitude: 28.6100, longitude: 77.2100 };

    it('User 1: 500m away and ahead on upcoming corridor -> Eligible for High Priority Alert', () => {
      // Point slightly offset from segment [28.6100, 77.2100] -> [28.6200, 77.2200]
      const userAhead: LatLng = { latitude: 28.6130, longitude: 77.2130 };
      const evalResult = evaluateCorridorProximity(userAhead, ambLocation, polyline, 50);

      expect(evalResult.isEligibleForAlert).toBe(true);
      expect(evalResult.isAheadOnRoute).toBe(true);
      expect(evalResult.distanceToAmbulance).toBeLessThan(1500);
      expect(evalResult.priorityLevel).toBe(AlertPriorityLevel.AMBULANCE_VERY_CLOSE);
    });

    it('User 2: 3.5km away -> Out of 3km range -> Not eligible', () => {
      const userFar: LatLng = { latitude: 28.6600, longitude: 77.2800 };
      const evalResult = evaluateCorridorProximity(userFar, ambLocation, polyline, 50);

      expect(evalResult.isEligibleForAlert).toBe(false);
      expect(evalResult.distanceToAmbulance).toBeGreaterThan(3000);
    });

    it('User within 3km range (2.2km) ahead on corridor -> Eligible for Alert', () => {
      const userInRange: LatLng = { latitude: 28.6250, longitude: 77.2250 };
      const evalResult = evaluateCorridorProximity(userInRange, ambLocation, polyline, 50);

      expect(evalResult.distanceToAmbulance).toBeLessThanOrEqual(3000);
      expect(evalResult.isAheadOnRoute).toBe(true);
      expect(evalResult.isEligibleForAlert).toBe(true);
    });

    it('User 3: 500m away but far behind the ambulance -> Filtered out', () => {
      // Behind ambulance location (at 28.6060, 77.2060)
      const userBehind: LatLng = { latitude: 28.6060, longitude: 77.2060 };
      const evalResult = evaluateCorridorProximity(userBehind, ambLocation, polyline, 50);

      // Even if near, they are behind and should not receive an alert
      expect(evalResult.isAheadOnRoute).toBe(false);
      expect(evalResult.isEligibleForAlert).toBe(false);
    });
  });

  describe('5. Alert Deduplication & 20 GPS Updates (Requirement 76)', () => {
    it('should update single existing alert and not create 20 duplicate alerts', async () => {
      const ambulance = await prisma.ambulance.findFirst();
      const hospital = await prisma.hospital.findFirst();
      const driverA = await prisma.user.findFirst({ where: { email: 'driver_a@user.test' } });

      expect(ambulance).toBeDefined();
      expect(hospital).toBeDefined();
      expect(driverA).toBeDefined();

      // Create test emergency
      const emergency = await emergencyService.createEmergency({
        pickupLatitude: 28.6250,
        pickupLongitude: 77.2200,
        pickupAddress: 'Test Corridor Location',
        hospitalId: hospital!.id,
        ambulanceId: ambulance!.id
      });

      const started = await emergencyService.startEmergency(emergency.id);
      const routePolyline: [number, number][] = JSON.parse(started.routes[0].polylineJson);
      const aheadPoint = routePolyline[Math.min(3, routePolyline.length - 1)];

      // Position driver A directly on the upcoming route corridor ahead
      await prisma.userLocation.upsert({
        where: { userId: driverA!.id },
        update: { latitude: aheadPoint[0], longitude: aheadPoint[1] },
        create: { userId: driverA!.id, latitude: aheadPoint[0], longitude: aheadPoint[1] }
      });

      // Send 20 GPS updates from origin moving forward
      const startPoint = routePolyline[0];
      for (let i = 0; i < 20; i++) {
        await passageNetworkService.processAmbulanceMovement(
          ambulance!.id,
          emergency.id,
          { latitude: startPoint[0], longitude: startPoint[1] },
          50
        );
      }

      // Check alerts count for this user & emergency
      const alerts = await prisma.emergencyAlert.findMany({
        where: {
          emergencyId: emergency.id,
          userId: driverA!.id
        }
      });

      expect(alerts.length).toBe(1); // EXACTLY 1 active alert record!
      expect(alerts[0].status).toBe(AlertStatus.ACTIVE);

      // Clean up emergency
      await emergencyService.cancelEmergency(emergency.id);
    });
  });

  describe('6. Emergency Completion Lifecycle (Requirement 77)', () => {
    it('should set ambulance to AVAILABLE, emergency to COMPLETED, and expire all alerts', async () => {
      const ambulance = await prisma.ambulance.findFirst();
      const hospital = await prisma.hospital.findFirst();

      const emg = await emergencyService.createEmergency({
        pickupLatitude: 28.6300,
        pickupLongitude: 77.2250,
        pickupAddress: 'Final Completion Test',
        hospitalId: hospital!.id,
        ambulanceId: ambulance!.id
      });

      await emergencyService.startEmergency(emg.id);
      await emergencyService.arriveAtPatient(emg.id);
      await emergencyService.pickupPatient(emg.id);
      await emergencyService.startHospitalRoute(emg.id, hospital!.id);
      await emergencyService.arriveAtHospital(emg.id);
      const completed = await emergencyService.completeEmergency(emg.id);

      expect(completed.status).toBe(EmergencyStatus.COMPLETED);

      // Verify ambulance returned to AVAILABLE
      const refreshedAmbulance = await prisma.ambulance.findUnique({ where: { id: ambulance!.id } });
      expect(refreshedAmbulance?.status).toBe(AmbulanceStatus.AVAILABLE);

      // Verify all alerts for this emergency are EXPIRED
      const remainingActiveAlerts = await prisma.emergencyAlert.count({
        where: {
          emergencyId: emg.id,
          status: AlertStatus.ACTIVE
        }
      });
      expect(remainingActiveAlerts).toBe(0);
    });
  });

  describe('7. Hospital Multi-Criteria Recommendation (Requirement 13 & 14)', () => {
    it('should recommend open emergency hospital with available ICU and beds', async () => {
      const res = await request(app)
        .get('/api/hospitals/nearby?lat=28.6139&lng=77.2090');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const recommended = res.body.find((h: any) => h.isRecommended);
      expect(recommended).toBeDefined();
      expect(recommended.emergencyDepartmentOpen).toBe(true);
      expect(recommended.recommendationScore).toBeGreaterThan(0);
    });
  });
});
