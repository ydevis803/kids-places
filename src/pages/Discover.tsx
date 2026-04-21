import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Flame, ToyBrick, TreePalm, GraduationCap, Coffee, Waves, FileText, Star, List, Utensils, RefreshCw, MapPin, Sparkles, ExternalLink, ChevronDown } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TrendingPlace {
  name: string;
  location: string;
  description: string;
  category: string;
  whyTrending: string;
  priceGuide?: string;
  outdoor: boolean;
  emoji: string;
}

// ── Session cache ──────────────────────────────────────────────────────────────
const CACHE_KEY = 'kids-places:trending';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function loadCache(): TrendingPlace[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: TrendingPlace[] };
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function saveCache(data: TrendingPlace[]) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
}

// ── Guide types & cache ────────────────────────────────────────────────────────
interface Guide {
  tag: string;
  title: string;
  body: string;
  author: string;
  role: string;
  rating: string;
  accentClass: string;
  initials?: string;
  sourceUrl?: string;
  sourceName?: string;
}

const GUIDES_CACHE_KEY = 'kids-places:guides';
const GUIDES_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const GUIDE_ACCENT_CLASSES = [
  'bg-primary-container/20',
  'bg-secondary-container/20',
  'bg-tertiary-container/20',
];

function loadGuidesCache(): Guide[] | null {
  try {
    const raw = sessionStorage.getItem(GUIDES_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: Guide[] };
    if (Date.now() - ts > GUIDES_CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function saveGuidesCache(data: Guide[]) {
  try { sessionStorage.setItem(GUIDES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
}

function tagIcon(tag: string) {
  const t = tag.toLowerCase();
  if (t.includes('food') || t.includes('drink')) return <Utensils className="w-3.5 h-3.5" />;
  if (t.includes('roundup')) return <List className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
}

// Option 3: Scrape Days Out With The Kids blog via ScrapingBee → structure with Gemini
async function fetchGuidesFromScrape(): Promise<Guide[]> {
  const sbKey: string = process.env.SCRAPINGBEE_API_KEY || '';
  if (!sbKey) throw new Error('No ScrapingBee key');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini key');

  const targetUrl = 'https://www.dayoutwiththekids.co.uk/blog/';
  const extractRules = JSON.stringify({
    titles:   { selector: 'h2, h3, h4, .card-title, .post-title, .entry-title', type: 'list' },
    excerpts: { selector: 'p, .excerpt, .summary, .card-text, .post-excerpt',   type: 'list' },
  });
  const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(sbKey)}&url=${encodeURIComponent(targetUrl)}&render_js=false&premium_proxy=true&extract_rules=${encodeURIComponent(extractRules)}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(sbUrl)}`;

  console.log('[Guides] Fetching DOTWTK via ScrapingBee...');
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`ScrapingBee status ${res.status}`);

  const wrapper = await res.json() as { contents: string };
  const data = JSON.parse(wrapper.contents) as { titles?: string[]; excerpts?: string[] };
  console.log('[Guides] ScrapingBee response titles:', data.titles?.length, 'excerpts:', data.excerpts?.length);

  const titles   = (data.titles   ?? []).filter(t => t.trim().length > 5).slice(0, 12);
  const excerpts = (data.excerpts ?? []).filter(e => e.trim().length > 20).slice(0, 12);
  if (titles.length < 2 && excerpts.length < 2) throw new Error('Insufficient scraped content');

  const rawText = [
    ...titles.map(t => `TITLE: ${t.trim()}`),
    ...excerpts.map(e => `TEXT: ${e.trim()}`),
  ].join('\n').slice(0, 5000);

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `The following is scraped content from Days Out With The Kids (dayoutwiththekids.co.uk), a popular UK family activity website. Based on these article titles and excerpts, create summaries for the 3 most interesting or useful guides for UK parents planning family days out.\n\nReturn ONLY a JSON array (no markdown):\n[{\n  "tag": "Itinerary | Roundup | Seasonal | Tips | Food & Drink",\n  "title": "Clear guide title (keep original article title if identifiable)",\n  "body": "2-3 engaging sentences describing what this guide covers and why families will love it"\n}]\n\nScraped content:\n${rawText}`,
  });
  const rawJson = (response.text ?? '').trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
  const parsed = JSON.parse(rawJson) as Array<{ tag: string; title: string; body: string }>;

  return parsed.slice(0, 3).map((g, i) => ({
    tag:        g.tag ?? 'Guide',
    title:      g.title,
    body:       g.body,
    author:     'Days Out With The Kids',
    role:       'Community Source',
    rating:     (4.6 + i * 0.1).toFixed(1),
    accentClass: GUIDE_ACCENT_CLASSES[i % GUIDE_ACCENT_CLASSES.length],
    sourceUrl:  'https://www.dayoutwiththekids.co.uk/blog/',
    sourceName: 'dayoutwiththekids.co.uk',
  }));
}

// Option 1: Pure Gemini generation — used as fallback when scraping fails
async function fetchGuidesGemini(): Promise<Guide[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });
  const monthYear = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Today is ${monthYear}. Create 3 practical community-style guides for UK parents planning family days out. Each should feel specific, seasonally relevant, and written with insider parent knowledge — include real UK location names.\n\nReturn ONLY a JSON array (no markdown):\n[{\n  "tag": "Itinerary | Roundup | Seasonal | Tips | Food & Drink",\n  "title": "Specific UK guide title with location or theme",\n  "body": "2-3 practical, parent-friendly sentences with specific tips",\n  "author": "First name + initial, e.g. Emma T.",\n  "role": "Local Explorer | Top Contributor | Verified Author | Seasonal Specialist"\n}]`,
  });
  const rawJson = (response.text ?? '').trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
  const parsed = JSON.parse(rawJson) as Array<{
    tag: string; title: string; body: string; author: string; role: string;
  }>;
  return parsed.slice(0, 3).map((g, i) => ({
    tag:        g.tag ?? 'Guide',
    title:      g.title,
    body:       g.body,
    author:     g.author ?? 'Community Member',
    role:       g.role ?? 'Local Explorer',
    rating:     (4.5 + i * 0.15).toFixed(1),
    accentClass: GUIDE_ACCENT_CLASSES[i % GUIDE_ACCENT_CLASSES.length],
    initials:   (g.author ?? 'CM').split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase(),
  }));
}

async function fetchGuides(): Promise<{ guides: Guide[]; source: 'scraped' | 'ai' }> {
  try {
    const guides = await fetchGuidesFromScrape();
    if (guides.length >= 2) { console.log('[Guides] Using scraped data'); return { guides, source: 'scraped' }; }
    throw new Error('Too few scraped guides');
  } catch (e) {
    console.warn('[Guides] Scrape failed, using Gemini fallback:', (e as Error).message);
    const guides = await fetchGuidesGemini();
    return { guides, source: 'ai' };
  }
}

// ── Gemini fetch ───────────────────────────────────────────────────────────────
async function fetchTrending(): Promise<TrendingPlace[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const now = new Date();
  const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const prompt = `Today is ${monthYear}. You are a UK family activities expert. Suggest 5 trending family-friendly places or activities in the UK right now, considering the current season and school holiday calendar. Focus on real, well-known UK venues or seasonal activities. Mix indoor and outdoor options.

Return ONLY a JSON array (no markdown fences):
[{
  "name": "Venue or activity name",
  "location": "Town or city, UK",
  "description": "Two engaging sentences for a family planning a day out",
  "category": "Zoo | Park | Museum | Adventure | Beach | Garden | Farm | Festival | Other",
  "whyTrending": "One sentence on why families are visiting right now",
  "priceGuide": "e.g. Free, From £10, £5–£15 per person — omit field if unknown",
  "outdoor": true or false,
  "emoji": "single most relevant emoji"
}]`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  const raw = (response.text ?? '').trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
  const parsed = JSON.parse(raw) as TrendingPlace[];
  return parsed;
}

// ── Gradient themes per category ───────────────────────────────────────────────
function cardTheme(category: string, idx: number): { bg: string; badge: string } {
  const themes: Record<string, { bg: string; badge: string }> = {
    Zoo:      { bg: 'from-emerald-400/20 to-teal-300/10',     badge: 'bg-emerald-100 text-emerald-700' },
    Park:     { bg: 'from-green-400/20 to-lime-300/10',        badge: 'bg-green-100 text-green-700' },
    Museum:   { bg: 'from-violet-400/20 to-purple-300/10',     badge: 'bg-violet-100 text-violet-700' },
    Adventure:{ bg: 'from-orange-400/20 to-amber-300/10',      badge: 'bg-orange-100 text-orange-700' },
    Beach:    { bg: 'from-sky-400/20 to-cyan-300/10',          badge: 'bg-sky-100 text-sky-700' },
    Garden:   { bg: 'from-lime-400/20 to-green-300/10',        badge: 'bg-lime-100 text-lime-700' },
    Farm:     { bg: 'from-yellow-400/20 to-amber-300/10',      badge: 'bg-yellow-100 text-yellow-700' },
    Festival: { bg: 'from-pink-400/20 to-rose-300/10',         badge: 'bg-pink-100 text-pink-700' },
  };
  const fallbacks = [
    { bg: 'from-primary/10 to-primary-container/5',   badge: 'bg-primary/10 text-primary' },
    { bg: 'from-secondary/20 to-secondary-container/10', badge: 'bg-secondary/20 text-on-secondary-container' },
    { bg: 'from-tertiary/20 to-tertiary-container/10', badge: 'bg-tertiary/20 text-on-tertiary-container' },
  ];
  return themes[category] ?? fallbacks[idx % fallbacks.length];
}

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard({ large = false }: { large?: boolean }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-surface-container-low ${large ? 'h-[420px]' : 'h-[220px]'}`} />
  );
}

export default function Discover() {
  const navigate = useNavigate();
  const [trending, setTrending] = useState<TrendingPlace[]>(() => loadCache() ?? []);
  const [loading, setLoading]   = useState(trending.length === 0);
  const [error, setError]       = useState<string | null>(null);
  const [guides, setGuides]           = useState<Guide[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(true);
  const [guideSource, setGuideSource] = useState<'scraped' | 'ai' | null>(null);
  const [expandedGuides, setExpandedGuides] = useState<Set<number>>(new Set());

  async function load(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) { setTrending(cached); setLoading(false); return; }
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrending();
      if (data.length) { saveCache(data); setTrending(data); }
      else setError('No trending data returned. Check your Gemini API key.');
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load trending places.');
    } finally {
      setLoading(false);
    }
  }

  async function loadGuides() {
    const cached = loadGuidesCache();
    if (cached?.length) { setGuides(cached); setGuidesLoading(false); return; }
    setGuidesLoading(true);
    try {
      const { guides: data, source } = await fetchGuides();
      if (data.length) { saveGuidesCache(data); setGuides(data); setGuideSource(source); }
    } catch { /* silently ignore — graceful degradation */ }
    finally { setGuidesLoading(false); }
  }

  useEffect(() => { load(); loadGuides(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hero = trending[0] ?? null;
  const rest  = trending.slice(1);

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 lg:px-14 pt-8 lg:pt-12 space-y-16">
      {/* ── Trending Hero ──────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="ml-2 lg:ml-4 flex items-end justify-between">
          <div>
            <h2 className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface tracking-tight">Trending This Week</h2>
            <p className="text-on-surface-variant text-sm md:text-base mt-2 max-w-2xl font-body">
              AI-curated highlights for UK families — updated for {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm font-label font-semibold text-primary hover:text-primary-container transition-colors disabled:opacity-40 shrink-0 mb-1"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mx-2 p-4 bg-secondary-container/40 text-on-secondary-container rounded-2xl text-sm font-body">
            {error}
          </div>
        )}

        {/* Hero card */}
        {loading && !hero ? (
          <SkeletonCard large />
        ) : hero ? (
          <div
            className={`relative w-full rounded-[1.5rem] overflow-hidden group cursor-pointer bg-gradient-to-br ${cardTheme(hero.category, 0).bg} border border-outline-variant/10 shadow-ambient`}
            style={{ minHeight: '420px' }}
          >
            {/* Big emoji background */}
            <div className="absolute inset-0 flex items-center justify-end pr-10 pointer-events-none select-none">
              <span className="text-[160px] md:text-[220px] opacity-10 leading-none">{hero.emoji}</span>
            </div>

            <div className="relative z-10 p-8 md:p-12 flex flex-col justify-between h-full" style={{ minHeight: '420px' }}>
              <div className="flex gap-3">
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${cardTheme(hero.category, 0).badge}`}>
                  {hero.category}
                </span>
                <span className="px-4 py-1.5 rounded-full bg-secondary/20 text-on-secondary-container text-xs font-bold flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" /> Trending
                </span>
              </div>

              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-on-surface-variant text-sm font-body mb-2">
                  <MapPin className="w-4 h-4 shrink-0" /> {hero.location}
                </div>
                <h3 className="font-headline text-3xl md:text-4xl font-extrabold text-on-surface mb-3 leading-tight">
                  {hero.emoji} {hero.name}
                </h3>
                <p className="font-body text-on-surface-variant text-sm md:text-base mb-3 line-clamp-3">{hero.description}</p>
                <p className="font-label text-xs text-primary font-semibold italic mb-6">✨ {hero.whyTrending}</p>
                <div className="flex flex-wrap gap-3 items-center">
                  {hero.priceGuide && (
                    <span className="px-3 py-1.5 rounded-full bg-surface-container-lowest/80 text-on-surface text-xs font-label font-semibold border border-outline-variant/20">
                      {hero.priceGuide}
                    </span>
                  )}
                  <span className="px-3 py-1.5 rounded-full bg-surface-container-lowest/80 text-on-surface text-xs font-label font-semibold border border-outline-variant/20">
                    {hero.outdoor ? '🌤 Outdoor' : '🏠 Indoor'}
                  </span>
                  <button
                    onClick={() => navigate('/map-editor', { state: { prefillText: `${hero.name}, ${hero.location}` } })}
                    className="ml-auto px-6 py-3 rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary font-bold text-sm shadow-ambient hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Find on Map
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Remaining trending cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading && !rest.length
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : rest.map((place, i) => {
                const theme = cardTheme(place.category, i + 1);
                return (
                  <article
                    key={place.name}
                    className={`relative bg-gradient-to-br ${theme.bg} rounded-2xl p-5 border border-outline-variant/10 flex flex-col gap-3 group hover:-translate-y-1 transition-transform duration-300 cursor-pointer overflow-hidden`}
                    onClick={() => navigate('/map-editor', { state: { prefillText: `${place.name}, ${place.location}` } })}
                  >
                    <div className="absolute bottom-2 right-3 text-6xl opacity-10 select-none pointer-events-none leading-none">{place.emoji}</div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${theme.badge}`}>{place.category}</span>
                      {place.priceGuide && (
                        <span className="text-xs font-label text-on-surface-variant">{place.priceGuide}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-headline font-bold text-on-surface text-base leading-snug mb-1">{place.name}</h4>
                      <p className="text-xs font-body text-on-surface-variant flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {place.location}
                      </p>
                    </div>
                    <p className="text-xs font-body text-on-surface-variant line-clamp-2 flex-1">{place.description}</p>
                    <p className="text-xs font-label text-primary italic line-clamp-1">✨ {place.whyTrending}</p>
                    <div className="flex items-center justify-end mt-auto">
                      <span className="text-xs font-label font-semibold text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                        Find on Map <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </article>
                );
              })}
        </div>
      </section>

      {/* ── Categories ────────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <h3 className="text-xl md:text-2xl font-headline font-bold text-on-surface ml-2 lg:ml-4">Explore by Vibe</h3>
        <div className="flex overflow-x-auto pb-6 -mx-6 px-6 md:mx-0 md:px-0 gap-4 snap-x snap-mandatory hide-scrollbar">
          {[
            { icon: <ToyBrick className="w-10 h-10 fill-current" />, label: 'Soft Play', color: 'text-primary', query: 'soft play UK' },
            { icon: <TreePalm className="w-10 h-10 fill-current" />, label: 'Outdoor Parks', color: 'text-secondary', query: 'outdoor park UK families' },
            { icon: <GraduationCap className="w-10 h-10 fill-current" />, label: 'Educational', color: 'text-tertiary', query: 'educational museum UK children' },
            { icon: <Coffee className="w-10 h-10 fill-current" />, label: 'Cafes', color: 'text-inverse-primary', query: 'family friendly cafe UK' },
            { icon: <Waves className="w-10 h-10 fill-current" />, label: 'Swimming', color: 'text-primary', query: 'swimming pool UK families' },
          ].map(({ icon, label, color, query }) => (
            <button
              key={label}
              onClick={() => navigate('/map-editor', { state: { prefillText: query } })}
              className="snap-start shrink-0 flex flex-col items-center gap-3 group"
            >
              <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full bg-surface-container-low flex items-center justify-center shadow-sm group-hover:bg-surface-container-lowest group-hover:shadow-ambient transition-all duration-300 ${color}`}>
                {icon}
              </div>
              <span className={`font-label text-sm font-semibold text-on-surface-variant group-hover:${color.replace('text-', 'text-')} transition-colors`}>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Community Guides (dynamic) ─────────────────────────────────────── */}
      <section className="space-y-8">
        <div className="flex justify-between items-end ml-2 lg:ml-4">
          <div>
            <h3 className="text-2xl md:text-3xl font-headline font-bold text-on-surface">Community Guides</h3>
            {guideSource === 'scraped' && (
              <p className="text-xs font-body text-on-surface-variant mt-1 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                Sourced from{' '}
                <a href="https://www.dayoutwiththekids.co.uk/blog/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  dayoutwiththekids.co.uk
                </a>
              </p>
            )}
            {guideSource === 'ai' && (
              <p className="text-xs font-body text-on-surface-variant mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" /> AI-curated guides for UK families
              </p>
            )}
          </div>
          <a
            href="https://www.dayoutwiththekids.co.uk/blog/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-primary hover:text-primary-container transition-colors flex items-center gap-1 mb-1 shrink-0"
          >
            More guides <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pb-12">
          {guidesLoading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            : guides.map((g, i) => (
                <article key={i} className="bg-surface-container-lowest rounded-[1.5rem] p-6 shadow-ambient flex flex-col h-full group hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden">
                  <div className={`absolute -top-10 -right-10 w-32 h-32 ${g.accentClass} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity`} />
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-semibold">
                        {tagIcon(g.tag)} {g.tag}
                      </span>
                      <div className="flex items-center gap-1 text-tertiary font-bold text-sm">
                        <Star className="w-4 h-4 text-tertiary-fixed fill-current" /> {g.rating}
                      </div>
                    </div>
                    <h4 className="font-headline text-xl font-bold text-on-surface mb-3 leading-snug">{g.title}</h4>
                    <div className="mb-4">
                      <p className={`font-body text-sm text-on-surface-variant ${expandedGuides.has(i) ? '' : 'line-clamp-3'}`}>{g.body}</p>
                      <button
                        onClick={() => setExpandedGuides(prev => {
                          const next = new Set(prev);
                          next.has(i) ? next.delete(i) : next.add(i);
                          return next;
                        })}
                        className="mt-1.5 flex items-center gap-0.5 text-xs font-label font-semibold text-primary hover:text-primary-container transition-colors"
                      >
                        {expandedGuides.has(i) ? 'Show less' : 'Read more'}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedGuides.has(i) ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-auto relative z-10 space-y-4 pt-4">
                    {/* Author row */}
                    <div className="flex items-center gap-3">
                      {g.sourceName ? (
                        <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                          <ExternalLink className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-sm shrink-0">
                          {g.initials ?? 'CM'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-label text-sm font-bold text-on-surface truncate">{g.author}</p>
                        <p className="font-label text-xs text-on-surface-variant">{g.role}</p>
                      </div>
                    </div>
                    {/* CTA */}
                    {g.sourceUrl ? (
                      <a
                        href={g.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-primary hover:bg-surface-container transition-colors"
                      >
                        Read full guide <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <button
                        onClick={() => navigate('/map-editor', { state: { prefillText: g.title } })}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-primary hover:bg-surface-container transition-colors"
                      >
                        Find these places <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              ))
          }
        </div>
      </section>
    </div>
  );
}

