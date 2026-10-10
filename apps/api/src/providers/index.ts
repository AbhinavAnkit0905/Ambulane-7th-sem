import { config } from '../config';
import { IRoutingProvider, ITrafficProvider, IGeocodingProvider, INewsProvider, IWeatherProvider, INotificationProvider } from './interfaces';
import { OSRMProvider } from './routing/osrm.provider';
import { LiveTrafficProvider, SimulationTrafficProvider, UnavailableTrafficProvider } from './traffic/traffic.provider';
import { NominatimProvider } from './geocoding/nominatim.provider';
import { NewsProvider } from './news/news.provider';
import { OpenMeteoWeatherProvider } from './weather/weather.provider';
import { ExpoNotificationProvider } from './notification/notification.provider';

export * from './interfaces';
export * from './routing/osrm.provider';
export * from './traffic/traffic.provider';
export * from './geocoding/nominatim.provider';
export * from './news/news.provider';
export * from './weather/weather.provider';
export * from './notification/notification.provider';

// Factory instantiation based on config
export const routingProvider: IRoutingProvider = new OSRMProvider(config.osrmBaseUrl);

export const trafficProvider: ITrafficProvider =
  config.trafficProvider === 'live' && config.trafficApiKey
    ? new LiveTrafficProvider(config.trafficApiKey)
    : config.trafficProvider === 'simulation'
    ? new SimulationTrafficProvider()
    : new UnavailableTrafficProvider();

export const geocodingProvider: IGeocodingProvider = new NominatimProvider(config.nominatimBaseUrl);
export const newsProvider: INewsProvider = new NewsProvider();
export const weatherProvider: IWeatherProvider = new OpenMeteoWeatherProvider();
export const notificationProvider: INotificationProvider = new ExpoNotificationProvider();
