import { IRoutingProvider } from '../interfaces';
import { LatLng, RouteCalculationResult, RouteStep } from '@smart-ambulance/shared';
import { calculateHaversineDistance } from '@smart-ambulance/shared';
import { config } from '../../config';
import { logger } from '../../logger';

export class OSRMProvider implements IRoutingProvider {
  private baseUrl: string;

  constructor(baseUrl: string = config.osrmBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async calculateRoute(
    origin: LatLng,
    destination: LatLng,
    isEmergency: boolean = false
  ): Promise<RouteCalculationResult> {
    const url = `${this.baseUrl}/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(url, {
        headers: { 'User-Agent': 'SmartAmbulancePlatform/1.0' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OSRM responded with HTTP status ${response.status}`);
      }

      const data = await response.json();
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No route found by OSRM');
      }

      const route = data.routes[0];
      const distanceMeters = Math.round(route.distance);
      let durationSeconds = Math.round(route.duration);

      // Emergency vehicles travel faster on clear passage (approx 20-25% faster than standard traffic)
      if (isEmergency) {
        durationSeconds = Math.max(30, Math.round(durationSeconds * 0.78));
      }

      // GeoJSON coordinates come as [longitude, latitude] -> convert to [latitude, longitude]
      const geometry: [number, number][] = (route.geometry.coordinates || []).map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );

      // Map steps
      const steps: RouteStep[] = [];
      if (route.legs && route.legs[0] && route.legs[0].steps) {
        for (const step of route.legs[0].steps) {
          steps.push({
            instruction: step.maneuver?.instruction || (step.name ? `Continue on ${step.name}` : 'Continue straight'),
            distance: Math.round(step.distance),
            duration: Math.round(step.duration),
            name: step.name || '',
            maneuver: {
              type: step.maneuver?.type || 'straight',
              modifier: step.maneuver?.modifier,
              location: step.maneuver?.location || [0, 0]
            }
          });
        }
      }

      return {
        distance: distanceMeters,
        duration: durationSeconds,
        geometry,
        steps,
        provider: 'OSRM (OpenStreetMap)',
        isTrafficLive: false,
        trafficMessage: 'Live traffic unavailable'
      };
    } catch (error: any) {
      logger.warn('OSRM routing request failed, activating resilient geometric fallback', {
        error: error.message,
        origin,
        destination
      });

      // Resilient fallback: Generate intermediate interpolated path points
      return this.generateInterpolatedFallbackRoute(origin, destination, isEmergency);
    }
  }

  private generateInterpolatedFallbackRoute(
    origin: LatLng,
    destination: LatLng,
    isEmergency: boolean
  ): RouteCalculationResult {
    const directDistance = calculateHaversineDistance(origin, destination);
    // Road factor approx 1.35x direct line
    const roadDistance = Math.round(directDistance * 1.35);

    // Speed approx 40 km/h (11 m/s) or 55 km/h for emergency (15 m/s)
    const speed = isEmergency ? 15.2 : 11.1;
    const duration = Math.max(20, Math.round(roadDistance / speed));

    // Interpolate 12 points along the way
    const geometry: [number, number][] = [];
    const stepsCount = 12;
    for (let i = 0; i <= stepsCount; i++) {
      const frac = i / stepsCount;
      const lat = origin.latitude + (destination.latitude - origin.latitude) * frac;
      const lng = origin.longitude + (destination.longitude - origin.longitude) * frac;
      geometry.push([lat, lng]);
    }

    return {
      distance: roadDistance,
      duration,
      geometry,
      steps: [
        {
          instruction: 'Proceed toward emergency destination',
          distance: roadDistance,
          duration,
          name: 'Main Route'
        }
      ],
      provider: 'Internal Geometric Resilient Provider',
      isTrafficLive: false,
      trafficMessage: 'Live traffic unavailable (Direct estimate)'
    };
  }
}
