export const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:5000/api`;
  }
  return 'http://localhost:5000/api';
};

const API_BASE = getApiBase();

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers = {}, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>)
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    headers: requestHeaders
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Request failed`);
  }

  return data;
}

export const api = {
  // Auth
  login: (email: string, password: string = 'password123') =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getMe: (token: string) => apiRequest('/auth/me', { token }),

  // Ambulances
  getAmbulances: (token: string) => apiRequest('/ambulances', { token }),
  getAmbulance: (id: string, token: string) => apiRequest(`/ambulances/${id}`, { token }),
  updateAmbulanceLocation: (id: string, body: any, token: string) =>
    apiRequest(`/ambulances/${id}/location`, { method: 'POST', body: JSON.stringify(body), token }),

  // Emergencies
  getEmergencies: (token: string) => apiRequest('/emergencies', { token }),
  getEmergency: (id: string, token: string) => apiRequest(`/emergencies/${id}`, { token }),
  createEmergency: (body: any, token: string) =>
    apiRequest('/emergencies', { method: 'POST', body: JSON.stringify(body), token }),
  startEmergency: (id: string, token: string, currentLocation?: { latitude: number; longitude: number }) =>
    apiRequest(`/emergencies/${id}/start`, {
      method: 'POST',
      body: currentLocation ? JSON.stringify(currentLocation) : undefined,
      token
    }),
  arrivePatient: (id: string, token: string) =>
    apiRequest(`/emergencies/${id}/arrive-patient`, { method: 'POST', token }),
  pickupPatient: (id: string, token: string) =>
    apiRequest(`/emergencies/${id}/pickup`, { method: 'POST', token }),
  startHospitalRoute: (id: string, hospitalId: string, token: string) =>
    apiRequest(`/emergencies/${id}/start-hospital-route`, {
      method: 'POST',
      body: JSON.stringify({ hospitalId }),
      token
    }),
  arriveHospital: (id: string, token: string) =>
    apiRequest(`/emergencies/${id}/arrive-hospital`, { method: 'POST', token }),
  completeEmergency: (id: string, token: string) =>
    apiRequest(`/emergencies/${id}/complete`, { method: 'POST', token }),
  cancelEmergency: (id: string, token: string) =>
    apiRequest(`/emergencies/${id}/cancel`, { method: 'POST', token }),

  // Routing
  getNormalRoute: (origin: any, destination: any) =>
    apiRequest('/routes/normal', { method: 'POST', body: JSON.stringify({ origin, destination }) }),
  getEmergencyRoute: (origin: any, destination: any, priority = 'CRITICAL') =>
    apiRequest('/routes/emergency', { method: 'POST', body: JSON.stringify({ origin, destination, priority }) }),
  searchPlaces: (query: string) =>
    apiRequest(`/routes/places/search?q=${encodeURIComponent(query)}`),
  reverseGeocode: (lat: number, lng: number) =>
    apiRequest(`/routes/places/reverse?lat=${lat}&lng=${lng}`),

  // Hospitals
  getHospitals: () => apiRequest('/hospitals'),
  getNearbyHospitals: (lat: number, lng: number) =>
    apiRequest(`/hospitals/nearby?lat=${lat}&lng=${lng}`),

  // Normal User
  updateUserLocation: (body: any, token: string) =>
    apiRequest('/users/location', { method: 'POST', body: JSON.stringify(body), token }),
  getMyAlerts: (token: string) => apiRequest('/alerts', { token }),

  // News & Weather
  getLocalNews: (category?: string) =>
    apiRequest(`/news/local${category ? `?category=${category}` : ''}`),
  getWeather: (lat = 28.6139, lng = 77.209) =>
    apiRequest(`/weather?lat=${lat}&lng=${lng}`),

  // Admin & Demo
  getAdminDashboard: (token: string) => apiRequest('/admin/dashboard', { token }),
  getAdminAnalytics: (token: string) => apiRequest('/admin/analytics', { token }),
  startDemo: (token: string) => apiRequest('/admin/demo/start', { method: 'POST', token }),
  stopDemo: (token: string) => apiRequest('/admin/demo/stop', { method: 'POST', token }),
  getDemoStatus: (token: string) => apiRequest('/admin/demo/status', { token })
};
