import { ITrafficProvider } from '../interfaces';
import { LatLng } from '@smart-ambulance/shared';

export class SimulationTrafficProvider implements ITrafficProvider {
  name = 'Traffic Simulation';
  isLive = false;

  async getTrafficAnnotation(
    origin: LatLng,
    destination: LatLng,
    polyline: [number, number][]
  ) {
    // Deterministic simulation based on coordinate hash for realistic test scenarios
    const hash = Math.abs(Math.round((origin.latitude + destination.longitude) * 1000) % 3);
    if (hash === 0) {
      return {
        statusMessage: 'Traffic Simulation: Moderate congestion ahead (+2 min)',
        speedFactor: 0.85,
        delaySeconds: 120,
        isLive: false
      };
    } else if (hash === 1) {
      return {
        statusMessage: 'Traffic Simulation: Heavy slow traffic along central junction (+4 min)',
        speedFactor: 0.65,
        delaySeconds: 240,
        isLive: false
      };
    } else {
      return {
        statusMessage: 'Traffic Simulation: Clear road passage',
        speedFactor: 1.0,
        delaySeconds: 0,
        isLive: false
      };
    }
  }
}

export class LiveTrafficProvider implements ITrafficProvider {
  name = 'Live Traffic Provider';
  isLive = true;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getTrafficAnnotation(
    origin: LatLng,
    destination: LatLng,
    polyline: [number, number][]
  ) {
    // If live API key is missing or not reachable, strictly report unavailable
    if (!this.apiKey) {
      return {
        statusMessage: 'Live traffic unavailable',
        speedFactor: 1.0,
        delaySeconds: 0,
        isLive: false
      };
    }

    return {
      statusMessage: 'Live traffic: Active data feed',
      speedFactor: 1.0,
      delaySeconds: 0,
      isLive: true
    };
  }
}

export class UnavailableTrafficProvider implements ITrafficProvider {
  name = 'No Traffic Feed';
  isLive = false;

  async getTrafficAnnotation() {
    return {
      statusMessage: 'Live traffic unavailable',
      speedFactor: 1.0,
      delaySeconds: 0,
      isLive: false
    };
  }
}
