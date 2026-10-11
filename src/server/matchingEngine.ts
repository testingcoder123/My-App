import { GoogleGenAI, Type } from '@google/genai';
import {
  ListingBadge,
  ListingMatchStatus,
  ListingType,
  MatchedSignal,
  NapDiscrepancy,
  RejectionReason,
} from '../types.ts';
import { db } from './db.ts';

export type {
  ListingBadge,
  ListingMatchStatus,
  ListingType,
  MatchedSignal,
  NapDiscrepancy,
  RejectionReason,
};

export interface SearchInput {
  businessName: string;
  alternateNames: string[];
  website: string;
  gbpUrl: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  phones: string[];
  industry: string;
  scanMode: 'quick' | 'full';
  deepVerify: boolean;
  bypassCache?: boolean;
  benchmarkUrls?: string[];
  distinctiveTokensOverride?: string[];
}

export interface MatchEvaluation {
  status: ListingMatchStatus | 'Discard';
  badge?: ListingBadge;
  rejectionReason?: RejectionReason;
  isNonListingPage?: boolean;
  matchedSignals: MatchedSignal[];
  matchScore: number;
  why: string;
  nameScore: number;
  addressScore: number;
  distinctiveTokens: string[];
  distinctiveTokensPresent: boolean;
  nameMatched: boolean;
  addressMatched: boolean;
  phoneMatched: boolean;
  websiteMatched: boolean;
  urlSlugMatched: boolean;
  cityMatched: boolean;
  foundName: string;
  foundPhone: string;
  foundAddress: string;
  napMismatch: boolean;
  napDiscrepancies: NapDiscrepancy[];
}

export interface GeneratedNameVariants {
  textVariants: string[];
  slugVariants: string[];
  compactVariants: string[];
}

const CORP_SUFFIXES = new Set([
  'pvt',
  'ltd',
  'private',
  'limited',
  'llc',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'llp',
  'plc',
]);

// Requirement B.1: Generic words to strip when finding distinctive name tokens
export const GENERIC_BUSINESS_WORDS = new Set([
  'garage',
  'door',
  'doors',
  'gate',
  'gates',
  'repair',
  'repairs',
  'service',
  'services',
  'company',
  'co',
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'pvt',
  'private',
  'corp',
  'corporation',
  'llp',
  'plc',
  'the',
  'and',
  'of',
  'in',
  'at',
  'for',
  'to',
  'a',
  'an',
  '&',
  'plumbing',
  'plumber',
  'plumbers',
  'roofing',
  'roofer',
  'roofers',
  'hvac',
  'construction',
  'cleaning',
  'cleaner',
  'cleaners',
  'landscaping',
  'landscaper',
  'dental',
  'dentist',
  'dentistry',
  'law',
  'legal',
  'attorney',
  'attorneys',
  'group',
  'solutions',
  'solution',
  'pros',
  'pro',
  'contractors',
  'contractor',
  'professional',
  'professionals',
  'best',
  'quality',
  'home',
  'auto',
  'automotive',
  'electric',
  'electrical',
  'electrician',
  'supplier',
  'suppliers',
  'supply',
  'installation',
  'installations',
  'installer',
  'installers',
  'maintenance',
  'specialist',
  'specialists',
  'expert',
  'experts',
  'center',
  'centre',
  'system',
  'systems',
  'enterprise',
  'enterprises',
  'associates',
  'agency',
  'studio',
  'local',
]);

const STOP_WORDS = new Set(['the', 'and', 'of', 'in', 'at', 'for', 'to', 'a', 'an']);

const STREET_TYPE_SUFFIXES = new Set([
  'st',
  'street',
  'ave',
  'avenue',
  'av',
  'avenida',
  'blvd',
  'boulevard',
  'rd',
  'road',
  'dr',
  'drive',
  'ln',
  'lane',
  'ct',
  'court',
  'pl',
  'place',
  'pkwy',
  'parkway',
  'hwy',
  'highway',
  'cir',
  'circle',
  'sq',
  'square',
  'way',
  'trl',
  'trail',
  'ter',
  'terrace',
  'loop',
  'pike',
  'fwy',
  'freeway',
  'expwy',
  'expressway',
]);

const DIRECTIONALS_AND_PREPOSITIONS = new Set([
  'n',
  's',
  'e',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
  'north',
  'south',
  'east',
  'west',
  'de',
  'la',
  'el',
  'del',
  'los',
  'las',
  'of',
  'the',
]);

export const US_STATES_MAP: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

