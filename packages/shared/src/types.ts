export enum UserRole {
  ADMIN = 'ADMIN',
  AMBULANCE_DRIVER = 'AMBULANCE_DRIVER',
  NORMAL_USER = 'NORMAL_USER',
  HOSPITAL_OPERATOR = 'HOSPITAL_OPERATOR'
}

export enum AmbulanceStatus {
  AVAILABLE = 'AVAILABLE',
  ASSIGNED = 'ASSIGNED',
  EN_ROUTE_TO_PATIENT = 'EN_ROUTE_TO_PATIENT',
  AT_PATIENT = 'AT_PATIENT',
  PATIENT_ONBOARD = 'PATIENT_ONBOARD',
  EN_ROUTE_TO_HOSPITAL = 'EN_ROUTE_TO_HOSPITAL',
  AT_HOSPITAL = 'AT_HOSPITAL',
  OFFLINE = 'OFFLINE',
  MAINTENANCE = 'MAINTENANCE'
}

export enum EmergencyStatus {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  EN_ROUTE_TO_PATIENT = 'EN_ROUTE_TO_PATIENT',
  AT_PATIENT = 'AT_PATIENT',
  PATIENT_PICKED_UP = 'PATIENT_PICKED_UP',
  EN_ROUTE_TO_HOSPITAL = 'EN_ROUTE_TO_HOSPITAL',
  AT_HOSPITAL = 'AT_HOSPITAL',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum EmergencyPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  UPDATED = 'UPDATED',
  PASSED = 'PASSED',
  EXPIRED = 'EXPIRED',
  DISMISSED = 'DISMISSED'
}

export enum AlertPriorityLevel {
  EMERGENCY_VEHICLE_NEARBY = 'EMERGENCY_VEHICLE_NEARBY', // < 200m
  AMBULANCE_VERY_CLOSE = 'AMBULANCE_VERY_CLOSE',         // < 500m
  AMBULANCE_APPROACHING = 'AMBULANCE_APPROACHING',       // 500m - 1500m
  AMBULANCE_NEARBY = 'AMBULANCE_NEARBY'                  // > 1500m
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface LocationUpdatePayload extends LatLng {
  speed?: number; // km/h or m/s
  heading?: number; // degrees 0-360
  accuracy?: number; // meters
  timestamp?: number | string;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  hospitalId?: string | null;
}

export interface AmbulanceSummary {
  id: string;
  registrationNumber: string;
  driverId?: string | null;
  driver?: UserSummary | null;
  status: AmbulanceStatus;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  lastLocationUpdate?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface HospitalSummary {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  emergencyDepartmentOpen: boolean;
  icuAvailable: boolean;
  icuBeds: number;
  totalAvailableBeds: number;
  receivingCapacity: number; // 0 - 100 percentage or active capacity
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface RouteStep {
  instruction: string;
  distance: number; // in meters
  duration: number; // in seconds
  name?: string;
  maneuver?: {
    type: string;
    modifier?: string;
    location: [number, number]; // [lng, lat]
  };
}

export interface RouteCalculationResult {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: [number, number][]; // [lat, lng] array
  steps: RouteStep[];
  provider: string;
  isTrafficLive: boolean;
  trafficMessage?: string;
}

export interface EmergencySummary {
  id: string;
  emergencyNumber: string;
  ambulanceId?: string | null;
  ambulance?: AmbulanceSummary | null;
  driverId?: string | null;
  driver?: UserSummary | null;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;
  hospitalId?: string | null;
  hospital?: HospitalSummary | null;
  priority: EmergencyPriority;
  status: EmergencyStatus;
  routeId?: string | null;
  activeRoute?: RouteCalculationResult | null;
  startedAt?: string | Date | null;
  patientArrivalAt?: string | Date | null;
  patientPickupAt?: string | Date | null;
  hospitalArrivalAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface EmergencyAlertPayload {
  alertId: string;
  emergencyId: string;
  emergencyNumber: string;
  ambulanceId: string;
  ambulanceRegistration: string;
  distanceMeters: number;
  etaSeconds: number;
  priorityLevel: AlertPriorityLevel;
  status: AlertStatus;
  ambulanceLocation: LatLng;
  safeInstruction: string;
  updatedAt: string | Date;
}

export interface NewsArticleSummary {
  id: string;
  title: string;
  summary: string;
  source: string;
  url?: string;
  imageUrl?: string;
  category: 'Local' | 'Traffic' | 'Roads' | 'Weather' | 'Emergency' | 'Civic';
  publishedAt: string | Date;
}

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  weatherDescription: string;
  rainProbability: number;
  windSpeed: number;
  humidity?: number;
  alerts?: string[];
  provider: string;
}

export interface AdminKPIs {
  activeEmergencies: number;
  availableAmbulances: number;
  ambulancesOnEmergency: number;
  hospitalsAvailable: number;
  usersCurrentlyAlerted: number;
  averageEmergencyResponseTimeMinutes: number;
  alertCoveragePercentage: number;
  averageAlertLeadTimeSeconds: number;
}
