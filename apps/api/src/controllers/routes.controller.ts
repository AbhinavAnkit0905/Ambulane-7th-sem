import { Request, Response, NextFunction } from 'express';
import { routingProvider, trafficProvider, geocodingProvider } from '../providers';
import { z } from 'zod';

export const routeQuerySchema = z.object({
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }),
  priority: z.string().optional()
});

export class RoutesController {
  async calculateNormalRoute(req: Request, res: Response, next: NextFunction) {
    try {
      const { origin, destination } = req.body;
      const route = await routingProvider.calculateRoute(origin, destination, false);

      const trafficAnnotation = await trafficProvider.getTrafficAnnotation(
        origin,
        destination,
        route.geometry
      );

      res.json({
        ...route,
        duration: route.duration + trafficAnnotation.delaySeconds,
        trafficMessage: trafficAnnotation.statusMessage,
        isTrafficLive: trafficAnnotation.isLive
      });
    } catch (err) {
      next(err);
    }
  }

  async calculateEmergencyRoute(req: Request, res: Response, next: NextFunction) {
    try {
      const { origin, destination, priority } = req.body;
      const route = await routingProvider.calculateRoute(origin, destination, true);

      const trafficAnnotation = await trafficProvider.getTrafficAnnotation(
        origin,
        destination,
        route.geometry
      );

      res.json({
        ...route,
        priority: priority || 'HIGH',
        duration: route.duration + trafficAnnotation.delaySeconds,
        trafficMessage: trafficAnnotation.statusMessage,
        isTrafficLive: trafficAnnotation.isLive
      });
    } catch (err) {
      next(err);
    }
  }

  async recalculateRoute(req: Request, res: Response, next: NextFunction) {
    return this.calculateEmergencyRoute(req, res, next);
  }

  async searchPlaces(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req.query.q as string) || '';
      if (!query.trim()) {
        res.json([]);
        return;
      }
      const results = await geocodingProvider.search(query);
      res.json(results);
    } catch (err) {
      next(err);
    }
  }

  async reverseGeocode(req: Request, res: Response, next: NextFunction) {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (isNaN(lat) || isNaN(lng)) {
        res.status(400).json({ error: 'Valid lat and lng required' });
        return;
      }
      const address = await geocodingProvider.reverse(lat, lng);
      res.json({ address });
    } catch (err) {
      next(err);
    }
  }
}

export const routesController = new RoutesController();
