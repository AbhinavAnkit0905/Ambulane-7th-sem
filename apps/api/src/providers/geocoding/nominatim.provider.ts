import { IGeocodingProvider, GeocodingResult } from '../interfaces';
import { config } from '../../config';
import { logger } from '../../logger';

interface CacheEntry {
  data: any;
  timestamp: number;
}

export class NominatimProvider implements IGeocodingProvider {
  private baseUrl: string;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(baseUrl: string = config.nominatimBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async search(query: string): Promise<GeocodingResult[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    const cached = this.cache.get(`search:${trimmed}`);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'SmartAmbulanceEmergencyPlatform/1.0 (contact@emergency-passage.org)'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Nominatim error HTTP ${res.status}`);
      }

      const raw = await res.json();
      const results: GeocodingResult[] = raw.map((item: any) => ({
        displayName: item.display_name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        type: item.type || 'place'
      }));

      this.cache.set(`search:${trimmed}`, { data: results, timestamp: Date.now() });
      return results;
    } catch (err: any) {
      logger.warn('Nominatim search failed, returning fallback', { error: err.message });
      // Return predefined emergency landmarks around demo coordinates as fallback
      return this.getLocalLandmarks(query);
    }
  }

  async reverse(lat: number, lng: number): Promise<string | null> {
    const key = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/reverse?format=json&lat=${lat}&lon=${lng}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'SmartAmbulanceEmergencyPlatform/1.0'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const name = raw.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      this.cache.set(key, { data: name, timestamp: Date.now() });
      return name;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  private getLocalLandmarks(query: string): GeocodingResult[] {
    const baseLat = config.demoLat;
    const baseLng = config.demoLng;
    const landmarks = [
      {
        displayName: `${config.demoCity} Central Plaza & Metro Crossing`,
        latitude: baseLat,
        longitude: baseLng,
        type: 'landmark'
      },
      {
        displayName: `${config.demoCity} General Hospital Trauma Center`,
        latitude: baseLat + 0.035,
        longitude: baseLng + 0.025,
        type: 'hospital'
      },
      {
        displayName: `${config.demoCity} East Corridor Junction`,
        latitude: baseLat + 0.015,
        longitude: baseLng + 0.020,
        type: 'junction'
      },
      {
        displayName: `${config.demoCity} South Civic Center`,
        latitude: baseLat - 0.025,
        longitude: baseLng - 0.015,
        type: 'civic'
      }
    ];

    return landmarks.filter(l => l.displayName.toLowerCase().includes(query.toLowerCase()) || query.length <= 3);
  }
}
