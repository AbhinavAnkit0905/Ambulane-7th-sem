import { create } from 'zustand';
import { UserRole, EmergencySummary, EmergencyAlertPayload, LatLng } from '@smart-ambulance/shared';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  hospitalId?: string;
  hospitalName?: string;
  token: string;
}

interface AppState {
  currentUser: UserSession | null;
  activeRole: UserRole;
  isOnline: boolean;
  activeEmergency: EmergencySummary | null;
  userAlerts: EmergencyAlertPayload[];
  myLocation: LatLng;
  alertSoundEnabled: boolean;

  setCurrentUser: (user: UserSession | null) => void;
  setActiveRole: (role: UserRole) => void;
  setIsOnline: (online: boolean) => void;
  setActiveEmergency: (emg: EmergencySummary | null) => void;
  setUserAlerts: (alerts: EmergencyAlertPayload[]) => void;
  addOrUpdateAlert: (alert: EmergencyAlertPayload) => void;
  removeAlert: (emergencyId: string) => void;
  setMyLocation: (loc: LatLng) => void;
  toggleAlertSound: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  activeRole: UserRole.ADMIN,
  isOnline: true,
  activeEmergency: null,
  userAlerts: [],
  myLocation: { latitude: 28.6139, longitude: 77.2090 },
  alertSoundEnabled: true,

  setCurrentUser: (currentUser) => set({ currentUser }),
  setActiveRole: (activeRole) => set({ activeRole }),
  setIsOnline: (isOnline) => set({ isOnline }),
  setActiveEmergency: (activeEmergency) => set({ activeEmergency }),
  setUserAlerts: (userAlerts) => set({ userAlerts }),
  addOrUpdateAlert: (alert) =>
    set((state) => {
      const idx = state.userAlerts.findIndex((a) => a.emergencyId === alert.emergencyId);
      if (idx >= 0) {
        const next = [...state.userAlerts];
        next[idx] = alert;
        return { userAlerts: next };
      }
      return { userAlerts: [alert, ...state.userAlerts] };
    }),
  removeAlert: (emergencyId) =>
    set((state) => ({
      userAlerts: state.userAlerts.filter((a) => a.emergencyId !== emergencyId)
    })),
  setMyLocation: (myLocation) => set({ myLocation }),
  toggleAlertSound: () => set((state) => ({ alertSoundEnabled: !state.alertSoundEnabled }))
}));
