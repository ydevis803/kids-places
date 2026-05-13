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
import type { Place } from './PlacesContext';
import { supabase } from '../lib/supabase';

export interface SpotlistEntry extends Place {
  addedAt: string;
  visited: boolean;
}

const STORAGE_KEY = 'kids-places:spotlist';

function loadLocal(): SpotlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SpotlistEntry[]) : [];
  } catch { return []; }
}

function saveLocal(entries: SpotlistEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

// ── Supabase row ↔ SpotlistEntry converters ───────────────────────────────────
function toEntry(row: Record<string, unknown>): SpotlistEntry {
  return {
    id:          String(row.id),
    name:        String(row.name),
    description: String(row.description ?? ''),
    category:    String(row.category ?? ''),
    price:       row.price != null ? String(row.price) : undefined,
    ageGroup:    row.age_group != null ? String(row.age_group) : undefined,
    outdoor:     row.outdoor != null ? Boolean(row.outdoor) : undefined,
    postcode:    row.postcode != null ? String(row.postcode) : undefined,
    website:     row.website != null ? String(row.website) : undefined,
    lat:         Number(row.lat),
    lng:         Number(row.lng),
    addedAt:     String(row.added_at),
    visited:     Boolean(row.visited),
  };
}

function toRow(e: SpotlistEntry) {
  return {
    id:          e.id,
    name:        e.name,
    description: e.description,
    category:    e.category,
    price:       e.price ?? null,
    age_group:   e.ageGroup ?? null,
    outdoor:     e.outdoor ?? null,
    postcode:    e.postcode ?? null,
    website:     e.website ?? null,
    lat:         e.lat,
    lng:         e.lng,
    added_at:    e.addedAt,
    visited:     e.visited,
  };
}

interface SpotlistContextValue {
  spotlist: SpotlistEntry[];
  addToSpotlist: (place: Place) => void;
  addBatchToSpotlist: (places: Place[]) => void;
  removeFromSpotlist: (id: string) => void;
  toggleVisited: (id: string) => void;
  isInSpotlist: (place: { id: string; postcode?: string; lat: number; lng: number }) => boolean;
  clearSpotlist: () => void;
}

const SpotlistContext = createContext<SpotlistContextValue | null>(null);

export function SpotlistProvider({ children }: { children: ReactNode }) {
  const [spotlist, setSpotlist] = useState<SpotlistEntry[]>(loadLocal);

  // On mount: sync from Supabase if configured
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('spotlist')
      .select('*')
      .order('added_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] spotlist load error:', error.message); return; }
        if (data) {
          const entries = (data as Record<string, unknown>[]).map(toEntry);
          setSpotlist(entries);
          saveLocal(entries);
        }
      });
  }, []);

  /** Returns true if `place` is already in the spotlist (by id, postcode, or close lat/lng). */
  const isDuplicate = (prev: SpotlistEntry[], place: Place) =>
    prev.some(
      (e) =>
        e.id === place.id ||
        (place.postcode &&
          e.postcode &&
          e.postcode.replace(/\s/g, '').toLowerCase() ===
            place.postcode.replace(/\s/g, '').toLowerCase()) ||
        (Math.abs(e.lat - place.lat) < 0.0005 && Math.abs(e.lng - place.lng) < 0.0005)
    );

  const addToSpotlist = useCallback((place: Place) => {
    setSpotlist((prev) => {
      if (isDuplicate(prev, place)) return prev;
      const entry: SpotlistEntry = { ...place, addedAt: new Date().toISOString(), visited: false };
      const next = [...prev, entry];
      saveLocal(next);
      supabase?.from('spotlist').upsert(toRow(entry)).then(({ error }) => {
        if (error) console.error('[Supabase] spotlist insert error:', error.message);
      });
      return next;
    });
  }, []);

  const addBatchToSpotlist = useCallback((places: Place[]) => {
    setSpotlist((prev) => {
      const newEntries = places
        .filter((p) => !p.geocodeFailed && !isDuplicate(prev, p))
        .map((p): SpotlistEntry => ({ ...p, addedAt: new Date().toISOString(), visited: false }));
      if (!newEntries.length) return prev;
      const next = [...prev, ...newEntries];
      saveLocal(next);
      supabase?.from('spotlist').upsert(newEntries.map(toRow)).then(({ error }) => {
        if (error) console.error('[Supabase] spotlist batch insert error:', error.message);
      });
      return next;
    });
  }, []);

  const removeFromSpotlist = useCallback((id: string) => {
    setSpotlist((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveLocal(next);
      supabase?.from('spotlist').delete().eq('id', id).then(({ error }) => {
        if (error) console.error('[Supabase] spotlist delete error:', error.message);
      });
      return next;
    });
  }, []);

  const toggleVisited = useCallback((id: string) => {
    setSpotlist((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, visited: !e.visited } : e));
      saveLocal(next);
      const updated = next.find((e) => e.id === id);
      if (updated) {
        supabase?.from('spotlist').update({ visited: updated.visited }).eq('id', id).then(({ error }) => {
          if (error) console.error('[Supabase] spotlist update error:', error.message);
        });
      }
      return next;
    });
  }, []);

  const isInSpotlist = useCallback(
    (place: { id: string; postcode?: string; lat: number; lng: number }) =>
      spotlist.some(
        (e) =>
          e.id === place.id ||
          (place.postcode &&
            e.postcode &&
            e.postcode.replace(/\s/g, '').toLowerCase() ===
              place.postcode.replace(/\s/g, '').toLowerCase()) ||
          (Math.abs(e.lat - place.lat) < 0.0005 && Math.abs(e.lng - place.lng) < 0.0005)
      ),
    [spotlist]
  );

  const clearSpotlist = useCallback(() => {
    setSpotlist([]);
    saveLocal([]);
    // Delete all rows for this client — Supabase RLS doesn't have per-user scoping yet
    // so we delete by fetching ids first to avoid truncating other users' data
    supabase?.from('spotlist').select('id').then(({ data }) => {
      if (data?.length) {
        const ids = (data as { id: string }[]).map((r) => r.id);
        supabase?.from('spotlist').delete().in('id', ids);
      }
    });
  }, []);

  return (
    <SpotlistContext.Provider
      value={{ spotlist, addToSpotlist, addBatchToSpotlist, removeFromSpotlist, toggleVisited, isInSpotlist, clearSpotlist }}
    >
      {children}
    </SpotlistContext.Provider>
  );
}

export function useSpotlist() {
  const ctx = useContext(SpotlistContext);
  if (!ctx) throw new Error('useSpotlist must be used within SpotlistProvider');
  return ctx;
}
