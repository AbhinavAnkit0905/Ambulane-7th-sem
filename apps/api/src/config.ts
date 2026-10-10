import dotenv from 'dotenv';
import path from 'path';

// Load root .env or local .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod_12345678',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  socketUrl: process.env.SOCKET_URL || 'http://localhost:5000',

  // Providers
  mapTileUrl: process.env.MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  osrmBaseUrl: process.env.OSRM_BASE_URL || 'https://router.project-osrm.org',
  nominatimBaseUrl: process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org',

  trafficProvider: (process.env.TRAFFIC_PROVIDER || 'simulation') as 'simulation' | 'live' | 'none',
  trafficApiKey: process.env.TRAFFIC_API_KEY || '',

  newsProvider: (process.env.NEWS_PROVIDER || 'builtin_rss') as 'builtin_rss' | 'newsapi' | 'none',
  newsApiKey: process.env.NEWS_API_KEY || '',

  weatherProvider: (process.env.WEATHER_PROVIDER || 'open_meteo') as 'open_meteo' | 'none',

  // Demo Coordinates
  demoCity: process.env.DEMO_CITY || 'Metro Central',
  demoLat: parseFloat(process.env.DEMO_LAT || '28.6139'),
  demoLng: parseFloat(process.env.DEMO_LNG || '77.2090'),

  // Emergency Passage Corridor Config (3km range)
  geofenceRadiusMeters: parseInt(process.env.GEOFENCE_RADIUS_METERS || '3000', 10),
  corridorBufferMeters: parseInt(process.env.CORRIDOR_BUFFER_METERS || '500', 10), // 100-500 meters road corridor
  lookAheadMeters: parseInt(process.env.LOOK_AHEAD_METERS || '3500', 10)
};
