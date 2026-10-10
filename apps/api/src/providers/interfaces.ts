import { LatLng, RouteCalculationResult, NewsArticleSummary, WeatherData } from '@smart-ambulance/shared';

export interface IRoutingProvider {
  calculateRoute(
    origin: LatLng,
    destination: LatLng,
    isEmergency?: boolean
  ): Promise<RouteCalculationResult>;
}

export interface ITrafficProvider {
  name: string;
  isLive: boolean;
  getTrafficAnnotation(
    origin: LatLng,
    destination: LatLng,
    polyline: [number, number][]
  ): Promise<{
    statusMessage: string;
    speedFactor: number; // 1.0 = normal, 0.7 = heavy, etc.
    delaySeconds: number;
    isLive: boolean;
  }>;
}

export interface GeocodingResult {
  displayName: string;
  latitude: number;
  longitude: number;
  type?: string;
}

export interface IGeocodingProvider {
  search(query: string): Promise<GeocodingResult[]>;
  reverse(lat: number, lng: number): Promise<string | null>;
}

export interface INewsProvider {
  getArticles(lat?: number, lng?: number, category?: string): Promise<NewsArticleSummary[]>;
}

export interface IWeatherProvider {
  getWeather(lat: number, lng: number): Promise<WeatherData | null>;
}

export interface INotificationProvider {
  sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<boolean>;
}
