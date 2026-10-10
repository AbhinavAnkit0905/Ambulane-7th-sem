import { Request, Response, NextFunction } from 'express';
import { prisma } from '@smart-ambulance/database';
import { AlertStatus } from '@smart-ambulance/shared';

export class AlertsController {
  async getMyAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const alerts = await prisma.emergencyAlert.findMany({
        where: {
          userId,
          status: AlertStatus.ACTIVE
        },
        include: {
          emergency: {
            include: {
              ambulance: true
            }
          }
        },
        orderBy: { lastUpdatedAt: 'desc' }
      });

      const formatted = alerts.map((a) => ({
        alertId: a.id,
        emergencyId: a.emergencyId,
        emergencyNumber: a.emergency.emergencyNumber,
        ambulanceId: a.emergency.ambulance?.id || '',
        ambulanceRegistration: a.emergency.ambulance?.registrationNumber || 'EMERGENCY',
        distanceMeters: Math.round(a.lastDistance),
        etaSeconds: Math.round(a.lastEtaSeconds),
        priorityLevel: a.priorityLevel,
        status: a.status,
        ambulanceLocation: {
          latitude: a.emergency.ambulance?.latitude || 0,
          longitude: a.emergency.ambulance?.longitude || 0
        },
        safeInstruction: a.safeInstruction,
        updatedAt: a.lastUpdatedAt.toISOString()
      }));

      res.json(formatted);
    } catch (err) {
      next(err);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updated = await prisma.emergencyAlert.update({
        where: { id },
        data: {
          status: AlertStatus.DISMISSED
        }
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
}

export const alertsController = new AlertsController();
