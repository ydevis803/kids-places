/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { Globe, Heart, Map, MapPin, Navigation, Route, Sun, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlaces } from '../context/PlacesContext';
import type { Place } from '../context/PlacesContext';
import EditPlaceModal from '../components/EditPlaceModal';

export default function SavedPlaces() {
  const { savedPlaces, unsavePlace, updatePlace } = usePlaces();
  const navigate = useNavigate();
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);

  if (savedPlaces.length === 0) {
    return (
      <div className="flex-1 px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <h1 className="font-headline text-4xl md:text-[3.5rem] font-extrabold text-on-background tracking-tight mb-2 leading-tight">
            Saved Places
          </h1>
          <p className="text-on-surface-variant font-body text-lg max-w-xl">
            Places you heart from the Map Editor will appear here.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-on-surface-variant">
          <Heart className="w-14 h-14 opacity-20" />
          <p className="text-sm font-body text-center max-w-xs">
            No saved places yet. Go to <strong>Map Editor</strong>, extract some places and tap the ♥ to save them here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto w-full overflow-y-auto">
      <div className="mb-10">
        <h1 className="font-headline text-4xl md:text-[3.5rem] font-extrabold text-on-background tracking-tight mb-2 leading-tight">
          Saved Places
        </h1>
        <p className="text-on-surface-variant font-body text-lg max-w-xl">
          {savedPlaces.length} place{savedPlaces.length !== 1 ? 's' : ''} saved
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
        {savedPlaces.map((place) => (
          <article
            key={place.id}
            className="bg-surface-container-lowest rounded-2xl p-5 shadow-ambient border border-outline-variant/10 relative flex flex-col gap-3 transition-all hover:shadow-[0_16px_32px_rgba(44,47,49,0.08)]"
          >
            {/* Distance badge */}
            {place.distanceMiles != null && (
              <div className="absolute top-0 right-0 p-4">
                <div className="bg-surface-container text-on-surface text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                  <Route className="w-3.5 h-3.5" /> {place.distanceMiles.toFixed(1)} mi
                </div>
              </div>
            )}

            <div className="pr-20">
              <h3 className="text-lg font-headline font-bold text-on-surface mb-1 leading-tight">{place.name}</h3>
              {place.description && (
                <p className="text-sm font-body text-on-surface-variant line-clamp-2">{place.description}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {place.category && (
                <span className="inline-flex items-center gap-1 bg-tertiary-container/30 text-tertiary text-xs font-label font-semibold px-2.5 py-1 rounded-full border border-tertiary/20">
                  {place.category}
                </span>
              )}
              {place.price && (
                <span className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface text-xs font-label font-medium px-2.5 py-1 rounded-full">
                  {place.price}
                </span>
              )}
              {place.outdoor != null && (
                <span className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface text-xs font-label font-medium px-2.5 py-1 rounded-full">
                  <Sun className="w-3.5 h-3.5 text-amber-500 fill-current" />
                  {place.outdoor ? 'Outdoor' : 'Indoor'}
                </span>
              )}
              {place.ageGroup && (
                <span className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface text-xs font-label font-medium px-2.5 py-1 rounded-full">
                  {place.ageGroup}
                </span>
              )}
            </div>

            <div className="flex gap-2 mt-auto items-center pt-1">
              <button
                onClick={() => navigate('/map-editor', { state: { spotlightPlace: place } })}
                aria-label="Show in map"
                title="Show in map"
                className="w-9 h-9 flex items-center justify-center rounded-full transition-colors border text-on-surface-variant hover:bg-primary/10 hover:text-primary border-outline-variant/20"
              >
                <Map className="w-4 h-4" />
              </button>
              <a
                href={place.website ?? `https://www.google.com/search?q=${encodeURIComponent(place.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={place.website ? 'Visit website' : 'Search on Google'}
                title={place.website ? place.website : `Search "${place.name}" on Google`}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors border ${
                  place.website
                    ? 'bg-primary-container text-on-primary-container border-primary/20 hover:bg-primary/10'
                    : 'text-on-surface-variant hover:bg-surface-container-high border-outline-variant/20'
                }`}
              >
                <Globe className="w-4 h-4" />
              </a>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Get directions"
                title="Get directions"
                className="flex-1 py-2 text-sm font-label font-semibold bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors rounded-xl flex items-center justify-center gap-2 border border-outline-variant/20"
              >
                <Navigation className="w-4 h-4" /> Directions
              </a>

              <button
                onClick={() => setEditingPlace(place)}
                aria-label="Edit place"
                title="Edit place"
                className="w-9 h-9 flex items-center justify-center rounded-full transition-colors border text-on-surface-variant hover:bg-primary/10 hover:text-primary border-outline-variant/20"
              >
                <Pencil className="w-4 h-4" />
              </button>

              <button
                onClick={() => unsavePlace(place.id)}
                aria-label="Remove from saved"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-secondary-container text-on-secondary-container hover:bg-secondary-container/70 transition-colors border border-secondary-container"
              >
                <Heart className="w-4 h-4 fill-current" />
              </button>
            </div>

            <div className="flex items-center gap-1 text-xs text-on-surface-variant/60 font-body">
              <MapPin className="w-3 h-3" />
              <span>{place.lat.toFixed(4)}, {place.lng.toFixed(4)}</span>
            </div>
          </article>
        ))}
      </div>

      {editingPlace && (
        <EditPlaceModal
          place={editingPlace}
          onSave={updatePlace}
          onClose={() => setEditingPlace(null)}
        />
      )}
    </div>
  );
}
