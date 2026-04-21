/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interactive Leaflet map with selectable place markers.
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Place } from '../context/PlacesContext';

// Fix default Leaflet marker icon paths for bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapProps {
  places: Place[];
  selectedIds: Set<string>;
  alwaysShow?: Place[];     // saved places — always visible with heart icon
  centerTrigger?: number;  // increment to pan map to saved places
  centerPlaces?: Place[];  // places to fit bounds on centerTrigger change
  onMarkerClick?: (place: Place) => void;
  userLat?: number;
  userLng?: number;
}

function makeIcon(isSaved: boolean) {
  return L.divIcon({
    className: '',
    html: isSaved
      ? `<div style="width:34px;height:34px;border-radius:50%;background:#E8A598;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:16px;">❤️</div>`
      : `<div style="width:32px;height:32px;border-radius:50%;background:#87C6E5;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;">📍</div>`,
    iconSize: isSaved ? [34, 34] : [32, 32],
    iconAnchor: isSaved ? [17, 17] : [16, 16],
  });
}

export default function LeafletMap({
  places, selectedIds, alwaysShow = [], centerTrigger, centerPlaces,
  onMarkerClick, userLat, userLng,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const placeMarkersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // ── Initialise map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [51.5, -0.09], zoom: 10, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; setMapReady(false); };
  }, []);

  // ── User location marker ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || userLat == null || userLng == null) return;
    userMarkerRef.current?.remove();
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#1B4F93;border:3px solid white;box-shadow:0 0 0 4px rgba(27,79,147,0.25)"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    userMarkerRef.current = L.marker([userLat, userLng], { icon })
      .addTo(map)
      .bindTooltip('Your location', { direction: 'top' });
    map.setView([userLat, userLng], 12);
  }, [mapReady, userLat, userLng]);

  // ── Sync all place markers (clear + rebuild on every change) ───────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove all existing place markers cleanly
    placeMarkersRef.current.forEach(m => m.remove());
    placeMarkersRef.current = [];

    const savedIds = new Set(alwaysShow.map(p => p.id));
    const visibleIds = new Set([...selectedIds, ...savedIds]);

    // Merge extracted + saved-only places (deduplicated)
    const allPlaces = [
      ...places,
      ...alwaysShow.filter(p => !places.some(ep => ep.id === p.id)),
    ];

    const visible = allPlaces.filter(p => visibleIds.has(p.id));

    visible.forEach(place => {
      const isSaved = savedIds.has(place.id);
      const marker = L.marker([place.lat, place.lng], { icon: makeIcon(isSaved) })
        .addTo(map)
        .bindTooltip(`<strong>${place.name}</strong>${isSaved ? ' ❤️' : ''}`, { direction: 'top' });
      marker.on('click', () => onMarkerClick?.(place));
      placeMarkersRef.current.push(marker);
    });

    if (visible.length > 0) {
      map.fitBounds(L.latLngBounds(visible.map(p => [p.lat, p.lng])), { padding: [60, 60] });
    }
  }, [mapReady, places, selectedIds, alwaysShow, onMarkerClick]);

  // ── "Show Favourites" — pan/zoom to saved places ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerTrigger || !centerPlaces?.length) return;
    map.fitBounds(L.latLngBounds(centerPlaces.map(p => [p.lat, p.lng])), { padding: [80, 80] });
  }, [mapReady, centerTrigger, centerPlaces]);

  return <div ref={containerRef} className="w-full h-full" />;
}

