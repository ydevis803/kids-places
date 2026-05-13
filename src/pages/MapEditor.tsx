/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  ChangeEvent,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  MapPin,
  Image as ImageIcon,
  Sparkles,
  ArrowUpDown,
  Route,
  Navigation,
  Sun,
  LocateFixed,
  Compass,
  Heart,
  Binoculars,
  Globe,
  X,
  Loader2,
  ExternalLink,
  ClipboardPaste,
  AlertTriangle,
  BookmarkPlus,
  BookmarkCheck,
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { GoogleGenAI } from '@google/genai';
import { usePlaces } from '../context/PlacesContext';
import type { Place } from '../context/PlacesContext';
import { useSpotlist } from '../context/SpotlistContext';
import LeafletMap from '../components/LeafletMap';
import { getEnv } from '../lib/env';

// ─── helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Single Nominatim lookup — returns null on miss. */
async function nominatimLookup(query: string): Promise<{ lat: number; lng: number; geocodedName?: string; website?: string; fee?: string; charge?: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&extratags=1&countrycodes=gb&viewbox=-8.65,49.82,1.77,60.86&bounded=0`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (!data[0]) return null;
    const { lat, lon, display_name, extratags } = data[0];
    const shortName = (display_name as string)?.split(',')[0]?.trim();
    return {
      lat: parseFloat(lat),
      lng: parseFloat(lon),
      geocodedName: shortName,
      website: extratags?.website ?? extratags?.['contact:website'],
      fee: extratags?.fee,
      charge: extratags?.charge ?? extratags?.['entrance:fee'],
    };
  } catch {
    return null;
  }
}

async function mapsCoLookup(query: string): Promise<{ lat: number; lng: number; geocodedName?: string } | null> {
  try {
    const res = await fetch(
      `https://geocode.maps.co/search?q=${encodeURIComponent(query)}&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json() as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!data[0]) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      geocodedName: data[0].display_name?.split(',')[0]?.trim(),
    };
  } catch {
    return null;
  }
}

/** Delay helper to respect Nominatim's 1 req/sec rate limit. */
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

/** Extract a UK postcode from a string, e.g. "Mizens Railway GU21 2JW" → "GU21 2JW" */
const UK_POSTCODE_RE = /\b([A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2})\b/i;
function extractUKPostcode(s: string): string | undefined {
  const m = UK_POSTCODE_RE.exec(s);
  return m ? m[1].toUpperCase().replace(/\s+/, ' ').trim() : undefined;
}
/** Remove an embedded UK postcode from a place name. */
function stripPostcodeFromName(name: string): string {
  return name.replace(UK_POSTCODE_RE, '').replace(/\s{2,}/g, ' ').trim();
}

