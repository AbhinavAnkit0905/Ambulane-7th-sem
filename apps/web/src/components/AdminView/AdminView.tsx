'use client';

import React, { useState, useEffect } from 'react';
import LiveMap from '../Map/LiveMap';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { SOCKET_EVENTS } from '@smart-ambulance/shared';
import {
  Activity,
  Ambulance,
  Building2 as HospitalIcon,
  Users,
  Clock,
  Play,
  Square,
  Radio,
  ShieldAlert,
  MapPin,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertCircle,
  Database,
  Wifi,
  WifiOff,
  LocateFixed
} from 'lucide-react';

export default function AdminView() {
  const { currentUser } = useAppStore();
  const [kpis, setKpis] = useState<any>({
    activeEmergencies: 0,
    availableAmbulances: 2,
    ambulancesOnEmergency: 0,
    hospitalsAvailable: 2,
    usersCurrentlyAlerted: 0,
    averageEmergencyResponseTimeMinutes: 4.8,
    alertCoveragePercentage: 96.4,
    averageAlertLeadTimeSeconds: 115
  });

  const [activeEmergencies, setActiveEmergencies] = useState<any[]>([]);
  const [liveAmbulanceLocations, setLiveAmbulanceLocations] = useState<Record<string, [number, number]>>({});
  const [selectedEmergency, setSelectedEmergency] = useState<any>(null);
  const [demoStatus, setDemoStatus] = useState<any>({ isRunning: false, logs: [] });
  const [systemHealth, setSystemHealth] = useState<any>({ status: 'checking', database: 'checking', socket: 'checking' });
  const [connectionStatus, setConnectionStatus] = useState<'ONLINE' | 'RECONNECTING' | 'OFFLINE'>('ONLINE');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch admin dashboard and system health
  const loadDashboardData = async () => {
    if (!currentUser?.token) return;
    try {
      setIsLoading(true);
      const data = await api.getAdminDashboard(currentUser.token);
      setKpis(data.kpis);
      setActiveEmergencies(data.activeEmergencies || []);
      if (data.activeEmergencies?.length > 0 && !selectedEmergency) {
        setSelectedEmergency(data.activeEmergencies[0]);
      }
      const demoRes = await api.getDemoStatus(currentUser.token);
      setDemoStatus(demoRes);

      // Check health endpoint (Requirement 36)
      const healthRes = await fetch('/health').then((r) => r.json()).catch(() => ({ status: 'error', database: 'disconnected', socket: 'inactive' }));
      setSystemHealth(healthRes);
    } catch (err) {
      console.error('Failed to load admin dashboard', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentUser]);

  // Real-time updates via Socket.IO (Requirement 28: No refresh needed)
  useEffect(() => {
    const socket = getSocket(currentUser?.token);

    socket.on('connect', () => setConnectionStatus('ONLINE'));
    socket.on('disconnect', () => setConnectionStatus('OFFLINE'));
    socket.on('reconnecting', () => setConnectionStatus('RECONNECTING'));

    socket.on(SOCKET_EVENTS.EMERGENCY_CREATED, () => loadDashboardData());
    socket.on(SOCKET_EVENTS.EMERGENCY_UPDATED, () => loadDashboardData());
    socket.on(SOCKET_EVENTS.EMERGENCY_COMPLETED, () => loadDashboardData());
    socket.on('admin:alert_count_update', (data: any) => {
      setKpis((prev: any) => ({ ...prev, usersCurrentlyAlerted: data.alertedCount }));
    });

    // Real-time ambulance GPS movement from real devices (Requirement 28)
    socket.on(SOCKET_EVENTS.AMBULANCE_LOCATION, (data: any) => {
      if (data.ambulanceId && data.latitude && data.longitude) {
        setLiveAmbulanceLocations((prev) => ({
          ...prev,
          [data.ambulanceId]: [data.latitude, data.longitude]
        }));
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnecting');
      socket.off(SOCKET_EVENTS.EMERGENCY_CREATED);
      socket.off(SOCKET_EVENTS.EMERGENCY_UPDATED);
      socket.off(SOCKET_EVENTS.EMERGENCY_COMPLETED);
      socket.off('admin:alert_count_update');
      socket.off(SOCKET_EVENTS.AMBULANCE_LOCATION);
    };
  }, [currentUser]);

  // Periodic polling for demo logs if demo is running
  useEffect(() => {
    if (!demoStatus.isRunning || !currentUser?.token) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.getDemoStatus(currentUser.token);
        setDemoStatus(status);
        if (!status.isRunning) {
          loadDashboardData();
        }
      } catch (e) {
        console.error(e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [demoStatus.isRunning, currentUser]);

  const handleStartDemo = async () => {
    if (!currentUser?.token) return;
    try {
      await api.startDemo(currentUser.token);
      setDemoStatus((prev: any) => ({ ...prev, isRunning: true }));
      loadDashboardData();
    } catch (err: any) {
      alert(`Demo start failed: ${err.message}`);
    }
  };

  const handleStopDemo = async () => {
    if (!currentUser?.token) return;
    try {
      await api.stopDemo(currentUser.token);
      setDemoStatus((prev: any) => ({ ...prev, isRunning: false }));
      loadDashboardData();
    } catch (err: any) {
      alert(`Demo stop failed: ${err.message}`);
    }
  };

  // Build markers for map (Requirement 29: Admin sees ambulances, routes, hospitals, NOT private user markers)
  const markers: any[] = [];
  let routePolyline: [number, number][] = [];

  activeEmergencies.forEach((emg) => {
    const ambLivePos =
      emg.ambulance?.id && liveAmbulanceLocations[emg.ambulance.id]
        ? liveAmbulanceLocations[emg.ambulance.id]
        : emg.ambulance?.latitude && emg.ambulance?.longitude
        ? [emg.ambulance.latitude, emg.ambulance.longitude]
        : null;

    if (ambLivePos) {
      markers.push({
        id: `amb-${emg.id}`,
        position: ambLivePos,
        type: 'ambulance',
        label: `${emg.ambulance?.registrationNumber || 'Ambulance'} (${emg.status})`
      });
    }

    if (emg.pickupLatitude && emg.pickupLongitude) {
      markers.push({
        id: `pickup-${emg.id}`,
        position: [emg.pickupLatitude, emg.pickupLongitude],
        type: 'patient',
        label: `Incident: ${emg.emergencyNumber}`
      });
    }

    if (emg.hospital) {
      markers.push({
        id: `hosp-${emg.hospital.id}`,
        position: [emg.hospital.latitude, emg.hospital.longitude],
        type: 'hospital',
        label: `${emg.hospital.name} (ICU: ${emg.hospital.icuBeds})`
      });
    }

    if (emg.routes && emg.routes.length > 0 && (!selectedEmergency || selectedEmergency.id === emg.id)) {
      try {
        routePolyline = JSON.parse(emg.routes[0].polylineJson);
      } catch {
        routePolyline = [];
      }
    }
  });

  return (
    <div className="w-full min-h-[calc(100vh-65px)] bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6 gap-6">
      {/* 1. TOP SYSTEM HEALTH & CONNECTION BAR (Requirement 36) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-2xl">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-sm text-white tracking-wide">
            EMERGENCY CONTROL CENTER
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            REAL MODE ACTIVE
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Database Status */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>DB:</span>
            <span className={systemHealth.database === 'connected' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
              {systemHealth.database}
            </span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Socket Real-Time Status */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Socket:</span>
            <span className={connectionStatus === 'ONLINE' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
              {connectionStatus}
            </span>
          </div>

          <button
            onClick={loadDashboardData}
            className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            title="Refresh Dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. TOP STATS / KPIS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Emergencies</span>
            <Activity className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-white">{kpis.activeEmergencies}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-blue-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Available Fleet</span>
            <Ambulance className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-white">{kpis.availableAmbulances}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Users Alerted</span>
            <Users className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-white">{kpis.usersCurrentlyAlerted}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-indigo-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Hospitals Open</span>
            <HospitalIcon className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-white">{kpis.hospitalsAvailable}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Avg Lead Time</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-white">{kpis.averageAlertLeadTimeSeconds}s</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-purple-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Corridor Coverage</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-white">{kpis.alertCoveragePercentage}%</p>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE (LIVE MAP + QUEUE / DEMO REPLAY) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[520px]">
        {/* Real-time Map (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col relative">
          <div className="p-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="font-extrabold text-sm text-white">Live Passage Network Map</h3>
            </div>
            <span className="text-xs text-slate-400">
              {markers.filter((m) => m.type === 'ambulance').length} Live Units Active
            </span>
          </div>

          <div className="flex-1 w-full h-[450px] lg:h-full relative">
            <LiveMap
              center={[28.6139, 77.2090]}
              zoom={13}
              routePolyline={routePolyline}
              markers={markers}
            />
          </div>
        </div>

        {/* Right Panel: Active Emergency Queue & Optional Demo Mode Controller */}
        <div className="flex flex-col gap-4">
          {/* Active Emergencies Queue */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex-1 flex flex-col">
            <h3 className="font-extrabold text-sm text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-500" /> Active Emergency Operations
            </h3>

            {activeEmergencies.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center text-xs">
                <CheckCircle2 className="w-8 h-8 text-slate-600 mb-2" />
                <span>All emergency units in standby. No active incidents.</span>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-56 pr-1">
                {activeEmergencies.map((emg) => (
                  <div
                    key={emg.id}
                    onClick={() => setSelectedEmergency(emg)}
                    className={`p-3 rounded-2xl border cursor-pointer transition ${
                      selectedEmergency?.id === emg.id
                        ? 'bg-rose-950/40 border-rose-500/80 shadow-md ring-1 ring-rose-500/50'
                        : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">{emg.emergencyNumber}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        {emg.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">{emg.pickupAddress}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-300 mt-2 font-medium">
                      <span>Unit: {emg.ambulance?.registrationNumber || 'Pending'}</span>
                      <span className="text-emerald-400">{emg.hospital?.name || 'En Route'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional Demo Mode Controller (Requirement 31: Clearly labeled as optional development simulation) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-xs text-slate-300 flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-amber-400" /> Demo Simulator (Development Tool)
              </h4>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Optional</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-tight">
              Replays a complete simulated emergency trip with mock GPS points and passage corridor alerts for development verification.
            </p>

            <div className="flex items-center gap-2">
              {!demoStatus.isRunning ? (
                <button
                  onClick={handleStartDemo}
                  className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                >
                  <Play className="w-3.5 h-3.5" /> Start Simulation
                </button>
              ) : (
                <button
                  onClick={handleStopDemo}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                >
                  <Square className="w-3.5 h-3.5" /> Stop Simulation
                </button>
              )}
            </div>

            {demoStatus.logs?.length > 0 && (
              <div className="mt-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 max-h-32 overflow-y-auto text-[10px] font-mono text-slate-400 space-y-1.5">
                {demoStatus.logs.slice(-5).map((log: any, idx: number) => {
                  const desc = typeof log === 'string'
                    ? log
                    : `[Step ${log.step ?? idx + 1}] ${log.description || 'Simulation step'} · Alerted: ${log.alertedCount ?? 0}`;
                  const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
                  return (
                    <div key={idx} className="flex items-center justify-between gap-2 border-b border-slate-900 pb-1 last:border-0">
                      <span className="truncate text-slate-300">{desc}</span>
                      {time && <span className="text-[9px] text-slate-500 shrink-0">{time}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
