import { useState } from 'react';
import { X } from 'lucide-react';
import type { Place } from '../context/PlacesContext';

interface EditPlaceModalProps {
  place: Place;
  onSave: (updated: Place) => void;
  onClose: () => void;
}

export default function EditPlaceModal({ place, onSave, onClose }: EditPlaceModalProps) {
  const [name, setName] = useState(place.name);
  const [postcode, setPostcode] = useState(place.postcode ?? '');
  const [price, setPrice] = useState(place.price ?? '');
  const [ageGroup, setAgeGroup] = useState(place.ageGroup ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      onSave({
        ...place,
        name: name.trim(),
        postcode: postcode.trim() || undefined,
        price: price.trim() || undefined,
        ageGroup: ageGroup.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-inverse-surface/30 backdrop-blur-sm p-4">
      <div className="bg-surface-container-lowest rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.12)] border border-outline-variant/10 p-6 w-full max-w-sm flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-headline font-bold text-on-surface">Edit Place</h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-label font-semibold text-on-surface">
              Name / Title
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50"
              placeholder="Place name"
            />
          </div>

          {/* Postcode */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="postcode" className="text-sm font-label font-semibold text-on-surface">
              Postcode
            </label>
            <input
              id="postcode"
              type="text"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50"
              placeholder="e.g. SW1A 2AA"
            />
          </div>

          {/* Price */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="price" className="text-sm font-label font-semibold text-on-surface">
              Price
            </label>
            <input
              id="price"
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50"
              placeholder="e.g. £15"
            />
          </div>

          {/* Age Group */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ageGroup" className="text-sm font-label font-semibold text-on-surface">
              Age Group
            </label>
            <input
              id="ageGroup"
              type="text"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-lg border border-outline-variant/30 bg-surface-container text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50"
              placeholder="e.g. 0-5 years"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-lg border border-outline-variant/30 text-on-surface hover:bg-surface-container font-label font-semibold transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 font-label font-semibold transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