function normalizePlaceName(name: string): string {
  return name
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[@#][\w-]+/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Extraction debug tracker (reset before each run) ────────────────────────
let _debug = {
  geminiCount: 0,
  geocodedCount: 0,
  failed: [] as { name: string; reason: string }[],
};
function resetDebug() {
  _debug = { geminiCount: 0, geocodedCount: 0, failed: [] };
}

/** Geocode a place name, trying multiple fallback strategies before giving up. */
async function geocodeName(name: string, postcode?: string): Promise<{ lat: number; lng: number; geocodedName?: string; website?: string; fee?: string; charge?: string } | null> {
  // Extract a postcode embedded in the name (e.g. "Mizens Railway GU21 2JW") if not provided separately
  const embeddedPostcode = extractUKPostcode(name);
  const resolvedPostcode = postcode ?? embeddedPostcode;
  const cleanName = normalizePlaceName(embeddedPostcode ? stripPostcodeFromName(name) : name);

  // Step 1: name + postcode (only when postcode is available)
  if (resolvedPostcode) {
    const result = await nominatimLookup(`${cleanName} ${resolvedPostcode}`);
    if (result) return result;
    await sleep(1100);
  }

  // Step 2: name, UK
  const withUK = await nominatimLookup(`${cleanName}, UK`);
  if (withUK) return withUK;
  await sleep(1100);

  // Step 3: bare name
  const bare = await nominatimLookup(cleanName);
  if (bare) return bare;
  await sleep(1100);

  // Step 4: postcode only (only when postcode is available)
  if (resolvedPostcode) {
    const result = await nominatimLookup(resolvedPostcode);
    if (result) return { ...result, geocodedName: resolvedPostcode };
    await sleep(1100);
  }

  // Step 5: fallback provider with the same query strategy
  if (resolvedPostcode) {
    const withPc = await mapsCoLookup(`${cleanName} ${resolvedPostcode}`);
    if (withPc) return withPc;
  }
  const ukFallback = await mapsCoLookup(`${cleanName}, UK`);
  if (ukFallback) return ukFallback;
  const bareFallback = await mapsCoLookup(cleanName);
  if (bareFallback) return bareFallback;

  return null;
}

function isUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const SOCIAL_DOMAINS = ['instagram.com', 'tiktok.com', 'vm.tiktok.com', 'fb.watch', 'facebook.com'];
function isSocialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SOCIAL_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Pull text from a social media post.
 * Strategy:
 *  1. ScrapingBee (JS-rendered, premium proxy) — extracts OG meta + visible text
 *  2. oEmbed endpoints (caption / title from platform APIs)
 *  3. allorigins CORS proxy — scrapes raw OG/Twitter Card meta from HTML
 */
async function fetchSocialText(url: string): Promise<string> {
  const parts: string[] = [];
  const host = new URL(url).hostname.replace(/^www\./, '');
  const sbKey = getEnv('SCRAPINGBEE_API_KEY');

  // 1. ScrapingBee — routed via allorigins to avoid browser CORS restrictions.
  //    ScrapingBee is a server-side API; direct browser fetch is blocked by CORS,
  //    so we wrap it with allorigins which makes the request server-to-server.
  if (sbKey) {
    try {
      const extractRules = JSON.stringify({
        og_title:           { selector: "meta[property='og:title']",         attribute: 'content' },
        og_description:     { selector: "meta[property='og:description']",   attribute: 'content' },
        twitter_title:      { selector: "meta[name='twitter:title']",        attribute: 'content' },
        twitter_description:{ selector: "meta[name='twitter:description']",  attribute: 'content' },
        ld_json:            { selector: 'script[type="application/ld+json"]', type: 'list' },
      });
      // Build the ScrapingBee URL (render_js=false is faster and sufficient for OG/ld+json)
      const sbApiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(sbKey)}&url=${encodeURIComponent(url)}&render_js=false&premium_proxy=true&extract_rules=${encodeURIComponent(extractRules)}`;
      // Wrap with allorigins so the request goes server→server (no CORS issue)
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(sbApiUrl)}`;
      console.log('[ScrapingBee] Fetching via allorigins proxy for:', url);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(45000) });
      if (res.ok) {
        const wrapper = await res.json() as { contents: string };
        console.log('[ScrapingBee] Raw response length:', wrapper.contents?.length);
        const data = JSON.parse(wrapper.contents) as Record<string, unknown>;
        console.log('[ScrapingBee] Parsed data:', data);
        const add = (v: unknown) => { if (typeof v === 'string' && v.trim()) parts.push(v.trim()); };
        add(data.og_title);
        add(data.og_description);
        if (data.twitter_title !== data.og_title) add(data.twitter_title);
        if (data.twitter_description !== data.og_description) add(data.twitter_description);
        if (Array.isArray(data.ld_json)) {
          for (const block of data.ld_json as string[]) {
            try {
              const json = JSON.parse(block) as Record<string, unknown>;
              add(json.caption);
              add(json.description);
              add(json.articleBody as string | undefined);
            } catch { /* ignore malformed blocks */ }
          }
        }
        const result = parts.join('\n').trim();
        console.log('[ScrapingBee] Extracted text:', result || '(empty)');
        if (result) return result;
      } else {
        console.warn('[ScrapingBee] Non-OK response:', res.status, res.statusText);
      }
    } catch (err) {
      console.warn('[ScrapingBee] Error:', err);
    }
  } else {
    console.warn('[ScrapingBee] Key not set — skipping. Add SCRAPINGBEE_API_KEY to .env.local and restart the dev server.');
  }

  // 2. oEmbed (returns title / author_name / caption for public posts)
  try {
    let oembedUrl = '';
    if (host.includes('instagram.com'))
      oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&format=json`;
    else if (host.includes('tiktok.com'))
      oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;

    if (oembedUrl) {
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json() as Record<string, string>;
        if (data.title) parts.push(data.title);
        if (data.author_name) parts.push(`Posted by ${data.author_name}`);
      }
    }
  } catch { /* ignore */ }

  // 3. Open Graph / Twitter Card meta tags via allorigins CORS proxy
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const { contents } = await res.json() as { contents: string };
      if (contents) {
        const getMeta = (pattern: RegExp) => pattern.exec(contents)?.[1] ?? '';
        const ogTitle  = getMeta(/property=["']og:title["']\s+content=["']([^"']+)["']/i)
                      || getMeta(/content=["']([^"']+)["']\s+property=["']og:title["']/i);
        const ogDesc   = getMeta(/property=["']og:description["']\s+content=["']([^"']+)["']/i)
                      || getMeta(/content=["']([^"']+)["']\s+property=["']og:description["']/i);
        const twDesc   = getMeta(/name=["']twitter:description["']\s+content=["']([^"']+)["']/i)
                      || getMeta(/content=["']([^"']+)["']\s+name=["']twitter:description["']/i);
        if (ogTitle) parts.push(ogTitle);
        if (ogDesc)  parts.push(ogDesc);
        if (twDesc && twDesc !== ogDesc) parts.push(twDesc);
      }
    }
  } catch { /* ignore */ }

  return parts.join('\n').trim();
}

/** Fetch an article via a public CORS proxy and return its plain text. */
async function fetchArticleText(url: string): Promise<string> {
  const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxy, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Could not fetch the URL. Try pasting the article text directly.');
  const { contents } = await res.json() as { contents: string };
  if (!contents) throw new Error('Empty response from URL.');
  const div = document.createElement('div');
  div.innerHTML = contents;
  return (div.textContent ?? div.innerText ?? '').replace(/\s{3,}/g, '\n').slice(0, 10000);
}

const EXTRACTION_PROMPT = `You are a helpful assistant that extracts real-world places and activities suitable for families with children in the United Kingdom.

IMPORTANT CONTEXT:
- ALL locations are in the UK (England, Scotland, Wales, or Northern Ireland).
- The text may contain UK postcodes (e.g. "SW1A 1AA", "OX1 2JD", "B1 1BB") — if a postcode appears near a place name, put it in the "postcode" field (NOT in the name).
- Prefer the full official name of the venue without any postcode appended.
- If the text mentions a town or city alongside the venue, you may include it in the description.

Return ONLY a JSON array (no markdown fences). Each element:
{
  "name": "Exact place name only — no postcode, no city suffix",
  "postcode": "UK postcode if mentioned near this place, e.g. OX20 1PP — omit if not mentioned",
  "description": "One sentence description, mentioning the UK town/city if known",
  "category": "Zoo | Park | Museum | Adventure | Restaurant | Other",
  "price": "e.g. Free, £5, £10 - £20, £3 per child — ONLY include if the text mentions a price or admission cost, otherwise omit this field entirely",
  "ageGroup": "All Ages | Toddlers | Older Kids",
  "outdoor": true or false
}
Rules:
- All places are in the UK. Never suggest a location outside the UK.
- "postcode" must be the raw postcode only (e.g. "SW1A 1AA"), never embedded in the name.
- "price" must be the actual price mentioned in the text. If no price is mentioned, do NOT include the field.
- Do not invent or guess prices or postcodes.
- Return ALL places found in the text, up to 20 maximum.
- If no real places are found return [].`;

const SEARCH_PROMPT = `You are a knowledgeable UK family activity guide. For the given search query, suggest up to 8 real, well-known, family-friendly places or venues in the UK that best match the query. Focus on places that genuinely exist and are suitable for children.

Return ONLY a JSON array (no markdown fences). Each element:
{
  "name": "Exact official venue name — no postcode, no city suffix",
  "postcode": "UK postcode if you know it with confidence, e.g. SW7 2DD — omit if unsure",
  "description": "One sentence mentioning the UK town/city and why it is great for families",
  "category": "Zoo | Park | Museum | Adventure | Restaurant | Soft Play | Swimming | Other",
  "price": "Approximate entry price if well-known, e.g. Free, £15 per person — omit if unsure",
  "ageGroup": "All Ages | Toddlers | Older Kids",
  "outdoor": true or false
}
Rules:
- Only suggest places that genuinely exist in the UK.
- Cover a geographic spread (England, Scotland, Wales, Northern Ireland) where appropriate.
- Prefer popular, well-reviewed, family-friendly venues.
- If postcode is uncertain, omit it rather than guess.
- If price is uncertain, omit it rather than guess.
- Return at most 20 places.`;

async function searchPlacesByQuery(query: string): Promise<Place[]> {
  const apiKey = getEnv('GEMINI_API_KEY');
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `${SEARCH_PROMPT}\n\nSearch query: ${query}`,
  });
  return parseGeminiPlaces(response.text ?? '[]');
}

/** Try to extract admission price from the place's own website using Gemini. */
async function enrichPriceFromWebsite(website: string, apiKey: string, placeName: string): Promise<string | undefined> {
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(website)}`;
    const res = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return undefined;
    const { contents } = await res.json() as { contents: string };
    if (!contents) return undefined;
    const div = document.createElement('div');
    div.innerHTML = contents;
    const pageText = (div.textContent ?? div.innerText ?? '').replace(/\s{3,}/g, ' ').slice(0, 4000);
    if (!pageText.trim()) return undefined;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `From the following website text for "${placeName}", extract the admission price or entry fee as a short string (e.g. "Free", "£12 adults / £8 children", "From £5"). If no price is mentioned, reply with exactly: none\n\nWebsite text:\n${pageText}`,
    });
    const answer = (response.text ?? '').trim();
    if (!answer || answer.toLowerCase() === 'none') return undefined;
    return answer.slice(0, 80); // cap length
  } catch {
    return undefined;
  }
}

