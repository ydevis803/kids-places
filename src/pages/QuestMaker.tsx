/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useMemo, useEffect } from 'react';
import {
  Wand2,
  Footprints,
  PartyPopper,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Sparkles,
  Clock,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Plus,
  Minus,
  Loader2,
  FolderHeart,
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { usePlaces } from '../context/PlacesContext';
import type { Place } from '../context/PlacesContext';
import { useSpotlist } from '../context/SpotlistContext';
import { useCollections } from '../context/CollectionsContext';
import { getEnv } from '../lib/env';
import { cn } from '../lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestPlace extends Place {
  durationHours: number;
  reason?: string;
}

interface QuestPlan {
  date: string;
  startTime: string;
  places: QuestPlace[];
}

// ── Stage metadata ────────────────────────────────────────────────────────────

const STAGES = [
  { id: 1, label: 'AI-Venture Finder',  icon: Sparkles,    subtitle: 'Let AI pick the best places for you' },
  { id: 2, label: 'The Plan-a-Saurus',  icon: Footprints,  subtitle: 'Build your perfect day'              },
  { id: 3, label: 'The Fun-vite',       icon: PartyPopper, subtitle: 'Share your adventure'                },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${hours * 60 | 0}min`;
  if (hours % 1 === 0) return `${hours}h`;
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  return `${h}h ${m}min`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuestMaker() {
  const { savedPlaces } = usePlaces();
  const { spotlist } = useSpotlist();
  const { collections } = useCollections();

  // Deduplicated combined list (Spotlist + Saved)
  const allPlaces = useMemo<Place[]>(() => {
    const seen = new Set<string>();
    const result: Place[] = [];
    for (const p of [...spotlist, ...savedPlaces]) {
      if (!seen.has(p.id) && !p.geocodeFailed) {
        seen.add(p.id);
        result.push(p);
      }
    }
    return result;
  }, [spotlist, savedPlaces]);

  // ── Stage state ──────────────────────────────────────────────────────────────
  const [stage, setStage] = useState(1);

  // Stage 1
  const [kidsAges, setKidsAges] = useState('');
  const [date, setDate] = useState('');
  const [startingPostcode, setStartingPostcode] = useState('SE9 2AY');
  const [maxDistance, setMaxDistance] = useState('30');
  const [prefs, setPrefs] = useState({ outdoor: false, indoor: false, free: false, educational: false });
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<QuestPlace[]>([]);
  const [aiError, setAiError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection whenever new AI suggestions arrive
  useEffect(() => {
    if (aiSuggestions.length > 0) {
      setSelectedIds(new Set());
    }
  }, [aiSuggestions]);

  // Places pool: if a collection is selected, use only its places; otherwise use all
  const sourcePlaces = useMemo<Place[]>(() => {
    if (!selectedCollectionId) return allPlaces;
    const col = collections.find(c => c.id === selectedCollectionId);
    if (!col) return allPlaces;
    const ids = new Set(col.placeIds);
    return allPlaces.filter(p => ids.has(p.id));
  }, [allPlaces, collections, selectedCollectionId]);

  // Stage 2
  const [questPlan, setQuestPlan] = useState<QuestPlan>({ date: '', startTime: '09:00', places: [] });

  // Stage 3
  const [invite, setInvite] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Stage 1: AI-Venture Finder ───────────────────────────────────────────────

  const handleFindAdventures = async () => {
    if (sourcePlaces.length === 0) {
      setAiError(
        selectedCollectionId
          ? 'That collection has no saved places. Try a different one or clear the filter.'
          : 'No places in your Spotlist or Saved Places yet. Add some first!',
      );
      return;
    }
    const apiKey = getEnv('GEMINI_API_KEY');
    if (!apiKey) {
      setAiError('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your environment.');
      return;
    }

    setAiLoading(true);
    setAiError('');
    setAiSuggestions([]);

    const prefLabels = (Object.keys(prefs) as (keyof typeof prefs)[])
      .filter(k => prefs[k])
      .map(k => k)
      .join(', ') || 'no specific preferences';

    const selectedCol = selectedCollectionId ? collections.find(c => c.id === selectedCollectionId) : null;

    const placesList = sourcePlaces
      .slice(0, 40) // cap to avoid token overflow
      .map(p =>
        `- ${p.name} | category: ${p.category || 'unknown'} | postcode: ${p.postcode ?? 'N/A'} | price: ${p.price ?? 'unknown'} | ages: ${p.ageGroup ?? 'all'} | ${p.outdoor ? 'outdoor' : 'indoor'}`,
      )
      .join('\n');

    const prompt = `You are a UK family day-out planner. Choose the best 3–5 places from the list below for a great day out based on the user's details.

User details:
- Kids' ages: ${kidsAges.trim() || 'all ages'}
- Date: ${date || 'not specified'}
- Starting postcode: ${startingPostcode || 'not specified'}
- Max travel distance: ${maxDistance} miles
- Preferences: ${prefLabels}${selectedCol ? `
- Collection filter: "${selectedCol.name}" — only places from this collection are in the list` : ''}

Available places:
${placesList}

Return ONLY a JSON array (no markdown, no extra text):
[{"name": "exact place name", "reason": "1-2 fun sentences why it's a great pick for this trip"}]`;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const raw = (response.text ?? '').trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
      const parsed = JSON.parse(raw) as Array<{ name: string; reason: string }>;

      const suggestions: QuestPlace[] = parsed
        .map(s => {
          const match = sourcePlaces.find(
            p =>
              p.name.toLowerCase() === s.name.toLowerCase() ||
              p.name.toLowerCase().includes(s.name.toLowerCase()) ||
              s.name.toLowerCase().includes(p.name.toLowerCase()),
          );
          if (!match) return null;
          return { ...match, durationHours: 2, reason: s.reason };
        })
        .filter((s): s is QuestPlace => s !== null);

      if (suggestions.length === 0) {
        setAiError('AI could not match any places. Try again or check your saved places.');
        return;
      }

      setAiSuggestions(suggestions);
    } catch (err) {
      setAiError('AI could not generate suggestions. Please try again.');
      console.error('[QuestMaker] AI error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const goToStage2 = () => {
    const selected = aiSuggestions.filter(s => selectedIds.has(s.id));
    setQuestPlan({ date, startTime: '09:00', places: selected });
    setStage(2);
  };

  // ── Stage 2: Plan-a-Saurus ────────────────────────────────────────────────────

  const movePlace = (index: number, dir: -1 | 1) => {
    setQuestPlan(prev => {
      const arr = [...prev.places];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return { ...prev, places: arr };
    });
  };

  const updateDuration = (id: string, delta: number) => {
    setQuestPlan(prev => ({
      ...prev,
      places: prev.places.map(p =>
        p.id === id ? { ...p, durationHours: Math.max(0.5, +(p.durationHours + delta).toFixed(1)) } : p,
      ),
    }));
  };

  const getTimeline = () => {
    let current = questPlan.startTime;
    return questPlan.places.map(p => {
      const start = current;
      const end = addMinutes(start, Math.round(p.durationHours * 60));
      current = addMinutes(end, 20); // ~20 min travel between stops
      return { ...p, start, end };
    });
  };

  // ── Stage 3: Fun-vite ─────────────────────────────────────────────────────────

  const handleGenerateInvite = async (plan: QuestPlan) => {
    const apiKey = getEnv('GEMINI_API_KEY');
    const timeline = (() => {
      let current = plan.startTime;
      return plan.places.map(p => {
        const start = current;
        const end = addMinutes(start, Math.round(p.durationHours * 60));
        current = addMinutes(end, 20);
        return { ...p, start, end };
      });
    })();
    const itinerary = timeline
      .map(p => `${p.start}–${p.end}: ${p.name}${p.postcode ? ` (${p.postcode})` : ''}`)
      .join('\n');

    if (!apiKey) {
      setInvite(
        `🎉 Our Family Adventure Day! 🎉\n\n📅 ${plan.date || 'Coming soon!'}\n\n${timeline.map((p, i) => `${i + 1}. ${p.name} — ${p.start} to ${p.end}`).join('\n')}\n\n🏠 Home time! Can't wait! 🚗`,
      );
      return;
    }

    setInviteLoading(true);
    const prompt = `Write a fun, enthusiastic family day-out invite message perfect for WhatsApp or a group chat. Use emojis freely, use kid-friendly language, and make it feel exciting and warm.

Date: ${plan.date || 'an upcoming day'}
Itinerary:
${itinerary}

Write 3–4 short paragraphs: a fun opening, a description of the adventure, a list of the stops with fun mini-descriptions, and an excited sign-off. Keep it conversational, warm and family-focused. Do NOT use markdown formatting.`;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      setInvite(response.text ?? '');
    } catch {
      setInvite(
        `🎉 Our Family Adventure Day! 🎉\n\n📅 ${plan.date || 'Coming soon!'}\n\n${timeline.map((p, i) => `${i + 1}. ${p.name} — ${p.start} to ${p.end}`).join('\n')}\n\n🏠 Home time! Can't wait! 🚗`,
      );
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const timeline = getTimeline();

  return (
    <div className="flex-1 px-6 py-8 md:px-12 md:py-12 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-headline text-4xl md:text-[3.5rem] font-extrabold text-on-background tracking-tight mb-2 leading-tight">
          Quest Maker
        </h1>
        <p className="text-on-surface-variant font-body text-lg max-w-xl">
          Plan the perfect day out with your little adventurers.
        </p>
      </div>

      {/* ── Stepper ── */}
      <div className="flex items-center mb-10 gap-1">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const isActive = stage === s.id;
          const isDone = stage > s.id;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all flex-1',
                  isActive && 'bg-primary text-on-primary shadow-ambient',
                  isDone && 'bg-surface-container text-primary cursor-pointer hover:bg-surface-container-high',
                  !isActive && !isDone && 'text-on-surface-variant',
                )}
                onClick={() => isDone && setStage(s.id)}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
                    isActive && 'bg-on-primary/20',
                    isDone && 'bg-primary/10',
                    !isActive && !isDone && 'bg-surface-container',
                  )}
                >
                  {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="hidden sm:block min-w-0">
                  <p className="text-xs font-label font-bold leading-tight truncate">{s.label}</p>
                  <p className={cn('text-xs leading-tight truncate', isActive ? 'opacity-80' : 'opacity-60')}>
                    {s.subtitle}
                  </p>
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <ChevronRight
                  className={cn(
                    'w-4 h-4 mx-1 flex-shrink-0',
                    stage > s.id ? 'text-primary' : 'text-outline-variant',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          STAGE 1 — AI-Venture Finder
      ════════════════════════════════════════════════════════════════════════ */}
      {stage === 1 && (
        <div className="flex flex-col gap-6">
          {/* Input card */}
          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 p-6 shadow-ambient flex flex-col gap-5">
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="font-headline text-xl font-bold text-on-surface">Tell the AI about your adventure</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-label font-semibold text-on-surface">Kids' Ages <span className="font-normal text-on-surface-variant">(leave blank for all)</span></label>
                <input
                  type="text"
                  value={kidsAges}
                  onChange={e => setKidsAges(e.target.value)}
                  placeholder="All ages — or e.g. 3, 6, 8"
                  className="px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-label font-semibold text-on-surface">Date of Outing</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-label font-semibold text-on-surface">Starting Postcode</label>
                <input
                  type="text"
                  value={startingPostcode}
                  onChange={e => setStartingPostcode(e.target.value)}
                  placeholder="e.g. GU11 1AA"
                  className="px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-label font-semibold text-on-surface">Max Distance (miles)</label>
                <input
                  type="number"
                  value={maxDistance}
                  onChange={e => setMaxDistance(e.target.value)}
                  min={5}
                  max={200}
                  className="px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>
            </div>

            {/* Preference toggles */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-label font-semibold text-on-surface">Preferences</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(prefs) as (keyof typeof prefs)[]).map(key => (
                  <button
                    key={key}
                    onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-label font-semibold border transition-all',
                      prefs[key]
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/40',
                    )}
                  >
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </button>
                ))}

                {/* Collections dropdown filter */}
                <div className="relative">
                  <button
                    onClick={() => setShowCollectionDropdown(v => !v)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-label font-semibold border transition-all',
                      selectedCollectionId
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/40',
                    )}
                  >
                    <FolderHeart className="w-4 h-4" />
                    {selectedCollectionId
                      ? (collections.find(c => c.id === selectedCollectionId)?.emoji ?? '') +
                        ' ' +
                        (collections.find(c => c.id === selectedCollectionId)?.name ?? 'Collection')
                      : 'Collection'}
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </button>

                  {showCollectionDropdown && (
                    <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[200px] bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient py-1 flex flex-col">
                      {collections.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-on-surface-variant font-label">No collections yet</p>
                      ) : (
                        <>
                          {selectedCollectionId && (
                            <button
                              onClick={() => { setSelectedCollectionId(null); setShowCollectionDropdown(false); }}
                              className="px-4 py-2.5 text-left text-sm font-label text-on-surface-variant hover:bg-surface-container transition-colors"
                            >
                              Clear filter
                            </button>
                          )}
                          {collections.filter(col => col.placeIds.some(id => allPlaces.some(p => p.id === id))).map(col => (
                            <button
                              key={col.id}
                              onClick={() => { setSelectedCollectionId(col.id); setShowCollectionDropdown(false); }}
                              className={cn(
                                'px-4 py-2.5 text-left text-sm font-label transition-colors flex items-center gap-2',
                                selectedCollectionId === col.id
                                  ? 'bg-primary/10 text-primary font-semibold'
                                  : 'text-on-surface hover:bg-surface-container',
                              )}
                            >
                              <span>{col.emoji}</span>
                              <span>{col.name}</span>
                              <span className="ml-auto text-xs text-on-surface-variant">{col.placeIds.filter(id => allPlaces.some(p => p.id === id)).length}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {allPlaces.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl">
                Your Spotlist and Saved Places are empty. Add some places first so the AI has something to pick from!
              </p>
            )}

            <button
              onClick={handleFindAdventures}
              disabled={aiLoading || allPlaces.length === 0}
              className="flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary text-on-primary font-label font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Finding adventures…
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" /> Find My Adventures!
                </>
              )}
            </button>

            {aiError && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 px-4 py-3 rounded-xl">{aiError}</p>
            )}
          </div>

          {/* AI Suggestions */}
          {aiSuggestions.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-headline text-lg font-bold text-on-surface">AI Suggested Places</h3>
                <span className="text-sm text-on-surface-variant font-label">{selectedIds.size} selected</span>
              </div>

              {aiSuggestions.map(place => (
                <button
                  key={place.id}
                  onClick={() => toggleSelect(place.id)}
                  className={cn(
                    'w-full text-left rounded-2xl border p-5 transition-all flex items-start gap-4',
                    selectedIds.has(place.id)
                      ? 'bg-primary-container/20 border-primary/40 shadow-ambient'
                      : 'bg-surface-container-lowest border-outline-variant/10 hover:border-primary/30',
                  )}
                >
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
                      selectedIds.has(place.id) ? 'bg-primary border-primary' : 'border-outline-variant',
                    )}
                  >
                    {selectedIds.has(place.id) && <Check className="w-3 h-3 text-on-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-headline font-bold text-on-surface">{place.name}</p>
                    {place.postcode && (
                      <p className="text-sm text-on-surface-variant mb-1">{place.postcode}</p>
                    )}
                    {place.reason && (
                      <p className="text-sm text-on-surface-variant italic leading-relaxed">{place.reason}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {place.category && (
                        <span className="text-xs px-2 py-1 rounded-lg bg-surface-container text-on-surface-variant font-label">
                          {place.category}
                        </span>
                      )}
                      {place.price && (
                        <span className="text-xs px-2 py-1 rounded-lg bg-surface-container text-on-surface-variant font-label">
                          {place.price}
                        </span>
                      )}
                      {place.ageGroup && (
                        <span className="text-xs px-2 py-1 rounded-lg bg-surface-container text-on-surface-variant font-label">
                          {place.ageGroup}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}

              <div className="flex justify-end">
                <button
                  onClick={goToStage2}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-2 py-3 px-6 rounded-xl bg-primary text-on-primary font-label font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Build My Plan <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          STAGE 2 — The Plan-a-Saurus
      ════════════════════════════════════════════════════════════════════════ */}
      {stage === 2 && (
        <div className="flex flex-col gap-6">
          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 p-6 shadow-ambient flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <Map className="w-5 h-5 text-primary" />
              <h2 className="font-headline text-xl font-bold text-on-surface">Build Your Perfect Day</h2>
            </div>

            {/* Start time */}
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-label font-semibold text-on-surface">Start Time</label>
                <input
                  type="time"
                  value={questPlan.startTime}
                  onChange={e => setQuestPlan(p => ({ ...p, startTime: e.target.value }))}
                  className="px-4 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>
            </div>

            {/* Timeline */}
            <div className="flex flex-col gap-3">
              {timeline.map((place, index) => (
                <div key={place.id} className="flex items-stretch gap-3">
                  {/* Time spine */}
                  <div className="flex flex-col items-center w-14 flex-shrink-0">
                    <span className="text-xs font-label font-bold text-primary">{place.start}</span>
                    <div className="flex-1 w-0.5 bg-primary/20 my-1 rounded-full min-h-[1.5rem]" />
                    <span className="text-xs font-label text-on-surface-variant">{place.end}</span>
                  </div>

                  {/* Place card */}
                  <div className="flex-1 bg-surface-container rounded-2xl p-4 border border-outline-variant/10 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-headline font-bold text-on-surface leading-tight">{place.name}</p>
                        {place.postcode && (
                          <p className="text-xs text-on-surface-variant mt-0.5">{place.postcode}</p>
                        )}
                      </div>
                      {/* Reorder arrows */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => movePlace(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                          className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest disabled:opacity-30 transition-colors"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => movePlace(index, 1)}
                          disabled={index === questPlan.places.length - 1}
                          aria-label="Move down"
                          className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest disabled:opacity-30 transition-colors"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Duration adjuster */}
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
                      <button
                        onClick={() => updateDuration(place.id, -0.5)}
                        aria-label="Decrease time"
                        className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-label font-semibold text-on-surface w-16 text-center">
                        {formatDuration(place.durationHours)}
                      </span>
                      <button
                        onClick={() => updateDuration(place.id, 0.5)}
                        aria-label="Increase time"
                        className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="text-xs text-on-surface-variant">at this place</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Home time row */}
              {timeline.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-14 text-center text-xs font-label font-bold text-on-surface-variant">
                    {timeline[timeline.length - 1].end}
                  </div>
                  <div className="flex-1 bg-surface-container rounded-2xl px-4 py-2.5 border border-dashed border-outline-variant/30 text-sm text-on-surface-variant font-label">
                    🏠 Home time!
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-between">
            <button
              onClick={() => setStage(1)}
              className="flex items-center gap-2 py-3 px-6 rounded-xl border border-outline-variant/30 text-on-surface font-label font-semibold hover:bg-surface-container transition-colors"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
            <button
              onClick={() => {
                setStage(3);
                setInvite('');
                handleGenerateInvite(questPlan);
              }}
              className="flex items-center gap-2 py-3 px-6 rounded-xl bg-primary text-on-primary font-label font-bold hover:bg-primary/90 transition-colors"
            >
              Create Fun-vite <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          STAGE 3 — The Fun-vite
      ════════════════════════════════════════════════════════════════════════ */}
      {stage === 3 && (
        <div className="flex flex-col gap-6">
          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 p-6 shadow-ambient flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PartyPopper className="w-5 h-5 text-primary" />
                <h2 className="font-headline text-xl font-bold text-on-surface">Your Fun-vite</h2>
              </div>
              <button
                onClick={handleCopy}
                disabled={!invite || inviteLoading}
                className="flex items-center gap-2 py-2 px-4 rounded-xl bg-surface-container text-on-surface font-label font-semibold hover:bg-surface-container-high border border-outline-variant/20 transition-all disabled:opacity-40"
              >
                {copied ? (
                  <><Check className="w-4 h-4 text-green-600" /> Copied!</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy</>
                )}
              </button>
            </div>

            {inviteLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="font-label text-sm">Writing your Fun-vite…</p>
              </div>
            ) : invite ? (
              <div className="bg-gradient-to-br from-primary-container/25 to-tertiary-container/20 rounded-2xl p-6 border border-primary/10">
                <pre className="font-body text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{invite}</pre>
              </div>
            ) : null}
          </div>

          <div className="flex gap-3 justify-between">
            <button
              onClick={() => setStage(2)}
              className="flex items-center gap-2 py-3 px-6 rounded-xl border border-outline-variant/30 text-on-surface font-label font-semibold hover:bg-surface-container transition-colors"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
            <button
              onClick={() => { setInvite(''); handleGenerateInvite(questPlan); }}
              disabled={inviteLoading}
              className="flex items-center gap-2 py-3 px-6 rounded-xl bg-surface-container border border-outline-variant/20 text-on-surface font-label font-semibold hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-primary" /> Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
