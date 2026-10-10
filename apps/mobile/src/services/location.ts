import * as Location from 'expo-location';
import { api } from './api';

const LOCATION_TASK_NAME = 'AMBULANCE_BACKGROUND_LOCATION_TASK';

let activeEmergencyId: string | null = null;
let activeAmbulanceId: string | null = null;
let activeToken: string | null = null;
let foregroundSubscription: Location.LocationSubscription | null = null;
let userLocationSubscription: Location.LocationSubscription | null = null;

// Offline GPS points queue (Requirement 39)
const offlineGpsQueue: any[] = [];

/**
 * Checks and requests explicit foreground and background location permissions.
 * Requirement 4 & 21
 */
export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return { foreground: false, background: false };
  }

  // Request background permission for persistent emergency mobility tracking (Requirement 5)
  try {
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    return { foreground: true, background: backgroundStatus === 'granted' };
  } catch {
    return { foreground: true, background: false };
  }
}

/**
 * Starts high-frequency GPS tracking for the ambulance driver during an active emergency.
 * Target frequency: 3-5 seconds (Requirement 7)
 */
export async function startEmergencyGpsTracking(
  ambulanceId: string,
  emergencyId: string,
  token: string,
  onLocationUpdate?: (location: Location.LocationObject) => void
): Promise<boolean> {
  activeEmergencyId = emergencyId;
  activeAmbulanceId = ambulanceId;
  activeToken = token;

  const permissions = await requestLocationPermissions();
  if (!permissions.foreground) {
    console.warn('Foreground location permission denied for ambulance tracking');
    return false;
  }

  // Stop any previous subscription
  if (foregroundSubscription) {
    foregroundSubscription.remove();
  }

  // High-frequency tracking: 3-4s, 10m (Requirement 7)
  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 3000,
      distanceInterval: 10
    },
    async (loc) => {
      onLocationUpdate?.(loc);

      const locPayload = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        speed: loc.coords.speed !== null && loc.coords.speed >= 0 ? Math.round(loc.coords.speed * 3.6) : 45, // m/s to km/h
        heading: loc.coords.heading !== null ? Math.round(loc.coords.heading) : 0,
        accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : 5,
        timestamp: loc.timestamp
      };

      if (activeAmbulanceId) {
        try {
          await api.updateAmbulanceLocation(activeAmbulanceId, locPayload, activeToken || undefined);

          // Flush any buffered offline points upon successful send
          if (offlineGpsQueue.length > 0) {
            const buffered = offlineGpsQueue.pop();
            await api.updateAmbulanceLocation(activeAmbulanceId, buffered, activeToken || undefined).catch(() => {});
          }
        } catch (err) {
          // Network failure: queue point locally (Requirement 39)
          console.warn('Network offline during mobile GPS tracking, buffering point locally');
          offlineGpsQueue.push(locPayload);
          if (offlineGpsQueue.length > 20) offlineGpsQueue.shift();
        }
      }
    }
  );

  return true;
}

/**
 * Stops high-frequency tracking when emergency finishes or cancels (Requirement 5).
 */
export async function stopEmergencyGpsTracking(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  activeEmergencyId = null;
  activeAmbulanceId = null;
  activeToken = null;
  offlineGpsQueue.length = 0;
}

/**
 * Starts periodic location tracking for normal drivers / road users.
 * Lower frequency (10-15s, 25m) to save battery (Requirement 6 & 7).
 */
export async function startNormalUserLocationTracking(
  onLocationUpdate?: (location: Location.LocationObject) => void
): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return false;
  }

  if (userLocationSubscription) {
    userLocationSubscription.remove();
  }

  userLocationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10000,
      distanceInterval: 25
    },
    async (loc) => {
      onLocationUpdate?.(loc);

      try {
        await api.updateUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          speed: loc.coords.speed !== null && loc.coords.speed >= 0 ? Math.round(loc.coords.speed * 3.6) : null,
          heading: loc.coords.heading !== null ? Math.round(loc.coords.heading) : null,
          accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : null
        });
      } catch (err) {
        // Silent catch for background mobile updates
      }
    }
  );

  return true;
}

export function stopNormalUserLocationTracking(): void {
  if (userLocationSubscription) {
    userLocationSubscription.remove();
    userLocationSubscription = null;
  }
}
