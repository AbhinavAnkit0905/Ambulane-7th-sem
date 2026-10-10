import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function mobileApiRequest(endpoint: string, options: any = {}) {
  const { token, body, headers = {}, ...rest } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers
  };

  const storedToken = token || (await SecureStore.getItemAsync('auth_token'));
  if (storedToken) {
    reqHeaders['Authorization'] = `Bearer ${storedToken}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  login: (email: string, password: string = 'password123') =>
    mobileApiRequest('/auth/login', { method: 'POST', body: { email, password } }),
  getEmergencies: () => mobileApiRequest('/emergencies'),
  startEmergency: (id: string) => mobileApiRequest(`/emergencies/${id}/start`, { method: 'POST' }),
  arrivePatient: (id: string) => mobileApiRequest(`/emergencies/${id}/arrive-patient`, { method: 'POST' }),
  pickupPatient: (id: string) => mobileApiRequest(`/emergencies/${id}/pickup`, { method: 'POST' }),
  startHospitalRoute: (id: string, hospitalId: string) =>
    mobileApiRequest(`/emergencies/${id}/start-hospital-route`, { method: 'POST', body: { hospitalId } }),
  arriveHospital: (id: string) => mobileApiRequest(`/emergencies/${id}/arrive-hospital`, { method: 'POST' }),
  completeEmergency: (id: string) => mobileApiRequest(`/emergencies/${id}/complete`, { method: 'POST' }),
  updateAmbulanceLocation: (id: string, payload: any, token?: string) =>
    mobileApiRequest(`/ambulances/${id}/location`, { method: 'POST', body: payload, token }),
  updateUserLocation: (payload: any) =>
    mobileApiRequest('/users/location', { method: 'POST', body: payload }),
  getNearbyHospitals: (lat: number, lng: number) =>
    mobileApiRequest(`/hospitals/nearby?lat=${lat}&lng=${lng}`),
  getNormalRoute: (origin: any, destination: any) =>
    mobileApiRequest('/routes/normal', { method: 'POST', body: { origin, destination } })
};
