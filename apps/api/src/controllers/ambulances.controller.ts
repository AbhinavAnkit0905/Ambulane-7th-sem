import { Request, Response, NextFunction } from 'express';
import { ambulanceService } from '../services/ambulance.service';
import { passageNetworkService } from '../services/passage-network.service';
import { AmbulanceStatus, UserRole } from '@smart-ambulance/shared';
import { z } from 'zod';

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().optional(),
  heading: z.number().optional(),
  accuracy: z.number().optional(),
  timestamp: z.union([z.number(), z.string()]).optional()
});

export const statusSchema = z.object({
  status: z.nativeEnum(AmbulanceStatus)
});

export class AmbulancesController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const ambulances = await ambulanceService.getAllAmbulances();
      res.json(ambulances);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const ambulance = await ambulanceService.getAmbulanceById(req.params.id);
      if (!ambulance) {
        res.status(404).json({ error: 'Ambulance not found' });
        return;
      }
      res.json(ambulance);
    } catch (err) {
      next(err);
    }
  }

  async updateLocation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Driver ownership check (Requirement 51)
      if (req.user && req.user.role === UserRole.AMBULANCE_DRIVER) {
        const amb = await ambulanceService.getAmbulanceById(id);
        if (amb && amb.driverId && amb.driverId !== req.user.id) {
          res.status(403).json({ error: 'Forbidden: You are not the assigned driver for this ambulance' });
          return;
        }
      }

      // Anti-spoofing validation (Requirement 52)
      if (req.body.speed !== undefined && (req.body.speed < 0 || req.body.speed > 200)) {
        req.body.speed = Math.min(Math.max(0, req.body.speed), 160);
      }

      const { ambulance, activeEmergency } = await ambulanceService.updateLocation(id, req.body);

      let alertedCount = 0;
      if (activeEmergency) {
        const result = await passageNetworkService.processAmbulanceMovement(
          id,
          activeEmergency.id,
          { latitude: req.body.latitude, longitude: req.body.longitude },
          req.body.speed ?? 45
        );
        alertedCount = result.alertedDriversCount;
      }

      res.json({
        success: true,
        ambulanceId: id,
        hasActiveEmergency: !!activeEmergency,
        alertedDriversCount: alertedCount,
        lastLocationUpdate: ambulance.lastLocationUpdate
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updated = await ambulanceService.updateStatus(id, status);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
}

export const ambulancesController = new AmbulancesController();
