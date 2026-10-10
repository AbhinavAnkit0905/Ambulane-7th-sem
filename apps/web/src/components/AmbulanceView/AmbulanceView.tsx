'use client';

import React, { useState, useEffect, useRef } from 'react';
import LiveMap from '../Map/LiveMap';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { EmergencyStatus, SOCKET_EVENTS } from '@smart-ambulance/shared';
import {
  Navigation,
  AlertTriangle,
  Building2 as HospitalIcon,
  Compass,
  CheckCircle,
  Users,
  Radio,
  Wifi,
  WifiOff,
  ChevronRight,
  Activity,
  Layers,
  Info,
  Shield,
  LocateFixed,
  AlertOctagon
} from 'lucide-react';

export default function AmbulanceView() {
  const { currentUser } = useAppStore();
  const [emergency, setEmergency] = useState<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [showHospitalModal, setShowHospitalModal] = useState(false);
  const [alertedCount, setAlertedCount] = useState<number>(0);

  // Operational Mode: REAL MODE is default per Requirement 1
  const [appMode, setAppMode] = useState<'REAL' | 'DEMO'>('REAL');
  const [isSimulatingGps, setIsSimulatingGps] = useState(false);

  // Connection & Diagnostics state
  const [connectionStatus, setConnectionStatus] = useState<'ONLINE' | 'RECONNECTING' | 'OFFLINE'>('ONLINE');
  const [gpsPermission, setGpsPermission] = useState<'prompt' | 'granted' | 'denied' | 'unavailable'>('prompt');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsSpeed, setGpsSpeed] = useState<number | null>(null);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [lastUploadTime, setLastUploadTime] = useState<string | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Navigation state
  const [currentInstruction, setCurrentInstruction] = useState('Proceed to destination');
  const [distanceRemaining, setDistanceRemaining] = useState<number>(2400);
  const [etaRemaining, setEtaRemaining] = useState<number>(180);
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);

  // Ambulance current GPS
  const [ambPos, setAmbPos] = useState<[number, number]>([28.6139, 77.2090]);

  const watchIdRef = useRef<number | null>(null);
  const lastLocationSentRef = useRef<number>(0);

  // 1. Load active emergency and nearby hospitals
  const loadActiveEmergency = async () => {
    try {
      if (!currentUser?.token) return;
      const emergencies = await api.getEmergencies(currentUser.token);
      const active = emergencies.find(
        (e: any) => e.status !== EmergencyStatus.COMPLETED && e.status !== EmergencyStatus.CANCELLED
      );

      if (active) {
        setEmergency(active);
        if (active.routes && active.routes.length > 0) {
          const poly = JSON.parse(active.routes[0].polylineJson);
          setRoutePolyline(poly);
          setDistanceRemaining(Math.round(active.routes[0].distance));
          setEtaRemaining(Math.round(active.routes[0].duration));
          if (active.routes[0].stepsJson) {
            const steps = JSON.parse(active.routes[0].stepsJson);
            if (steps.length > 0) setCurrentInstruction(steps[0].instruction);
          }
        }
      }

      // Fetch nearby recommended hospitals
      const hospList = await api.getNearbyHospitals(ambPos[0], ambPos[1]);
      setHospitals(hospList);
      if (hospList.length > 0) {
        const top = hospList.find((h: any) => h.isRecommended) || hospList[0];
        setSelectedHospitalId(top.id);
      }
    } catch (err) {
      console.error('Failed to load emergency data', err);
    }
  };

  useEffect(() => {
    loadActiveEmergency();
  }, [currentUser]);

  // 2. Real-time socket events
  useEffect(() => {
    const socket = getSocket(currentUser?.token);

    socket.on('connect', () => {
      setConnectionStatus('ONLINE');
      // Flush offline GPS points when reconnected (Requirement 39)
      flushOfflineQueue();
    });
    socket.on('disconnect', () => setConnectionStatus('OFFLINE'));
    socket.on('reconnecting', () => setConnectionStatus('RECONNECTING'));

    socket.on('admin:alert_count_update', (data: any) => {
      if (data.emergencyId === emergency?.id) {
        setAlertedCount(data.alertedCount);
      }
    });

    socket.on(SOCKET_EVENTS.EMERGENCY_UPDATED, (updated: any) => {
      if (updated.id === emergency?.id) {
        setEmergency(updated);
        if (updated.routes && updated.routes.length > 0) {
          setRoutePolyline(JSON.parse(updated.routes[0].polylineJson));
        }
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnecting');
      socket.off('admin:alert_count_update');
      socket.off(SOCKET_EVENTS.EMERGENCY_UPDATED);
    };
  }, [emergency, currentUser]);

  // 3. REAL GPS TRACKING (Requirement 4, 5, 7, 38)
  const isEmergencyActive =
    emergency &&
    emergency.status !== EmergencyStatus.COMPLETED &&
    emergency.status !== EmergencyStatus.CANCELLED &&
    emergency.status !== EmergencyStatus.CREATED &&
    emergency.status !== EmergencyStatus.ASSIGNED;

  useEffect(() => {
    // Only engage real GPS when in REAL MODE and emergency is active
    if (appMode !== 'REAL') return;

    if (!navigator.geolocation) {
      setGpsPermission('unavailable');
      setPermissionError('Geolocation is not supported by your browser or device.');
      return;
    }

    // Start watching physical device GPS
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPermission('granted');
        setPermissionError(null);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        const speed = pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : null;
        const heading = pos.coords.heading !== null ? Math.round(pos.coords.heading) : null;

        setAmbPos([lat, lng]);
        setGpsAccuracy(accuracy);
        setGpsSpeed(speed);
        setGpsHeading(heading);

        // Throttle updates to backend: 3-5 seconds (Requirement 7)
        const now = Date.now();
        if (isEmergencyActive && now - lastLocationSentRef.current >= 3000) {
          lastLocationSentRef.current = now;
          sendLocationUpdate({
            latitude: lat,
            longitude: lng,
            accuracy,
            speed: speed ?? 45,
            heading: heading ?? 0,
            timestamp: now
          });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsPermission('denied');
          setPermissionError('Location permission denied. Enable GPS access in browser settings.');
        } else {
          setPermissionError(`GPS error: ${err.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000
      }
    );

    watchIdRef.current = watchId;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [appMode, isEmergencyActive, emergency?.ambulanceId, currentUser?.token]);

  // Dispatch location update with offline queueing (Requirement 39)
  const sendLocationUpdate = async (locData: any) => {
    if (!currentUser?.token || !emergency?.ambulanceId) return;

    try {
      const res = await api.updateAmbulanceLocation(emergency.ambulanceId, locData, currentUser.token);
      setLastUploadTime(new Date().toLocaleTimeString());
      if (res.alertedDriversCount !== undefined) {
        setAlertedCount(res.alertedDriversCount);
      }
    } catch (e) {
      // Network failure: queue points locally (Requirement 39)
      console.warn('Network offline: queuing ambulance GPS point locally', locData);
      setOfflineQueue((prev) => [...prev.slice(-15), locData]);
    }
  };

  const flushOfflineQueue = async () => {
    if (offlineQueue.length === 0 || !currentUser?.token || !emergency?.ambulanceId) return;
    const latest = offlineQueue[offlineQueue.length - 1];
    try {
      await api.updateAmbulanceLocation(emergency.ambulanceId, latest, currentUser.token);
      setOfflineQueue([]);
      setLastUploadTime(new Date().toLocaleTimeString());
    } catch {
      // Keep queue for next attempt
    }
  };

  // 4. DEMO MODE GPS SIMULATION (Optional development preview - Requirement 1 & 31)
  useEffect(() => {
    if (appMode !== 'DEMO' || !isSimulatingGps || !emergency || routePolyline.length === 0) return;

    let stepIdx = 0;
    const interval = setInterval(async () => {
      if (stepIdx < routePolyline.length) {
        const nextCoord = routePolyline[stepIdx];
        setAmbPos(nextCoord);
        setGpsAccuracy(3);
        setGpsSpeed(52);
        setGpsHeading(45);

        if (currentUser?.token && emergency?.ambulanceId) {
          try {
            const res = await api.updateAmbulanceLocation(
              emergency.ambulanceId,
              {
                latitude: nextCoord[0],
                longitude: nextCoord[1],
                speed: 52,
                heading: 45,
                accuracy: 3
              },
              currentUser.token
            );
            setLastUploadTime(new Date().toLocaleTimeString());
            if (res.alertedDriversCount !== undefined) {
              setAlertedCount(res.alertedDriversCount);
            }
          } catch (e) {
            console.error('Simulated location upload failed', e);
          }
        }

        setDistanceRemaining((prev) => Math.max(0, prev - 120));
        setEtaRemaining((prev) => Math.max(0, prev - 8));
        stepIdx++;
      } else {
        clearInterval(interval);
        setIsSimulatingGps(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [appMode, isSimulatingGps, routePolyline, emergency, currentUser]);

  // 5. State Machine Action Handler
  const handleMainAction = async () => {
    if (!emergency || !currentUser?.token) return;

    // In REAL MODE: enforce location permission check before starting (Requirement 21)
    if (
      appMode === 'REAL' &&
      (emergency.status === EmergencyStatus.ASSIGNED || emergency.status === EmergencyStatus.CREATED)
    ) {
      if (gpsPermission === 'denied' || gpsPermission === 'unavailable') {
        alert('Location permission is required to start an emergency ride. Please grant GPS access.');
        return;
      }
    }

    try {
      if (emergency.status === EmergencyStatus.ASSIGNED || emergency.status === EmergencyStatus.CREATED) {
        const res = await api.startEmergency(emergency.id, currentUser.token, {
          latitude: ambPos[0],
          longitude: ambPos[1]
        });
        setEmergency(res);
        setRoutePolyline(JSON.parse(res.routes[0].polylineJson));

        if (appMode === 'DEMO') {
          setIsSimulatingGps(true);
        } else {
          // Immediately send initial device location
          sendLocationUpdate({
            latitude: ambPos[0],
            longitude: ambPos[1],
            accuracy: gpsAccuracy ?? 8,
            speed: gpsSpeed ?? 0,
            heading: gpsHeading ?? 0,
            timestamp: Date.now()
          });
        }
      } else if (emergency.status === EmergencyStatus.EN_ROUTE_TO_PATIENT) {
        const res = await api.arrivePatient(emergency.id, currentUser.token);
        setEmergency(res);
      } else if (emergency.status === EmergencyStatus.AT_PATIENT) {
        const res = await api.pickupPatient(emergency.id, currentUser.token);
        setEmergency(res);
        setShowHospitalModal(true);
      } else if (emergency.status === EmergencyStatus.PATIENT_PICKED_UP) {
        setShowHospitalModal(true);
      } else if (emergency.status === EmergencyStatus.EN_ROUTE_TO_HOSPITAL) {
        const res = await api.arriveHospital(emergency.id, currentUser.token);
        setEmergency(res);
      } else if (emergency.status === EmergencyStatus.AT_HOSPITAL) {
        const res = await api.completeEmergency(emergency.id, currentUser.token);
        setEmergency(res);
        setIsSimulatingGps(false);
      }
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    }
  };

  // 5.5 Fast Test Actions for Real-World Corridor Alert Testing
  const handleStartCorridorTrip = async () => {
    if (!currentUser?.token) return;
    try {
      // If there is an existing emergency, complete/cancel it first so ambulance is available
      if (emergency) {
        await api.cancelEmergency(emergency.id, currentUser.token).catch(() => {});
      }

      // 1. Create fresh emergency directly passing through corridor with driver A (28.6209, 77.2150)
      const newEmg = await api.createEmergency(
        {
          pickupLatitude: 28.6260,
          pickupLongitude: 77.2200,
          pickupAddress: 'Barakhamba Road Corridor Intersection',
          ambulanceId: 'amb-001',
          priority: 'CRITICAL'
        },
        currentUser.token
      );

      // 2. Start the emergency (calculates route and activates passage network)
      const ambStart: [number, number] = [28.6139, 77.2090];
      setAmbPos(ambStart);
      const started = await api.startEmergency(newEmg.id, currentUser.token, {
        latitude: ambStart[0],
        longitude: ambStart[1]
      });
      setEmergency(started);
      if (started.routes && started.routes.length > 0) {
        setRoutePolyline(JSON.parse(started.routes[0].polylineJson));
        setDistanceRemaining(Math.round(started.routes[0].distance));
        setEtaRemaining(Math.round(started.routes[0].duration));
      }

      // 3. Immediately send ambulance position from start of corridor
      const locRes = await api.updateAmbulanceLocation(
        'amb-001',
        {
          latitude: ambStart[0],
          longitude: ambStart[1],
          speed: 55,
          heading: 45,
          accuracy: 5,
          timestamp: Date.now()
        },
        currentUser.token
      );

      if (locRes.alertedDriversCount !== undefined) {
        setAlertedCount(locRes.alertedDriversCount);
      }
      alert(`⚡ Emergency trip started! Passage corridor calculated and ${locRes.alertedDriversCount ?? 0} driver(s) alerted along the route.`);
    } catch (err: any) {
      alert(`Could not start corridor trip: ${err.message}`);
    }
  };

  const handlePingCorridor = async () => {
    if (!currentUser?.token || !emergency) {
      alert('No active emergency. Click "⚡ New Corridor Trip" to start one.');
      return;
    }
    try {
      const res = await api.updateAmbulanceLocation(
        emergency.ambulanceId || 'amb-001',
        {
          latitude: ambPos[0],
          longitude: ambPos[1],
          speed: gpsSpeed ?? 50,
          heading: gpsHeading ?? 0,
          accuracy: gpsAccuracy ?? 5,
          timestamp: Date.now()
        },
        currentUser.token
      );
      if (res.alertedDriversCount !== undefined) {
        setAlertedCount(res.alertedDriversCount);
      }
      alert(`🚨 Corridor pinged! ${res.alertedDriversCount ?? 0} driver(s) currently notified along route.`);
    } catch (err: any) {
      alert(`Ping error: ${err.message}`);
    }
  };

  const handleResetTrip = async () => {
    if (!currentUser?.token || !emergency) return;
    if (!confirm('Are you sure you want to cancel and reset the current emergency trip?')) return;
    try {
      await api.cancelEmergency(emergency.id, currentUser.token).catch(() => {});
      setEmergency(null);
      setRoutePolyline([]);
      setAlertedCount(0);
      alert('Emergency trip cleared. Ambulance is now AVAILABLE.');
    } catch (err: any) {
      alert(`Reset error: ${err.message}`);
    }
  };

  const handleConfirmHospitalRoute = async () => {
    if (!emergency || !selectedHospitalId || !currentUser?.token) return;
    try {
      const res = await api.startHospitalRoute(emergency.id, selectedHospitalId, currentUser.token);
      setEmergency(res);
      setShowHospitalModal(false);
      setRoutePolyline(JSON.parse(res.routes[0].polylineJson));
      if (appMode === 'DEMO') {
        setIsSimulatingGps(true);
      }
    } catch (err: any) {
      alert(`Routing failed: ${err.message}`);
    }
  };

  // Map markers
  const markers: any[] = [
    {
      id: 'amb',
      position: ambPos,
      type: 'ambulance' as const,
      label: emergency?.ambulance?.registrationNumber || 'Ambulance'
    }
  ];

  if (emergency?.pickupLatitude && emergency?.pickupLongitude) {
    markers.push({
      id: 'patient',
      position: [emergency.pickupLatitude, emergency.pickupLongitude],
      type: 'patient' as const,
      label: 'Patient Location'
    });
  }

  if (emergency?.hospital) {
    markers.push({
      id: 'hosp',
      position: [emergency.hospital.latitude, emergency.hospital.longitude],
      type: 'hospital' as const,
      label: `${emergency.hospital.name} (ICU: ${emergency.hospital.icuBeds})`
    });
  }

  return (
    <div className="relative w-full h-[calc(100vh-65px)] flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* 1. TOP HEADER & MODE SELECTOR */}
      <div className="z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center font-black text-xl shadow-md">
            🚑
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-wide">
                {emergency?.emergencyNumber || 'ASSIGNED EMERGENCY'}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
                {emergency?.priority || 'CRITICAL'}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-[220px] sm:max-w-md">
              {emergency?.pickupAddress || 'Patient Location Loading...'}
            </p>
          </div>
        </div>

        {/* Mode Selector & Status Bar */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Mode Switcher (Requirement 1: Real Mode is Default) */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => {
                setAppMode('REAL');
                setIsSimulatingGps(false);
              }}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 ${
                appMode === 'REAL' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>REAL MODE</span>
            </button>
            <button
              onClick={() => {
                setAppMode('DEMO');
              }}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 ${
                appMode === 'DEMO' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>DEMO MODE</span>
            </button>
          </div>

          {/* Quick Action Buttons for Corridor Testing */}
          <button
            onClick={handleStartCorridorTrip}
            title="Dispatch fresh emergency & alert corridor drivers"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition"
          >
            <span>⚡ New Corridor Trip</span>
          </button>

          <button
            onClick={handlePingCorridor}
            title="Ping ambulance GPS and notify ahead corridor drivers"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md transition"
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ping Corridor</span>
          </button>

          {emergency && (
            <button
              onClick={handleResetTrip}
              title="Cancel and reset current emergency"
              className="text-xs px-2 py-1 rounded-lg font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              Reset
            </button>
          )}

          {/* Alerted Drivers Count Badge */}
          <div className="flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-emerald-300 font-bold text-xs shadow-sm">
            <Users className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>{alertedCount} Alerted</span>
          </div>

          {/* GPS Diagnostics Toggle Button (Requirement 37) */}
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
          >
            <Info className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">Diagnostics</span>
          </button>

          {/* Connection Status */}
          <div
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold border ${
              connectionStatus === 'ONLINE'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-400'
            }`}
          >
            {connectionStatus === 'ONLINE' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{connectionStatus}</span>
          </div>
        </div>
      </div>

      {/* Permission Warning Banner (Requirement 21) */}
      {permissionError && appMode === 'REAL' && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{permissionError}</span>
          </div>
          <button
            onClick={() => setAppMode('DEMO')}
            className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px]"
          >
            Switch to Demo Mode
          </button>
        </div>
      )}

      {/* Low GPS Accuracy Warning (Requirement 38) */}
      {gpsAccuracy && gpsAccuracy > 50 && appMode === 'REAL' && (
        <div className="bg-yellow-950/90 border-b border-yellow-500/40 px-4 py-1.5 flex items-center gap-2 text-xs text-yellow-200 z-30">
          <AlertOctagon className="w-4 h-4 text-yellow-400 shrink-0" />
          <span>GPS accuracy is low (±{gpsAccuracy}m). Position may drift until clear sky view is obtained.</span>
        </div>
      )}

      {/* 2. FULL-SCREEN NAVIGATION MAP */}
      <div className="flex-1 relative w-full h-full">
        <LiveMap center={ambPos} zoom={14} routePolyline={routePolyline} markers={markers} />

        {/* Turn-by-Turn Maneuver Banner */}
        <div className="absolute top-4 left-4 right-4 sm:left-6 sm:w-96 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-2xl shadow-2xl flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-lg">
            <Compass className="w-6 h-6 animate-spin-slow" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs uppercase font-extrabold tracking-wider text-blue-400">Next Maneuver</p>
            <p className="text-sm font-bold text-white truncate">{currentInstruction}</p>
          </div>
        </div>

        {/* GPS Diagnostics Screen / Floating Overlay (Requirement 37) */}
        {showDiagnostics && (
          <div className="absolute top-20 right-4 z-30 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-4 shadow-2xl w-80 text-xs space-y-2 text-slate-300">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" /> GPS Diagnostics (Test Tool)
              </span>
              <button onClick={() => setShowDiagnostics(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500">Mode:</span>{' '}
                <span className="font-bold text-white">{appMode}</span>
              </div>
              <div>
                <span className="text-slate-500">Permission:</span>{' '}
                <span className="font-bold text-emerald-400">{gpsPermission}</span>
              </div>
              <div>
                <span className="text-slate-500">Latitude:</span>{' '}
                <span className="font-mono text-white">{ambPos[0].toFixed(5)}</span>
              </div>
              <div>
                <span className="text-slate-500">Longitude:</span>{' '}
                <span className="font-mono text-white">{ambPos[1].toFixed(5)}</span>
              </div>
              <div>
                <span className="text-slate-500">Accuracy:</span>{' '}
                <span className="text-white">±{gpsAccuracy ?? '--'} m</span>
              </div>
              <div>
                <span className="text-slate-500">Speed:</span>{' '}
                <span className="text-white">{gpsSpeed !== null ? `${gpsSpeed} km/h` : '0 km/h'}</span>
              </div>
              <div>
                <span className="text-slate-500">Heading:</span>{' '}
                <span className="text-white">{gpsHeading !== null ? `${gpsHeading}°` : '0°'}</span>
              </div>
              <div>
                <span className="text-slate-500">Socket:</span>{' '}
                <span className="text-emerald-400">{connectionStatus}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Last Upload:</span>{' '}
                <span className="text-white">{lastUploadTime || 'Standby'}</span>
              </div>
              {offlineQueue.length > 0 && (
                <div className="col-span-2 text-amber-400">
                  <span>Queued Offline Points: {offlineQueue.length}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. BOTTOM FLOATING NAVIGATION CONTROL CARD */}
      <div className="z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-4 shadow-2xl">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Distance & ETA */}
          <div className="flex items-center gap-6 w-full sm:w-auto justify-around sm:justify-start">
            <div>
              <p className="text-xs font-semibold text-slate-400">ESTIMATED TIME</p>
              <p className="text-2xl font-black text-white">
                ~{Math.max(1, Math.round(etaRemaining / 60))} <span className="text-sm font-semibold text-slate-400">min</span>
              </p>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div>
              <p className="text-xs font-semibold text-slate-400">DISTANCE</p>
              <p className="text-2xl font-black text-white">
                {(distanceRemaining / 1000).toFixed(1)} <span className="text-sm font-semibold text-slate-400">km</span>
              </p>
            </div>
            <div className="h-8 w-px bg-slate-700 sm:block hidden" />
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-slate-400">PASSAGE CORRIDOR</p>
              <p className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                <Radio className="w-4 h-4 animate-ping" /> {appMode === 'REAL' ? 'REAL GPS LIVE' : 'SIMULATION'}
              </p>
            </div>
          </div>

          {/* Large Action Transition Button */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {appMode === 'DEMO' && (
              <button
                onClick={() => setIsSimulatingGps(!isSimulatingGps)}
                className={`px-3 py-3 rounded-xl font-bold text-xs border transition ${
                  isSimulatingGps
                    ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {isSimulatingGps ? 'PAUSE GPS' : 'SIMULATE GPS'}
              </button>
            )}

            <button
              onClick={handleMainAction}
              className={`flex-1 sm:flex-none px-6 py-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition active:scale-95 ${
                emergency?.status === EmergencyStatus.COMPLETED
                  ? 'bg-emerald-600 text-white cursor-default'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {emergency?.status === EmergencyStatus.ASSIGNED || emergency?.status === EmergencyStatus.CREATED
                ? 'START EMERGENCY'
                : emergency?.status === EmergencyStatus.EN_ROUTE_TO_PATIENT
                ? 'ARRIVED AT PATIENT'
                : emergency?.status === EmergencyStatus.AT_PATIENT
                ? 'PATIENT PICKED UP'
                : emergency?.status === EmergencyStatus.PATIENT_PICKED_UP
                ? 'SELECT HOSPITAL'
                : emergency?.status === EmergencyStatus.EN_ROUTE_TO_HOSPITAL
                ? 'ARRIVED AT HOSPITAL'
                : emergency?.status === EmergencyStatus.AT_HOSPITAL
                ? 'COMPLETE EMERGENCY'
                : 'EMERGENCY COMPLETED'}
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. HOSPITAL SELECTION MODAL */}
      {showHospitalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <HospitalIcon className="w-6 h-6 text-blue-400" />
                <h3 className="text-lg font-bold">Select Destination Hospital</h3>
              </div>
              <button onClick={() => setShowHospitalModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-3 mb-4">
              Ranked by emergency trauma receiving capacity, ICU bed availability, and real travel time.
            </p>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {hospitals.map((h) => (
                <div
                  key={h.id}
                  onClick={() => setSelectedHospitalId(h.id)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                    selectedHospitalId === h.id
                      ? 'bg-blue-950/60 border-blue-500 shadow-md ring-1 ring-blue-500'
                      : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-white">{h.name}</span>
                    {h.isRecommended && (
                      <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{h.address}</p>

                  <div className="flex items-center gap-4 mt-2 text-xs font-semibold text-slate-300">
                    <span>Distance: {(h.distanceMeters / 1000).toFixed(1)} km</span>
                    <span>ETA: ~{Math.round(h.etaSeconds / 60)} min</span>
                    <span className="text-emerald-400">ICU Beds: {h.icuBeds}</span>
                  </div>
                  {h.recommendationReason && (
                    <p className="text-[11px] text-blue-300 mt-1 italic">{h.recommendationReason}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowHospitalModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHospitalRoute}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg"
              >
                Confirm & Start Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
