import { prisma } from '@smart-ambulance/database';
import {
  EmergencyStatus,
  EmergencyPriority,
  AmbulanceStatus,
  SOCKET_EVENTS,
  assertValidEmergencyTransition,
  LatLng
} from '@smart-ambulance/shared';
import { routingProvider, trafficProvider } from '../providers';
import { passageNetworkService } from './passage-network.service';
import { getSocketServer } from '../socket';
import { logger } from '../logger';

export class EmergencyService {
  async getAllEmergencies(statusFilter?: EmergencyStatus) {
    return prisma.emergency.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      include: {
        ambulance: true,
        driver: { select: { id: true, name: true, phone: true } },
        hospital: true,
        routes: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: {
          select: {
            alerts: { where: { status: 'ACTIVE' } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getEmergencyById(id: string) {
    return prisma.emergency.findUnique({
      where: { id },
      include: {
        ambulance: true,
        driver: { select: { id: true, name: true, phone: true } },
        hospital: true,
        routes: { orderBy: { createdAt: 'desc' }, take: 1 },
        alerts: {
          include: { user: { select: { id: true, name: true } } }
        }
      }
    });
  }

  async createEmergency(data: {
    pickupLatitude: number;
    pickupLongitude: number;
    pickupAddress: string;
    hospitalId?: string;
    priority?: EmergencyPriority;
    ambulanceId?: string;
    driverId?: string;
  }) {
    const count = await prisma.emergency.count();
    const emergencyNumber = `EMG-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const emergency = await prisma.emergency.create({
      data: {
        emergencyNumber,
        pickupLatitude: data.pickupLatitude,
        pickupLongitude: data.pickupLongitude,
        pickupAddress: data.pickupAddress,
        hospitalId: data.hospitalId || null,
        priority: data.priority || EmergencyPriority.HIGH,
        ambulanceId: data.ambulanceId || null,
        driverId: data.driverId || null,
        status: data.ambulanceId ? EmergencyStatus.ASSIGNED : EmergencyStatus.CREATED
      },
      include: {
        ambulance: true,
        hospital: true
      }
    });

    if (data.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: data.ambulanceId },
        data: { status: AmbulanceStatus.ASSIGNED }
      });
    }

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_CREATED, emergency);
    }

    return emergency;
  }

  async startEmergency(id: string, driverId?: string, currentLocation?: LatLng) {
    const emergency = await prisma.emergency.findUnique({
      where: { id },
      include: { ambulance: true, hospital: true }
    });

    if (!emergency) throw new Error('Emergency not found');
    if (!emergency.ambulanceId || !emergency.ambulance) {
      throw new Error('Cannot start emergency: No ambulance assigned');
    }

    if (driverId) {
      if (emergency.driverId && emergency.driverId !== driverId) {
        throw new Error('Unauthorized: You are not the driver assigned to this emergency');
      }
      if (!emergency.driverId) {
        await prisma.emergency.update({ where: { id }, data: { driverId } });
      }
      if (emergency.ambulance && !emergency.ambulance.driverId) {
        await prisma.ambulance.update({ where: { id: emergency.ambulance.id }, data: { driverId } });
      }
    }

    assertValidEmergencyTransition(
      emergency.status as EmergencyStatus,
      EmergencyStatus.EN_ROUTE_TO_PATIENT
    );

    if (currentLocation && emergency.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: emergency.ambulanceId },
        data: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          lastLocationUpdate: new Date()
        }
      });
    }

    const ambulance = emergency.ambulance;
    const ambLat = currentLocation?.latitude ?? ambulance.latitude ?? emergency.pickupLatitude - 0.02;
    const ambLng = currentLocation?.longitude ?? ambulance.longitude ?? emergency.pickupLongitude - 0.02;

    // Calculate initial emergency route towards patient
    const origin: LatLng = { latitude: ambLat, longitude: ambLng };
    const destination: LatLng = {
      latitude: emergency.pickupLatitude,
      longitude: emergency.pickupLongitude
    };

    const routeCalc = await routingProvider.calculateRoute(origin, destination, true);
    const trafficAnnotation = await trafficProvider.getTrafficAnnotation(
      origin,
      destination,
      routeCalc.geometry
    );

    // Save route record
    const routeRecord = await prisma.emergencyRoute.create({
      data: {
        emergencyId: emergency.id,
        originLat: origin.latitude,
        originLng: origin.longitude,
        destLat: destination.latitude,
        destLng: destination.longitude,
        distance: routeCalc.distance,
        duration: routeCalc.duration + trafficAnnotation.delaySeconds,
        polylineJson: JSON.stringify(routeCalc.geometry),
        stepsJson: JSON.stringify(routeCalc.steps),
        isEmergencyMode: true,
        provider: routeCalc.provider,
        trafficStatus: trafficAnnotation.statusMessage
      }
    });

    // Update emergency & ambulance state
    const updated = await prisma.emergency.update({
      where: { id },
      data: {
        status: EmergencyStatus.EN_ROUTE_TO_PATIENT,
        startedAt: new Date(),
        routeId: routeRecord.id
      },
      include: {
        ambulance: true,
        hospital: true,
        routes: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    await prisma.ambulance.update({
      where: { id: emergency.ambulanceId },
      data: { status: AmbulanceStatus.EN_ROUTE_TO_PATIENT }
    });

    // Activate Emergency Passage Network
    await passageNetworkService.processAmbulanceMovement(
      emergency.ambulanceId,
      emergency.id,
      origin,
      50
    );

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_STARTED, updated);
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.AMBULANCE_STARTED, {
        ambulanceId: emergency.ambulanceId,
        emergencyId: emergency.id,
        routeId: routeRecord.id
      });
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.AMBULANCE_ROUTE_UPDATED, {
        emergencyId: emergency.id,
        route: routeRecord
      });
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.EMERGENCY_STARTED, updated);
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.AMBULANCE_STARTED, {
        ambulanceId: emergency.ambulanceId,
        emergencyId: emergency.id,
        routeId: routeRecord.id
      });
    }

    return updated;
  }

  async arriveAtPatient(id: string) {
    const emergency = await prisma.emergency.findUnique({
      where: { id },
      include: { ambulance: true }
    });
    if (!emergency) throw new Error('Emergency not found');

    assertValidEmergencyTransition(
      emergency.status as EmergencyStatus,
      EmergencyStatus.AT_PATIENT
    );

    const updated = await prisma.emergency.update({
      where: { id },
      data: {
        status: EmergencyStatus.AT_PATIENT,
        patientArrivalAt: new Date()
      },
      include: { ambulance: true, hospital: true, routes: { take: 1 } }
    });

    if (emergency.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: emergency.ambulanceId },
        data: { status: AmbulanceStatus.AT_PATIENT }
      });
    }

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
    }

    return updated;
  }

  async pickupPatient(id: string) {
    const emergency = await prisma.emergency.findUnique({
      where: { id },
      include: { ambulance: true }
    });
    if (!emergency) throw new Error('Emergency not found');

    assertValidEmergencyTransition(
      emergency.status as EmergencyStatus,
      EmergencyStatus.PATIENT_PICKED_UP
    );

    const updated = await prisma.emergency.update({
      where: { id },
      data: {
        status: EmergencyStatus.PATIENT_PICKED_UP,
        patientPickupAt: new Date()
      },
      include: { ambulance: true, hospital: true }
    });

    if (emergency.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: emergency.ambulanceId },
        data: { status: AmbulanceStatus.PATIENT_ONBOARD }
      });
    }

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
    }

    return updated;
  }

  async startHospitalRoute(id: string, hospitalId?: string) {
    const emergency = await prisma.emergency.findUnique({
      where: { id },
      include: { ambulance: true, hospital: true }
    });
    if (!emergency) throw new Error('Emergency not found');

    assertValidEmergencyTransition(
      emergency.status as EmergencyStatus,
      EmergencyStatus.EN_ROUTE_TO_HOSPITAL
    );

    const targetHospitalId = hospitalId || emergency.hospitalId;
    if (!targetHospitalId) {
      throw new Error('Destination hospital must be selected before routing');
    }

    const hospital = await prisma.hospital.findUnique({ where: { id: targetHospitalId } });
    if (!hospital) throw new Error('Destination hospital not found');

    const origin: LatLng = {
      latitude: emergency.ambulance?.latitude ?? emergency.pickupLatitude,
      longitude: emergency.ambulance?.longitude ?? emergency.pickupLongitude
    };
    const destination: LatLng = {
      latitude: hospital.latitude,
      longitude: hospital.longitude
    };

    const routeCalc = await routingProvider.calculateRoute(origin, destination, true);
    const trafficAnnotation = await trafficProvider.getTrafficAnnotation(
      origin,
      destination,
      routeCalc.geometry
    );

    const routeRecord = await prisma.emergencyRoute.create({
      data: {
        emergencyId: emergency.id,
        originLat: origin.latitude,
        originLng: origin.longitude,
        destLat: destination.latitude,
        destLng: destination.longitude,
        distance: routeCalc.distance,
        duration: routeCalc.duration + trafficAnnotation.delaySeconds,
        polylineJson: JSON.stringify(routeCalc.geometry),
        stepsJson: JSON.stringify(routeCalc.steps),
        isEmergencyMode: true,
        provider: routeCalc.provider,
        trafficStatus: trafficAnnotation.statusMessage
      }
    });

    const updated = await prisma.emergency.update({
      where: { id },
      data: {
        status: EmergencyStatus.EN_ROUTE_TO_HOSPITAL,
        hospitalId: targetHospitalId,
        routeId: routeRecord.id
      },
      include: {
        ambulance: true,
        hospital: true,
        routes: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    if (emergency.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: emergency.ambulanceId },
        data: { status: AmbulanceStatus.EN_ROUTE_TO_HOSPITAL }
      });

      // Update corridor for new route to hospital
      await passageNetworkService.processAmbulanceMovement(
        emergency.ambulanceId,
        emergency.id,
        origin,
        55
      );
    }

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.AMBULANCE_ROUTE_UPDATED, {
        emergencyId: emergency.id,
        route: routeRecord
      });
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.AMBULANCE_ROUTE_UPDATED, {
        emergencyId: emergency.id,
        route: routeRecord
      });
      io.to(`hospital:${targetHospitalId}`).emit('hospital:incoming_emergency', updated);
    }

    return updated;
  }

  async arriveAtHospital(id: string) {
    const emergency = await prisma.emergency.findUnique({
      where: { id },
      include: { ambulance: true }
    });
    if (!emergency) throw new Error('Emergency not found');

    assertValidEmergencyTransition(
      emergency.status as EmergencyStatus,
      EmergencyStatus.AT_HOSPITAL
    );

    const updated = await prisma.emergency.update({
      where: { id },
      data: {
        status: EmergencyStatus.AT_HOSPITAL,
        hospitalArrivalAt: new Date()
      },
      include: { ambulance: true, hospital: true }
    });

    if (emergency.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: emergency.ambulanceId },
        data: { status: AmbulanceStatus.AT_HOSPITAL }
      });
    }

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.EMERGENCY_UPDATED, updated);
    }

    return updated;
  }

  async completeEmergency(id: string) {
    const emergency = await prisma.emergency.findUnique({
      where: { id },
      include: {
        ambulance: true,
        routes: true,
        alerts: true
      }
    });
    if (!emergency) throw new Error('Emergency not found');

    assertValidEmergencyTransition(
      emergency.status as EmergencyStatus,
      EmergencyStatus.COMPLETED
    );

    const completedAt = new Date();
    const updated = await prisma.emergency.update({
      where: { id },
      data: {
        status: EmergencyStatus.COMPLETED,
        completedAt
      },
      include: { ambulance: true, hospital: true }
    });

    // 1. Reset ambulance back to AVAILABLE (Requirement 77)
    if (emergency.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: emergency.ambulanceId },
        data: { status: AmbulanceStatus.AVAILABLE }
      });
    }

    // 2. Terminate all passage alerts (Requirement 41 & 77)
    await passageNetworkService.expireAllAlertsForEmergency(id);

    // 3. Record trip analytics
    const totalDistance = emergency.routes.reduce((acc: number, r: any) => acc + r.distance, 0);
    const durationSeconds = emergency.startedAt
      ? Math.round((completedAt.getTime() - emergency.startedAt.getTime()) / 1000)
      : 0;
    const responseTimeSeconds = emergency.patientArrivalAt && emergency.startedAt
      ? Math.round((emergency.patientArrivalAt.getTime() - emergency.startedAt.getTime()) / 1000)
      : null;

    if (emergency.ambulanceId) {
      await prisma.trip.create({
        data: {
          emergencyId: emergency.id,
          ambulanceId: emergency.ambulanceId,
          driverId: emergency.driverId,
          distanceMeters: totalDistance,
          durationSeconds,
          alertCount: emergency.alerts.length,
          responseTimeSeconds,
          startedAt: emergency.startedAt || emergency.createdAt,
          completedAt
        }
      });
    }

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_COMPLETED, updated);
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.EMERGENCY_COMPLETED, updated);
    }

    logger.info('Emergency response successfully completed and logged', {
      emergencyId: id,
      durationSeconds,
      alertsCount: emergency.alerts.length
    });

    return updated;
  }

  async cancelEmergency(id: string) {
    const emergency = await prisma.emergency.findUnique({ where: { id } });
    if (!emergency) throw new Error('Emergency not found');

    const updated = await prisma.emergency.update({
      where: { id },
      data: { status: EmergencyStatus.CANCELLED }
    });

    if (emergency.ambulanceId) {
      await prisma.ambulance.update({
        where: { id: emergency.ambulanceId },
        data: { status: AmbulanceStatus.AVAILABLE }
      });
    }

    await passageNetworkService.expireAllAlertsForEmergency(id);

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.EMERGENCY_CANCELLED, updated);
      io.to(`emergency:${id}`).emit(SOCKET_EVENTS.EMERGENCY_CANCELLED, updated);
    }

    return updated;
  }
}

export const emergencyService = new EmergencyService();
