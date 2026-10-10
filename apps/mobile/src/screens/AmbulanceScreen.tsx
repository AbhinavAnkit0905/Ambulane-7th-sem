import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal
} from 'react-native';
import { api } from '../services/api';
import {
  startEmergencyGpsTracking,
  stopEmergencyGpsTracking,
  requestLocationPermissions
} from '../services/location';
import { getMobileSocket, onSocketStateChange, SocketConnectionState } from '../services/socket';

export default function AmbulanceScreen({ navigation }: any) {
  const [emergency, setEmergency] = useState<any>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [alertedCount, setAlertedCount] = useState(0);
  const [socketStatus, setSocketStatus] = useState<SocketConnectionState>('CONNECTED');

  // Real GPS Telemetry state (Requirement 4 & 37)
  const [currentCoords, setCurrentCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    timestamp: number;
  } | null>(null);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const loadEmergency = async () => {
    try {
      const emgs = await api.getEmergencies();
      const active = emgs.find((e: any) => e.status !== 'COMPLETED' && e.status !== 'CANCELLED');
      if (active) setEmergency(active);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadEmergency();
    const socket = getMobileSocket();
    socket.on('admin:alert_count_update', (d: any) => setAlertedCount(d.alertedCount));

    const unsubscribeSocket = onSocketStateChange((state) => {
      setSocketStatus(state);
    });

    return () => {
      socket.off('admin:alert_count_update');
      unsubscribeSocket();
      stopEmergencyGpsTracking();
    };
  }, []);

  const handleAction = async () => {
    if (!emergency) return;

    try {
      if (emergency.status === 'ASSIGNED' || emergency.status === 'CREATED') {
        // Enforce GPS Permission check before starting (Requirement 21)
        const perms = await requestLocationPermissions();
        if (!perms.foreground) {
          Alert.alert(
            'Location Permission Required',
            'Location permission is required to start an emergency ride. Please grant GPS access in device settings.'
          );
          return;
        }

        const res = await api.startEmergency(emergency.id);
        setEmergency(res);
        setIsTracking(true);

        // Start high-frequency real device GPS tracking (Requirement 4, 5, 7)
        await startEmergencyGpsTracking(res.ambulanceId, res.id, '', (loc) => {
          setCurrentCoords({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ? Math.round(loc.coords.accuracy) : null,
            speed: loc.coords.speed !== null && loc.coords.speed >= 0 ? Math.round(loc.coords.speed * 3.6) : null,
            heading: loc.coords.heading !== null ? Math.round(loc.coords.heading) : null,
            timestamp: loc.timestamp
          });
        });
      } else if (emergency.status === 'EN_ROUTE_TO_PATIENT') {
        const res = await api.arrivePatient(emergency.id);
        setEmergency(res);
      } else if (emergency.status === 'AT_PATIENT') {
        const res = await api.pickupPatient(emergency.id);
        setEmergency(res);
      } else if (emergency.status === 'PATIENT_PICKED_UP') {
        const res = await api.startHospitalRoute(emergency.id, emergency.hospitalId || 'hosp-001');
        setEmergency(res);
      } else if (emergency.status === 'EN_ROUTE_TO_HOSPITAL') {
        const res = await api.arriveHospital(emergency.id);
        setEmergency(res);
      } else if (emergency.status === 'AT_HOSPITAL') {
        const res = await api.completeEmergency(emergency.id);
        setEmergency(res);
        setIsTracking(false);
        await stopEmergencyGpsTracking();
        Alert.alert('Emergency Completed', 'Trip concluded. Passage alerts expired and tracking stopped.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Banner */}
      <View style={styles.topCard}>
        <View style={styles.row}>
          <Text style={styles.title}>{emergency?.emergencyNumber || 'NO ACTIVE EMERGENCY'}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{emergency?.priority || 'HIGH'}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>{emergency?.pickupAddress || 'Standby for dispatch'}</Text>

        <View style={styles.kpiRow}>
          <Text style={styles.kpi}>Alerted Drivers: {alertedCount}</Text>
          <Text style={[styles.kpi, { color: isTracking ? '#10b981' : '#f59e0b' }]}>
            GPS: {isTracking ? 'REAL GPS ACTIVE' : 'STANDBY'}
          </Text>
        </View>

        {/* Live GPS Telemetry Pill */}
        {currentCoords && (
          <View style={styles.telemetryBar}>
            <Text style={styles.telemetryText}>
              Acc: ±{currentCoords.accuracy ?? '--'}m · Speed: {currentCoords.speed ?? 0} km/h
            </Text>
            <TouchableOpacity onPress={() => setShowDiagnostics(true)}>
              <Text style={styles.diagLink}>Diagnostics</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Navigation Instruction */}
      <View style={styles.instructionCard}>
        <Text style={styles.instructionLabel}>NAVIGATION GUIDANCE</Text>
        <Text style={styles.instructionText}>
          {emergency?.status === 'EN_ROUTE_TO_HOSPITAL'
            ? 'Proceed along Emergency Corridor toward Hospital'
            : emergency?.status === 'EN_ROUTE_TO_PATIENT'
            ? 'Proceed to Patient Pickup Location'
            : 'Standby for next dispatch instruction'}
        </Text>
      </View>

      {/* Connection & Status Banner */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Network Socket: </Text>
        <Text
          style={[
            styles.statusVal,
            { color: socketStatus === 'CONNECTED' ? '#10b981' : '#f59e0b' }
          ]}
        >
          {socketStatus}
        </Text>
      </View>

      {/* Main Action Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.button} onPress={handleAction}>
          <Text style={styles.buttonText}>
            {emergency?.status === 'ASSIGNED' || emergency?.status === 'CREATED'
              ? 'START EMERGENCY'
              : emergency?.status === 'EN_ROUTE_TO_PATIENT'
              ? 'ARRIVED AT PATIENT'
              : emergency?.status === 'AT_PATIENT'
              ? 'PATIENT PICKED UP'
              : emergency?.status === 'PATIENT_PICKED_UP'
              ? 'ROUTE TO HOSPITAL'
              : emergency?.status === 'EN_ROUTE_TO_HOSPITAL'
              ? 'ARRIVED AT HOSPITAL'
              : emergency?.status === 'AT_HOSPITAL'
              ? 'COMPLETE EMERGENCY'
              : 'EMERGENCY COMPLETED'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* GPS Diagnostics Modal (Requirement 37) */}
      <Modal visible={showDiagnostics} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Field GPS Diagnostics</Text>
            <Text style={styles.diagItem}>
              Latitude: {currentCoords?.latitude.toFixed(5) ?? '--'}
            </Text>
            <Text style={styles.diagItem}>
              Longitude: {currentCoords?.longitude.toFixed(5) ?? '--'}
            </Text>
            <Text style={styles.diagItem}>
              Accuracy: ±{currentCoords?.accuracy ?? '--'} meters
            </Text>
            <Text style={styles.diagItem}>
              Speed: {currentCoords?.speed ?? 0} km/h
            </Text>
            <Text style={styles.diagItem}>
              Heading: {currentCoords?.heading ?? 0}°
            </Text>
            <Text style={styles.diagItem}>Socket: {socketStatus}</Text>
            <Text style={styles.diagItem}>
              Last Point: {currentCoords ? new Date(currentCoords.timestamp).toLocaleTimeString() : '--'}
            </Text>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowDiagnostics(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 16 },
  topCard: { backgroundColor: '#0f172a', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#1e293b' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '900', color: '#fff' },
  badge: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.4)' },
  badgeText: { color: '#f87171', fontWeight: 'bold', fontSize: 11 },
  subtitle: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  kpiRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e293b' },
  kpi: { fontSize: 12, fontWeight: '700', color: '#cbd5e1' },
  telemetryBar: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, backgroundColor: '#020617', padding: 8, borderRadius: 10 },
  telemetryText: { color: '#38bdf8', fontSize: 11, fontWeight: '600' },
  diagLink: { color: '#f59e0b', fontSize: 11, fontWeight: 'bold' },
  instructionCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 20, marginTop: 16 },
  instructionLabel: { color: '#38bdf8', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  instructionText: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 4 },
  statusLabel: { color: '#64748b', fontSize: 12 },
  statusVal: { fontWeight: 'bold', fontSize: 12 },
  bottomBar: { position: 'absolute', bottom: 20, left: 16, right: 16 },
  button: { backgroundColor: '#e11d48', paddingVertical: 18, borderRadius: 20, alignItems: 'center', shadowColor: '#e11d48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#0f172a', borderRadius: 24, padding: 20, width: '100%', borderWidth: 1, borderColor: '#334155' },
  modalTitle: { color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 12 },
  diagItem: { color: '#cbd5e1', fontSize: 13, marginVertical: 4 },
  closeBtn: { marginTop: 16, backgroundColor: '#2563eb', padding: 12, borderRadius: 14, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 }
});
