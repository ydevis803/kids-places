import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export interface Collection {
  id: string;
  name: string;
  placeIds: string[];
  emoji: string;
  createdAt: number;
}

const COLLECTIONS_STORAGE_KEY = 'kids-places:collections';

const EMOJIS = ['📍', '🗺️', '⭐', '🎯', '🌿', '🏖️', '🏰', '🎪', '🌟', '🧭', '🚀', '🌈'];

function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Collection[]) : [];
  } catch { return []; }
}

function saveCollections(collections: Collection[]) {
  try { localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(collections)); } catch { /* ignore */ }
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

  const update = useCallback((fn: (prev: Collection[]) => Collection[]) => {
    setCollections(prev => {
      const next = fn(prev);
      saveCollections(next);
      return next;
    });
  }, []);

  const createCollection = useCallback((name: string, emoji?: string): Collection => {
    const col: Collection = {
      id: Math.random().toString(36).slice(2),
      name,
      placeIds: [],
      emoji: emoji ?? EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      createdAt: Date.now(),
    };
    update(prev => [...prev, col]);
    return col;
  }, [update]);

  const renameCollection = useCallback((id: string, name: string) => {
    update(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  }, [update]);

  const deleteCollection = useCallback((id: string) => {
    update(prev => prev.filter(c => c.id !== id));
  }, [update]);

  const addToCollection = useCallback((collectionId: string, placeId: string) => {
    update(prev => prev.map(c =>
      c.id === collectionId && !c.placeIds.includes(placeId)
        ? { ...c, placeIds: [...c.placeIds, placeId] }
        : c
    ));
  }, [update]);

  const removeFromCollection = useCallback((collectionId: string, placeId: string) => {
    update(prev => prev.map(c =>
      c.id === collectionId
        ? { ...c, placeIds: c.placeIds.filter(id => id !== placeId) }
        : c
    ));
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
