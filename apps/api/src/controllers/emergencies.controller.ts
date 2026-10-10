import { Request, Response, NextFunction } from 'express';
import { emergencyService } from '../services/emergency.service';
import { EmergencyPriority, EmergencyStatus } from '@smart-ambulance/shared';
import { z } from 'zod';

export const createEmergencySchema = z.object({
  pickupLatitude: z.number().min(-90).max(90),
  pickupLongitude: z.number().min(-180).max(180),
  pickupAddress: z.string().min(3),
  hospitalId: z.string().optional(),
  priority: z.nativeEnum(EmergencyPriority).optional(),
  ambulanceId: z.string().optional(),
  driverId: z.string().optional()
});

export const hospitalRouteSchema = z.object({
  hospitalId: z.string().optional()
});

export class EmergenciesController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const statusFilter = req.query.status as EmergencyStatus | undefined;
      const emergencies = await emergencyService.getAllEmergencies(statusFilter);
      res.json(emergencies);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const emergency = await emergencyService.getEmergencyById(req.params.id);
      if (!emergency) {
        res.status(404).json({ error: 'Emergency not found' });
        return;
      }
      res.json(emergency);
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const emergency = await emergencyService.createEmergency(req.body);
      res.status(201).json(emergency);
    } catch (err) {
      next(err);
    }
  }

  async start(req: Request, res: Response, next: NextFunction) {
    try {
      const currentLocation =
        req.body?.latitude !== undefined && req.body?.longitude !== undefined
          ? { latitude: Number(req.body.latitude), longitude: Number(req.body.longitude) }
          : undefined;
      const result = await emergencyService.startEmergency(req.params.id, req.user?.id, currentLocation);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async arrivePatient(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emergencyService.arriveAtPatient(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async pickupPatient(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emergencyService.pickupPatient(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async startHospitalRoute(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emergencyService.startHospitalRoute(req.params.id, req.body.hospitalId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async arriveHospital(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emergencyService.arriveAtHospital(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emergencyService.completeEmergency(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await emergencyService.cancelEmergency(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}

export const emergenciesController = new EmergenciesController();