/** Try to find admission price/fee data from OpenStreetMap Overpass API. */
async function enrichPriceFromOSM(lat: number, lng: number): Promise<string | undefined> {
  try {
    // Query for POIs within 200m that have fee or charge tags
    const query = `[out:json][timeout:5];(node(around:200,${lat},${lng})[fee];way(around:200,${lat},${lng})[fee];node(around:200,${lat},${lng})[charge];way(around:200,${lat},${lng})[charge];);out tags 3;`;
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return undefined;
    const data = await res.json() as { elements: Array<{ tags?: Record<string, string> }> };
    for (const el of data.elements ?? []) {
      const t = el.tags ?? {};
      if (t.charge) return t.charge;
      if (t['entrance:fee']) return t['entrance:fee'];
      if (t.fee === 'no') return 'Free';
      if (t.fee === 'yes') return 'Paid admission';
    }
  } catch { /* ignore network/timeout errors */ }
  return undefined;
}

async function parseGeminiPlaces(raw: string): Promise<Place[]> {
  const cleaned = raw.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '');
  let parsed: Array<{
    name: string; postcode?: string; description: string; category: string;
    price?: string; ageGroup?: string; outdoor?: boolean;
  }> = [];
  try { parsed = JSON.parse(cleaned); } catch { parsed = []; }

  _debug.geminiCount = parsed.length; // record how many Gemini returned

  const places: Place[] = [];
  for (const item of parsed) {
    // Also check if the name itself contains an embedded postcode (e.g. Gemini included it)
    const embeddedPostcode = extractUKPostcode(item.name);
    const resolvedPostcode = item.postcode ?? embeddedPostcode;
    const cleanName = embeddedPostcode ? stripPostcodeFromName(item.name) : item.name;
    const coords = await geocodeName(cleanName, resolvedPostcode);
    // Respect Nominatim rate limit between places (geocodeName already sleeps between its own retries)
    await sleep(1100);
    if (coords) {
      _debug.geocodedCount++;
      let price = item.price;

      // Source 2: OSM extratags returned directly by geocoding
      if (!price) {
        if (coords.charge) price = coords.charge;
        else if (coords.fee === 'no') price = 'Free';
        else if (coords.fee === 'yes') price = 'Paid admission';
      }

      // Source 3: Overpass nearby fee/charge tags
      if (!price) price = await enrichPriceFromOSM(coords.lat, coords.lng);

      // Source 4: Fetch the place's own website and let Gemini read its pricing page
      const apiKey = getEnv('GEMINI_API_KEY');
      if (!price && coords.website && apiKey) {
        price = await enrichPriceFromWebsite(coords.website, apiKey, item.name);
      }

      places.push({ id: uid(), ...item, name: cleanName, postcode: resolvedPostcode, price, ...coords });
    } else {
      // Geocoding failed — record in debug but silently drop the place
      const failReason = `Not found after all lookup strategies`;
      _debug.failed.push({ name: item.name, reason: failReason });
    }
  }
  return places;
}

