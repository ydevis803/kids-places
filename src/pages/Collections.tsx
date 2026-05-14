import { useState, useEffect, useRef, type RefObject } from 'react';
import { Plus, MoreVertical, MapPin, X, Check, Pencil, Trash2 } from 'lucide-react';
import { usePlaces, type Place } from '../context/PlacesContext';
import { useCollections, type Collection } from '../context/CollectionsContext';

// ── Cover gradient palette for user collections ───────────────────────────────
const COVER_GRADIENTS = [
  'from-violet-400/40 via-purple-300/30 to-fuchsia-200/20',
  'from-sky-400/40 via-cyan-300/30 to-blue-200/20',
  'from-emerald-400/40 via-teal-300/30 to-green-200/20',
  'from-orange-400/40 via-amber-300/30 to-yellow-200/20',
  'from-pink-400/40 via-rose-300/30 to-red-200/20',
  'from-indigo-400/40 via-blue-300/30 to-sky-200/20',
];

// ── Create Collection Modal ───────────────────────────────────────────────────
function CreateModal({ onCreate, onClose }: {
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-outline-variant/10 w-full max-w-sm p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-headline font-bold text-on-surface">New Collection</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <input
          autoFocus type="text" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onCreate(name.trim())}
          className="w-full bg-surface-container-low border border-outline-variant/15 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          placeholder="e.g. Rainy Day Favourites"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
          <button onClick={() => name.trim() && onCreate(name.trim())} disabled={!name.trim()} className="flex-[2] py-2.5 rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary text-sm font-label font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Create Collection
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rename Modal ──────────────────────────────────────────────────────────────
function RenameModal({ current, onRename, onClose }: {
  current: string; onRename: (name: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(current);
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-outline-variant/10 w-full max-w-sm p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-headline font-bold text-on-surface">Rename Collection</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <input
          autoFocus type="text" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onRename(name.trim())}
          className="w-full bg-surface-container-low border border-outline-variant/15 text-on-surface rounded-xl px-4 py-3 text-sm font-body focus:ring-1 focus:ring-primary focus:border-primary outline-none"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
          <button onClick={() => name.trim() && onRename(name.trim())} disabled={!name.trim()} className="flex-[2] py-2.5 rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary text-sm font-label font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ name, onDelete, onClose }: {
  name: string; onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-outline-variant/10 w-full max-w-sm p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-headline font-bold text-on-surface">Delete Collection?</h2>
        <p className="text-sm font-body text-on-surface-variant"><strong>"{name}"</strong> will be deleted. The places inside it won't be affected.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">Cancel</button>
          <button onClick={onDelete} className="flex-[2] py-2.5 rounded-xl bg-red-500 text-white text-sm font-label font-bold flex items-center justify-center gap-2 hover:bg-red-600 transition-colors">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Collection Detail Modal ───────────────────────────────────────────────────
function DetailModal({ collection, savedPlaces, onAdd, onRemove, onClose }: {
  collection: Collection | 'all';
  savedPlaces: Place[];
  onAdd: (placeId: string) => void;
  onRemove: (placeId: string) => void;
  onClose: () => void;
}) {
  const isAll = collection === 'all';
  const col = isAll ? null : (collection as Collection);
  const title = isAll ? 'All Saved Places' : col!.name;
  const inIds = isAll ? new Set(savedPlaces.map(p => p.id)) : new Set(col!.placeIds);
  const inCollection = savedPlaces.filter(p => inIds.has(p.id));
  const notInCollection = isAll ? [] : savedPlaces.filter(p => !inIds.has(p.id));

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-outline-variant/10 w-full sm:max-w-lg flex flex-col max-h-[85dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-outline-variant/10 shrink-0">
          <div>
            <h2 className="text-xl font-headline font-bold text-on-surface">{title}</h2>
            <p className="text-xs font-body text-on-surface-variant mt-0.5">{inCollection.length} place{inCollection.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Places in collection */}
          {inCollection.length > 0 ? (
            <div className="space-y-2">
              {!isAll && <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-3">In this collection</p>}
              {inCollection.map(place => (
                <div key={place.id} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-4 py-3">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-label font-semibold text-on-surface truncate">{place.name}</p>
                    {place.category && <p className="text-xs text-on-surface-variant">{place.category}</p>}
                  </div>
                  {!isAll && (
                    <button onClick={() => onRemove(place.id)} className="p-1.5 rounded-full hover:bg-secondary-container text-on-surface-variant hover:text-on-secondary-container transition-colors shrink-0" title="Remove from collection">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-on-surface-variant">
              <MapPin className="w-10 h-10 opacity-20" />
              <p className="text-sm font-body text-center">No places in this collection yet.</p>
            </div>
          )}

          {/* Add from saved places */}
          {!isAll && notInCollection.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-3">Add from saved places</p>
              {notInCollection.map(place => (
                <div key={place.id} className="flex items-center gap-3 bg-surface-container-low/50 rounded-xl px-4 py-3 border border-dashed border-outline-variant/30">
                  <MapPin className="w-4 h-4 text-on-surface-variant shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-label font-semibold text-on-surface truncate">{place.name}</p>
                    {place.category && <p className="text-xs text-on-surface-variant">{place.category}</p>}
                  </div>
                  <button onClick={() => onAdd(place.id)} className="p-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0" title="Add to collection">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!isAll && savedPlaces.length === 0 && (
            <p className="text-sm font-body text-on-surface-variant text-center py-4">Save some places from <strong>Map Editor</strong> to add them here.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Collection Card ───────────────────────────────────────────────────────────
function CollectionCard({ collection, index, savedPlaceIds, isMenuOpen, menuRef, onCardClick, onMenuToggle, onRename, onDelete }: {
  collection: Collection;
  index: number;
  savedPlaceIds: Set<string>;
  isMenuOpen: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onCardClick: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const gradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  return (
    <div onClick={onCardClick} className="group cursor-pointer bg-surface-container-lowest rounded-[1.5rem] overflow-hidden shadow-ambient flex flex-col h-[18rem]">
      <div className={`h-40 overflow-hidden relative bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <span className="text-7xl opacity-30 select-none pointer-events-none group-hover:scale-110 transition-transform duration-500 ease-in-out leading-none">{collection.emoji}</span>
        <div ref={isMenuOpen ? menuRef : null} className="absolute top-4 right-4">
          <button onClick={onMenuToggle} className="bg-surface-container-lowest/80 backdrop-blur-md p-2 rounded-full text-on-surface hover:text-primary transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-surface-container-lowest rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-outline-variant/10 overflow-hidden z-10">
              <button onClick={e => { e.stopPropagation(); onRename(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-label font-medium text-on-surface hover:bg-surface-container transition-colors">
                <Pencil className="w-4 h-4 text-on-surface-variant" /> Rename
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-label font-medium text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="p-6 flex-1 flex flex-col justify-center">
        <h3 className="font-headline text-xl font-bold text-on-background mb-1">{collection.name}</h3>
        <p className="text-on-surface-variant text-sm font-medium">{collection.placeIds.filter(id => savedPlaceIds.has(id)).length} place{collection.placeIds.filter(id => savedPlaceIds.has(id)).length !== 1 ? 's' : ''}</p>
      </div>
    </div>
  );
}

// ── Collections page ──────────────────────────────────────────────────────────
export default function Collections() {
  const { savedPlaces } = usePlaces();
  const { collections, createCollection, renameCollection, deleteCollection, addToCollection, removeFromCollection } = useCollections();

  const [showCreate, setShowCreate] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | 'all' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setActiveMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeMenu]);

  const detailCollection =
    detailId === 'all' ? ('all' as const) : collections.find(c => c.id === detailId) ?? null;

  return (
    <>
      {showCreate && (
        <CreateModal onCreate={name => { createCollection(name); setShowCreate(false); }} onClose={() => setShowCreate(false)} />
      )}
      {renamingId && (
        <RenameModal
          current={collections.find(c => c.id === renamingId)?.name ?? ''}
          onRename={name => { renameCollection(renamingId, name); setRenamingId(null); }}
          onClose={() => setRenamingId(null)}
        />
      )}
      {deletingId && (
        <DeleteModal
          name={collections.find(c => c.id === deletingId)?.name ?? ''}
          onDelete={() => { deleteCollection(deletingId); setDeletingId(null); }}
          onClose={() => setDeletingId(null)}
        />
      )}
      {detailCollection !== null && (
        <DetailModal
          collection={detailCollection}
          savedPlaces={savedPlaces}
          onAdd={placeId => detailId !== 'all' && addToCollection(detailId!, placeId)}
          onRemove={placeId => detailId !== 'all' && removeFromCollection(detailId!, placeId)}
          onClose={() => setDetailId(null)}
        />
      )}

      <div className="flex-1 px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto w-full h-full overflow-y-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
          <div>
            <h1 className="font-headline text-4xl md:text-[3.5rem] font-extrabold text-on-background tracking-tight mb-2 leading-tight">My Collections</h1>
            <p className="text-on-surface-variant font-body text-lg max-w-xl">Curate your family's adventures, one folder at a time.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-4 rounded-xl font-bold shadow-ambient hover:scale-[1.02] active:scale-95 transition-transform duration-200"
          >
            <Plus className="w-5 h-5" />
            Create Collection
          </button>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-12">

          {/* All Saved Places — featured card (always shown) */}
          <div
            onClick={() => setDetailId('all')}
            className="col-span-1 md:col-span-2 lg:col-span-1 row-span-2 group cursor-pointer h-[28rem] relative rounded-[1.5rem] overflow-hidden shadow-ambient flex flex-col justify-end p-8"
          >
            <div className="absolute inset-0 bg-surface-container-lowest z-0">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBrBFMX6_HzPr_FpG256S4OEghJCuktTXqjdi4e6407VIx00azIF1FivZaeFT-CLiFVSbcpJm0WgdQ2TIw8TgdgUs4t9MUGYd7_xtZNufwBMLeP64zzJkzNazcIXVUZZJvkqy4a8E7Sc2YK-D45zQDq8byCkyI3xXGFWEdjBE4Y1qC4J-0558zVfDmdBT-38iwwmL2yr8CSzB7PnDLe7RFFVBQ4_EcMvAGtop1JTSBtfsVwIbnVMW2F1-mLLxu2mAthlUAeHpeeAoQ"
                alt="All Saved Places Cover"
                className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700 ease-in-out"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-inverse-surface/30 to-transparent z-10" />
            <div className="relative z-20 flex flex-col gap-2">
              <div className="bg-tertiary-container text-on-tertiary-container w-max px-4 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase mb-2">Primary</div>
              <h2 className="font-headline text-3xl font-bold text-surface-bright leading-tight">All Saved Places</h2>
              <div className="flex items-center gap-2 text-surface-bright/80">
                <MapPin className="w-4 h-4" />
                <p className="font-body text-sm font-medium">{savedPlaces.length} place{savedPlaces.length !== 1 ? 's' : ''} saved</p>
              </div>
            </div>
          </div>

          {/* User collections */}
          {collections.map((col, i) => (
            <CollectionCard
              key={col.id}
              collection={col}
              index={i}
              savedPlaceIds={new Set(savedPlaces.map(p => p.id))}
              isMenuOpen={activeMenu === col.id}
              menuRef={menuRef}
              onCardClick={() => setDetailId(col.id)}
              onMenuToggle={e => { e.stopPropagation(); setActiveMenu(prev => prev === col.id ? null : col.id); }}
              onRename={() => { setActiveMenu(null); setRenamingId(col.id); }}
              onDelete={() => { setActiveMenu(null); setDeletingId(col.id); }}
            />
          ))}

          {/* Empty-state nudge when no collections yet */}
          {collections.length === 0 && (
            <div
              onClick={() => setShowCreate(true)}
              className="group cursor-pointer bg-surface-container-low rounded-[1.5rem] flex flex-col h-[18rem] items-center justify-center gap-4 text-on-surface-variant hover:bg-surface-container transition-colors border-2 border-dashed border-outline-variant/30"
            >
              <Plus className="w-10 h-10 opacity-30 group-hover:opacity-60 transition-opacity" />
              <p className="text-sm font-body font-medium">Create your first collection</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}


