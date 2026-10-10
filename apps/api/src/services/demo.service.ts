import { prisma } from '@smart-ambulance/database';
import { AmbulanceStatus, EmergencyPriority, EmergencyStatus, LatLng } from '@smart-ambulance/shared';
import { emergencyService } from './emergency.service';
import { ambulanceService } from './ambulance.service';
import { passageNetworkService } from './passage-network.service';
import { routingProvider } from '../providers';
import { config } from '../config';
import { logger } from '../logger';

export interface DemoStepEvent {
  step: number;
  description: string;
  ambulanceLocation: LatLng;
  alertedCount: number;
  driverStatuses: Record<string, string>;
  timestamp: string;
}

export class DemoService {
  private activeSimulationInterval: NodeJS.Timeout | null = null;
  private currentEmergencyId: string | null = null;
  private simulationLogs: DemoStepEvent[] = [];

  async startDemoEmergency(autoProgress: boolean = true): Promise<{
    emergencyId: string;
    message: string;
  }> {
    // Stop any existing simulation
    this.stopDemoSimulation();
    this.simulationLogs = [];

    const baseLat = config.demoLat;
    const baseLng = config.demoLng;

    // 1. Ensure Demo Users & Locations exist
    const driverA = await prisma.user.findFirst({ where: { email: 'driver_a@user.test' } });
    const driverB = await prisma.user.findFirst({ where: { email: 'driver_b@user.test' } });
    const driverC = await prisma.user.findFirst({ where: { email: 'driver_c@user.test' } });
    const ambDriver = await prisma.user.findFirst({ where: { role: 'AMBULANCE_DRIVER' } });

    // Ensure Ambulance exists
    let ambulance = await prisma.ambulance.findFirst({
      where: { registrationNumber: 'EMERG-911' }
    });
    if (!ambulance) {
      ambulance = await prisma.ambulance.create({
        data: {
          registrationNumber: 'EMERG-911',
          driverId: ambDriver?.id,
          status: AmbulanceStatus.AVAILABLE,
          latitude: baseLat,
          longitude: baseLng,
          heading: 45,
          speed: 0
        }
      });
    }

    // Ensure Hospital exists
    const hospital = await prisma.hospital.findFirst({
      where: { emergencyDepartmentOpen: true }
    });
    if (!hospital) {
      throw new Error('No emergency hospital available for demo');
    }

    // Patient Pickup Location (approx 2.5km North-East)
    const patientLat = baseLat + 0.022;
    const patientLng = baseLng + 0.018;

    // Reset Driver Locations per requirements:
    // Driver A: ~500m from route ahead
    if (driverA) {
      await prisma.userLocation.upsert({
        where: { userId: driverA.id },
        update: { latitude: baseLat + 0.007, longitude: baseLng + 0.006, updatedAt: new Date() },
        create: { userId: driverA.id, latitude: baseLat + 0.007, longitude: baseLng + 0.006 }
      });
    }

    // Driver B: ~1.2km from route ahead
    if (driverB) {
      await prisma.userLocation.upsert({
        where: { userId: driverB.id },
        update: { latitude: baseLat + 0.014, longitude: baseLng + 0.018, updatedAt: new Date() },
        create: { userId: driverB.id, latitude: baseLat + 0.014, longitude: baseLng + 0.018 }
      });
    }

    // Driver C: ~3.5km away (outside 2000m geofence)
    if (driverC) {
      await prisma.userLocation.upsert({
        where: { userId: driverC.id },
        update: { latitude: baseLat - 0.035, longitude: baseLng - 0.030, updatedAt: new Date() },
        create: { userId: driverC.id, latitude: baseLat - 0.035, longitude: baseLng - 0.030 }
      });
    }

    // 2. Create Emergency
    const emergency = await emergencyService.createEmergency({
      pickupLatitude: patientLat,
      pickupLongitude: patientLng,
      pickupAddress: `${config.demoCity} Sector 7 Junction, Incident Spot`,
      hospitalId: hospital.id,
      priority: EmergencyPriority.CRITICAL,
      ambulanceId: ambulance.id,
      driverId: ambDriver?.id
    });

    this.currentEmergencyId = emergency.id;

    // 3. Start Emergency & Calculate Route
    const startedEmergency = await emergencyService.startEmergency(emergency.id);
    const activeRoute = startedEmergency.routes[0];
    const polyline: [number, number][] = JSON.parse(activeRoute.polylineJson);

    logger.info('Demo Emergency started', {
      emergencyId: emergency.id,
      waypoints: polyline.length
    });

    if (autoProgress) {
      this.runAutomatedWaypoints(emergency.id, ambulance.id, polyline, hospital.id);
    }

    return {
      emergencyId: emergency.id,
      message: 'Demo emergency started successfully with full Passage Corridor simulation'
    };
  }

