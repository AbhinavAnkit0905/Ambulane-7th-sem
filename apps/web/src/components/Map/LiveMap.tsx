'use client';

import React, { useEffect, useState } from 'react';
import { LatLng } from '@smart-ambulance/shared';
import 'leaflet/dist/leaflet.css';

interface MarkerItem {
  id: string;
  position: [number, number];
  type: 'ambulance' | 'hospital' | 'patient' | 'user';
  label?: string;
  sublabel?: string;
  heading?: number;
}

interface LiveMapProps {
  center?: [number, number];
  zoom?: number;
  routePolyline?: [number, number][];
  corridorBuffer?: boolean;
  markers?: MarkerItem[];
  interactive?: boolean;
  className?: string;
  routeColor?: string;
  routeHaloColor?: string;
  onMapClick?: (pos: LatLng) => void;
}

export default function LiveMap({
  center = [28.6139, 77.2090],
  zoom = 13,
  routePolyline = [],
  markers = [],
  className = 'w-full h-full min-h-[400px]',
  routeColor = '#e11d48',
  routeHaloColor,
  onMapClick
}: LiveMapProps) {
  const [mounted, setMounted] = useState(false);
  const [L, setL] = useState<any>(null);
  const onMapClickRef = React.useRef(onMapClick);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    // Dynamically load leaflet on client
    import('leaflet').then((leaflet) => {
      setL(leaflet.default);
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted || !L) return;

    const mapElement = document.getElementById('leaflet-map-container');
    if (!mapElement) return;

    // Check if map already initialized on this container
    if ((mapElement as any)._leaflet_id) {
      return;
    }

    const map = L.map('leaflet-map-container', {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    map.on('click', (e: any) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      }
    });

    // Force map to adapt to its parent container size
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    (mapElement as any)._mapInstance = map;

    return () => {
      map.remove();
      (mapElement as any)._mapInstance = null;
    };
  }, [mounted, L]);

  // Update map center, route, markers when props change
  useEffect(() => {
    if (!mounted || !L) return;
    const mapElement = document.getElementById('leaflet-map-container');
    const map = (mapElement as any)?._mapInstance;
    if (!map) return;

    // Layer groups for markers and routes
    let layerGroup = (mapElement as any)._customLayerGroup;
    if (layerGroup) {
      layerGroup.clearLayers();
    } else {
      layerGroup = L.layerGroup().addTo(map);
      (mapElement as any)._customLayerGroup = layerGroup;
    }

    // 1. Draw Route Corridor Halo + Primary Polyline
    if (routePolyline && routePolyline.length > 1) {
      const primaryColor = routeColor;
      const haloColor =
        routeHaloColor ||
        (primaryColor === '#2563eb' || primaryColor === '#3b82f6' ? '#60a5fa' : '#f43f5e');

      // Route corridor buffer halo
      L.polyline(routePolyline, {
        color: haloColor,
        weight: 12,
        opacity: 0.28,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(layerGroup);

      // Primary Route line
      L.polyline(routePolyline, {
        color: primaryColor,
        weight: 5,
        opacity: 0.95
      }).addTo(layerGroup);

      // Fit bounds to route
      const bounds = L.latLngBounds(routePolyline);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (center) {
      map.panTo(center);
    }

    // 2. Draw Custom Markers with SVGs
    markers.forEach((m) => {
      let iconHtml = '';

      if (m.type === 'ambulance') {
        iconHtml = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-10 h-10 rounded-full bg-rose-500 opacity-75 ambulance-pulse"></div>
            <div class="relative z-10 w-9 h-9 rounded-full bg-rose-600 border-2 border-white shadow-lg flex items-center justify-center text-white font-bold text-lg">
              🚑
            </div>
            ${m.label ? `<div class="absolute -bottom-6 bg-slate-900/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">${m.label}</div>` : ''}
          </div>
        `;
      } else if (m.type === 'hospital') {
        iconHtml = `
          <div class="relative flex flex-col items-center">
            <div class="w-8 h-8 rounded-lg bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-base font-bold">
              🏥
            </div>
            ${m.label ? `<div class="mt-1 bg-white/95 text-blue-900 border border-blue-200 text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">${m.label}</div>` : ''}
          </div>
        `;
      } else if (m.type === 'patient') {
        iconHtml = `
          <div class="relative flex flex-col items-center">
            <div class="w-8 h-8 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-sm font-bold animate-bounce">
              📍
            </div>
            ${m.label ? `<div class="mt-1 bg-amber-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">${m.label}</div>` : ''}
          </div>
        `;
      } else {
        // Normal user vehicle
        iconHtml = `
          <div class="relative flex flex-col items-center">
            <div class="w-7 h-7 rounded-full bg-emerald-600 border-2 border-white shadow-md flex items-center justify-center text-white text-xs">
              🚗
            </div>
            ${m.label ? `<div class="mt-1 bg-slate-800 text-white text-[9px] font-semibold px-1 py-0.5 rounded shadow whitespace-nowrap">${m.label}</div>` : ''}
          </div>
        `;
      }

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-leaflet-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker(m.position, { icon: customIcon }).addTo(layerGroup);
      if (m.label || m.sublabel) {
        marker.bindPopup(`<b>${m.label || ''}</b><br/>${m.sublabel || ''}`);
      }
    });
  }, [mounted, L, markers, routePolyline, center, routeColor, routeHaloColor]);

  return (
    <div className={`relative ${className} bg-slate-100 overflow-hidden`}>
      {!mounted && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
          Loading Emergency Mobility Map...
        </div>
      )}
      <div id="leaflet-map-container" className="w-full h-full" />
    </div>
  );
}
