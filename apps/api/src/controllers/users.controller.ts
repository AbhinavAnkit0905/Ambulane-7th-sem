import { Request, Response, NextFunction } from 'express';
import { prisma } from '@smart-ambulance/database';
import { passageNetworkService } from '../services/passage-network.service';
import { EmergencyStatus } from '@smart-ambulance/shared';
import { z } from 'zod';

export const userLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().optional(),
  heading: z.number().optional(),
  accuracy: z.number().optional()
});

export class UsersController {
  async updateLocation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { latitude, longitude, speed, heading, accuracy } = req.body;

      const record = await prisma.userLocation.upsert({
        where: { userId },
        update: {
          latitude,
          longitude,
          speed: speed ?? null,
          heading: heading ?? null,
          accuracy: accuracy ?? null,
          updatedAt: new Date()
        },
        create: {
          userId,
          latitude,
          longitude,
          speed: speed ?? null,
          heading: heading ?? null,
          accuracy: accuracy ?? null
        }
      });

      // Evaluate active emergency passage corridor (only vehicles within 3km receive alerts via WebSocket)
      const activeEmergencies = await prisma.emergency.findMany({
        where: {
          status: {
            in: [EmergencyStatus.EN_ROUTE_TO_PATIENT, EmergencyStatus.EN_ROUTE_TO_HOSPITAL]
          }
        },
        include: { ambulance: true }
      });

      for (const emg of activeEmergencies) {
        if (emg.ambulance && emg.ambulance.latitude && emg.ambulance.longitude) {
          passageNetworkService
            .processAmbulanceMovement(
              emg.ambulance.id,
              emg.id,
              { latitude: emg.ambulance.latitude, longitude: emg.ambulance.longitude },
              emg.ambulance.speed ?? 45
            )
            .catch(() => {});
        }
      }

      res.json({
        success: true,
        message: 'Location updated securely for 3km emergency passage network analysis',
        updatedAt: record.updatedAt
      });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          hospitalId: true,
          hospital: { select: { id: true, name: true } },
          ambulances: { select: { id: true, registrationNumber: true, status: true } }
        }
      });
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
}

export const usersController = new UsersController();