async function callGemini(apiKey: string, text: string): Promise<Place[]> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `${EXTRACTION_PROMPT}\n\nText:\n${text.slice(0, 15000)}`,
  });
  return parseGeminiPlaces(response.text ?? '[]');
}

async function extractPlacesFromText(input: string): Promise<Place[]> {
  const apiKey = getEnv('GEMINI_API_KEY');
  const trimmed = input.trim();
  const url = isUrl(trimmed) ? trimmed : null;

  // ── Social media URL (Instagram, TikTok, Facebook…) ───────────────────────
  // These platforms block bot crawlers. We extract publicly available
  // caption/OG text via oEmbed + CORS proxy, then send that text to Gemini.
  if (url && isSocialUrl(url)) {
    const socialText = await fetchSocialText(url);
    if (!socialText) {
      // Signal to the UI to show the manual-copy helper instead of a plain error
      const err = new Error('__SOCIAL_LOGIN_REQUIRED__') as Error & { socialUrl: string };
      err.socialUrl = url;
      throw err;
    }
    if (!apiKey) {
      _debug.failed.push({ name: 'Gemini API', reason: 'GEMINI_API_KEY is not configured' });
      return extractFromPlainText(socialText);
    }
    const places = await callGemini(apiKey, socialText);
    if (places.length === 0) {
      const err = new Error('__SOCIAL_LOGIN_REQUIRED__') as Error & { socialUrl: string };
      err.socialUrl = url;
      throw err;
    }
    return places;
  }

  // ── Regular article / blog URL ─────────────────────────────────────────────
  if (url) {
    const text = await fetchArticleText(url);
    if (!apiKey) {
      _debug.failed.push({ name: 'Gemini API', reason: 'GEMINI_API_KEY is not configured' });
      return extractFromPlainText(text);
    }
    return callGemini(apiKey, text);
  }

  // ── Plain text / caption ───────────────────────────────────────────────────
  if (!apiKey) {
    _debug.failed.push({ name: 'Gemini API', reason: 'GEMINI_API_KEY is not configured' });
    return extractFromPlainText(trimmed);
  }
  return callGemini(apiKey, trimmed);
}

/** Heuristic fallback when no API key is available. */
async function extractFromPlainText(text: string): Promise<Place[]> {
  const matches = [...text.matchAll(/\b([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)+)\b/g)];
  const candidates = [...new Set(matches.map((m) => m[0]))].slice(0, 8);
  const places: Place[] = [];
  for (const name of candidates) {
    const coords = await geocodeName(name);
    if (coords) places.push({ id: uid(), name, description: '', category: 'Place', ...coords });
  }
  return places;
}

// ─── PlaceCard ────────────────────────────────────────────────────────────────

