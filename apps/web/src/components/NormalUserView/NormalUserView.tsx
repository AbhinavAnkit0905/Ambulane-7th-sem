'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import LiveMap from '../Map/LiveMap';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { SOCKET_EVENTS, EmergencyAlertPayload, LatLng } from '@smart-ambulance/shared';
import {
  Search,
  Navigation,
  Compass,
  Volume2,
  VolumeX,
  Newspaper,
  CloudSun,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  MapPin,
  LocateFixed,
  Wifi,
  WifiOff,
  AlertTriangle,
  X,
  CornerUpRight,
  CornerUpLeft,
  ArrowUp,
  Loader2,
  Fuel,
  Plane,
  Building2,
  Navigation2
} from 'lucide-react';

export default function NormalUserView() {
  const { currentUser, userAlerts, addOrUpdateAlert, removeAlert, alertSoundEnabled, toggleAlertSound } =
    useAppStore();

  // Real device location (starts at default or last known, updated via navigator.geolocation)
  const [userLocation, setUserLocation] = useState<[number, number]>([28.6189, 77.2130]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([28.6189, 77.2130]);
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied' | 'unavailable'>('prompt');
  const [permissionBannerDismissed, setPermissionBannerDismissed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'ONLINE' | 'RECONNECTING' | 'OFFLINE'>('ONLINE');

  // Routing and Search State
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [destinationCoord, setDestinationCoord] = useState<[number, number] | null>(null);
  const [userRoute, setUserRoute] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [routeSteps, setRouteSteps] = useState<any[]>([]);
  const [isRouting, setIsRouting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // News and Weather
  const [newsArticles, setNewsArticles] = useState<any[]>([]);
  const [newsCategory, setNewsCategory] = useState<string>('All');
  const [showNewsDrawer, setShowNewsDrawer] = useState(false);
  const [weather, setWeather] = useState<any>(null);

  // Active Emergency Alert (topmost priority active alert within 3km)
  const activeAlert = userAlerts.length > 0 ? userAlerts[0] : null;

  const watchIdRef = useRef<number | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const lastSentPosRef = useRef<[number, number] | null>(null);

  // Audio chime for emergency alert (Requirement 14 & 18)
  const playAlertSound = () => {
    if (!alertSoundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.35); // A4

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch {
      // AudioContext might be blocked before first user gesture
    }
  };

  // 1. REAL DEVICE GPS WATCHER (Requirement 6 & 7)
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationPermission('unavailable');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationPermission('granted');
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);

        // Throttle updates to backend: every 10 seconds or when moving > 20 meters
        const now = Date.now();
        const lastSent = lastSentTimeRef.current;
        const lastPos = lastSentPosRef.current;

        const distanceMoved = lastPos
          ? Math.sqrt(Math.pow(lat - lastPos[0], 2) + Math.pow(lng - lastPos[1], 2)) * 111000
          : 999;

        if (now - lastSent >= 10000 || distanceMoved >= 20) {
          lastSentTimeRef.current = now;
          lastSentPosRef.current = [lat, lng];

          if (currentUser?.token) {
            api.updateUserLocation(
              {
                latitude: lat,
                longitude: lng,
                speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : null,
                heading: pos.coords.heading ?? null,
                accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null
              },
              currentUser.token
            ).catch((err) => console.debug('User location update error:', err));
          }
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationPermission('denied');
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
  }, [currentUser?.token]);

  // 1.5. Initial Alerts & Initial Location Sync
  useEffect(() => {
    if (currentUser?.token) {
      // Fetch any active passage alerts on initial load
      api.getMyAlerts(currentUser.token)
        .then((alerts) => {
          if (Array.isArray(alerts) && alerts.length > 0) {
            alerts.forEach((a: any) => addOrUpdateAlert(a));
          }
        })
        .catch((err) => console.debug('Failed to fetch initial alerts:', err));

      // Send initial location so passage corridor recognizes this driver
      api.updateUserLocation(
        {
          latitude: userLocation[0],
          longitude: userLocation[1],
          accuracy: 10
        },
        currentUser.token
      ).catch((err) => console.debug('Initial location sync error:', err));
    }
  }, [currentUser?.token]);

  // 2. SOCKET.IO REAL-TIME ALERTS (Requirement 8, 9, 14, 16, 18, 19)
  useEffect(() => {
    const socket = getSocket(currentUser?.token);

    const handleConnect = () => {
      setConnectionStatus('ONLINE');
      if (currentUser?.id) {
        socket.emit('register:user', currentUser.id);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setConnectionStatus('OFFLINE'));
    socket.on('reconnecting', () => setConnectionStatus('RECONNECTING'));

    // Register room immediately if already connected
    if (socket.connected && currentUser?.id) {
      socket.emit('register:user', currentUser.id);
    }

    // New alert entry within 3km -> Play sound once, register alert (Requirement 14 & 17)
    const onAlert = (payload: EmergencyAlertPayload) => {
      addOrUpdateAlert(payload);
      playAlertSound();
    };

    // Existing alert update -> Update distance/ETA silently without repeated audio chime (Requirement 18)
    const onAlertUpdate = (payload: EmergencyAlertPayload) => {
      addOrUpdateAlert(payload);
    };

    // Alert expired -> Ambulance passed or emergency completed (Requirement 19)
    const onAlertExpired = (data: { emergencyId: string }) => {
      removeAlert(data.emergencyId);
    };

    socket.on(SOCKET_EVENTS.EMERGENCY_ALERT, onAlert);
    socket.on(SOCKET_EVENTS.EMERGENCY_ALERT_UPDATE, onAlertUpdate);
    socket.on(SOCKET_EVENTS.EMERGENCY_ALERT_EXPIRED, onAlertExpired);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect');
      socket.off('reconnecting');
      socket.off(SOCKET_EVENTS.EMERGENCY_ALERT, onAlert);
      socket.off(SOCKET_EVENTS.EMERGENCY_ALERT_UPDATE, onAlertUpdate);
      socket.off(SOCKET_EVENTS.EMERGENCY_ALERT_EXPIRED, onAlertExpired);
    };
  }, [currentUser]);

  // 3. Load News and Weather (Requirement 45 & 46)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [newsRes, weatherRes] = await Promise.all([
          api.getLocalNews(newsCategory === 'All' ? undefined : newsCategory),
          api.getWeather(userLocation[0], userLocation[1])
        ]);
        setNewsArticles(newsRes.articles || []);
        setWeather(weatherRes);
      } catch (e) {
        console.error('Failed to load news or weather', e);
      }
    };
    loadData();
  }, [newsCategory, userLocation]);

  // 4. Calculate Driving Route to Destination
  const calculateRouteTo = async (destLat: number, destLng: number, labelName?: string) => {
    setIsRouting(true);
    setShowSuggestions(false);
    setDestinationCoord([destLat, destLng]);

    if (labelName) {
      setDestinationName(labelName);
      setDestinationQuery(labelName);
    }

    try {
      const [routeRes, reverseRes] = await Promise.all([
        api.getNormalRoute(
          { latitude: userLocation[0], longitude: userLocation[1] },
          { latitude: destLat, longitude: destLng }
        ),
        labelName ? Promise.resolve(null) : api.reverseGeocode(destLat, destLng).catch(() => null)
      ]);

      if (reverseRes && reverseRes.address) {
        const shortAddr = reverseRes.address.split(',').slice(0, 2).join(',').trim();
        setDestinationName(shortAddr);
        setDestinationQuery(shortAddr);
      }

      setUserRoute(routeRes.geometry);
      setRouteInfo({ distance: routeRes.distance, duration: routeRes.duration });
      setRouteSteps(routeRes.steps || []);
      setMapCenter([destLat, destLng]);
    } catch (err: any) {
      console.error('Route calculation error:', err);
    } finally {
      setIsRouting(false);
    }
  };

  // 5. Live Search & Autocomplete
  const handleSearchChange = (value: string) => {
    setDestinationQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim() || value.length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowSuggestions(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.searchPlaces(value);
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error('Place search error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  // 6. Handle Form Submit (Press Enter / Route)
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationQuery.trim()) return;

    if (searchResults.length > 0) {
      const first = searchResults[0];
      await calculateRouteTo(first.latitude, first.longitude, first.displayName.split(',')[0]);
      return;
    }

    // If query typed without dropdown selection, search immediately
    setIsSearching(true);
    try {
      const results = await api.searchPlaces(destinationQuery);
      if (results && results.length > 0) {
        const top = results[0];
        await calculateRouteTo(top.latitude, top.longitude, top.displayName.split(',')[0]);
      }
    } catch (err) {
      console.error('Search submit error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // 7. Select a place from dropdown
  const handleSelectPlace = (place: any) => {
    const cleanName = place.displayName.split(',')[0];
    calculateRouteTo(place.latitude, place.longitude, cleanName);
  };

  // 8. Map Click to Route
  const handleMapClick = (pos: LatLng) => {
    calculateRouteTo(pos.latitude, pos.longitude);
  };

  // 9. Quick Destination Chips
  const handleQuickDestination = async (category: string) => {
    setIsRouting(true);
    try {
      if (category === 'Hospital') {
        const nearby = await api.getNearbyHospitals(userLocation[0], userLocation[1]).catch(() => []);
        if (nearby && nearby.length > 0) {
          const top = nearby[0];
          await calculateRouteTo(top.latitude, top.longitude, top.name);
          return;
        }
      }

      const results = await api.searchPlaces(`${category} near me`);
      if (results && results.length > 0) {
        const top = results[0];
        await calculateRouteTo(top.latitude, top.longitude, top.displayName.split(',')[0]);
      } else {
        // Fallback offset if geocoding returns empty
        const destLat = userLocation[0] + 0.015;
        const destLng = userLocation[1] + 0.012;
        await calculateRouteTo(destLat, destLng, category);
      }
    } catch (err) {
      console.error('Quick destination route error:', err);
    } finally {
      setIsRouting(false);
    }
  };

  // 10. Clear Active Route
  const handleClearRoute = () => {
    setDestinationCoord(null);
    setDestinationName('');
    setDestinationQuery('');
    setUserRoute([]);
    setRouteInfo(null);
    setRouteSteps([]);
    setShowSuggestions(false);
  };

  // 11. Recenter Map on Driver
  const handleRecenter = () => {
    setMapCenter([...userLocation]);
  };

  // Map markers
  const markers: any[] = [
    {
      id: 'me',
      position: userLocation,
      type: 'user' as const,
      label: 'You (Connected Driver)'
    }
  ];

  if (destinationCoord) {
    markers.push({
      id: 'dest',
      position: destinationCoord,
      type: 'patient' as const,
      label: destinationName || destinationQuery || 'Destination'
    });
  }

  // If ambulance alert is active, show approaching ambulance on map (Requirement 14)
  if (activeAlert?.ambulanceLocation) {
    markers.push({
      id: 'alert_amb',
      position: [activeAlert.ambulanceLocation.latitude, activeAlert.ambulanceLocation.longitude],
      type: 'ambulance' as const,
      label: `EMERGENCY: ${activeAlert.ambulanceRegistration} (${activeAlert.distanceMeters}m away)`
    });
  }

  const handleTriggerPreviewAlert = () => {
    playAlertSound();
    const previewPayload: EmergencyAlertPayload = {
      alertId: 'preview-alert-' + Date.now(),
      emergencyId: 'emg-preview',
      emergencyNumber: 'EMG-TEST-911',
      ambulanceId: 'amb-001',
      ambulanceRegistration: 'EMERG-911',
      distanceMeters: 480,
      etaSeconds: 35,
      priorityLevel: 'EMERGENCY_VEHICLE_NEARBY' as any,
      status: 'ACTIVE' as any,
      ambulanceLocation: {
        latitude: userLocation[0] - 0.003,
        longitude: userLocation[1] - 0.002
      },
      safeInstruction: 'Please give way and allow the ambulance to pass when safe and legal to do so.',
      updatedAt: new Date().toISOString()
    };
    addOrUpdateAlert(previewPayload);
  };

  // Determine maneuver icon for current turn step
  const renderManeuverIcon = (step: any) => {
    const modifier = step?.maneuver?.modifier || '';
    if (modifier.includes('left')) {
      return <CornerUpLeft className="w-6 h-6 text-blue-400" />;
    }
    if (modifier.includes('right')) {
      return <CornerUpRight className="w-6 h-6 text-blue-400" />;
    }
    return <ArrowUp className="w-6 h-6 text-blue-400" />;
  };

  const nextStep = routeSteps.length > 0 ? routeSteps[0] : null;

  return (
    <div className="relative w-full h-[calc(100vh-65px)] flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* Location Permission Denied Warning (Requirement 22) */}
      {locationPermission === 'denied' && !permissionBannerDismissed && (
        <div className="bg-amber-950/95 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Enable location access in your browser or device settings to receive nearby ambulance passage warnings.</span>
          </div>
          <button
            onClick={() => setPermissionBannerDismissed(true)}
            className="text-amber-400 hover:text-white font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 max-w-xl mx-auto flex flex-col gap-2">
        <div className="relative bg-slate-900/95 backdrop-blur-md p-2 rounded-2xl border border-slate-700/80 shadow-2xl">
          <div className="flex items-center gap-2">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 px-3">
              {isSearching || isRouting ? (
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
              ) : (
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <input
                type="text"
                placeholder="Search destination, landmark or tap map..."
                value={destinationQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSuggestions(true);
                }}
                className="w-full bg-transparent text-sm text-white focus:outline-none placeholder:text-slate-500 font-medium"
              />
              {destinationQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setDestinationQuery('');
                    setSearchResults([]);
                    setShowSuggestions(false);
                  }}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={isRouting}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold text-white transition shadow-sm flex items-center gap-1"
              >
                <Navigation className="w-3 h-3" />
                <span>Route</span>
              </button>
            </form>

            {/* Sound & Status Controls & Test Alert Preview */}
            <div className="flex items-center gap-1.5 pr-1 border-l border-slate-700/80 pl-2">
              <button
                onClick={handleTriggerPreviewAlert}
                title="Test Emergency Alert Popup & Sound Chime"
                className="px-2 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 border border-rose-500/40 text-[11px] font-black text-rose-300 hover:text-white transition flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span className="hidden sm:inline">Test Alert</span>
              </button>

              <button
                onClick={toggleAlertSound}
                title={alertSoundEnabled ? 'Alert chime enabled' : 'Alert chime muted'}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                {alertSoundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
              </button>

              <div
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-bold border ${
                  connectionStatus === 'ONLINE'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                    : 'bg-amber-950/60 border-amber-500/40 text-amber-400'
                }`}
              >
                {connectionStatus === 'ONLINE' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span className="hidden sm:inline">{connectionStatus}</span>
              </div>
            </div>
          </div>

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-40 max-h-64 overflow-y-auto">
              <div className="p-2 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Matching Places
              </div>
              {searchResults.map((place, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPlace(place)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-blue-600/20 border-b border-slate-800/60 last:border-b-0 flex items-start gap-2.5 transition"
                >
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {place.displayName.split(',')[0]}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {place.displayName.split(',').slice(1).join(',').trim()}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                    {place.type || 'place'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick-Tap Destination Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          {[
            { label: 'Hospital', icon: '🏥' },
            { label: 'City Center', icon: '🏛️' },
            { label: 'Airport', icon: '✈️' },
            { label: 'Mall', icon: '🛒' },
            { label: 'Fuel', icon: '⛽' }
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => handleQuickDestination(chip.label)}
              className="px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-blue-600/30 border border-slate-700/80 hover:border-blue-500/50 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              <span>{chip.icon}</span>
              <span>{chip.label}</span>
            </button>
          ))}
        </div>

        {/* Live Weather & Status Bar */}
        {weather && (
          <div className="self-start flex items-center gap-3 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-800 text-xs text-slate-300">
            <div className="flex items-center gap-1 text-sky-400 font-semibold">
              <CloudSun className="w-3.5 h-3.5" />
              <span>{weather.temperature}°C {weather.condition}</span>
            </div>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] text-slate-400">💡 Tap map to set destination</span>
          </div>
        )}
      </div>

      {/* FULL-SCREEN LIVE MAP */}
      <div className="flex-1 relative w-full h-full">
        <LiveMap
          center={mapCenter}
          zoom={14}
          routePolyline={userRoute}
          markers={markers}
          routeColor="#2563eb"
          routeHaloColor="#93c5fd"
          onMapClick={handleMapClick}
        />

        {/* TURN-BY-TURN NAVIGATION HUD (Top Banner when route is active) */}
        {userRoute.length > 0 && nextStep && (
          <div className="absolute top-28 left-4 right-4 sm:left-6 sm:w-96 z-20">
            <div className="bg-slate-900/95 backdrop-blur-md border border-blue-500/40 rounded-2xl p-3.5 shadow-2xl flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                {renderManeuverIcon(nextStep)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400">
                    Next Turn · in {nextStep.distance > 1000 ? `${(nextStep.distance / 1000).toFixed(1)} km` : `${nextStep.distance} m`}
                  </span>
                </div>
                <p className="font-bold text-xs text-white truncate mt-0.5">
                  {nextStep.instruction || 'Continue on route'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* COMPACT EMERGENCY PASSAGE ALERT POPUP (Requirement 14 & 33) */}
        {activeAlert && (
          <div className="absolute top-28 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-30 animate-bounce-short">
            <div className="bg-rose-950/95 backdrop-blur-md border-2 border-rose-500 rounded-3xl p-4 shadow-2xl text-white">
              <div className="flex items-center justify-between pb-2 border-b border-rose-800/80">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-xs font-black tracking-wider uppercase text-rose-300">
                    EMERGENCY AMBULANCE APPROACHING
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold bg-rose-500/30 px-2 py-0.5 rounded text-rose-200 uppercase">
                    {activeAlert.priorityLevel || 'HIGH PRIORITY'}
                  </span>
                  <button
                    onClick={() => removeAlert(activeAlert.emergencyId)}
                    title="Dismiss alert card"
                    className="text-[11px] text-rose-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-rose-800/60 font-bold"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="mt-2.5">
                <h4 className="font-extrabold text-base text-white">
                  Ambulance {activeAlert.ambulanceRegistration}
                </h4>
                <div className="flex items-center gap-4 mt-1.5 text-xs font-bold text-rose-200">
                  <span>Distance: {activeAlert.distanceMeters} m</span>
                  <span>ETA: ~{Math.max(1, Math.round(activeAlert.etaSeconds / 60))} min</span>
                </div>
              </div>

              {/* Safety Guidance Box (Requirement 33: Give way when safe and legal) */}
              <div className="mt-3 bg-black/40 border border-rose-500/40 rounded-xl p-2.5 text-xs text-rose-100 font-semibold flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  {activeAlert.safeInstruction ||
                    'Please give way and allow the ambulance to pass when safe and legal to do so.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE ROUTE INFO CARD & END NAVIGATION BUTTON */}
        {routeInfo && (
          <div className="absolute bottom-20 left-4 right-4 sm:left-6 sm:w-80 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                  {destinationName || 'Destination'}
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-black text-white">
                    {(routeInfo.distance / 1000).toFixed(1)} km
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    · ~{Math.round(routeInfo.duration / 60)} min
                  </span>
                </div>
              </div>
              <button
                onClick={handleClearRoute}
                title="End route navigation"
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/60 border border-slate-700 hover:border-rose-500/50 text-xs font-bold text-slate-300 hover:text-rose-200 transition flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>End</span>
              </button>
            </div>

            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-full animate-pulse" />
            </div>
          </div>
        )}

        {/* Floating Action Buttons (Recenter & Local News) */}
        <div className="absolute bottom-6 right-4 sm:right-6 z-20 flex flex-col items-end gap-2.5">
          {/* Recenter Button */}
          <button
            onClick={handleRecenter}
            title="Re-center map on your vehicle"
            className="p-3 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 shadow-xl transition"
          >
            <LocateFixed className="w-5 h-5 text-blue-400" />
          </button>

          {/* Local News Drawer Toggle Button (Requirement 45) */}
          <button
            onClick={() => setShowNewsDrawer(!showNewsDrawer)}
            className="bg-slate-900/95 hover:bg-slate-800 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-2xl transition"
          >
            <Newspaper className="w-4 h-4 text-sky-400" />
            <span>Local News & Bulletins</span>
            {showNewsDrawer ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 5. LOCAL NEWS BOTTOM DRAWER */}
      {showNewsDrawer && (
        <div className="z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-4 max-h-72 overflow-y-auto shadow-2xl">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-sky-400" /> Local Traffic & Safety News
              </h3>
              <div className="flex items-center gap-1.5 text-xs">
                {['All', 'TRAFFIC', 'SAFETY'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setNewsCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      newsCategory === cat ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {newsArticles.map((article) => (
                <div key={article.id} className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between text-[11px] font-bold text-sky-400 mb-1">
                    <span>{article.category}</span>
                    <span className="text-slate-400">{article.source}</span>
                  </div>
                  <h4 className="font-bold text-xs text-white mb-1">{article.title}</h4>
                  <p className="text-[11px] text-slate-300 line-clamp-2">{article.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
