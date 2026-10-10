import { Request, Response, NextFunction } from 'express';
import { hospitalService } from '../services/hospital.service';
import { z } from 'zod';

export const nearbyHospitalsQuerySchema = z.object({
  lat: z.string().transform(v => parseFloat(v)),
  lng: z.string().transform(v => parseFloat(v))
});

export class HospitalsController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const hospitals = await hospitalService.getAllHospitals();
      res.json(hospitals);
    } catch (err) {
      next(err);
    }
  }

  async getNearby(req: Request, res: Response, next: NextFunction) {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (isNaN(lat) || isNaN(lng)) {
        res.status(400).json({ error: 'Valid lat and lng query parameters required' });
        return;
      }

      const results = await hospitalService.getNearbyHospitals({ latitude: lat, longitude: lng });
      res.json(results);
    } catch (err) {
      next(err);
    }
  }

  async updateCapacity(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updated = await hospitalService.updateCapacity(id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
}

export const hospitalsController = new HospitalsController();