interface PlaceCardProps {
  place: Place;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

function PlaceCard({ place, selected, onToggleSelect }: PlaceCardProps) {
  const { savePlace, unsavePlace, isSaved } = usePlaces();
  const { addToSpotlist, removeFromSpotlist, isInSpotlist } = useSpotlist();
  const saved = isSaved(place);
  const inSpotlist = isInSpotlist(place);

  // Silently omit any place that couldn't be located — never render a card for it
  if (place.geocodeFailed) return null;

  return (
    <article className="bg-surface-container-lowest rounded-2xl p-5 shadow-[0_12px_24px_rgba(44,47,49,0.04)] border border-outline-variant/10 relative group overflow-hidden transition-all hover:shadow-[0_16px_32px_rgba(44,47,49,0.06)]">
      {place.distanceMiles != null && (
        <div className="absolute top-0 right-0 p-4">
          <div className="bg-surface-container text-on-surface text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
            <Route className="w-3.5 h-3.5" /> {place.distanceMiles.toFixed(1)} mi
          </div>
        </div>
      )}

      <div className="pr-24 mb-3">
        <h3 className="text-lg font-headline font-bold text-on-surface mb-1 leading-tight">{place.name}</h3>
        {place.geocodedName && place.geocodedName.toLowerCase() !== place.name.trim().toLowerCase() && (
          <p className="text-xs font-label text-primary/70 mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            Found as: <span className="font-semibold">{place.geocodedName}</span>
          </p>
        )}
        {place.description && (
          <p className="text-sm font-body text-on-surface-variant line-clamp-2">{place.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
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

      <div className="flex gap-2 mt-auto items-center">
        <button
          onClick={() => onToggleSelect(place.id)}
          aria-label={selected ? 'Remove from map' : 'Add to map'}
          title={selected ? 'Remove from map' : 'Add to map'}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors border ${
            selected
              ? 'bg-primary text-on-primary border-primary'
              : 'text-primary hover:bg-primary/5 border-primary/20'
          }`}
        >
          {selected ? <Binoculars className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
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
          className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors border border-outline-variant/20"
        >
          <Navigation className="w-4 h-4" />
        </a>

        <button
          onClick={() => (inSpotlist ? removeFromSpotlist(place.id) : addToSpotlist(place))}
          aria-label={inSpotlist ? 'Remove from Spotlist' : 'Add to Spotlist'}
          title={inSpotlist ? 'Remove from Spotlist' : 'Add to Spotlist'}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors border ${
            inSpotlist
              ? 'bg-tertiary-container text-on-tertiary-container border-tertiary-container'
              : 'text-on-surface-variant hover:bg-surface-container-high border-outline-variant/20'
          }`}
        >
          {inSpotlist
            ? <BookmarkCheck className="w-4 h-4 fill-current" />
            : <BookmarkPlus className="w-4 h-4" />}
        </button>

        <button
          onClick={() => (saved ? unsavePlace(place.id) : savePlace(place))}
          aria-label={saved ? 'Unsave place' : 'Save place'}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors border ${
            saved
              ? 'bg-secondary-container text-on-secondary-container border-secondary-container'
              : 'text-on-surface-variant hover:bg-surface-container-high border-outline-variant/20'
          }`}
        >
          <Heart className={`w-4 h-4 ${saved ? 'fill-current' : ''}`} />
        </button>
      </div>
    </article>
  );
}

// ─── SocialCaptionHelper ─────────────────────────────────────────────────────

function SocialCaptionHelper({
  url,
  onPaste,
  onDismiss,
}: {
  url: string;
  onPaste: (text: string) => void;
  onDismiss: () => void;
}) {
  const [draft, setDraft] = useState('');
  const host = new URL(url).hostname.replace(/^www\./, '');
  const brand = host.includes('tiktok') ? 'TikTok' : host.includes('instagram') ? 'Instagram' : 'Facebook';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4">
      <div className="bg-surface-container-lowest rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.15)] border border-outline-variant/10 w-full max-w-md flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-headline font-bold text-on-surface">Copy caption from {brand}</h2>
            <p className="text-sm font-body text-on-surface-variant mt-1">
              {brand} requires a login to read post content. Open the post, copy the caption, and paste it below.
            </p>
          </div>
          <button onClick={onDismiss} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ol className="flex flex-col gap-2 text-sm font-body text-on-surface-variant list-none">
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <span>Open the post in a new tab (you're already logged in there)</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <span>Copy the caption / description text</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <span>Paste it below and click <strong>Extract Places</strong></span>
          </li>
        </ol>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-xl py-2.5 text-sm font-label font-semibold transition-colors border border-outline-variant/10"
        >
          <ExternalLink className="w-4 h-4" /> Open post in new tab
        </a>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="w-full bg-surface-container-low border border-outline-variant/15 text-on-surface rounded-xl p-4 text-sm font-body resize-none h-28 placeholder:text-on-surface-variant/60 focus:ring-1 focus:ring-primary focus:border-primary transition-colors outline-none"
          placeholder="Paste the caption text here…"
        />

        <div className="flex gap-3">
          <button onClick={onDismiss} className="flex-1 py-2.5 rounded-xl border border-outline-variant/20 text-sm font-label font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button
            onClick={() => draft.trim() && onPaste(draft.trim())}
            disabled={!draft.trim()}
            className="flex-[2] flex items-center justify-center gap-2 bg-gradient-to-br from-primary to-primary-container text-on-primary py-2.5 rounded-xl text-sm font-label font-bold disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <ClipboardPaste className="w-4 h-4" /> Extract Places
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MapEditor page ───────────────────────────────────────────────────────────

export default function MapEditor() {
  const location = useLocation();
  const prefill = (location.state as { prefillText?: string } | null)?.prefillText ?? '';
  const [input, setInput] = useState(prefill);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postcode, setPostcode] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sortingDistance, setSortingDistance] = useState(false);
  const [socialHelper, setSocialHelper] = useState<string | null>(null);
  const [showFavourites, setShowFavourites] = useState(false);
  const [favCenterTrigger, setFavCenterTrigger] = useState(0);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [extractionDebug, setExtractionDebug] = useState<{
    geminiCount: number;
    geocodedCount: number;
    failed: { name: string; reason: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { savedPlaces } = usePlaces();
  const { addToSpotlist, addBatchToSpotlist } = useSpotlist();

  // ── Auto-trigger when arriving from Discover with a pre-filled query ─────────
  useEffect(() => {
    if (prefill) handleExtract();
    // handleExtract reads `input` which is already set to `prefill` at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Extraction ──────────────────────────────────────────────────────────────
  const handleExtract = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setExtractionDebug(null);
    resetDebug();
    try {
      const trimmedInput = input.trim();
      // A standalone postcode — skip Gemini entirely and geocode it directly
      const isOnlyPostcode = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i.test(trimmedInput);

      // "Name + postcode" short input (e.g. "Church Crookham GU52 8AU") — also bypass Gemini
      const namePostcodeMatch = trimmedInput.match(/^(.+?)\s+([A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2})$/i);
      const isShortNameWithPostcode = !!(namePostcodeMatch && trimmedInput.split(/\s+/).length <= 6);

      if (isOnlyPostcode || isShortNameWithPostcode) {
        const postcode = isOnlyPostcode ? trimmedInput.toUpperCase() : namePostcodeMatch![2].toUpperCase();
        const name = isOnlyPostcode ? trimmedInput.toUpperCase() : namePostcodeMatch![1].trim();

        // Run the same 4-step chain: name+postcode → name,UK → bare name → postcode only
        const coords = isOnlyPostcode
          ? await nominatimLookup(postcode)
          : (
              await nominatimLookup(`${name} ${postcode}`) ||
              (await sleep(1100), await nominatimLookup(`${name}, UK`)) ||
              (await sleep(1100), await nominatimLookup(name)) ||
              (await sleep(1100), await nominatimLookup(postcode))
            );

        if (coords) {
          const pin: Place = {
            id: uid(),
            name,
            description: postcode !== name ? `${name}, ${postcode}` : `Postcode area ${postcode}`,
            category: 'Other',
            lat: coords.lat,
            lng: coords.lng,
            geocodedName: (coords as { geocodedName?: string }).geocodedName ?? name,
          };
          setPlaces([pin]);
          setSelectedIds(new Set([pin.id]));
          addToSpotlist(pin);
        } else {
          setError(`Could not locate "${trimmedInput}" on the map.`);
        }
        return;
      }

      const extracted = await extractPlacesFromText(input);
      setExtractionDebug({ ..._debug, failed: [..._debug.failed] });

      if (extracted.length) {
        setPlaces(extracted);
        setSelectedIds(new Set(extracted.filter(p => !p.geocodeFailed).map((p) => p.id)));
        addBatchToSpotlist(extracted);
      } else {
        setError('No places found. Make sure the text contains specific place names, or include a postcode alongside the name.');
      }
    } catch (e) {
      const err = e as Error & { socialUrl?: string };
      if (err.message === '__SOCIAL_LOGIN_REQUIRED__' && err.socialUrl) {
        setSocialHelper(err.socialUrl);
      } else {
        setError(err.message ?? 'Extraction failed. Check your API key or try again.');
      }
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [input, addToSpotlist, addBatchToSpotlist]);

  const handleSocialPaste = useCallback(async (text: string) => {
    setSocialHelper(null);
    setInput(text);
    setLoading(true);
    setError(null);
    setExtractionDebug(null);
    resetDebug();
    try {
      const extracted = await extractPlacesFromText(text);
      setExtractionDebug({ ..._debug, failed: [..._debug.failed] });
      if (!extracted.length) {
        setError('No identifiable places found in that caption. Try adding more location details.');
      } else {
        setPlaces(extracted);
        setSelectedIds(new Set(extracted.filter(p => !p.geocodeFailed).map((p) => p.id)));
        addBatchToSpotlist(extracted);
      }
    } catch (e) {
      setError((e as Error).message ?? 'Extraction failed.');
    } finally {
      setLoading(false);
    }
  }, [addBatchToSpotlist]);

  // ── Screenshot upload → OCR → extract ──────────────────────────────────────
  const handleFileUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const text = data.text;
      if (!text.trim()) throw new Error('No text found in screenshot.');
      setInput(text);
      const extracted = await extractPlacesFromText(text);
      if (!extracted.length) {
        setError('No places found in the screenshot. Check the image content.');
      } else {
        setPlaces(extracted);
        setSelectedIds(new Set(extracted.map((p) => p.id)));
        addBatchToSpotlist(extracted);
      }
    } catch (err) {
      setError((err as Error).message ?? 'Screenshot processing failed.');
      console.error(err);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }, [addBatchToSpotlist]);

  // ── Map selection ───────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedIds(new Set(places.filter(p => !p.geocodeFailed).map((p) => p.id)));
  const clearAll = () => setSelectedIds(new Set());

  // ── Distance sorting ────────────────────────────────────────────────────────
  const applyDistanceSort = useCallback(
    (lat: number, lng: number, list: Place[]) => {
      const withDist = list.map((p) => ({
        ...p,
        distanceMiles: +(haversineKm(lat, lng, p.lat, p.lng) * 0.621371).toFixed(1),
      }));
      withDist.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
      setPlaces(withDist);
    },
    []
  );

  const handleSort = useCallback(async () => {
    if (!postcode.trim() || !places.length) return;
    setSortingDistance(true);
    setError(null);
    try {
      const coords = await geocodeName(postcode);
      if (!coords) throw new Error(`Could not locate "${postcode}".`);
      setUserCoords(coords);
      applyDistanceSort(coords.lat, coords.lng, places);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSortingDistance(false);
    }
  }, [postcode, places, applyDistanceSort]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        if (places.length) applyDistanceSort(coords.lat, coords.lng, places);
      },
      () => setError('Location permission denied.')
    );
  }, [places, applyDistanceSort]);

  return (
    <>
    {socialHelper && (
      <SocialCaptionHelper
        url={socialHelper}
        onPaste={handleSocialPaste}
        onDismiss={() => setSocialHelper(null)}
      />
    )}
    <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden">
      {/* ── Mobile List/Map Toggle ──────────────────────────────────────────── */}
      <div className="lg:hidden flex bg-surface-container-low border-b border-outline-variant/20 shrink-0">
        <button
          onClick={() => setMobileTab('list')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
            mobileTab === 'list' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'
          }`}
        >
          <MapPin className="w-4 h-4" /> Places List
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
            mobileTab === 'map' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'
          }`}
        >
          <Compass className="w-4 h-4" /> Map View
        </button>
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={`w-full lg:w-[42%] xl:w-[38%] h-full flex flex-col bg-surface-container-low border-r border-surface-container-high/50 relative z-10 shadow-[20px_0_40px_rgba(44,47,49,0.02)] overflow-y-auto overflow-x-hidden ${
        mobileTab === 'map' ? 'hidden lg:flex' : 'flex'
      }`}>
        <div className="p-6 md:p-8 flex flex-col gap-8">

          {/* Header & Input Hub */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container">
                <Compass className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h1 className="text-2xl font-headline font-bold text-on-surface tracking-tight">Curate Your Journey</h1>
                <p className="text-sm font-body text-on-surface-variant">Add places from social media, reels or a screenshot.</p>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-[0_8px_24px_rgba(44,47,49,0.03)] border border-outline-variant/10 flex flex-col gap-4">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/15 text-on-surface rounded-xl p-4 text-sm font-body resize-none h-24 placeholder:text-on-surface-variant/60 focus:ring-1 focus:ring-primary focus:border-primary transition-colors outline-none"
                placeholder="Paste an article URL, reel caption, or describe places… (Instagram/TikTok reels require a Gemini API key)"
              />

              {error && (
                <div className="flex items-start gap-2 bg-secondary-container/40 text-on-secondary-container rounded-xl p-3 text-sm font-body">
                  <X className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </div>
              )}

              <div className="flex gap-3 items-center">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-4 py-3 rounded-xl text-sm font-label font-semibold hover:bg-secondary-container/80 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  Upload Screenshot
                </button>

                <button
                  onClick={handleExtract}
                  disabled={loading || !input.trim()}
                  className="flex-[1.5] flex items-center justify-center gap-2 bg-gradient-to-br from-primary to-primary-container text-on-primary px-4 py-3 rounded-xl text-sm font-label font-bold shadow-[0_8px_16px_rgba(74,64,224,0.2)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 fill-current" />}
                  {loading ? 'Extracting…' : 'Extract & Map Places'}
                </button>
              </div>
            </div>
          </section>

          {/* Distance Sorting */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-headline font-bold text-on-surface-variant uppercase tracking-wider">Distance Sorting</h2>
            <div className="flex gap-3 bg-surface-container-lowest p-2 rounded-xl shadow-[0_4px_12px_rgba(44,47,49,0.02)] border border-outline-variant/10 items-center">
              <div className="flex-1 relative flex items-center">
                <MapPin className="absolute left-3 text-on-surface-variant/50 w-4 h-4" />
                <input
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort()}
                  className="w-full bg-transparent border-none text-sm font-body text-on-surface focus:ring-0 pl-10 placeholder:text-on-surface-variant/50 outline-none"
                  placeholder="Enter postcode or city…"
                />
              </div>
              <button onClick={handleLocate} title="Use my location" className="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
                <LocateFixed className="w-4 h-4" />
              </button>
              <button
                onClick={handleSort}
                disabled={sortingDistance || !postcode.trim() || !places.length}
                className="bg-surface-container-low text-on-surface px-4 py-2 rounded-lg text-sm font-label font-medium hover:bg-surface-variant disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {sortingDistance ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpDown className="w-4 h-4" />}
                Sort
              </button>
            </div>
          </section>

          {/* Show/Hide Favourites toggle button */}
          {savedPlaces.length > 0 && (
            <button
              onClick={() => {
                setShowFavourites((prev) => {
                  if (!prev) setFavCenterTrigger((t) => t + 1);
                  return !prev;
                });
              }}
              className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-label font-semibold transition-colors border ${
                showFavourites
                  ? 'bg-secondary text-on-secondary border-secondary/40 hover:bg-secondary/90'
                  : 'bg-secondary-container text-on-secondary-container border-secondary/20 hover:bg-secondary-container/80'
              }`}
            >
              <Heart className={`w-4 h-4 ${showFavourites ? 'fill-current' : ''}`} />
              {showFavourites ? `Hide Favourites (${savedPlaces.length})` : `Show Favourites on Map (${savedPlaces.length})`}
            </button>
          )}

          {/* Places List */}
          {places.length > 0 && (
            <section className="flex flex-col gap-5 pb-8">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <h2 className="text-xl font-headline font-bold text-on-surface tracking-tight">
                    Extracted Places
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-label text-on-surface-variant font-medium bg-surface-container-high px-2 py-1 rounded-md">
                    {places.filter(p => !p.geocodeFailed).length} mapped
                    {extractionDebug && extractionDebug.failed.length > 0 && (
                      <span className="text-amber-600"> · {extractionDebug.failed.length} not located</span>
                    )}
                  </span>
                  <button
                    onClick={selectedIds.size === places.filter(p => !p.geocodeFailed).length ? clearAll : selectAll}
                    className="text-xs font-label text-primary hover:underline"
                  >
                    {selectedIds.size === places.filter(p => !p.geocodeFailed).length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
              </div>

              {/* Extraction debug summary */}
              {extractionDebug && (
                <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-4 flex flex-col gap-2 text-xs font-body">
                  <p className="font-semibold text-on-surface-variant uppercase tracking-wider text-[10px]">Extraction debug</p>
                  <div className="flex gap-4">
                    <span className="text-on-surface-variant">🧠 Gemini returned: <strong className="text-on-surface">{extractionDebug.geminiCount}</strong></span>
                    <span className="text-on-surface-variant">✅ Geocoded: <strong className="text-on-surface">{extractionDebug.geocodedCount}</strong></span>
                    {extractionDebug.failed.length > 0 && (
                      <span className="text-amber-600">⚠️ Not located: <strong>{extractionDebug.failed.length}</strong></span>
                    )}
                  </div>
                  {extractionDebug.failed.length > 0 && (
                    <ul className="flex flex-col gap-1 mt-1">
                      {extractionDebug.failed.map((f) => (
                        <li key={f.name} className="flex gap-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span><strong>{f.name}</strong> — {f.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {places.map((place) => (
                <PlaceCard key={place.id} place={place} selected={selectedIds.has(place.id)} onToggleSelect={toggleSelect} />
              ))}
            </section>
          )}

          {/* Empty state */}
          {!loading && places.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-on-surface-variant">
              <Compass className="w-12 h-12 opacity-30" />
              <p className="text-sm font-body text-center max-w-xs">
                Paste a URL or description above and click <strong>Extract & Map Places</strong> to get started.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Map Panel ─────────────────────────────────────────────────────────── */}
      <main className={`w-full lg:w-[58%] xl:w-[62%] relative flex-1 min-h-0 ${
        mobileTab === 'list' ? 'hidden lg:block' : 'block'
      }`}>
        <LeafletMap
          places={places.filter(p => !p.geocodeFailed)}
          selectedIds={selectedIds}
          alwaysShow={showFavourites ? savedPlaces : []}
          centerTrigger={favCenterTrigger}
          centerPlaces={savedPlaces}
          userLat={userCoords?.lat}
          userLng={userCoords?.lng}
          onMarkerClick={(place) => toggleSelect(place.id)}
        />

        {savedPlaces.length > 0 && (
          <button
            onClick={() => {
              setShowFavourites((prev) => {
                if (!prev) setFavCenterTrigger((t) => t + 1);
                return !prev;
              });
            }}
            className={`absolute top-4 right-4 z-[1001] backdrop-blur-sm text-xs font-label font-semibold px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5 transition-colors border ${
              showFavourites
                ? 'bg-secondary text-on-secondary border-secondary/40 hover:bg-secondary/90'
                : 'bg-surface-container-lowest/90 text-on-surface border-outline-variant/20 hover:bg-surface-container'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${showFavourites ? 'fill-current' : ''} text-current`} />
            {showFavourites ? 'Hide Favourites' : 'Show Favourites'}
          </button>
        )}

        {places.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="bg-surface-container-lowest/90 backdrop-blur-md px-6 py-4 rounded-2xl shadow-ambient border border-outline-variant/10 flex flex-col items-center gap-2">
              <MapPin className="w-8 h-8 text-primary opacity-60" />
              <p className="text-sm font-body text-on-surface-variant text-center max-w-xs">
                Extracted places will appear on the map. Untick any you want to hide.
              </p>
            </div>
          </div>
        )}

        {(selectedIds.size > 0 || savedPlaces.length > 0) && (
          <div className="absolute top-4 left-4 z-20 flex gap-2">
            {selectedIds.size > 0 && (
              <div className="bg-primary text-on-primary text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
                {selectedIds.size} place{selectedIds.size > 1 ? 's' : ''} on map
              </div>
            )}
            {savedPlaces.length > 0 && (
              <div className="bg-secondary-container text-on-secondary-container text-xs font-bold px-3 py-1.5 rounded-full shadow-md flex items-center gap-1">
                <Heart className="w-3 h-3 fill-current" /> {savedPlaces.length} saved
              </div>
            )}
          </div>
        )}
      </main>
    </div>
    </>
  );
}
