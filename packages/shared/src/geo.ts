import { LatLng, AlertPriorityLevel } from './types';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates Haversine distance between two latitude/longitude points in meters.
 */
export function calculateHaversineDistance(p1: LatLng, p2: LatLng): number {
  const dLat = toRadians(p2.latitude - p1.latitude);
  const dLon = toRadians(p2.longitude - p1.longitude);
  const lat1 = toRadians(p1.latitude);
  const lat2 = toRadians(p2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculates initial compass bearing from p1 to p2 in degrees (0 - 360).
 */
export function calculateBearing(p1: LatLng, p2: LatLng): number {
  const lat1 = toRadians(p1.latitude);
  const lat2 = toRadians(p2.latitude);
  const dLon = toRadians(p2.longitude - p1.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = toDegrees(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Computes shortest distance from point P to line segment AB in meters.
 */
export function pointToSegmentDistanceMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const segmentLength = calculateHaversineDistance(a, b);
  if (segmentLength < 0.1) {
    return calculateHaversineDistance(p, a);
  }

  // Convert to local planar projection (Equirectangular approximation)
  const midLat = toRadians((a.latitude + b.latitude + p.latitude) / 3);
  const kx = Math.cos(midLat);

  const xA = toRadians(a.longitude) * kx * EARTH_RADIUS_METERS;
  const yA = toRadians(a.latitude) * EARTH_RADIUS_METERS;

  const xB = toRadians(b.longitude) * kx * EARTH_RADIUS_METERS;
  const yB = toRadians(b.latitude) * EARTH_RADIUS_METERS;

  const xP = toRadians(p.longitude) * kx * EARTH_RADIUS_METERS;
  const yP = toRadians(p.latitude) * EARTH_RADIUS_METERS;

  const dx = xB - xA;
  const dy = yB - yA;
  const l2 = dx * dx + dy * dy;

  if (l2 === 0) {
    return Math.hypot(xP - xA, yP - yA);
  }

  // Projection scalar t onto segment AB
  let t = ((xP - xA) * dx + (yP - yA) * dy) / l2;
  t = Math.max(0, Math.min(1, t));

  const projX = xA + t * dx;
  const projY = yA + t * dy;

  return Math.hypot(xP - projX, yP - projY);
}

/**
 * Finds index of nearest point or segment along the polyline.
 */
export function findNearestSegmentIndex(
  point: LatLng,
  polyline: [number, number][] // [lat, lng] array
): { index: number; distance: number } {
  if (polyline.length < 2) {
    return { index: 0, distance: 0 };
  }

  let minDistance = Infinity;
  let bestIndex = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = { latitude: polyline[i][0], longitude: polyline[i][1] };
    const b = { latitude: polyline[i + 1][0], longitude: polyline[i + 1][1] };
    const dist = pointToSegmentDistanceMeters(point, a, b);

    if (dist < minDistance) {
      minDistance = dist;
      bestIndex = i;
    }
  }

  return { index: bestIndex, distance: minDistance };
}

export interface CorridorEvaluationOptions {
  geofenceRadiusMeters?: number; // Condition A: 3km range (default 3000m)
  corridorBufferMeters?: number; // Condition B: 500m ahead corridor
  lookAheadMeters?: number;     // Look ahead along route: default 3500m
}

export interface CorridorEvaluationResult {
  isEligibleForAlert: boolean;
  distanceToAmbulance: number; // Euclidean meters
  distanceToCorridor: number;  // Meters from ahead route
  isAheadOnRoute: boolean;
  priorityLevel: AlertPriorityLevel;
  estimatedEtaSeconds: number;
}

/**
 * Evaluates whether a normal driver/user is in the Emergency Look-Ahead corridor.
 * Condition A: Within 3000 meters (3 km) of the ambulance.
 * Condition B: Within road corridor ahead of ambulance.
 * Drivers behind ambulance or beyond 3km are filtered out.
 */
export function evaluateCorridorProximity(
  userLocation: LatLng,
  ambulanceLocation: LatLng,
  routePolyline: [number, number][], // [lat, lng][]
  ambulanceSpeedKmh: number = 45,
  options: CorridorEvaluationOptions = {}
): CorridorEvaluationResult {
  const geofenceRadius = options.geofenceRadiusMeters ?? 3000;
  const corridorBuffer = options.corridorBufferMeters ?? 500;

  const distanceToAmbulance = calculateHaversineDistance(userLocation, ambulanceLocation);

  // Default negative response if beyond 3km (3000m) geofence
  if (distanceToAmbulance > geofenceRadius) {
    return {
      isEligibleForAlert: false,
      distanceToAmbulance,
      distanceToCorridor: Infinity,
      isAheadOnRoute: false,
      priorityLevel: AlertPriorityLevel.AMBULANCE_NEARBY,
      estimatedEtaSeconds: Math.round((distanceToAmbulance / Math.max(10, (ambulanceSpeedKmh * 1000) / 3600)))
    };
  }

  // If no polyline is available, fall back to pure radial geofence
  if (!routePolyline || routePolyline.length < 2) {
    const isClose = distanceToAmbulance <= geofenceRadius;
    return {
      isEligibleForAlert: isClose,
      distanceToAmbulance,
      distanceToCorridor: 0,
      isAheadOnRoute: true,
      priorityLevel: determinePriorityLevel(distanceToAmbulance),
      estimatedEtaSeconds: Math.round(distanceToAmbulance / Math.max(10, (ambulanceSpeedKmh * 1000) / 3600))
    };
  }

  // 1. Locate where the ambulance and user currently are along the polyline
  const ambulancePos = findNearestSegmentIndex(ambulanceLocation, routePolyline);
  const userPos = findNearestSegmentIndex(userLocation, routePolyline);

  // 2. Build the upcoming ahead-path from ambulance segment index to the end
  let minCorridorDist = Infinity;
  for (let i = ambulancePos.index; i < routePolyline.length - 1; i++) {
    const a = { latitude: routePolyline[i][0], longitude: routePolyline[i][1] };
    const b = { latitude: routePolyline[i + 1][0], longitude: routePolyline[i + 1][1] };
    const segDist = pointToSegmentDistanceMeters(userLocation, a, b);

    if (segDist < minCorridorDist) {
      minCorridorDist = segDist;
    }
  }

  // 3. User is ahead on route:
  // If user is on a subsequent segment: true
  // If user is on an earlier segment: false
  // If user is on the same segment: check forward progress relative to segment vector
  let isAhead = false;
  if (userPos.index > ambulancePos.index) {
    isAhead = true;
  } else if (userPos.index < ambulancePos.index) {
    isAhead = false;
  } else {
    // Same segment: check forward heading along segment
    const segA = { latitude: routePolyline[ambulancePos.index][0], longitude: routePolyline[ambulancePos.index][1] };
    const segB = {
      latitude: routePolyline[Math.min(ambulancePos.index + 1, routePolyline.length - 1)][0],
      longitude: routePolyline[Math.min(ambulancePos.index + 1, routePolyline.length - 1)][1]
    };
    const segBearing = calculateBearing(segA, segB);
    const ambToUserBearing = calculateBearing(ambulanceLocation, userLocation);
    const angleDiff = Math.abs(((ambToUserBearing - segBearing + 180 + 360) % 360) - 180);
    isAhead = angleDiff <= 90;
  }

  // Always consider within immediate proximity (<150m) as in passage corridor
  if (distanceToAmbulance < 150) {
    isAhead = true;
  }

  // Check both Condition A (within 2000m) AND Condition B (within corridor buffer ahead)
  const isEligible = distanceToAmbulance <= geofenceRadius && minCorridorDist <= corridorBuffer && isAhead;

  // Calculate ETA based on speed (minimum 25 km/h for emergency vehicle estimate)
  const speedMetersPerSec = Math.max(7, (ambulanceSpeedKmh * 1000) / 3600);
  const estimatedEtaSeconds = Math.max(5, Math.round(distanceToAmbulance / speedMetersPerSec));

  return {
    isEligibleForAlert: isEligible,
    distanceToAmbulance,
    distanceToCorridor: minCorridorDist,
    isAheadOnRoute: isAhead,
    priorityLevel: determinePriorityLevel(distanceToAmbulance),
    estimatedEtaSeconds
  };
}

export function determinePriorityLevel(distanceMeters: number): AlertPriorityLevel {
  if (distanceMeters < 200) {
    return AlertPriorityLevel.EMERGENCY_VEHICLE_NEARBY;
  }
  if (distanceMeters < 500) {
    return AlertPriorityLevel.AMBULANCE_VERY_CLOSE;
  }
  if (distanceMeters <= 1500) {
    return AlertPriorityLevel.AMBULANCE_APPROACHING;
  }
  return AlertPriorityLevel.AMBULANCE_NEARBY;
}
