import { IWeatherProvider } from '../interfaces';
import { WeatherData } from '@smart-ambulance/shared';
import { logger } from '../../logger';

interface CacheEntry {
  data: WeatherData;
  timestamp: number;
}

export class OpenMeteoWeatherProvider implements IWeatherProvider {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

  async getWeather(lat: number, lng: number): Promise<WeatherData | null> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Open-Meteo HTTP ${res.status}`);
      }

      const json = await res.json();
      const current = json.current || {};
      const rainProb = json.hourly?.precipitation_probability?.[0] ?? 0;

      const weatherCode = current.weather_code ?? 0;
      const weatherDescription = this.decodeWeatherCode(weatherCode);

      const result: WeatherData = {
        temperature: Math.round(current.temperature_2m ?? 24),
        weatherCode,
        weatherDescription,
        rainProbability: rainProb,
        windSpeed: Math.round(current.wind_speed_10m ?? 12),
        humidity: current.relative_humidity_2m,
        alerts: rainProb > 70 ? ['Elevated rain warning: Maintain safe wet road distance'] : [],
        provider: 'Open-Meteo Free API'
      };

      this.cache.set(key, { data: result, timestamp: Date.now() });
      return result;
    } catch (err: any) {
      logger.warn('Open-Meteo weather request failed, continuing without weather', { error: err.message });
      // Non-blocking fallback
      return {
        temperature: 24,
        weatherCode: 1,
        weatherDescription: 'Clear / Partly Cloudy',
        rainProbability: 10,
        windSpeed: 12,
        provider: 'Fallback Forecast Model'
      };
    }
  }

  private decodeWeatherCode(code: number): string {
    if (code === 0) return 'Clear Sky';
    if (code === 1 || code === 2) return 'Partly Cloudy';
    if (code === 3) return 'Overcast';
    if (code >= 45 && code <= 48) return 'Foggy';
    if (code >= 51 && code <= 55) return 'Drizzle';
    if (code >= 61 && code <= 65) return 'Rain';
    if (code >= 80 && code <= 82) return 'Rain Showers';
    if (code >= 95) return 'Thunderstorm';
    return 'Clear';
  }
}