export const COUNTRY_META: Record<string, { gl: string; hl: string; name: string }> = {
  us: { gl: 'us', hl: 'en', name: 'United States' },
  gb: { gl: 'gb', hl: 'en', name: 'United Kingdom' },
  ca: { gl: 'ca', hl: 'en', name: 'Canada' },
  au: { gl: 'au', hl: 'en', name: 'Australia' },
  in: { gl: 'in', hl: 'en', name: 'India' },
  ae: { gl: 'ae', hl: 'en', name: 'United Arab Emirates' },
  sg: { gl: 'sg', hl: 'en', name: 'Singapore' },
  de: { gl: 'de', hl: 'de', name: 'Germany' },
  fr: { gl: 'fr', hl: 'fr', name: 'France' },
  es: { gl: 'es', hl: 'es', name: 'Spain' },
  nl: { gl: 'nl', hl: 'nl', name: 'Netherlands' },
  nz: { gl: 'nz', hl: 'en', name: 'New Zealand' },
  ie: { gl: 'ie', hl: 'en', name: 'Ireland' },
  za: { gl: 'za', hl: 'en', name: 'South Africa' },
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function singularizeWord(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (
    w.endsWith('es') &&
    (w.endsWith('ses') || w.endsWith('ches') || w.endsWith('shes') || w.endsWith('xes'))
  ) {
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) {
    return w.slice(0, -1);
  }
  return w;
}

// In-memory cache for distinctive tokens
const memoryDistinctiveCache = new Map<string, string[]>();

/**
 * Requirement B.1:
 * Remove generic words from the business name (plus words from the Industry field).
 * Example: "Intelligent Garage Door & Gate Repair" => ["intelligent"].
 */
export function extractDeterministicDistinctiveTokens(
  businessName: string,
  industry?: string
): string[] {
  const industryWords = new Set<string>();
  if (industry) {
    const rawIndTokens = industry
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    for (const iw of rawIndTokens) {
      industryWords.add(iw);
      industryWords.add(singularizeWord(iw));
      industryWords.add(`${singularizeWord(iw)}s`);
    }
  }

  const nameTokens = (businessName || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const distinctive: string[] = [];
  const seen = new Set<string>();

  for (const tok of nameTokens) {
    const sing = singularizeWord(tok);
    if (
      GENERIC_BUSINESS_WORDS.has(tok) ||
      GENERIC_BUSINESS_WORDS.has(sing) ||
      industryWords.has(tok) ||
      industryWords.has(sing)
    ) {
      continue;
    }
    if (!seen.has(tok)) {
      seen.add(tok);
      distinctive.push(tok);
    }
  }

  return distinctive;
}

/**
 * Requirement B.1:
 * If no distinctive token remains after removing generic words, ask Gemini once
 * to identify the distinctive part and cache it.
 */
export async function resolveDistinctiveTokens(
  businessName: string,
  industry?: string
): Promise<string[]> {
  const det = extractDeterministicDistinctiveTokens(businessName, industry);
  if (det.length > 0) {
    return det;
  }

  const cacheKey = `${(businessName || '').trim().toLowerCase()}|${(industry || '').trim().toLowerCase()}`;
  if (memoryDistinctiveCache.has(cacheKey)) {
    return memoryDistinctiveCache.get(cacheKey)!;
  }

  try {
    const row = db
      .prepare('SELECT tokens_json FROM distinctive_tokens_cache WHERE cache_key = ?')
      .get(cacheKey);
    if (row && row.tokens_json) {
      const parsed = JSON.parse(String(row.tokens_json)) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryDistinctiveCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore cache read error
  }

  const fallbackTokens = (businessName || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !CORP_SUFFIXES.has(w) && !STOP_WORDS.has(w))
    .slice(0, 2);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return fallbackTokens;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `Given the business name "${businessName}"${
      industry ? ` in the "${industry}" industry` : ''
    }, identify the 1 or 2 most distinctive brand word(s) that distinguish this specific business from generic industry terms. Return lowercase single words only.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            distinctiveTokens: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['distinctiveTokens'],
        },
      },
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text) as { distinctiveTokens?: string[] };
      const clean = (parsed.distinctiveTokens || [])
        .map((t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter((t) => t.length >= 2);

      if (clean.length > 0) {
        memoryDistinctiveCache.set(cacheKey, clean);
        try {
          db.prepare(
            `INSERT OR REPLACE INTO distinctive_tokens_cache (cache_key, tokens_json, created_at) VALUES (?, ?, ?)`
          ).run(cacheKey, JSON.stringify(clean), new Date().toISOString());
        } catch {
          // ignore
        }
        return clean;
      }
    }
  } catch (err) {
    console.warn('Gemini distinctive token fallback skipped:', err instanceof Error ? err.message : err);
  }

  memoryDistinctiveCache.set(cacheKey, fallbackTokens);
  return fallbackTokens;
}

export function inferCountryFromAddress(address: string, city?: string, phone?: string): string {
  const combined = `${address || ''} ${city || ''}`.trim();
  const lower = combined.toLowerCase();

  if (
    /\b(united states|usa|u\.s\.a\.|u\.s\.)\b/i.test(combined) ||
    /\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/.test(combined)
  ) {
    return 'us';
  }
  for (const [abbr, full] of Object.entries(US_STATES_MAP)) {
    const stateZipRegex = new RegExp(`\\b${abbr}\\s+\\d{5}\\b`);
    const fullStateRegex = new RegExp(`\\b${full.toLowerCase()}\\b`);
    if (stateZipRegex.test(combined) || fullStateRegex.test(lower)) {
      return 'us';
    }
  }

  if (/\b(united kingdom|england|scotland|wales|uk|great britain|london)\b/i.test(lower)) return 'gb';
  if (/\b(canada|ontario|quebec|british columbia|alberta)\b/i.test(lower)) return 'ca';
  if (/\b(australia|new south wales|victoria|queensland|sydney|melbourne)\b/i.test(lower)) return 'au';
  if (/\b(united arab emirates|uae|dubai|abu dhabi)\b/i.test(lower)) return 'ae';
  if (/\b(singapore)\b/i.test(lower)) return 'sg';
  if (/\b(germany|deutschland|berlin|munich)\b/i.test(lower)) return 'de';
  if (
    /\b(india|mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|kolkata|pune|ahmedabad|jaipur|maharashtra|karnataka)\b/i.test(
      lower
    ) ||
    /\b\d{6}\b/.test(combined)
  ) {
    return 'in';
  }

  const trimmedPhone = (phone || '').trim();
  if (trimmedPhone.startsWith('+1')) return 'us';
  if (trimmedPhone.startsWith('+44')) return 'gb';
  if (trimmedPhone.startsWith('+91')) return 'in';
  if (trimmedPhone.startsWith('+61')) return 'au';
  if (trimmedPhone.startsWith('+971')) return 'ae';

  return 'us';
}

export function extractStateFromAddress(
  address: string,
  explicitState?: string
): { stateShort: string; stateFull: string } {
  if (explicitState && explicitState.trim()) {
    const clean = explicitState.trim();
    const upper = clean.toUpperCase();
    if (US_STATES_MAP[upper]) {
      return { stateShort: upper, stateFull: US_STATES_MAP[upper] };
    }
    for (const [abbr, full] of Object.entries(US_STATES_MAP)) {
      if (full.toLowerCase() === clean.toLowerCase()) {
        return { stateShort: abbr, stateFull: full };
      }
    }
    return { stateShort: clean, stateFull: clean };
  }

  if (!address) return { stateShort: '', stateFull: '' };

  const abbrMatch = address.match(/(?:,\s*|\b)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?|\s*,|\s*$)/);
  if (abbrMatch && US_STATES_MAP[abbrMatch[1]]) {
    const code = abbrMatch[1];
    return { stateShort: code, stateFull: US_STATES_MAP[code] };
  }

  const lowerAddr = address.toLowerCase();
  for (const [abbr, full] of Object.entries(US_STATES_MAP)) {
    if (new RegExp(`\\b${full.toLowerCase()}\\b`).test(lowerAddr)) {
      return { stateShort: abbr, stateFull: full };
    }
  }

  return { stateShort: '', stateFull: '' };
}

export function buildSerperLocation(
  city: string,
  address: string,
  countryCode: string,
  explicitState?: string
): string {
  const cleanCity = (city || '').trim();
  const { stateFull } = extractStateFromAddress(address, explicitState);
  const countryMeta = COUNTRY_META[(countryCode || 'us').toLowerCase()] || COUNTRY_META.us;
  const parts = [cleanCity, stateFull, countryMeta.name].filter(Boolean);
  return Array.from(new Set(parts)).join(', ');
}

export function extractStreetAddressWithoutSuite(address: string, city?: string): string {
  if (!address) return '';
  let firstPart = address.split(',')[0].trim();

  if (city) {
    const cityIdx = firstPart.toLowerCase().indexOf(city.toLowerCase());
    if (cityIdx > 5) {
      firstPart = firstPart.slice(0, cityIdx).trim();
    }
  }

  const withoutSuite = firstPart
    .replace(/\s+#\s*[a-zA-Z0-9-]+.*$/i, '')
    .replace(
      /\s+\b(?:suite|ste|unit|apt|apartment|floor|fl|flr|rm|room|bldg|building)\.?\s*[a-zA-Z0-9-]+.*$/i,
      ''
    )
    .replace(/[,\s]+$/, '')
    .trim();

  return withoutSuite || firstPart;
}

function stripSuffixesAndPunctuation(name: string): string {
  return name
    .replace(/&/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !CORP_SUFFIXES.has(w.toLowerCase()))
    .join(' ')
    .trim();
}

/**
 * Requirement A.2:
 * Generate from the business name and alternate names:
 * original; "&" removed; "&" replaced with "and"; punctuation and suffixes (LLC, Inc, Pvt Ltd) removed;
 * SLUG forms (lowercase words joined by "-", with and without "and"); compact form (no spaces).
 */
export function generateNameVariants(
  businessName: string,
  alternateNames: string[] = [],
  website?: string
): GeneratedNameVariants {
  const textSet = new Set<string>();
  const slugSet = new Set<string>();
  const compactSet = new Set<string>();

  const rawNames = [businessName, ...(alternateNames || [])]
    .map((n) => (n || '').trim())
    .filter(Boolean);

  const addTextVariant = (val: string) => {
    const cleaned = val.replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 2) {
      textSet.add(cleaned);
    }
  };

  const addSlugFromWords = (words: string[]) => {
    const cleanWords = words
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);
    if (cleanWords.length > 0) {
      const hyphenated = cleanWords.join('-');
      if (hyphenated.length >= 3) {
        slugSet.add(hyphenated);
      }
    }
  };

  for (const raw of rawNames) {
    // 1. Original
    addTextVariant(raw);

    // 2. "&" removed and "&" replaced with "and"
    if (raw.includes('&')) {
      const ampRemoved = raw.replace(/\s*&\s*/g, ' ').replace(/\s+/g, ' ').trim();
      addTextVariant(ampRemoved);

      const ampToAnd = raw.replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim();
      addTextVariant(ampToAnd);
    } else if (/\band\b/i.test(raw)) {
      const andRemoved = raw.replace(/\s+\band\b\s+/gi, ' ').replace(/\s+/g, ' ').trim();
      const andToAmp = raw.replace(/\s+\band\b\s+/gi, ' & ').replace(/\s+/g, ' ').trim();
      addTextVariant(andRemoved);
      addTextVariant(andToAmp);
    }

    // 3. Punctuation and suffixes (LLC, Inc, Pvt Ltd) removed
    const stripped = stripSuffixesAndPunctuation(raw);
    addTextVariant(stripped);

    const strippedWithAnd = raw
      .replace(/&/g, ' and ')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0 && !CORP_SUFFIXES.has(w.toLowerCase()))
      .join(' ')
      .trim();
    addTextVariant(strippedWithAnd);

    // 4. SLUG forms (lowercase words joined by "-", with and without "and")
    const wordsNoAmp = stripped
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0 && w !== 'and');
    addSlugFromWords(wordsNoAmp);

    const wordsWithAnd = strippedWithAnd
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    addSlugFromWords(wordsWithAnd);

    if (wordsNoAmp.includes('door')) {
      addSlugFromWords(wordsNoAmp.map((w) => (w === 'door' ? 'doors' : w)));
      addSlugFromWords(wordsWithAnd.map((w) => (w === 'door' ? 'doors' : w)));
    }

    // 5. Compact form (no spaces)
    const fullCompactNoAnd = wordsNoAmp.join('');
    if (fullCompactNoAnd.length >= 4) {
      compactSet.add(fullCompactNoAnd);
    }
    const fullCompactWithAnd = wordsWithAnd.join('');
    if (fullCompactWithAnd.length >= 4) {
      compactSet.add(fullCompactWithAnd);
    }

    if (wordsNoAmp.length >= 3) {
      const first3Compact = wordsNoAmp.slice(0, 3).join('');
      if (first3Compact.length >= 6) {
        compactSet.add(first3Compact);
      }
      addSlugFromWords(wordsNoAmp.slice(0, 3));
    }
  }

  if (website) {
    const rootDom = extractRootDomain(website);
    const stem = rootDom.split('.')[0]?.toLowerCase().replace(/[^a-z0-9-]/g, '') || '';
    if (stem.length >= 4) {
      compactSet.add(stem.replace(/-/g, ''));
      if (stem.endsWith('s') && stem.length >= 6) {
        compactSet.add(stem.slice(0, -1).replace(/-/g, ''));
      }
      if (stem.includes('-')) {
        slugSet.add(stem);
      }
    }
  }

  return {
    textVariants: Array.from(textSet),
    slugVariants: Array.from(slugSet),
    compactVariants: Array.from(compactSet),
  };
}

export function normalizeBusinessName(name: string): string {
  if (!name) return '';
  const cleaned = name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !CORP_SUFFIXES.has(token) && !STOP_WORDS.has(token))
    .map(singularizeWord);
  return cleaned.join(' ').trim();
}

export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDist = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t /= 2;

  const jaro = (matches / len1 + matches / len2 + (matches - t) / matches) / 3.0;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export function tokenSetRatio(targetNorm: string, candidateNorm: string): number {
  if (!targetNorm || !candidateNorm) return 0;
  if (candidateNorm.includes(targetNorm)) return 100;

  const targetTokens = targetNorm.split(/\s+/).filter(Boolean);
  const candTokens = new Set(candidateNorm.split(/\s+/).filter(Boolean));
  if (targetTokens.length === 0) return 0;

  let matchedCount = 0;
  for (const t of targetTokens) {
    if (candTokens.has(t)) {
      matchedCount++;
    } else {
      for (const c of candTokens) {
        if (jaroWinkler(t, c) >= 0.88) {
          matchedCount += 0.85;
          break;
        }
      }
    }
  }

  const tokenScore = (matchedCount / targetTokens.length) * 100;
  const jwScore =
    jaroWinkler(targetNorm, candidateNorm.slice(0, Math.max(targetNorm.length + 12, 30))) * 100;
  return Math.round(Math.max(tokenScore, jwScore));
}

export function extractCandidateTitleName(rawTitle: string): string {
  if (!rawTitle) return '';
  const segments = rawTitle.split(/\s+[-|:–—•·]\s+/);
  return (segments[0] || rawTitle).trim();
}

export function extractLast10Digits(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

export function extractPhoneCandidatesFromText(text: string): string[] {
  if (!text) return [];
  const regex = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?|\b\d{2,5}[\s.-])\d{3,5}[\s.-]\d{4,6}\b|\b\d{10}\b/g;
  const rawMatches = text.match(regex) || [];
  const results: string[] = [];
  const seen = new Set<string>();

  for (const m of rawMatches) {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) {
      const last10 = digits.slice(-10);
      if (!seen.has(last10)) {
        seen.add(last10);
        results.push(m.trim());
      }
    }
  }
  return results;
}

export function extractPincodes(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b\d{5,6}\b/g) || [];
  return Array.from(new Set(matches));
}

export function extractRootDomain(urlOrDomain: string): string {
  if (!urlOrDomain) return '';
  let cleaned = urlOrDomain.trim().toLowerCase();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  try {
    const u = new URL(cleaned);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return cleaned
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
  }
}

export function normalizeListingUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = u.pathname.replace(/\/+$/, '') || '';
    const dropParams = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'entry',
      'g_ep',
      'hl',
      'gl',
    ]);
    const keptParams: string[] = [];
    u.searchParams.forEach((val, key) => {
      if (!dropParams.has(key.toLowerCase())) {
        keptParams.push(`${key}=${val}`);
      }
    });
    const queryStr = keptParams.length > 0 ? `?${keptParams.sort().join('&')}` : '';
    return `${host}${pathname}${queryStr}`;
  } catch {
    return rawUrl
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/+$/, '');
  }
}

/**
 * Requirement B.2:
 * ADDRESS signal = TRUE only if the street number AND the main street name both appear together.
 * City/state/ZIP alone is NOT an address match. Suite number is optional.
 */
export function evaluateStrictStreetAddress(
  expectedAddress: string,
  expectedCity: string,
  candidateText: string,
  candidateUrl: string
): {
  matched: boolean;
  foundAddress: string;
} {
  const streetPart = extractStreetAddressWithoutSuite(expectedAddress, expectedCity);
  if (!streetPart) {
    return { matched: false, foundAddress: '—' };
  }

  const rawTokens = streetPart
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Find street number token (e.g., "23046", "123", "4th")
  const streetNumber = rawTokens.find((t) => /^\d+[a-z]?$/i.test(t) && /\d/.test(t));
  if (!streetNumber) {
    return { matched: false, foundAddress: '—' };
  }

  // Main street name words (excluding street number, suffixes like Ave/St/Blvd, and short prepositions like de/la)
  let mainStreetWords = rawTokens.filter(
    (t) =>
      t !== streetNumber &&
      !/^\d+$/.test(t) &&
      !STREET_TYPE_SUFFIXES.has(t) &&
      !DIRECTIONALS_AND_PREPOSITIONS.has(t) &&
      t.length >= 2
  );

  // Fallback if the street name is a numbered street (e.g., "123 5th Ave") or single letter ("123 Avenue A")
  if (mainStreetWords.length === 0) {
    mainStreetWords = rawTokens.filter(
      (t) => t !== streetNumber && !STREET_TYPE_SUFFIXES.has(t) && !DIRECTIONALS_AND_PREPOSITIONS.has(t)
    );
  }
  if (mainStreetWords.length === 0) {
    return { matched: false, foundAddress: '—' };
  }

  const combinedSource = `${candidateText || ''} ${candidateUrl || ''}`;
  const lowerSource = combinedSource.toLowerCase();

  const numRegex = new RegExp(`\\b${escapeRegex(streetNumber)}\\b`, 'i');
  if (!numRegex.test(lowerSource)) {
    return { matched: false, foundAddress: '—' };
  }

  // Check if all mainStreetWords appear in proximity to streetNumber (within 75 chars)
  const numMatches = Array.from(lowerSource.matchAll(new RegExp(`\\b${escapeRegex(streetNumber)}\\b`, 'gi')));
  for (const m of numMatches) {
    const idx = m.index ?? 0;
    const windowStart = Math.max(0, idx - 25);
    const windowEnd = Math.min(lowerSource.length, idx + 85);
    const windowText = lowerSource.slice(windowStart, windowEnd);

    const allMainWordsInWindow = mainStreetWords.every((w) =>
      new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(windowText)
    );

    if (allMainWordsInWindow) {
      // Extract a clean readable address snippet from candidateText around the match
      const textIdx = (candidateText || '').toLowerCase().indexOf(streetNumber.toLowerCase());
      if (textIdx >= 0) {
        const snippetStart = Math.max(0, textIdx);
        const rawSlice = candidateText.slice(snippetStart, snippetStart + 90);
        const stopAtSeparator = rawSlice.split(/\s*[|•·\n\r]\s*/)[0] || rawSlice;
        const cleanedFound = stopAtSeparator.replace(/\s+/g, ' ').replace(/[.,;:\s]+$/, '').trim();
        return {
          matched: true,
          foundAddress: cleanedFound || streetPart,
        };
      }
      return {
        matched: true,
        foundAddress: streetPart,
      };
    }
  }

  return { matched: false, foundAddress: '—' };
}

/**
 * Requirement B.5:
 * NON-LISTING PAGES can never be Confirmed:
 * URLs containing /search, ?find_desc, ?q=, /category/, /categories/, /tag/, /near/, /best-,
 * and titles starting with "Best", "Top", "Find".
 * Aggregator pages ("Garage Door Repair in <City>", "113 Companies") get a badge "Mentioned in a list"
 * only if the exact street address or the phone appears with a distinctive name token.
 */
export function detectNonListingOrAggregatorPage(
  url: string,
  title: string,
  distinctiveTokens: string[],
  city: string
): {
  isStrictNonListing: boolean;
  isAggregator: boolean;
} {
  const lowerUrl = (url || '').toLowerCase();
  const cleanTitle = (title || '').trim();
  const lowerTitle = cleanTitle.toLowerCase();

  const hasNonListingUrlPattern =
    lowerUrl.includes('/search') ||
    lowerUrl.includes('?find_desc') ||
    lowerUrl.includes('&find_desc') ||
    lowerUrl.includes('?q=') ||
    lowerUrl.includes('&q=') ||
    lowerUrl.includes('/category/') ||
    lowerUrl.includes('/categories/') ||
    lowerUrl.includes('/tag/') ||
    lowerUrl.includes('/near/') ||
    lowerUrl.includes('/best-');

  const hasNonListingTitlePrefix = /^(?:the\s+)?(?:\d+\s+)?(?:best|top|find)\b/i.test(cleanTitle);

  const isStrictNonListing = hasNonListingUrlPattern || hasNonListingTitlePrefix;

  // Check aggregator patterns: e.g. "113 Companies", "Garage Door Repair in <City>", "/top-", "/list-of-"
  const hasCountCompaniesPattern =
    /\b\d+\s+(?:companies|businesses|contractors|pros|providers|services|results|listings|suppliers|repair|repairs|agencies)\b/i.test(
      cleanTitle
    );

  const titleHasDistinctiveToken =
    distinctiveTokens.length > 0 &&
    distinctiveTokens.every((t) => new RegExp(`\\b${escapeRegex(t)}s?\\b`, 'i').test(lowerTitle));

  const cleanCity = (city || '').trim().toLowerCase();
  const isGenericServiceInCityTitle =
    Boolean(cleanCity && lowerTitle.includes(` in ${cleanCity}`)) && !titleHasDistinctiveToken;

  const isAggregator =
    isStrictNonListing ||
    hasCountCompaniesPattern ||
    isGenericServiceInCityTitle ||
    lowerUrl.includes('/top-') ||
    lowerUrl.includes('/list-of-');

  return {
    isStrictNonListing,
    isAggregator,
  };
}

/**
 * Extracts the exact matched business name text from title or text, or returns "Name not found on page".
 */
function extractExactFoundNameOnPage(
  title: string,
  combinedText: string,
  variants: GeneratedNameVariants,
  distinctiveTokens: string[],
  distinctiveTokensPresent: boolean
): string {
  if (!distinctiveTokensPresent) {
    return 'Name not found on page';
  }

  const candidateHeading = extractCandidateTitleName(title || '');
  const lowerHeading = candidateHeading.toLowerCase();

  // 1. If candidate title heading contains all distinctive tokens, return the candidate heading
  if (
    candidateHeading &&
    distinctiveTokens.every((t) => new RegExp(`\\b${escapeRegex(t)}s?\\b`, 'i').test(lowerHeading))
  ) {
    return candidateHeading;
  }

  // 2. Check if any generated textVariant appears verbatim in combinedText (longest first)
  const sortedTextVariants = [...variants.textVariants].sort((a, b) => b.length - a.length);
  for (const v of sortedTextVariants) {
    const regex = new RegExp(escapeRegex(v), 'i');
    const match = combinedText.match(regex);
    if (match && match[0]) {
      return match[0].trim();
    }
  }

  // 3. Extract phrase around the first distinctive token in title or snippet
  const primaryDist = distinctiveTokens[0];
  if (primaryDist) {
    const phraseRegex = new RegExp(
      `\\b([A-Z0-9][A-Za-z0-9&'\\s-]{0,15}\\b${escapeRegex(primaryDist)}s?\\b[A-Za-z0-9&'\\s-]{0,35})`,
      'i'
    );
    const titleMatch = (title || '').match(phraseRegex);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].split(/\s+[-|:–—•·]\s+/)[0].trim();
    }
    const bodyMatch = combinedText.match(phraseRegex);
    if (bodyMatch && bodyMatch[1]) {
      return bodyMatch[1].split(/\s+[-|:–—•·.,]\s+/)[0].trim().slice(0, 65);
    }
  }

  return candidateHeading || 'Name not found on page';
}

export function evaluateListingMatch(
  input: SearchInput,
  item: { title: string; link: string; snippet: string; scrapedText?: string; isBacklink?: boolean }
): MatchEvaluation {
  const combinedText = `${item.title || ''} ${item.snippet || ''} ${item.scrapedText || ''}`.trim();
  const lowerCombined = combinedText.toLowerCase();
  const lowerUrl = (item.link || '').toLowerCase();
  const matchedSignals: MatchedSignal[] = [];
  const napDiscrepancies: NapDiscrepancy[] = [];

  const variants = generateNameVariants(input.businessName, input.alternateNames, input.website);

  // 1. DISTINCTIVE NAME TOKENS (Requirement B.1)
  const distinctiveTokens =
    input.distinctiveTokensOverride && input.distinctiveTokensOverride.length > 0
      ? input.distinctiveTokensOverride
      : extractDeterministicDistinctiveTokens(input.businessName, input.industry);

  const effectiveDistinctiveTokens =
    distinctiveTokens.length > 0
      ? distinctiveTokens
      : normalizeBusinessName(input.businessName).split(/\s+/).filter(Boolean).slice(0, 2);

  let urlPathLower = lowerUrl;
  try {
    const parsedUrl = new URL(item.link);
    urlPathLower = decodeURIComponent(`${parsedUrl.pathname}${parsedUrl.search}`).toLowerCase();
  } catch {
    // fallback
  }
  const urlPathNormalizedHyphen = urlPathLower.replace(/[+_~.%20]+/g, '-');
  const urlPathCompact = urlPathLower.replace(/[^a-z0-9]/g, '');
  const urlPathTokens = new Set(urlPathLower.split(/[^a-z0-9]+/).filter(Boolean));

  // Check if ALL distinctive tokens appear as whole words in title, snippet/scrapedText, or URL slug
  const tokenAppearsWholeWord = (tok: string): boolean => {
    const wordRegex = new RegExp(`\\b${escapeRegex(tok)}s?\\b`, 'i');
    if (wordRegex.test(combinedText)) return true;
    if (urlPathTokens.has(tok) || urlPathTokens.has(`${tok}s`)) return true;
    // Also check if URL slug contains a full slug/compact variant that includes the distinctive token
    for (const compact of variants.compactVariants) {
      if (compact.includes(tok) && compact.length >= tok.length + 3 && urlPathCompact.includes(compact)) {
        return true;
      }
    }
    return false;
  };

  const distinctiveTokensPresent =
    effectiveDistinctiveTokens.length > 0 &&
    effectiveDistinctiveTokens.every((t) => tokenAppearsWholeWord(t));

  // Check if generic words from the business name appear (for "generic name only" rejection diagnostics)
  const allBusinessWords = (input.businessName || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !CORP_SUFFIXES.has(w));
  const genericBusinessWords = allBusinessWords.filter(
    (w) => !effectiveDistinctiveTokens.includes(w)
  );
  const genericWordsMatchedCount = genericBusinessWords.filter((gw) =>
    new RegExp(`\\b${escapeRegex(gw)}s?\\b`, 'i').test(`${combinedText} ${urlPathLower}`)
  ).length;

  // 2. URL_SLUG SIGNAL (Requirement B.3)
  let urlSlugMatched = false;
  if (distinctiveTokensPresent) {
    for (const slug of variants.slugVariants) {
      if (
        slug.length >= 4 &&
        effectiveDistinctiveTokens.every((t) => slug.includes(t)) &&
        (urlPathLower.includes(slug) || urlPathNormalizedHyphen.includes(slug))
      ) {
        urlSlugMatched = true;
        break;
      }
    }
    if (!urlSlugMatched) {
      for (const compact of variants.compactVariants) {
        if (
          compact.length >= 6 &&
          effectiveDistinctiveTokens.every((t) => compact.includes(t)) &&
          urlPathCompact.includes(compact)
        ) {
          urlSlugMatched = true;
          break;
        }
      }
    }
  }

  // 3. CITY SIGNAL (Requirement B.2: weak signal, never confirms on its own)
  let cityMatched = false;
  const cleanCity = (input.city || '').trim().toLowerCase();
  if (cleanCity.length >= 2) {
    const citySlug = cleanCity.replace(/\s+/g, '-');
    const cityCompact = cleanCity.replace(/[^a-z0-9]/g, '');
    if (
      new RegExp(`\\b${escapeRegex(cleanCity)}\\b`, 'i').test(combinedText) ||
      lowerUrl.includes(citySlug) ||
      (cityCompact.length >= 4 && urlPathCompact.includes(cityCompact))
    ) {
      cityMatched = true;
    }
  }

  // 4. NAME SIGNAL (Requirement B.1: TRUE only if ALL distinctive tokens appear as whole words AND fuzzy score >= 80)
  const candidateHeading = extractCandidateTitleName(item.title || '');
  const normCandidateHeading = normalizeBusinessName(candidateHeading);
  const normTitleFull = normalizeBusinessName(item.title || '');
  const normFullText = normalizeBusinessName(combinedText);

  let bestNameScore = 0;
  if (distinctiveTokensPresent) {
    for (const targetName of variants.textVariants) {
      const normTarget = normalizeBusinessName(targetName);
      if (!normTarget) continue;
      const headingScore = tokenSetRatio(normTarget, normCandidateHeading);
      const titleScore = tokenSetRatio(normTarget, normTitleFull);
      const bodyScore = tokenSetRatio(normTarget, normFullText);
      const score = Math.max(headingScore, titleScore, bodyScore);
      if (score > bestNameScore) {
        bestNameScore = score;
      }
    }

    const exactVariantInText = variants.textVariants.some(
      (v) =>
        v.length >= 4 &&
        effectiveDistinctiveTokens.every((t) => v.toLowerCase().includes(t)) &&
        lowerCombined.includes(v.toLowerCase())
    );
    const compactInText = variants.compactVariants.some(
      (c) =>
        c.length >= 7 &&
        effectiveDistinctiveTokens.every((t) => c.includes(t)) &&
        lowerCombined.replace(/[^a-z0-9]/g, '').includes(c)
    );

    if (exactVariantInText && bestNameScore < 92) {
      bestNameScore = 95;
    } else if ((compactInText || urlSlugMatched) && bestNameScore < 84) {
      bestNameScore = 85;
    }
  } else {
    // Generic words only -> cap score below 40 and NAME signal is strictly FALSE
    bestNameScore = genericWordsMatchedCount >= 2 ? 35 : 0;
  }

  const nameMatched = distinctiveTokensPresent && bestNameScore >= 80;
  if (nameMatched) {
    matchedSignals.push('Name');
  }

  // 5. PHONE SIGNAL (Requirement B.3: last 10 digits match)
  const expectedPhonesLast10 = (input.phones || [])
    .map(extractLast10Digits)
    .filter((d) => d.length >= 8);
  const foundPhonesRaw = extractPhoneCandidatesFromText(`${combinedText} ${item.link || ''}`);
  let phoneMatched = false;
  let matchedPhoneStr = '';

  for (const foundRaw of foundPhonesRaw) {
    const foundLast10 = extractLast10Digits(foundRaw);
    if (expectedPhonesLast10.includes(foundLast10)) {
      phoneMatched = true;
      matchedPhoneStr = foundRaw;
      break;
    }
  }

  if (phoneMatched) {
    matchedSignals.push('Phone');
  }

  // 6. STRICT ADDRESS SIGNAL (Requirement B.2: street number AND main street name both appear together)
  const strictAddr = evaluateStrictStreetAddress(
    input.address,
    input.city,
    combinedText,
    item.link || ''
  );
  const addressMatched = strictAddr.matched;
  const foundAddress = strictAddr.foundAddress;

  if (addressMatched) {
    matchedSignals.push('Address');
  }

  // 7. WEBSITE SIGNAL (Requirement B.3: root domain match ignoring www, or DataForSEO backlink)
  const expectedRootDomain = extractRootDomain(input.website);
  let websiteMatched = false;
  if (item.isBacklink) {
    websiteMatched = true;
    matchedSignals.push('Website');
  } else if (expectedRootDomain) {
    const linkRoot = extractRootDomain(item.link);
    if (linkRoot === expectedRootDomain || lowerCombined.includes(expectedRootDomain)) {
      websiteMatched = true;
      matchedSignals.push('Website');
    }
  }

  if (urlSlugMatched) {
    matchedSignals.push('URL_SLUG');
  }
  if (cityMatched) {
    matchedSignals.push('CITY');
  }

  // 8. NON-LISTING & AGGREGATOR PAGE RULES (Requirement B.5)
  const { isStrictNonListing, isAggregator } = detectNonListingOrAggregatorPage(
    item.link,
    item.title,
    effectiveDistinctiveTokens,
    input.city
  );

  let status: ListingMatchStatus | 'Discard' = 'Discard';
  let badge: ListingBadge | undefined = undefined;
  let rejectionReason: RejectionReason | undefined = undefined;

  const isDeepVerified = Boolean(item.scrapedText);

  if (isStrictNonListing || isAggregator) {
    // Non-listing and aggregator pages can NEVER be Confirmed.
    // Aggregator pages get badge "Mentioned in a list" ONLY if exact street address or phone appears with a distinctive name token.
    if ((addressMatched || phoneMatched) && distinctiveTokensPresent) {
      status = 'Strong Possible';
      badge = 'Mentioned in a list';
    } else {
      status = 'Discard';
      rejectionReason = 'search page';
    }
  } else {
    // Requirement B.4:
    // CONFIRMED only if:
    // (PHONE AND ADDRESS) OR (PHONE AND NAME) OR (NAME AND ADDRESS) OR (NAME AND WEBSITE)
    // OR (URL_SLUG AND CITY AND distinctive tokens present)
    // OR after Deep-Verify of Strong Possible (street address or phone): page text also has a distinctive name token or the phone.
    const confirmedByStandardRules =
      (phoneMatched && addressMatched) ||
      (phoneMatched && nameMatched) ||
      (nameMatched && addressMatched) ||
      (nameMatched && websiteMatched) ||
      (urlSlugMatched && cityMatched && distinctiveTokensPresent);

    const confirmedByDeepVerifyUpgrade =
      isDeepVerified &&
      ((addressMatched && (distinctiveTokensPresent || phoneMatched)) ||
        (phoneMatched && distinctiveTokensPresent));

    if (confirmedByStandardRules || confirmedByDeepVerifyUpgrade) {
      status = 'Confirmed';
    } else if (addressMatched || phoneMatched) {
      // STRONG POSSIBLE: exact street address alone, or phone alone.
      status = 'Strong Possible';
      if (addressMatched && !distinctiveTokensPresent && !phoneMatched) {
        badge = 'Mentioned (address only)';
      }
    } else if (distinctiveTokensPresent) {
      // POSSIBLE: distinctive name token alone.
      status = 'Possible';
    } else {
      // REJECT: everything else.
      status = 'Discard';
      const expectedPincodes = extractPincodes(input.address);
      const foundPincodes = extractPincodes(combinedText);
      const hasZipMatch =
        expectedPincodes.length > 0 && expectedPincodes.some((p) => foundPincodes.includes(p));

      if (genericWordsMatchedCount >= 1) {
        rejectionReason = 'generic name only';
      } else if (cityMatched || hasZipMatch) {
        rejectionReason = 'city-only address';
      } else {
        rejectionReason = 'no signals';
      }
    }
  }

  // 9. OUTPUT COLUMNS: Found Name, Found Phone, Found Address, Match Score (0-100), Why (Requirement B.6)
  const foundName = extractExactFoundNameOnPage(
    item.title || '',
    combinedText,
    variants,
    effectiveDistinctiveTokens,
    distinctiveTokensPresent
  );
  const foundPhone = matchedPhoneStr || (foundPhonesRaw[0] ?? '');

  // Calculate Match Score (0-100)
  let matchScore = 0;
  if (status === 'Confirmed') {
    if (nameMatched && addressMatched && phoneMatched) {
      matchScore = 99;
    } else if (nameMatched && addressMatched) {
      matchScore = 95;
    } else if (phoneMatched && addressMatched) {
      matchScore = 94;
    } else if (phoneMatched && nameMatched) {
      matchScore = 93;
    } else if (nameMatched && websiteMatched) {
      matchScore = 90;
    } else if (urlSlugMatched && cityMatched && distinctiveTokensPresent) {
      matchScore = 86;
    } else {
      matchScore = 84;
    }
  } else if (status === 'Strong Possible') {
    if (badge === 'Mentioned in a list') {
      matchScore = 74;
    } else if (phoneMatched) {
      matchScore = 68;
    } else if (addressMatched && badge === 'Mentioned (address only)') {
      matchScore = 58;
    } else {
      matchScore = 65;
    }
  } else if (status === 'Possible') {
    if (nameMatched && cityMatched) {
      matchScore = 52;
    } else if (nameMatched || urlSlugMatched) {
      matchScore = 46;
    } else if (cityMatched) {
      matchScore = 40;
    } else {
      matchScore = 35;
    }
  } else {
    // Discard / Rejected
    if (rejectionReason === 'generic name only') matchScore = 15;
    else if (rejectionReason === 'city-only address') matchScore = 10;
    else if (rejectionReason === 'search page') matchScore = 12;
    else matchScore = 0;
  }

  // Build "Why" explanation string (e.g. "Distinctive name: intelligent ✓, Street address ✓, Phone ✗")
  const distLabel = effectiveDistinctiveTokens.join(', ') || 'name';
  const distCheck = distinctiveTokensPresent ? (nameMatched ? '✓' : '~') : '✗';
  const whyParts: string[] = [
    `Distinctive name: ${distLabel} ${distCheck}`,
    `Street address ${addressMatched ? '✓' : '✗'}`,
    `Phone ${phoneMatched ? '✓' : '✗'}`,
  ];
  if (websiteMatched) {
    whyParts.push('Website ✓');
  }
  if (urlSlugMatched) {
    whyParts.push('URL slug ✓');
  }
  if (cityMatched && !addressMatched) {
    whyParts.push('City ✓');
  }
  if (badge) {
    whyParts.push(`[${badge}]`);
  }
  if (status === 'Discard' && rejectionReason) {
    whyParts.push(`Rejected: ${rejectionReason}`);
  }
  const why = whyParts.join(', ');

  // 10. NAP MISMATCH: Show ONLY on truly Confirmed listings, stating which field differs (found vs expected) (Requirement B.6)
  if (status === 'Confirmed') {
    if (!phoneMatched && foundPhonesRaw.length > 0 && expectedPhonesLast10.length > 0) {
      napDiscrepancies.push({
        field: 'Phone',
        found: foundPhonesRaw[0],
        expected: input.phones[0] || '',
        detail: `Found phone "${foundPhonesRaw[0]}" vs expected "${input.phones[0]}"`,
      });
    }

    if (foundName !== 'Name not found on page') {
      const primaryNorm = normalizeBusinessName(input.businessName);
      const foundNorm = normalizeBusinessName(foundName);
      if (
        foundNorm &&
        primaryNorm &&
        foundNorm !== primaryNorm &&
        !variants.textVariants.some((a) => normalizeBusinessName(a) === foundNorm)
      ) {
        const sim = tokenSetRatio(primaryNorm, foundNorm);
        if (sim < 88) {
          napDiscrepancies.push({
            field: 'Name',
            found: foundName,
            expected: input.businessName,
            detail: `Found name "${foundName}" differs from expected "${input.businessName}"`,
          });
        }
      }
    }

    const expectedPincodes = extractPincodes(input.address);
    const foundPincodes = extractPincodes(combinedText);
    const pincodeMatched =
      expectedPincodes.length > 0 && expectedPincodes.some((p) => foundPincodes.includes(p));

    if (expectedPincodes.length > 0 && foundPincodes.length > 0 && !pincodeMatched) {
      napDiscrepancies.push({
        field: 'Address',
        found: `ZIP/Postal ${foundPincodes[0]} (${foundAddress !== '—' ? foundAddress : 'on page'})`,
        expected: `${input.address}, ${input.city}`,
        detail: `Found postal code "${foundPincodes[0]}" vs expected "${expectedPincodes.join('/')}"`,
      });
    }
  }

  return {
    status,
    badge,
    rejectionReason,
    isNonListingPage: isStrictNonListing || isAggregator,
    matchedSignals,
    matchScore,
    why,
    nameScore: bestNameScore,
    addressScore: addressMatched ? 100 : 0,
    distinctiveTokens: effectiveDistinctiveTokens,
    distinctiveTokensPresent,
    nameMatched,
    addressMatched,
    phoneMatched,
    websiteMatched,
    urlSlugMatched,
    cityMatched,
    foundName,
    foundPhone,
    foundAddress,
    napMismatch: status === 'Confirmed' && napDiscrepancies.length > 0,
    napDiscrepancies,
  };
}

export function detectListingTypeSync(
  url: string,
  title: string
): { type: ListingType; confident: boolean } {
  const lowerUrl = (url || '').toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  if (
    lowerUrl.includes('google.com/maps') ||
    lowerUrl.includes('g.page/') ||
    lowerUrl.includes('bing.com/maps') ||
    lowerUrl.includes('maps.apple.com') ||
    lowerUrl.includes('mapquest.com') ||
    lowerUrl.includes('openstreetmap.org') ||
    lowerUrl.includes('wego.here.com') ||
    lowerUrl.includes('waze.com') ||
    lowerUrl.includes('mappls.com') ||
    lowerUrl.includes('zeemaps.com') ||
    lowerUrl.includes('vymaps.com') ||
    lowerUrl.includes('onmap.ae')
  ) {
    return { type: 'Map Listing', confident: true };
  }

  if (
    lowerUrl.includes('youtube.com/watch') ||
    lowerUrl.includes('youtu.be/') ||
    lowerUrl.includes('vimeo.com/')
  ) {
    if (
      lowerUrl.includes('youtube.com/@') ||
      lowerUrl.includes('youtube.com/channel') ||
      lowerUrl.includes('youtube.com/c/')
    ) {
      return { type: 'Channel', confident: true };
    }
    return { type: 'Video', confident: true };
  }
  if (
    lowerUrl.includes('youtube.com/@') ||
    lowerUrl.includes('youtube.com/channel/') ||
    lowerUrl.includes('youtube.com/user/') ||
    lowerUrl.includes('open.spotify.com/show')
  ) {
    return { type: 'Channel', confident: true };
  }

  if (
    lowerUrl.includes('reddit.com/r/') ||
    lowerUrl.includes('quora.com/') ||
    lowerUrl.includes('stackoverflow.com/questions') ||
    lowerUrl.includes('stackexchange.com/questions') ||
    lowerUrl.includes('news.ycombinator.com/item') ||
    lowerUrl.includes('/forum/') ||
    lowerUrl.includes('/threads/') ||
    lowerUrl.includes('/discussion/')
  ) {
    return { type: 'Forum Thread', confident: true };
  }

  if (
    lowerUrl.includes('prlog.org') ||
    lowerUrl.includes('openpr.com') ||
    lowerUrl.includes('pr.com') ||
    lowerUrl.includes('prnewswire.com') ||
    lowerUrl.includes('businesswire.com') ||
    lowerUrl.includes('/press-release') ||
    lowerTitle.includes('press release')
  ) {
    return { type: 'Press Release', confident: true };
  }

  if (
    lowerUrl.includes('wikipedia.org') ||
    lowerUrl.includes('wikidata.org') ||
    lowerUrl.includes('/wiki/')
  ) {
    return { type: 'Wiki', confident: true };
  }

  if (
    lowerUrl.includes('locanto.com') ||
    lowerUrl.includes('classi4u.com') ||
    lowerUrl.includes('dewalist.com') ||
    lowerUrl.includes('topclassifieds.com') ||
    lowerUrl.includes('chaosads.com') ||
    lowerUrl.includes('global-free-classified-ads.com') ||
    lowerUrl.includes('adfreeposting.com') ||
    lowerUrl.includes('golocalads.com') ||
    lowerUrl.includes('olx.in') ||
    lowerUrl.includes('quikr.com') ||
    lowerUrl.includes('clickindia.com')
  ) {
    return { type: 'Classified Ad', confident: true };
  }

  if (lowerUrl.includes('linkedin.com/company/')) {
    return { type: 'Business Profile', confident: true };
  }
  if (
    lowerUrl.includes('linkedin.com/in/') ||
    lowerUrl.includes('facebook.com/') ||
    lowerUrl.includes('instagram.com/') ||
    lowerUrl.includes('x.com/') ||
    lowerUrl.includes('twitter.com/') ||
    lowerUrl.includes('pinterest.com/') ||
    lowerUrl.includes('tiktok.com/@') ||
    lowerUrl.includes('threads.net/@') ||
    lowerUrl.includes('bsky.app/profile') ||
    lowerUrl.includes('patreon.com/') ||
    lowerUrl.includes('500px.com/')
  ) {
    return { type: 'Social Profile', confident: true };
  }

  if (
    lowerUrl.includes('/reviews') ||
    lowerUrl.includes('trustpilot.com/review/') ||
    lowerUrl.includes('sitejabber.com/reviews/') ||
    lowerUrl.includes('smartcustomer.com/reviews/') ||
    lowerUrl.includes('glassdoor.com/Reviews/') ||
    lowerUrl.includes('ambitionbox.com/reviews/') ||
    (lowerTitle.includes('reviews') && !lowerTitle.includes('top ') && !lowerTitle.includes('best '))
  ) {
    return { type: 'Review Page', confident: true };
  }

  if (
    lowerUrl.includes('/search?') ||
    lowerUrl.includes('/category/') ||
    lowerUrl.includes('/categories/') ||
    lowerUrl.includes('/directory/') ||
    lowerUrl.includes('/top-') ||
    lowerUrl.includes('/best-') ||
    lowerUrl.includes('/list-of-') ||
    /^(top|best)\s+\d+/i.test(lowerTitle)
  ) {
    return { type: 'Category Page', confident: true };
  }

  if (
    lowerUrl.includes('medium.com/') ||
    lowerUrl.includes('substack.com/') ||
    lowerUrl.includes('dev.to/') ||
    lowerUrl.includes('hashnode.com/') ||
    lowerUrl.includes('hackernoon.com/') ||
    lowerUrl.includes('wordpress.com/') ||
    lowerUrl.includes('blogger.com/') ||
    lowerUrl.includes('vocal.media/') ||
    lowerUrl.includes('hubpages.com/') ||
    lowerUrl.includes('/blog/') ||
    lowerUrl.includes('/article/') ||
    lowerUrl.includes('/news/') ||
    lowerUrl.includes('/post/')
  ) {
    return { type: 'Blog Post', confident: true };
  }

  if (
    lowerUrl.includes('yelp.com/biz/') ||
    lowerUrl.includes('bbb.org/us/') ||
    lowerUrl.includes('g2.com/products/') ||
    lowerUrl.includes('capterra.com/p/') ||
    lowerUrl.includes('clutch.co/profile/') ||
    lowerUrl.includes('goodfirms.co/company/') ||
    lowerUrl.includes('crunchbase.com/organization/') ||
    lowerUrl.includes('justdial.com/') ||
    lowerUrl.includes('indiamart.com/') ||
    lowerUrl.includes('sulekha.com/') ||
    lowerUrl.includes('tradeindia.com/') ||
    lowerUrl.includes('yellowpages.com/') ||
    lowerUrl.includes('manta.com/c/') ||
    lowerUrl.includes('hotfrog.com/company/') ||
    lowerUrl.includes('chamberofcommerce.com/') ||
    lowerUrl.includes('alignable.com/') ||
    lowerUrl.includes('dnb.com/business-directory/') ||
    lowerUrl.includes('opencorporates.com/companies/') ||
    lowerUrl.includes('/company/') ||
    lowerUrl.includes('/business/') ||
    lowerUrl.includes('/profile/') ||
    lowerUrl.includes('/listing/')
  ) {
    return { type: 'Business Profile', confident: true };
  }

  return { type: 'Business Profile', confident: false };
}

export async function classifyAmbiguousListingsWithGemini(
  items: Array<{ url: string; title: string; snippet: string }>
): Promise<Record<string, ListingType>> {
  const resultMap: Record<string, ListingType> = {};
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || items.length === 0) {
    return resultMap;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const batch = items.slice(0, 15);
    const prompt = `Classify each of the following web search results into one of these exact Listing Types:
"Business Profile", "Review Page", "Category Page", "Social Profile", "Channel", "Video", "Blog Post", "Forum Thread", "Classified Ad", "Press Release", "Map Listing", "Wiki", "Mention Only", "Other".

Items to classify:
${JSON.stringify(batch.map((b, i) => ({ index: i, url: b.url, title: b.title, snippet: b.snippet })))}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: { type: Type.INTEGER },
              listingType: { type: Type.STRING },
            },
            required: ['index', 'listingType'],
          },
        },
      },
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text) as Array<{ index: number; listingType: ListingType }>;
      for (const entry of parsed) {
        const item = batch[entry.index];
        if (item && entry.listingType) {
          resultMap[item.url] = entry.listingType;
        }
      }
    }
  } catch (err) {
    console.warn('Gemini listing classification fallback skipped:', err instanceof Error ? err.message : err);
  }

  return resultMap;
}
