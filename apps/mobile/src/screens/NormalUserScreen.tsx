import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform
} from 'react-native';
import { getMobileSocket, onSocketStateChange, SocketConnectionState } from '../services/socket';
import { api } from '../services/api';
import {
  startNormalUserLocationTracking,
  stopNormalUserLocationTracking
} from '../services/location';
import {
  requestNotificationPermissions,
  showEmergencyAlertNotification
} from '../services/notifications';

export default function NormalUserScreen() {
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [destination, setDestination] = useState('');
  const [routeInfo, setRouteInfo] = useState<any>(null);
  const [socketStatus, setSocketStatus] = useState<SocketConnectionState>('CONNECTED');
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    // 1. Request notification permissions (Requirement 20)
    requestNotificationPermissions();

    // 2. Start real device location tracking (Requirement 6 & 7)
    startNormalUserLocationTracking((loc) => {
      setMyCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });
    });

    // 3. Socket event listeners
    const socket = getMobileSocket();

    socket.on('emergency:alert', (alert: any) => {
      setActiveAlert(alert);
      // Trigger system notification (Requirement 14 & 20)
      showEmergencyAlertNotification(
        '🚨 EMERGENCY AMBULANCE APPROACHING',
        `Ambulance ${alert.ambulanceRegistration} is ${alert.distanceMeters}m away. Please give way when safe and legal.`,
        { emergencyId: alert.emergencyId }
      );
    });

    socket.on('emergency:alert_update', (alert: any) => {
      // Update in-app card silently without repeated notification (Requirement 16 & 18)
      setActiveAlert(alert);
    });

    socket.on('emergency:alert_expired', () => {
      // Clear alert when ambulance passes (Requirement 19)
      setActiveAlert(null);
    });

    const unsubscribeSocket = onSocketStateChange((state) => {
      setSocketStatus(state);
    });

    return () => {
      socket.off('emergency:alert');
      socket.off('emergency:alert_update');
      socket.off('emergency:alert_expired');
      unsubscribeSocket();
      stopNormalUserLocationTracking();
    };
  }, []);

  const handleRoute = async () => {
    if (!destination.trim()) return;
    const origin = myCoords || { latitude: 28.6189, longitude: 77.2130 };
    const target = { latitude: origin.latitude + 0.025, longitude: origin.longitude + 0.018 };

    try {
      const res = await api.getNormalRoute(origin, target);
      setRouteInfo(res);
    } catch (e) {
      console.error('Route calculation error:', e);
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search destination to navigate..."
          placeholderTextColor="#94a3b8"
          value={destination}
          onChangeText={setDestination}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleRoute}>
          <Text style={styles.searchButtonText}>Route</Text>
        </TouchableOpacity>
      </View>

      {/* Emergency Alert Card (Requirement 14: Compact, in-app popup) */}
      {activeAlert && (
        <View style={styles.alertCard}>
          <View style={styles.alertHeaderRow}>
            <Text style={styles.alertHeader}>🚨 EMERGENCY AMBULANCE APPROACHING</Text>
            <Text style={styles.priorityPill}>{activeAlert.priorityLevel || 'HIGH'}</Text>
          </View>

          <Text style={styles.unitText}>Ambulance {activeAlert.ambulanceRegistration}</Text>

          <View style={styles.metricsRow}>
            <Text style={styles.metricText}>Distance: {activeAlert.distanceMeters} m</Text>
            <Text style={styles.metricText}>
              ETA: ~{Math.max(1, Math.round(activeAlert.etaSeconds / 60))} min
            </Text>
          </View>

          {/* Safety Notice (Requirement 33) */}
          <View style={styles.safeBox}>
            <Text style={styles.safeInstruction}>
              {activeAlert.safeInstruction ||
                'Please give way and allow the ambulance to pass when safe and legal to do so.'}
            </Text>
          </View>
        </View>
      )}

      {/* Active Navigation Stats */}
      {routeInfo && (
        <View style={styles.navCard}>
          <Text style={styles.navTitle}>Active Navigation Route</Text>
          <Text style={styles.navText}>
            Distance: {(routeInfo.distance / 1000).toFixed(1)} km · ETA: ~
            {Math.round(routeInfo.duration / 60)} min
          </Text>
          <Text style={styles.trafficNote}>Live traffic unavailable (Standard OSRM)</Text>
        </View>
      )}

      {/* Connection & Network Status */}
      <View style={styles.feedCard}>
        <View style={styles.feedHeaderRow}>
          <Text style={styles.feedTitle}>Emergency Passage Network</Text>
          <Text
            style={[
              styles.statusText,
              { color: socketStatus === 'CONNECTED' ? '#10b981' : '#f59e0b' }
            ]}
          >
            {socketStatus}
          </Text>
        </View>
        <Text style={styles.feedBody}>
          Real device GPS is active. You will receive an immediate heads-up warning whenever an
          active emergency vehicle approaches your road corridor.
        </Text>
        {myCoords && (
          <Text style={styles.coordText}>
            GPS: {myCoords.latitude.toFixed(4)}, {myCoords.longitude.toFixed(4)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 16 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: { flex: 1, backgroundColor: '#0f172a', color: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' },
  searchButton: { backgroundColor: '#2563eb', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 12 },
  searchButtonText: { color: '#fff', fontWeight: 'bold' },
  alertCard: { backgroundColor: '#450a0a', borderColor: '#ef4444', borderWidth: 2, padding: 16, borderRadius: 20, marginBottom: 16 },
  alertHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertHeader: { color: '#fca5a5', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  priorityPill: { backgroundColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  unitText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
  metricText: { color: '#fecaca', fontWeight: 'bold', fontSize: 13 },
  safeBox: { backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10 },
  safeInstruction: { color: '#fee2e2', fontSize: 12, fontWeight: '600', lineHeight: 16 },
  navCard: { backgroundColor: '#0f172a', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', marginBottom: 16 },
  navTitle: { color: '#38bdf8', fontSize: 11, fontWeight: 'bold' },
  navText: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 4 },
  trafficNote: { color: '#64748b', fontSize: 11, marginTop: 4 },
  feedCard: { backgroundColor: '#0f172a', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b' },
  feedHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedTitle: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  feedBody: { color: '#cbd5e1', fontSize: 12, marginTop: 4, lineHeight: 18 },
  coordText: { color: '#38bdf8', fontSize: 10, marginTop: 8, fontStyle: 'italic' }
});
