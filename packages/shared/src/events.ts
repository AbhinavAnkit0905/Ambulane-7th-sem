export const SOCKET_EVENTS = {
  // Ambulance events
  AMBULANCE_STARTED: 'ambulance:started',
  AMBULANCE_LOCATION: 'ambulance:location',
  AMBULANCE_ROUTE: 'ambulance:route',
  AMBULANCE_ROUTE_UPDATED: 'ambulance:route_updated',
  AMBULANCE_STATUS_CHANGED: 'ambulance:status_changed',

  // Emergency lifecycle events
  EMERGENCY_CREATED: 'emergency:created',
  EMERGENCY_UPDATED: 'emergency:updated',
  EMERGENCY_STARTED: 'emergency:started',
  EMERGENCY_COMPLETED: 'emergency:completed',
  EMERGENCY_CANCELLED: 'emergency:cancelled',

  // Passage Network Alert events (targeted to normal users)
  EMERGENCY_ALERT: 'emergency:alert',
  EMERGENCY_ALERT_UPDATE: 'emergency:alert_update',
  EMERGENCY_ALERT_EXPIRED: 'emergency:alert_expired',

  // Notifications & User location
  USER_LOCATION_UPDATE: 'user:location_update',
  NOTIFICATION_NEW: 'notification:new',

  // Rooms
  ROOM_ADMIN: 'room:admin',
  ROOM_HOSPITAL_PREFIX: 'hospital:',
  ROOM_USER_PREFIX: 'user:',
  ROOM_EMERGENCY_PREFIX: 'emergency:'
} as const;
