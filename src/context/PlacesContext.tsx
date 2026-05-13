/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

export interface Place {
  id: string;
  name: string;
  description: string;
  category: string;
  price?: string;
  ageGroup?: string;
  outdoor?: boolean;
  postcode?: string;
  geocodedName?: string;  // official name returned by Nominatim, may differ from extracted name
  website?: string;        // venue website (from OSM extratags or manual entry)
  lat: number;
  lng: number;
  distanceMiles?: number;
  geocodeFailed?: boolean;  // true when Nominatim could not locate this place
  failReason?: string;      // human-readable reason for the geocode failure
}

const STORAGE_KEY = 'kids-places:saved';

// ── localStorage helpers (instant cache while Supabase loads) ─────────────────
function loadLocal(): Place[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Place[]) : [];
  } catch { return []; }
}
function saveLocal(places: Place[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(places)); } catch { /* ignore */ }
}

// ── Supabase row ↔ Place converters ──────────────────────────────────────────
function toPlace(row: Record<string, unknown>): Place {
  return {
    id:           String(row.id),
    name:         String(row.name),
    description:  String(row.description ?? ''),
    category:     String(row.category ?? ''),
    price:        row.price != null ? String(row.price) : undefined,
    ageGroup:     row.age_group != null ? String(row.age_group) : undefined,
    outdoor:      row.outdoor != null ? Boolean(row.outdoor) : undefined,
    postcode:     row.postcode != null ? String(row.postcode) : undefined,
    website:      row.website != null ? String(row.website) : undefined,
    lat:          Number(row.lat),
    lng:          Number(row.lng),
  };
}
function toRow(p: Place) {
  return {
    id:          p.id,
    name:        p.name,
    description: p.description,
    category:    p.category,
    price:       p.price ?? null,
    age_group:   p.ageGroup ?? null,
    outdoor:     p.outdoor ?? null,
    postcode:    p.postcode ?? null,
    website:     p.website ?? null,
    lat:         p.lat,
    lng:         p.lng,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────
interface PlacesContextValue {
  savedPlaces: Place[];
  savePlace: (place: Place) => void;
  unsavePlace: (id: string) => void;
  updatePlace: (place: Place) => void;
  isSaved: (place: { id: string; postcode?: string; lat: number; lng: number }) => boolean;
}

const PlacesContext = createContext<PlacesContextValue | null>(null);

export function PlacesProvider({ children }: { children: ReactNode }) {
  // Seed from localStorage immediately so the UI isn't empty on first paint
  const [savedPlaces, setSavedPlaces] = useState<Place[]>(loadLocal);

  // On mount: if Supabase is configured, load the real list from the DB
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('saved_places')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] load error:', error.message); return; }
        if (data) {
          const places = (data as Record<string, unknown>[]).map(toPlace);
          setSavedPlaces(places);
          saveLocal(places); // keep local cache in sync
        }
      });
  }, []);

  const savePlace = useCallback((place: Place) => {
    setSavedPlaces((prev) => {
      // Deduplicate: skip if same id, same name, same postcode, or same lat/lng
      const isDuplicate = prev.some((p) =>
        p.id === place.id ||
        p.name.trim().toLowerCase() === place.name.trim().toLowerCase() ||
        (place.postcode && p.postcode &&
          p.postcode.replace(/\s/g, '').toLowerCase() === place.postcode.replace(/\s/g, '').toLowerCase()) ||
        (Math.abs(p.lat - place.lat) < 0.0005 && Math.abs(p.lng - place.lng) < 0.0005)
      );
      if (isDuplicate) return prev;
      const next = [...prev, place];
      saveLocal(next);
      // Upsert to Supabase (fire-and-forget)
      supabase?.from('saved_places').upsert(toRow(place)).then(({ error }) => {
        if (error) console.error('[Supabase] save error:', error.message);
      });
      return next;
    });
  }, []);

  const unsavePlace = useCallback((id: string) => {
    setSavedPlaces((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveLocal(next);
      // Delete from Supabase (fire-and-forget)
      supabase?.from('saved_places').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('[Supabase] delete error:', error.message);
      });
      return next;
    });
  }, []);

  const updatePlace = useCallback((place: Place) => {
    setSavedPlaces((prev) => {
      const next = prev.map((p) => (p.id === place.id ? place : p));
      saveLocal(next);
      // Update in Supabase (fire-and-forget)
      supabase?.from('saved_places').update(toRow(place)).eq('id', place.id).then(({ error }) => {
        if (error) console.error('[Supabase] update error:', error.message);
      });
      return next;
    });
  }, []);

  const isSaved = useCallback(
    (place: { id: string; postcode?: string; lat: number; lng: number }) =>
      savedPlaces.some(
        (p) =>
          p.id === place.id ||
          (place.postcode &&
            p.postcode &&
            p.postcode.replace(/\s/g, '').toLowerCase() ===
              place.postcode.replace(/\s/g, '').toLowerCase()) ||
          (Math.abs(p.lat - place.lat) < 0.0005 && Math.abs(p.lng - place.lng) < 0.0005)
      ),
    [savedPlaces]
  );

  return (
    <PlacesContext.Provider value={{ savedPlaces, savePlace, unsavePlace, updatePlace, isSaved }}>
      {children}
    </PlacesContext.Provider>
  );
}

export function usePlaces() {
  const ctx = useContext(PlacesContext);
  if (!ctx) throw new Error('usePlaces must be used within PlacesProvider');
  return ctx;
}
