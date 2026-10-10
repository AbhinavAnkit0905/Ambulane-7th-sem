import { prisma } from '@smart-ambulance/database';
import { AmbulanceStatus, LocationUpdatePayload, SOCKET_EVENTS } from '@smart-ambulance/shared';
import { getSocketServer } from '../socket';

export class AmbulanceService {
  async getAllAmbulances() {
    return prisma.ambulance.findMany({
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        emergencies: {
          where: {
            status: {
              notIn: ['COMPLETED', 'CANCELLED']
            }
          },
          take: 1
        }
      },
      orderBy: { registrationNumber: 'asc' }
    });
  }

  async getAmbulanceById(id: string) {
    return prisma.ambulance.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        emergencies: {
          where: {
            status: {
              notIn: ['COMPLETED', 'CANCELLED']
            }
          },
          include: {
            hospital: true,
            routes: { orderBy: { createdAt: 'desc' }, take: 1 }
          },
          take: 1
        }
      }
    });
  }

  async updateStatus(id: string, status: AmbulanceStatus) {
    const updated = await prisma.ambulance.update({
      where: { id },
      data: { status }
    });

    const io = getSocketServer();
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.AMBULANCE_STATUS_CHANGED, {
        ambulanceId: id,
        status
      });
    }

    return updated;
  }

  async updateLocation(ambulanceId: string, payload: LocationUpdatePayload) {
    // 1. Update ambulance current location
    const updated = await prisma.ambulance.update({
      where: { id: ambulanceId },
      data: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed ?? null,
        heading: payload.heading ?? null,
        accuracy: payload.accuracy ?? null,
        lastLocationUpdate: new Date()
      }
    });

    // 2. Find any active emergency for this ambulance
    const activeEmergency = await prisma.emergency.findFirst({
      where: {
        ambulanceId,
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'CREATED', 'ASSIGNED']
        }
      },
      include: {
        routes: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    // 3. Persist location log
    await prisma.ambulanceLocation.create({
      data: {
        ambulanceId,
        emergencyId: activeEmergency?.id || null,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed ?? null,
        heading: payload.heading ?? null,
        accuracy: payload.accuracy ?? null
      }
    });

    // 4. Broadcast to Admin & Emergency room
    const io = getSocketServer();
    if (io) {
      const socketPayload = {
        ambulanceId,
        emergencyId: activeEmergency?.id || null,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed,
        heading: payload.heading,
        accuracy: payload.accuracy,
        timestamp: new Date().toISOString()
      };

      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit(SOCKET_EVENTS.AMBULANCE_LOCATION, socketPayload);

      if (activeEmergency) {
        io.to(`emergency:${activeEmergency.id}`).emit(SOCKET_EVENTS.AMBULANCE_LOCATION, socketPayload);
      }
    }

    return { ambulance: updated, activeEmergency };
  }
}

export const ambulanceService = new AmbulanceService();
