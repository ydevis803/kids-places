/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useMemo } from 'react';
import {
  ListChecks,
  Navigation,
  Heart,
  X,
  Sun,
  Search,
  CheckCircle2,
  Circle,
  Trash2,
  MapPin,
  Globe,
} from 'lucide-react';
import { useSpotlist, SpotlistEntry } from '../context/SpotlistContext';
import { usePlaces } from '../context/PlacesContext';
import { cn } from '../lib/cn';

// ── Category colour map ──────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Zoo:         { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200' },
  Park:        { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-200' },
  Museum:      { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  Adventure:   { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200' },
  Restaurant:  { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200' },
  'Soft Play': { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200' },
  Swimming:    { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200' },
  Other:       { bg: 'bg-gray-100',    text: 'text-gray-600',    border: 'border-gray-200' },
};

function getCategoryStyle(cat: string) {
  return CATEGORY_STYLES[cat] ?? CATEGORY_STYLES.Other;
}

// ── SpotCard ─────────────────────────────────────────────────────────────────

interface SpotCardProps {
  entry: SpotlistEntry;
  onRemove: (id: string) => void;
  onToggleVisited: (id: string) => void;
  onToggleSaved: (entry: SpotlistEntry) => void;
  isSaved: boolean;
}

function SpotCard({ entry, onRemove, onToggleVisited, onToggleSaved, isSaved }: SpotCardProps) {
  const catStyle = getCategoryStyle(entry.category);
  const addedDate = new Date(entry.addedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <article
      className={cn(
        'relative bg-surface-container-lowest rounded-2xl p-5 shadow-[0_8px_24px_rgba(44,47,49,0.04)] border border-outline-variant/10 flex flex-col gap-3 transition-all hover:shadow-[0_12px_32px_rgba(44,47,49,0.08)]',
        entry.visited && 'opacity-60'
      )}
    >
      {/* Visited toggle */}
      <button
        onClick={() => onToggleVisited(entry.id)}
        aria-label={entry.visited ? 'Mark as not visited' : 'Mark as visited'}
        className={cn(
          'absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-label font-semibold border transition-colors',
          entry.visited
            ? 'bg-secondary-container text-on-secondary-container border-secondary/20'
            : 'bg-surface-container text-on-surface-variant border-outline-variant/20 hover:bg-secondary-container/30'
        )}
      >
        {entry.visited ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          <Circle className="w-3.5 h-3.5" />
        )}
        {entry.visited ? 'Visited' : 'Not yet'}
      </button>

      {/* Name + description */}
      <div className="pr-24">
        <h3
          className={cn(
            'text-base font-headline font-bold text-on-surface leading-tight mb-1',
            entry.visited && 'line-through text-on-surface-variant'
          )}
        >
          {entry.name}
        </h3>
        {entry.description && (
          <p className="text-sm font-body text-on-surface-variant line-clamp-2">
            {entry.description}
          </p>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {entry.category && (
          <span
            className={cn(
              'inline-flex items-center text-xs font-label font-semibold px-2.5 py-1 rounded-full border',
              catStyle.bg,
              catStyle.text,
              catStyle.border
            )}
          >
            {entry.category}
          </span>
        )}
        {entry.price && (
          <span className="inline-flex items-center bg-surface-container-high text-on-surface text-xs font-label font-medium px-2.5 py-1 rounded-full">
            {entry.price}
          </span>
        )}
        {entry.outdoor != null && (
          <span className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface text-xs font-label font-medium px-2.5 py-1 rounded-full">
            <Sun className="w-3 h-3 text-amber-500 fill-current" />
            {entry.outdoor ? 'Outdoor' : 'Indoor'}
          </span>
        )}
        {entry.ageGroup && (
          <span className="inline-flex items-center bg-surface-container-high text-on-surface text-xs font-label font-medium px-2.5 py-1 rounded-full">
            {entry.ageGroup}
          </span>
        )}
        {entry.postcode && (
          <span className="inline-flex items-center gap-1 bg-surface-container text-on-surface-variant text-xs font-label font-medium px-2.5 py-1 rounded-full">
            <MapPin className="w-3 h-3" />
            {entry.postcode}
          </span>
        )}
      </div>

      {/* Date discovered */}
      <p className="text-[11px] font-body text-on-surface-variant/60">
        Discovered {addedDate}
      </p>

      {/* Actions */}
      <div className="flex gap-2 items-center mt-auto pt-2 border-t border-outline-variant/10">
        <a
          href={entry.website ?? `https://www.google.com/search?q=${encodeURIComponent(entry.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={entry.website ? 'Visit website' : 'Search on Google'}
          title={entry.website ? entry.website : `Search "${entry.name}" on Google`}
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-full transition-colors border',
            entry.website
              ? 'bg-primary-container text-on-primary-container border-primary/20 hover:bg-primary/10'
              : 'text-on-surface-variant hover:bg-surface-container-high border-outline-variant/20'
          )}
        >
          <Globe className="w-4 h-4" />
        </a>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${entry.lat},${entry.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get directions"
          title="Get directions"
          className="flex-1 py-2 text-sm font-label font-semibold bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors rounded-xl flex items-center justify-center gap-1.5 border border-outline-variant/20"
        >
          <Navigation className="w-3.5 h-3.5" /> Directions
        </a>

        <button
          onClick={() => onToggleSaved(entry)}
          aria-label={isSaved ? 'Remove from saved' : 'Save place'}
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-full border transition-colors',
            isSaved
              ? 'bg-secondary-container text-on-secondary-container border-secondary-container'
              : 'text-on-surface-variant hover:bg-surface-container-high border-outline-variant/20'
          )}
        >
          <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
        </button>

        <button
          onClick={() => onRemove(entry.id)}
          aria-label="Remove from Spotlist"
          className="w-9 h-9 flex items-center justify-center rounded-full border border-outline-variant/20 text-on-surface-variant hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}

// ── Spotlist page ─────────────────────────────────────────────────────────────

export default function Spotlist() {
  const { spotlist, removeFromSpotlist, toggleVisited, clearSpotlist } = useSpotlist();
  const { savePlace, unsavePlace, isSaved } = usePlaces();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const categories = useMemo(() => {
    const cats = new Set(spotlist.map((e) => e.category).filter(Boolean));
    return ['All', ...Array.from(cats).sort()];
  }, [spotlist]);

  const filtered = useMemo(() => {
    return spotlist.filter((e) => {
      const matchCat = activeCategory === 'All' || e.category === activeCategory;
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q) ||
        (e.postcode ?? '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [spotlist, activeCategory, search]);

  const visitedCount = spotlist.filter((e) => e.visited).length;
  const toVisitCount = spotlist.length - visitedCount;

  const handleToggleSaved = (entry: SpotlistEntry) => {
    if (isSaved(entry)) unsavePlace(entry.id);
    else savePlace(entry);
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (spotlist.length === 0) {
    return (
      <div className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <h1 className="font-headline text-4xl md:text-[3.5rem] font-extrabold text-on-background tracking-tight mb-2 leading-tight">
            The Spotlist
          </h1>
          <p className="text-on-surface-variant font-body text-lg max-w-xl">
            Your complete inventory of every discovered place.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant">
          <ListChecks className="w-14 h-14 opacity-20" />
          <p className="text-sm font-body text-center max-w-xs">
            Every place found in <strong>Map Editor</strong> is automatically added here.
            Start exploring to build your inventory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto w-full">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="font-headline text-4xl md:text-[3.5rem] font-extrabold text-on-background tracking-tight mb-2 leading-tight">
            The Spotlist
          </h1>
          <p className="text-on-surface-variant font-body text-lg">
            Your complete discovery inventory
          </p>
        </div>
        <button
          onClick={() => setShowConfirmClear(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-on-surface-variant hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors self-start sm:self-auto"
        >
          <Trash2 className="w-4 h-4" /> Clear all
        </button>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-8 max-w-xs">
        <div className="bg-surface-container-lowest rounded-2xl p-4 text-center border border-outline-variant/10 shadow-[0_4px_12px_rgba(44,47,49,0.03)]">
          <p className="text-2xl font-headline font-extrabold text-on-surface">{spotlist.length}</p>
          <p className="text-xs font-label text-on-surface-variant mt-0.5">Discovered</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-4 text-center border border-outline-variant/10 shadow-[0_4px_12px_rgba(44,47,49,0.03)]">
          <p className="text-2xl font-headline font-extrabold text-secondary">{visitedCount}</p>
          <p className="text-xs font-label text-on-surface-variant mt-0.5">Visited</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-4 text-center border border-outline-variant/10 shadow-[0_4px_12px_rgba(44,47,49,0.03)]">
          <p className="text-2xl font-headline font-extrabold text-primary">{toVisitCount}</p>
          <p className="text-xs font-label text-on-surface-variant mt-0.5">To Visit</p>
        </div>
      </div>

      {/* ── Search + Category filters ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mb-8">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search places…"
            className="w-full bg-surface-container-lowest border border-outline-variant/15 rounded-xl pl-10 pr-4 py-2.5 text-sm font-body text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-label font-semibold border transition-colors',
                activeCategory === cat
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/20 hover:bg-surface-container'
              )}
            >
              {cat}
              {cat !== 'All' && (
                <span className="ml-1.5 opacity-60 text-xs">
                  {spotlist.filter((e) => e.category === cat).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards grid ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-on-surface-variant">
          <Search className="w-10 h-10 opacity-20" />
          <p className="text-sm font-body text-center">No places match your search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-12">
          {filtered.map((entry) => (
            <SpotCard
              key={entry.id}
              entry={entry}
              onRemove={removeFromSpotlist}
              onToggleVisited={toggleVisited}
              onToggleSaved={handleToggleSaved}
              isSaved={isSaved(entry)}
            />
          ))}
        </div>
      )}

      {/* ── Confirm clear dialog ─────────────────────────────────────────────── */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-inverse-surface/30 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.12)] border border-outline-variant/10 p-6 w-full max-w-sm flex flex-col gap-5">
            <h2 className="text-lg font-headline font-bold text-on-surface">Clear the Spotlist?</h2>
            <p className="text-sm font-body text-on-surface-variant">
              This will permanently remove all {spotlist.length} place
              {spotlist.length !== 1 ? 's' : ''} from your inventory. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  clearSpotlist();
                  setShowConfirmClear(false);
                }}
                className="flex-[1.5] py-2.5 rounded-xl bg-error text-on-error text-sm font-label font-bold transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
