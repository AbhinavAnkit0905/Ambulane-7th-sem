import { EmergencyStatus } from './types';

export const VALID_EMERGENCY_TRANSITIONS: Record<EmergencyStatus, EmergencyStatus[]> = {
  [EmergencyStatus.CREATED]: [
    EmergencyStatus.ASSIGNED,
    EmergencyStatus.CANCELLED
  ],
  [EmergencyStatus.ASSIGNED]: [
    EmergencyStatus.EN_ROUTE_TO_PATIENT,
    EmergencyStatus.CANCELLED
  ],
  [EmergencyStatus.EN_ROUTE_TO_PATIENT]: [
    EmergencyStatus.AT_PATIENT,
    EmergencyStatus.CANCELLED
  ],
  [EmergencyStatus.AT_PATIENT]: [
    EmergencyStatus.PATIENT_PICKED_UP,
    EmergencyStatus.CANCELLED
  ],
  [EmergencyStatus.PATIENT_PICKED_UP]: [
    EmergencyStatus.EN_ROUTE_TO_HOSPITAL,
    EmergencyStatus.CANCELLED
  ],
  [EmergencyStatus.EN_ROUTE_TO_HOSPITAL]: [
    EmergencyStatus.AT_HOSPITAL,
    EmergencyStatus.CANCELLED
  ],
  [EmergencyStatus.AT_HOSPITAL]: [
    EmergencyStatus.COMPLETED,
    EmergencyStatus.CANCELLED
  ],
  [EmergencyStatus.COMPLETED]: [],
  [EmergencyStatus.CANCELLED]: []
};

export function isValidEmergencyTransition(current: EmergencyStatus, target: EmergencyStatus): boolean {
  const allowed = VALID_EMERGENCY_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}

export function assertValidEmergencyTransition(current: EmergencyStatus, target: EmergencyStatus): void {
  if (!isValidEmergencyTransition(current, target)) {
    throw new Error(`Invalid emergency state transition: cannot transition from ${current} to ${target}`);
  }
}
