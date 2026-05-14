import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

export interface Collection {
  id: string;
  name: string;
  placeIds: string[];
  emoji: string;
  createdAt: number;
}

const COLLECTIONS_STORAGE_KEY = 'kids-places:collections';

const EMOJIS = ['🌧️', '🍔', '🦁', '🚂', '🎢', '🏛️', '🛝', '🏖️', '🏊', '🌿', '⭐', '🌈'];

// Guess a fitting emoji from the collection name
function guessEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/train|rail|railway|steam|locomotive/.test(n))                  return '🚂';
  if (/rain|wet|indoor|drizzle/.test(n))                              return '🌧️';
  if (/pub|bar|food|eat|restaurant|lunch|dinner|café|cafe/.test(n))  return '🍔';
  if (/farm|petting|barn|hay/.test(n))                                return '🐄';
  if (/zoo|safari|wildlife|animal/.test(n))                           return '🦁';
  if (/water.?park|pool|swim|splash|aqua/.test(n))                    return '🏊';
  if (/theme.?park|roller.?coaster|thrill|adventure/.test(n))         return '🎢';
  if (/museum|gallery|history|science|art/.test(n))                   return '🏛️';
  if (/play|soft|slide|swing|playground|kids|children/.test(n))       return '🛝';
  if (/sea|beach|coast|seaside|sand|shore/.test(n))                   return '🏖️';
  if (/garden|nature|green|forest|walk|hike|park/.test(n))            return '🌿';
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (!raw) return [];
    // Apply guessEmoji migration on load so existing collections get updated icons
    const cols = JSON.parse(raw) as Collection[];
    return cols.map(c => ({ ...c, emoji: guessEmoji(c.name) }));
  } catch { return []; }
}

function saveCollections(collections: Collection[]) {
  try { localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(collections)); } catch { /* ignore */ }
}

// ── Supabase row ↔ Collection converters ──────────────────────────────────────
function toCollection(row: Record<string, unknown>): Collection {
  return {
    id:        String(row.id),
    name:      String(row.name),
    placeIds:  Array.isArray(row.place_ids) ? (row.place_ids as string[]) : [],
    emoji:     String(row.emoji ?? '📍'),
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
  };
}
function toRow(c: Collection) {
  return { id: c.id, name: c.name, place_ids: c.placeIds, emoji: c.emoji };
}

interface CollectionsContextValue {
  collections: Collection[];
  createCollection: (name: string, emoji?: string) => Collection;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  addToCollection: (collectionId: string, placeId: string) => void;
  removeFromCollection: (collectionId: string, placeId: string) => void;
}

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
  const [collections, setCollections] = useState<Collection[]>(loadCollections);

  // On mount: load from Supabase if configured
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[Supabase] collections load error:', error.message); return; }
        if (data) {
          const cols = (data as Record<string, unknown>[])
            .map(toCollection)
            .map(c => ({ ...c, emoji: guessEmoji(c.name) }));
          setCollections(cols);
          saveCollections(cols);
          // Sync updated emojis back to Supabase
          cols.forEach(c => {
            supabase?.from('collections').upsert(toRow(c)).then(({ error }) => {
              if (error) console.error('[Supabase] emoji migration upsert error:', error.message);
            });
          });
        }
      });
  }, []);

  const update = useCallback((fn: (prev: Collection[]) => Collection[], updatedCol?: Collection, deletedId?: string) => {
    setCollections(prev => {
      const next = fn(prev);
      saveCollections(next);
      // Sync to Supabase
      if (deletedId) {
        supabase?.from('collections').delete().eq('id', deletedId).then(({ error }) => {
          if (error) console.error('[Supabase] collections delete error:', error.message);
        });
      } else if (updatedCol) {
        supabase?.from('collections').upsert(toRow(updatedCol)).then(({ error }) => {
          if (error) console.error('[Supabase] collections upsert error:', error.message);
        });
      }
      return next;
    });
  }, []);

  const createCollection = useCallback((name: string, emoji?: string): Collection => {
    const col: Collection = {
      id: Math.random().toString(36).slice(2),
      name,
      placeIds: [],
      emoji: emoji ?? guessEmoji(name),
      createdAt: Date.now(),
    };
    update(prev => [...prev, col], col);
    return col;
  }, [update]);

  const renameCollection = useCallback((id: string, name: string) => {
    update(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name } : c);
      const updated = next.find(c => c.id === id);
      if (updated) supabase?.from('collections').upsert(toRow(updated)).then(({ error }) => {
        if (error) console.error('[Supabase] collections upsert error:', error.message);
      });
      return next;
    });
  }, [update]);

  const deleteCollection = useCallback((id: string) => {
    update(prev => prev.filter(c => c.id !== id), undefined, id);
  }, [update]);

  const addToCollection = useCallback((collectionId: string, placeId: string) => {
    update(prev => {
      const next = prev.map(c =>
        c.id === collectionId && !c.placeIds.includes(placeId)
          ? { ...c, placeIds: [...c.placeIds, placeId] }
          : c
      );
      const updated = next.find(c => c.id === collectionId);
      if (updated) supabase?.from('collections').upsert(toRow(updated)).then(({ error }) => {
        if (error) console.error('[Supabase] collections upsert error:', error.message);
      });
      return next;
    });
  }, [update]);

  const removeFromCollection = useCallback((collectionId: string, placeId: string) => {
    update(prev => {
      const next = prev.map(c =>
        c.id === collectionId
          ? { ...c, placeIds: c.placeIds.filter(id => id !== placeId) }
          : c
      );
      const updated = next.find(c => c.id === collectionId);
      if (updated) supabase?.from('collections').upsert(toRow(updated)).then(({ error }) => {
        if (error) console.error('[Supabase] collections upsert error:', error.message);
      });
      return next;
    });
  }, [update]);

  return (
    <CollectionsContext.Provider value={{
      collections,
      createCollection,
      renameCollection,
      deleteCollection,
      addToCollection,
      removeFromCollection,
    }}>
      {children}
    </CollectionsContext.Provider>
  );
}

export function useCollections() {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error('useCollections must be used within CollectionsProvider');
  return ctx;
}