  private runAutomatedWaypoints(
    emergencyId: string,
    ambulanceId: string,
    toPatientPolyline: [number, number][],
    hospitalId: string
  ) {
    let waypointIndex = 0;
    const totalWaypoints = toPatientPolyline.length;
    let phase: 'to_patient' | 'at_patient' | 'to_hospital' | 'completed' = 'to_patient';
    let toHospitalPolyline: [number, number][] = [];

    this.activeSimulationInterval = setInterval(async () => {
      try {
        if (phase === 'to_patient') {
          if (waypointIndex < totalWaypoints) {
            const coord = toPatientPolyline[waypointIndex];
            const currentLoc: LatLng = { latitude: coord[0], longitude: coord[1] };

            await ambulanceService.updateLocation(ambulanceId, {
              ...currentLoc,
              speed: 52,
              heading: 45,
              accuracy: 5
            });

            const { alertedDriversCount } = await passageNetworkService.processAmbulanceMovement(
              ambulanceId,
              emergencyId,
              currentLoc,
              52
            );

            this.logStep(
              waypointIndex + 1,
              `Ambulance en route to patient - Waypoint ${waypointIndex + 1}/${totalWaypoints}`,
              currentLoc,
              alertedDriversCount
            );

            waypointIndex++;
          } else {
            // Reached patient!
            phase = 'at_patient';
            await emergencyService.arriveAtPatient(emergencyId);
            this.logStep(
              waypointIndex,
              'Ambulance arrived at patient location',
              { latitude: toPatientPolyline[totalWaypoints - 1][0], longitude: toPatientPolyline[totalWaypoints - 1][1] },
              0
            );

            // Wait 4 seconds, then pickup patient and route to hospital
            setTimeout(async () => {
              try {
                await emergencyService.pickupPatient(emergencyId);
                const hospitalEmergency = await emergencyService.startHospitalRoute(emergencyId, hospitalId);
                const hRoute = hospitalEmergency.routes[0];
                toHospitalPolyline = JSON.parse(hRoute.polylineJson);
                waypointIndex = 0;
                phase = 'to_hospital';
              } catch (err) {
                logger.error('Error starting hospital route during demo', err);
              }
            }, 3000);
          }
        } else if (phase === 'to_hospital') {
          if (waypointIndex < toHospitalPolyline.length) {
            const coord = toHospitalPolyline[waypointIndex];
            const currentLoc: LatLng = { latitude: coord[0], longitude: coord[1] };

            await ambulanceService.updateLocation(ambulanceId, {
              ...currentLoc,
              speed: 58,
              heading: 60,
              accuracy: 5
            });

            const { alertedDriversCount } = await passageNetworkService.processAmbulanceMovement(
              ambulanceId,
              emergencyId,
              currentLoc,
              58
            );

            this.logStep(
              waypointIndex + 1,
              `Ambulance en route to hospital - Transit Waypoint ${waypointIndex + 1}/${toHospitalPolyline.length}`,
              currentLoc,
              alertedDriversCount
            );

            waypointIndex++;
          } else {
            // Reached hospital and complete!
            phase = 'completed';
            await emergencyService.arriveAtHospital(emergencyId);
            await emergencyService.completeEmergency(emergencyId);
            this.stopDemoSimulation();
            this.logStep(
              waypointIndex,
              'Ambulance safely arrived at Hospital Trauma Center. Emergency COMPLETED.',
              { latitude: toHospitalPolyline[toHospitalPolyline.length - 1][0], longitude: toHospitalPolyline[toHospitalPolyline.length - 1][1] },
              0
            );
          }
        }
      } catch (err: any) {
        logger.error('Demo simulation tick error', err);
        this.stopDemoSimulation();
      }
    }, 2500); // 2.5s step interval for smooth real-time viewing
  }

  private logStep(step: number, description: string, ambulanceLocation: LatLng, alertedCount: number) {
    this.simulationLogs.push({
      step,
      description,
      ambulanceLocation,
      alertedCount,
      driverStatuses: {
        'Driver A (500m)': alertedCount > 0 ? 'ALERTED (Give Way)' : 'PASSED/CLEAR',
        'Driver B (1.2km)': alertedCount > 1 ? 'ALERTED (Approaching)' : 'CLEAR',
        'Driver C (3.5km)': 'NO ALERT (Out of Range)'
      },
      timestamp: new Date().toISOString()
    });
  }

  stopDemoSimulation() {
    if (this.activeSimulationInterval) {
      clearInterval(this.activeSimulationInterval);
      this.activeSimulationInterval = null;
    }
  }

  getDemoStatus() {
    return {
      isRunning: this.activeSimulationInterval !== null,
      emergencyId: this.currentEmergencyId,
      logs: this.simulationLogs.slice(-10)
    };
  }
}

export const demoService = new DemoService();
