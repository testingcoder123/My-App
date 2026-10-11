import {
  BenchmarkReport,
  BenchmarkUrlItem,
  ChecklistMatchStatus,
  DiscoverySource,
  ErrorSource,
  ListingMatchStatus,
  NapIssueItem,
  OpenWebItem,
  OwnPropertyItem,
  ProviderWarningItem,
  RawQueryLogItem,
  RejectedResultItem,
  SearchExecutionResult,
  SiteChecklistItem,
} from '../types.ts';
import {
  db,
  getResolvedDataForSeoCredentials,
  getResolvedSerperApiKey,
  getServerSettings,
  ServerSettings,
} from './db.ts';
import {
  buildSerperLocation,
  classifyAmbiguousListingsWithGemini,
  COUNTRY_META,
  detectListingTypeSync,
  evaluateListingMatch,
  extractLast10Digits,
  extractRootDomain,
  extractStateFromAddress,
  extractStreetAddressWithoutSuite,
  generateNameVariants,
  inferCountryFromAddress,
  ListingType,
  normalizeListingUrl,
  resolveDistinctiveTokens,
  SearchInput,
} from './matchingEngine.ts';

export type {
  DiscoverySource,
  NapIssueItem,
  OpenWebItem,
  OwnPropertyItem,
  RawQueryLogItem,
  SearchExecutionResult,
  SiteChecklistItem,
};

export interface SerperOrganicItem {
  title: string;
  link: string;
  snippet: string;
  position?: number;
}

export interface CollectedCandidateItem {
  title: string;
  link: string;
  snippet: string;
  scrapedText?: string;
  isBacklink?: boolean;
  sources: Set<'Serper' | 'DataForSEO'>;
}

export function resolveDiscoverySource(sources: Set<'Serper' | 'DataForSEO'>): DiscoverySource {
  const hasSerper = sources.has('Serper');
  const hasDfs = sources.has('DataForSEO');
  if (hasSerper && hasDfs) return 'Both';
  if (hasDfs) return 'DataForSEO';
  return 'Serper';
}

export interface DiscoveryProviderContext {
  searchId: number;
  clientId: number;
  input: SearchInput;
  settings: ServerSettings;
  gl: string;
  hl: string;
  serperLocation: string;
  maxCalls: number;
  maxPagesPhase1: number;
  registryRows: Array<Record<string, any>>;
  getTotalCallsUsed: () => number;
  incrementSerperCalls: (n?: number) => void;
  incrementDataForSeoCalls: (n?: number) => void;
  recordCandidate: (
    provider: 'Serper' | 'DataForSEO',
    item: { title: string; link: string; snippet: string; isBacklink?: boolean }
  ) => void;
  getCollectedItems: () => CollectedCandidateItem[];
  rawResults: RawQueryLogItem[];
  providerWarnings: ProviderWarningItem[];
  updateProgress: (percent: number, message: string) => void;
}

export interface DiscoveryProvider {
  readonly name: 'Serper' | 'DataForSEO';
  isEnabled(settings: ServerSettings, input: SearchInput): boolean;
  discover(ctx: DiscoveryProviderContext): Promise<void>;
}

export async function searchWeb(
  query: string,
  page: number,
  context: {
    clientId: number;
    searchId: number | null;
    gl: string;
    hl: string;
    location?: string;
  }
): Promise<{
  organic: SerperOrganicItem[];
  httpStatus: number;
  creditUsed: boolean;
  querySent: string;
  error?: string;
}> {
  const { key } = getResolvedSerperApiKey();
  if (!key) {
    const err = new Error('Serper.dev: API key is not configured.') as Error & {
      errorSource?: ErrorSource;
      httpStatus?: number;
    };
    err.errorSource = 'Serper.dev';
    err.httpStatus = 401;
    throw err;
  }

  const executeAttempt = async (qToRun: string, includeLocation: boolean): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);
    try {
      const payload: Record<string, unknown> = {
        q: qToRun,
        num: 10,
        page,
        gl: context.gl || 'us',
        hl: context.hl || 'en',
      };
      if (includeLocation && context.location) {
        payload.location = context.location;
      }

      return await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  let finalQueryUsed = query.trim();
  let response: Response;
  try {
    response = await executeAttempt(finalQueryUsed, true);

    if (response.status === 400) {
      const unquotedDomainQuery = finalQueryUsed
        .replace(/inurl:"([^"]+)"/g, 'inurl:$1')
        .replace(/"([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^"]*)?)"/g, '$1')
        .trim();

      if (unquotedDomainQuery !== finalQueryUsed) {
        finalQueryUsed = unquotedDomainQuery;
        response = await executeAttempt(finalQueryUsed, true);
      }

      if (response.status === 400) {
        response = await executeAttempt(finalQueryUsed, false);
      }
      if (response.status === 400) {
        const strippedQuotes = finalQueryUsed.replace(/"/g, '').replace(/\s+/g, ' ').trim();
        if (strippedQuotes && strippedQuotes !== finalQueryUsed) {
          finalQueryUsed = strippedQuotes;
          response = await executeAttempt(finalQueryUsed, false);
        }
      }
    } else if (response.status >= 500) {
      await new Promise((r) => setTimeout(r, 700));
      response = await executeAttempt(finalQueryUsed, true);
    }
  } catch (networkErr) {
    try {
      await new Promise((r) => setTimeout(r, 700));
      response = await executeAttempt(finalQueryUsed, true);
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : 'Network connection failed';
      const netFatal = new Error(`Serper.dev network error: ${msg}`) as Error & {
        errorSource?: ErrorSource;
      };
      netFatal.errorSource = 'Serper.dev';
      throw netFatal;
    }
  }

  const creditUsed = response.ok ? 1 : 0;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO serper_logs (client_id, search_id, endpoint, query, credits_used, status_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    context.clientId,
    context.searchId,
    'search',
    finalQueryUsed.slice(0, 300),
    creditUsed,
    response.status,
    now
  );

  if (!response.ok) {
    let rawErrorText = '';
    try {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        rawErrorText = parsed.message || parsed.error || text;
      } catch {
        rawErrorText = text;
      }
    } catch {
      rawErrorText = response.statusText || 'Unknown error';
    }

    const exactErrorMsg = `Serper.dev HTTP ${response.status}: ${rawErrorText || response.statusText}`;

    // Requirement D.3: Never swallow errors: if Serper returns 401/402/429 (or 403), show the exact message to the admin and stop
    if (
      response.status === 401 ||
      response.status === 402 ||
      response.status === 403 ||
      response.status === 429
    ) {
      const fatalErr = new Error(exactErrorMsg) as Error & {
        httpStatus?: number;
        querySent?: string;
        errorSource?: ErrorSource;
      };
      fatalErr.httpStatus = response.status;
      fatalErr.querySent = finalQueryUsed;
      fatalErr.errorSource = 'Serper.dev';
      throw fatalErr;
    }

    return {
      organic: [],
      httpStatus: response.status,
      creditUsed: false,
      querySent: finalQueryUsed,
      error: exactErrorMsg,
    };
  }

  const data = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string; position?: number }>;
  };
  const organic: SerperOrganicItem[] = (data.organic || [])
    .filter((item) => item && item.link)
    .map((item) => ({
      title: String(item.title || ''),
      link: String(item.link || ''),
      snippet: String(item.snippet || ''),
      position: item.position,
    }));

  return {
    organic,
    httpStatus: response.status,
    creditUsed: true,
    querySent: finalQueryUsed,
  };
}

export async function fetchDataForSeoBacklinks(
  targetDomain: string,
  context: {
    clientId: number;
    searchId: number | null;
    login?: string;
    password?: string;
  }
): Promise<{
  items: Array<{
    url_from: string;
    domain_from: string;
    anchor: string;
    page_from_title: string;
  }>;
  httpStatus: number;
  callCounted: boolean;
  error?: string;
}> {
  const creds = getResolvedDataForSeoCredentials();
  const login = (context.login || creds.login || '').trim();
  const password = (context.password || creds.password || '').trim();

  if (!login || !password) {
    return {
      items: [],
      httpStatus: 401,
      callCounted: false,
      error: 'DataForSEO credentials are not configured.',
    };
  }

  const basicAuth = Buffer.from(`${login}:${password}`, 'utf8').toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch('https://api.dataforseo.com/v3/backlinks/backlinks/live', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          target: targetDomain,
          mode: 'one_per_domain',
          limit: 500,
        },
      ]),
      signal: controller.signal,
    });

    let bodyJson: any = null;
    let rawText = '';
    try {
      rawText = await response.text();
      bodyJson = JSON.parse(rawText);
    } catch {
      bodyJson = null;
    }

    const task = bodyJson?.tasks?.[0];
    const taskStatusCode = Number(task?.status_code || bodyJson?.status_code || response.status);
    const taskStatusMessage = String(
      task?.status_message || bodyJson?.status_message || response.statusText || ''
    );

    const isSuccess = response.ok && (taskStatusCode === 20000 || !task?.status_code);
    const callCounted = isSuccess ? 1 : 0;

    db.prepare(`
      INSERT INTO dataforseo_logs (client_id, search_id, endpoint, target, calls_used, status_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      context.clientId,
      context.searchId,
      'backlinks/backlinks/live',
      targetDomain.slice(0, 250),
      callCounted,
      response.ok ? (taskStatusCode === 20000 ? 200 : taskStatusCode) : response.status,
      new Date().toISOString()
    );

    if (!isSuccess) {
      const errDetail = taskStatusMessage || rawText.slice(0, 200) || `HTTP ${response.status}`;
      return {
        items: [],
        httpStatus: response.ok ? taskStatusCode : response.status,
        callCounted: false,
        error: `DataForSEO (${
          response.ok ? `Code ${taskStatusCode}` : `HTTP ${response.status}`
        }): ${errDetail}`,
      };
    }

    const rawItems: Array<Record<string, any>> = task?.result?.[0]?.items || [];
    const items = rawItems
      .filter((it) => it && typeof it.url_from === 'string' && it.url_from.trim().length > 0)
      .map((it) => ({
        url_from: String(it.url_from || '').trim(),
        domain_from: String(it.domain_from || '').trim(),
        anchor: String(it.anchor || '').trim(),
        page_from_title: String(it.page_from_title || '').trim(),
      }));

    return {
      items,
      httpStatus: 200,
      callCounted: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error calling DataForSEO';
    db.prepare(`
      INSERT INTO dataforseo_logs (client_id, search_id, endpoint, target, calls_used, status_code, created_at)
      VALUES (?, ?, ?, ?, 0, 500, ?)
    `).run(
      context.clientId,
      context.searchId,
      'backlinks/backlinks/live',
      targetDomain.slice(0, 250),
      new Date().toISOString()
    );

    return {
      items: [],
      httpStatus: 500,
      callCounted: false,
      error: `DataForSEO connection failed: ${msg}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function scrapePageText(
  url: string,
  context: { clientId: number; searchId: number | null }
): Promise<{ text: string; httpStatus: number; creditUsed: boolean; error?: string }> {
  const { key } = getResolvedSerperApiKey();
  if (!key) return { text: '', httpStatus: 0, creditUsed: false, error: 'No API key' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetch('https://scrape.serper.dev', {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    const creditUsed = response.ok ? 1 : 0;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO serper_logs (client_id, search_id, endpoint, query, credits_used, status_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      context.clientId,
      context.searchId,
      'scrape',
      url.slice(0, 300),
      creditUsed,
      response.status,
      now
    );

    if (!response.ok) {
      let errMsg = `Serper.dev Scrape HTTP ${response.status}`;
      try {
        const errBody = (await response.json()) as { message?: string };
        if (errBody?.message) errMsg = `Serper.dev Scrape HTTP ${response.status}: ${errBody.message}`;
      } catch {
        // ignore
      }
      return { text: '', httpStatus: response.status, creditUsed: false, error: errMsg };
    }
    const data = (await response.json()) as { text?: string; markdown?: string };
    return {
      text: String(data.text || data.markdown || '').slice(0, 15000),
      httpStatus: response.status,
      creditUsed: true,
    };
  } catch (err) {
    return {
      text: '',
      httpStatus: 0,
      creditUsed: false,
      error: err instanceof Error ? err.message : 'Scrape timeout/failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildPhoneFormatVariations(phones: string[], countryCode: string): string[] {
  const variations = new Set<string>();
  const cc = (countryCode || 'us').toLowerCase();

  for (const raw of phones) {
    const last10 = extractLast10Digits(raw);
    if (last10.length === 10) {
      const area = last10.slice(0, 3);
      const mid = last10.slice(3, 6);
      const line = last10.slice(6);

      if (cc === 'us' || cc === 'ca') {
        variations.add(`${area}-${mid}-${line}`);
        variations.add(`(${area}) ${mid}-${line}`);
        variations.add(`${area}.${mid}.${line}`);
        variations.add(last10);
        variations.add(`+1 ${area}-${mid}-${line}`);
        variations.add(`+1${last10}`);
      } else if (cc === 'in') {
        variations.add(`+91${last10}`);
        variations.add(`+91 ${last10.slice(0, 5)} ${last10.slice(5)}`);
        variations.add(`0${last10}`);
        variations.add(`${last10.slice(0, 5)} ${last10.slice(5)}`);
        variations.add(last10);
      } else {
        variations.add(last10);
        variations.add(`${area}-${mid}-${line}`);
        variations.add(`${last10.slice(0, 5)} ${last10.slice(5)}`);
        if (raw.trim()) variations.add(raw.trim());
      }
    } else if (raw.trim().length >= 7) {
      variations.add(raw.trim());
    }
  }
  return Array.from(variations);
}

export function doesUrlMatchRegistryDomain(url: string, searchDomain: string): boolean {
  const lowerUrl = (url || '').toLowerCase();
  const target = (searchDomain || '').toLowerCase().trim();
  if (!lowerUrl || !target) return false;

  if (target === 'google.com/maps') {
    return (
      lowerUrl.includes('google.com/maps') ||
      lowerUrl.includes('maps.google.') ||
      lowerUrl.includes('g.page/')
    );
  }
  if (target === 'bing.com/maps') {
    return lowerUrl.includes('bing.com/maps') || lowerUrl.includes('bing.com/local');
  }
  if (target === 'x.com' || target === 'twitter.com') {
    const host = extractRootDomain(lowerUrl);
    return (
      host === 'x.com' ||
      host === 'twitter.com' ||
      host.endsWith('.x.com') ||
      host.endsWith('.twitter.com')
    );
  }

  if (target.includes('/')) {
    return lowerUrl.includes(target);
  }

  const host = extractRootDomain(lowerUrl);
  return host === target || host.endsWith(`.${target}`);
}

export function computeCacheKey(input: SearchInput): string {
  const settings = getServerSettings();
  const normName = input.businessName.trim().toLowerCase();
  const normCity = input.city.trim().toLowerCase();
  const normCountry = (input.country || '').trim().toLowerCase();
  const normPhone = (input.phones || []).map(extractLast10Digits).sort().join(',');
  const mode = input.scanMode;
  const deep = input.deepVerify ? 'deep' : 'std';
  const providers = `${settings.serperEnabled ? 'S1' : 'S0'}_${
    settings.useDataForSeoBacklinks && settings.dataForSeoConfigured ? 'D1' : 'D0'
  }`;
  return `v4|${normName}|${normCity}|${normCountry}|${normPhone}|${mode}|${deep}|${providers}`;
}

function updateSearchProgress(
  searchId: number,
  percent: number,
  message: string,
  serperCallsUsed: number,
  dataForSeoCallsUsed: number
): void {
  try {
    db.prepare(`
      UPDATE searches
      SET progress_percent = ?, progress_message = ?, serper_calls_used = ?, dataforseo_calls_used = ?
      WHERE id = ?
    `).run(
      Math.min(99, Math.max(1, Math.round(percent))),
      message,
      serperCallsUsed,
      dataForSeoCallsUsed,
      searchId
    );
  } catch (err) {
    console.error('Failed to update search progress:', err);
  }
}

// =========================================================
// PROVIDER 1: DATAFORSEO BACKLINKS PROVIDER (Requirement C)
// =========================================================
export class DataForSeoDiscoveryProvider implements DiscoveryProvider {
  readonly name = 'DataForSEO' as const;

  isEnabled(settings: ServerSettings, input: SearchInput): boolean {
    const clientRootDomain = extractRootDomain(input.website);
    return Boolean(
      settings.useDataForSeoBacklinks && settings.dataForSeoConfigured && clientRootDomain
    );
  }

  async discover(ctx: DiscoveryProviderContext): Promise<void> {
    if (ctx.getTotalCallsUsed() >= ctx.maxCalls) return;

    const clientRootDomain = extractRootDomain(ctx.input.website);
    if (!clientRootDomain) return;

    ctx.updateProgress(5, `Checking backlinks for ${clientRootDomain}...`);

    const dfsRes = await fetchDataForSeoBacklinks(clientRootDomain, {
      clientId: ctx.clientId,
      searchId: ctx.searchId,
    });

    if (dfsRes.callCounted) {
      ctx.incrementDataForSeoCalls(1);
    }

    const organicPreview: SerperOrganicItem[] = dfsRes.items.slice(0, 100).map((it, idx) => ({
      title: it.page_from_title || it.anchor || it.domain_from || 'Backlink Page',
      link: it.url_from,
      snippet: `Domain: ${it.domain_from} | Anchor: "${it.anchor}" → ${clientRootDomain}`,
      position: idx + 1,
    }));

    ctx.rawResults.push({
      provider: 'DataForSEO',
      phase: 'DataForSEO Backlinks',
      query: `POST /v3/backlinks/backlinks/live target="${clientRootDomain}" mode="one_per_domain" limit=500`,
      page: 1,
      httpStatus: dfsRes.httpStatus,
      resultsCount: dfsRes.items.length,
      creditsUsed: dfsRes.callCounted ? 1 : 0,
      error: dfsRes.error,
      errorSource: dfsRes.error ? 'DataForSEO' : undefined,
      organic: organicPreview,
    });

    if (dfsRes.error) {
      // Requirement C.3 & D.1:
      // If DataForSEO returns 401/402/403 or any error, auto-disable it for that scan,
      // continue with Serper results, and never block the scan.
      // Show as a non-blocking yellow "DataForSEO Warning" (admin only) with a hint.
      ctx.providerWarnings.push({
        source: 'DataForSEO',
        message: `${dfsRes.error} (Auto-disabled for this scan; continuing with Serper.dev results.)`,
        adminHint:
          'Verify your account and Backlinks API subscription at app.dataforseo.com, or turn off "Use DataForSEO Backlinks" in Admin Settings.',
      });
      return;
    }

    for (const item of dfsRes.items) {
      const title = item.page_from_title || item.anchor || item.domain_from || '';
      const snippetParts = [
        item.anchor ? `Anchor: ${item.anchor}` : '',
        item.domain_from ? `Source domain: ${item.domain_from}` : '',
        `Backlink to ${clientRootDomain}`,
      ].filter(Boolean);

      ctx.recordCandidate('DataForSEO', {
        title,
        link: item.url_from,
        snippet: snippetParts.join(' · '),
        isBacklink: true,
      });
    }
  }
}

// =========================================================
// PROVIDER 2: SERPER.DEV SEARCH PROVIDER (Requirement A)
// =========================================================
export class SerperDiscoveryProvider implements DiscoveryProvider {
  readonly name = 'Serper' as const;

  isEnabled(settings: ServerSettings, _input: SearchInput): boolean {
    return Boolean(settings.serperEnabled && settings.serperKeyConfigured);
  }

  async discover(ctx: DiscoveryProviderContext): Promise<void> {
    const { input, gl, hl, serperLocation, maxCalls, maxPagesPhase1, registryRows } = ctx;

    const variants = generateNameVariants(input.businessName, input.alternateNames, input.website);
    const cityClean = input.city.trim();
    const { stateShort, stateFull } = extractStateFromAddress(input.address, input.state);
    const stateToken = stateShort || stateFull;
    const streetWithoutSuite = extractStreetAddressWithoutSuite(input.address, cityClean);
    const clientRootDomain = extractRootDomain(input.website);

    const phase1Queries: Array<{ q: string; maxPages: number }> = [];
    const seenQuerySet = new Set<string>();
    const addPhase1Query = (q: string, pages = maxPagesPhase1) => {
      const clean = q.replace(/\s+/g, ' ').trim();
      if (!clean || seenQuerySet.has(clean.toLowerCase())) return;
      seenQuerySet.add(clean.toLowerCase());
      phase1Queries.push({ q: clean, maxPages: pages });
    };

    // Requirement A.3 Query Set (Full mode: up to 5 pages, num=10; Quick mode: 1 page):
    // 1) inurl:"{slug}" for each slug variant, and inurl:{compact}
    for (const slug of variants.slugVariants) {
      addPhase1Query(`inurl:"${slug}"`, maxPagesPhase1);
    }
    for (const compact of variants.compactVariants) {
      addPhase1Query(`inurl:${compact}`, maxPagesPhase1);
    }

    // 2) intitle:"{variant}" for each variant
    for (const nameVar of variants.textVariants) {
      addPhase1Query(`intitle:"${nameVar}"`, maxPagesPhase1);
    }

    // 3) "{variant}" "{city}" for each variant
    if (cityClean) {
      for (const nameVar of variants.textVariants) {
        addPhase1Query(`"${nameVar}" "${cityClean}"`, maxPagesPhase1);
      }
    }

    // 4) "{street number + street name}" (without suite) and the same with "{variant}"
    if (streetWithoutSuite && streetWithoutSuite.length >= 5) {
      addPhase1Query(`"${streetWithoutSuite}"`, maxPagesPhase1);

      for (const nameVar of variants.textVariants) {
        addPhase1Query(`"${streetWithoutSuite}" "${nameVar}"`, maxPagesPhase1);
      }
    }

    // 5) Each phone in several formats (if provided)
    const phoneVariations = buildPhoneFormatVariations(input.phones || [], gl);
    for (let i = 0; i < phoneVariations.length; i += 3) {
      const chunk = phoneVariations.slice(i, i + 3).map((v) => `"${v}"`);
      addPhase1Query(chunk.join(' OR '), maxPagesPhase1);
    }

    // 6) {variant} {city} {state} (unquoted)
    for (const nameVar of variants.textVariants) {
      const unquotedLoc = [nameVar, cityClean, stateToken].filter(Boolean).join(' ');
      addPhase1Query(unquotedLoc, maxPagesPhase1);
    }

    // 7) "{website domain}" -site:{website domain}
    if (clientRootDomain) {
      addPhase1Query(`"${clientRootDomain}" -site:${clientRootDomain}`, maxPagesPhase1);
    }

    for (let qIdx = 0; qIdx < phase1Queries.length; qIdx++) {
      if (ctx.getTotalCallsUsed() >= maxCalls) break;
      const { q, maxPages } = phase1Queries[qIdx];

      for (let page = 1; page <= maxPages; page++) {
        if (ctx.getTotalCallsUsed() >= maxCalls) break;
        const pct = 8 + Math.round(((qIdx + 1) / Math.max(1, phase1Queries.length)) * 42);
        ctx.updateProgress(
          pct,
          `Phase 1 (Open Web Discovery): Query ${qIdx + 1}/${phase1Queries.length} (page ${page}/${maxPages})`
        );

        try {
          const res = await searchWeb(q, page, {
            clientId: ctx.clientId,
            searchId: ctx.searchId,
            gl,
            hl,
            location: serperLocation,
          });
          if (res.creditUsed) ctx.incrementSerperCalls(1);
          ctx.rawResults.push({
            provider: 'Serper.dev',
            phase: 'Phase 1: Open Web',
            query: res.querySent,
            page,
            httpStatus: res.httpStatus,
            resultsCount: res.organic.length,
            creditsUsed: res.creditUsed ? 1 : 0,
            location: serperLocation,
            gl,
            hl,
            error: res.error,
            errorSource: res.error ? 'Serper.dev' : undefined,
            organic: res.organic,
          });
          for (const org of res.organic) {
            ctx.recordCandidate('Serper', org);
          }

          if (res.organic.length < 10) break;
        } catch (err) {
          const fatalErr = err as Error & {
            httpStatus?: number;
            querySent?: string;
            errorSource?: ErrorSource;
          };
          ctx.rawResults.push({
            provider: 'Serper.dev',
            phase: 'Phase 1: Open Web',
            query: fatalErr.querySent || q,
            page,
            httpStatus: fatalErr.httpStatus || 500,
            resultsCount: 0,
            creditsUsed: 0,
            location: serperLocation,
            gl,
            hl,
            error: fatalErr.message,
            errorSource: fatalErr.errorSource || 'Serper.dev',
            organic: [],
          });
          // Requirement D.3: Never swallow errors: if Serper returns 401/402/429, show exact message to admin and stop
          throw fatalErr;
        }
      }
    }

    // Requirement A.4: REGISTRY CHECK: batches of at most 3 sites per query.
    // In Full mode, for each registry site not yet found, also run site:{domain} "{variant}" individually.
    // Skip sites already confirmed.
    const getConfirmedAndFoundRegistryIds = () => {
      const confirmedIds = new Set<number>();
      const anyMatchIds = new Set<number>();
      const currentItems = ctx.getCollectedItems();
      for (const reg of registryRows) {
        const regId = Number(reg.id);
        const sDomain = String(reg.search_domain);
        const matchingItems = currentItems.filter((item) =>
          doesUrlMatchRegistryDomain(item.link, sDomain)
        );
        for (const mItem of matchingItems) {
          const evalRes = evaluateListingMatch(input, mItem);
          if (evalRes.status === 'Confirmed') {
            confirmedIds.add(regId);
            anyMatchIds.add(regId);
            break;
          } else if (evalRes.status === 'Strong Possible' || evalRes.status === 'Possible') {
            anyMatchIds.add(regId);
          }
        }
      }
      return { confirmedIds, anyMatchIds };
    };

    const { confirmedIds: phase1ConfirmedIds } = getConfirmedAndFoundRegistryIds();
    const unconfirmedSites = registryRows.filter((r) => !phase1ConfirmedIds.has(Number(r.id)));

    const BATCH_SIZE = 3;
    const batches: Array<typeof unconfirmedSites> = [];
    for (let i = 0; i < unconfirmedSites.length; i += BATCH_SIZE) {
      batches.push(unconfirmedSites.slice(i, i + BATCH_SIZE));
    }

    const primaryName = variants.textVariants[0] || input.businessName.trim();
    const secondaryName =
      variants.textVariants.find((v) => v !== primaryName && !v.includes('&')) || primaryName;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (ctx.getTotalCallsUsed() >= maxCalls) break;
      const batch = batches[bIdx];
      const siteClauses = batch.map((s) => `site:${String(s.search_domain)}`).join(' OR ');
      const nameClause =
        secondaryName !== primaryName
          ? `("${primaryName}" OR "${secondaryName}")`
          : `"${primaryName}"`;
      const batchQuery = `${nameClause} (${siteClauses})`;

      const pct = 52 + Math.round(((bIdx + 1) / Math.max(1, batches.length)) * 22);
      ctx.updateProgress(
        pct,
        `Phase 2 (Registry Batch of ${batch.length}): Batch ${bIdx + 1}/${batches.length}`
      );

      try {
        const res = await searchWeb(batchQuery, 1, {
          clientId: ctx.clientId,
          searchId: ctx.searchId,
          gl,
          hl,
          location: serperLocation,
        });
        if (res.creditUsed) ctx.incrementSerperCalls(1);
        ctx.rawResults.push({
          provider: 'Serper.dev',
          phase: 'Phase 2: Registry Batch (3 sites)',
          query: res.querySent,
          page: 1,
          httpStatus: res.httpStatus,
          resultsCount: res.organic.length,
          creditsUsed: res.creditUsed ? 1 : 0,
          location: serperLocation,
          gl,
          hl,
          error: res.error,
          errorSource: res.error ? 'Serper.dev' : undefined,
          organic: res.organic,
        });
        for (const org of res.organic) {
          ctx.recordCandidate('Serper', org);
        }
      } catch (err) {
        const fatalErr = err as Error & {
          httpStatus?: number;
          querySent?: string;
          errorSource?: ErrorSource;
        };
        ctx.rawResults.push({
          provider: 'Serper.dev',
          phase: 'Phase 2: Registry Batch (3 sites)',
          query: fatalErr.querySent || batchQuery,
          page: 1,
          httpStatus: fatalErr.httpStatus || 500,
          resultsCount: 0,
          creditsUsed: 0,
          location: serperLocation,
          gl,
          hl,
          error: fatalErr.message,
          errorSource: fatalErr.errorSource || 'Serper.dev',
          organic: [],
        });
        throw fatalErr;
      }
    }

    if (input.scanMode === 'full' && ctx.getTotalCallsUsed() < maxCalls) {
      const { confirmedIds: afterBatchConfirmedIds, anyMatchIds: afterBatchFoundIds } =
        getConfirmedAndFoundRegistryIds();
      const stillNotFoundSites = registryRows.filter(
        (r) =>
          !afterBatchConfirmedIds.has(Number(r.id)) && !afterBatchFoundIds.has(Number(r.id))
      );

      for (let sIdx = 0; sIdx < stillNotFoundSites.length; sIdx++) {
        if (ctx.getTotalCallsUsed() >= maxCalls) break;
        const siteRow = stillNotFoundSites[sIdx];
        const domain = String(siteRow.search_domain);
        const indivQuery = `site:${domain} "${secondaryName}"`;

        const pct = 75 + Math.round(((sIdx + 1) / Math.max(1, stillNotFoundSites.length)) * 12);
        ctx.updateProgress(
          pct,
          `Phase 2 (Individual Site Check): ${String(siteRow.name)} (${sIdx + 1}/${
            stillNotFoundSites.length
          })`
        );

        try {
          const res = await searchWeb(indivQuery, 1, {
            clientId: ctx.clientId,
            searchId: ctx.searchId,
            gl,
            hl,
            location: serperLocation,
          });
          if (res.creditUsed) ctx.incrementSerperCalls(1);
          ctx.rawResults.push({
            provider: 'Serper.dev',
            phase: 'Phase 2: Registry Individual',
            query: res.querySent,
            page: 1,
            httpStatus: res.httpStatus,
            resultsCount: res.organic.length,
            creditsUsed: res.creditUsed ? 1 : 0,
            location: serperLocation,
            gl,
            hl,
            error: res.error,
            errorSource: res.error ? 'Serper.dev' : undefined,
            organic: res.organic,
          });
          for (const org of res.organic) {
            ctx.recordCandidate('Serper', org);
          }
        } catch (err) {
          const fatalErr = err as Error & {
            httpStatus?: number;
            querySent?: string;
            errorSource?: ErrorSource;
          };
          ctx.rawResults.push({
            provider: 'Serper.dev',
            phase: 'Phase 2: Registry Individual',
            query: fatalErr.querySent || indivQuery,
            page: 1,
            httpStatus: fatalErr.httpStatus || 500,
            resultsCount: 0,
            creditsUsed: 0,
            location: serperLocation,
            gl,
            hl,
            error: fatalErr.message,
            errorSource: fatalErr.errorSource || 'Serper.dev',
            organic: [],
          });
          throw fatalErr;
        }
      }
    }
  }
}

/**
 * Requirement E: Benchmark Recall Tool
 * Evaluates a list of known listing URLs against the scan results and rejected pool.
 */
export function buildBenchmarkReport(
  knownUrls: string[],
  result: {
    siteChecklist: SiteChecklistItem[];
    otherSitesFound: OpenWebItem[];
    ownProperties: OwnPropertyItem[];
    rejectedResults?: RejectedResultItem[];
  }
): BenchmarkReport {
  const cleanUrls = Array.from(
    new Set(
      (knownUrls || [])
        .map((u) => (u || '').trim())
        .filter((u) => u.length >= 4)
    )
  );

  const items: BenchmarkUrlItem[] = [];
  let foundCount = 0;
  let rejectedCount = 0;
  let missedCount = 0;

  for (const rawInputUrl of cleanUrls) {
    const withProtocol = /^https?:\/\//i.test(rawInputUrl) ? rawInputUrl : `https://${rawInputUrl}`;
    const normTarget = normalizeListingUrl(withProtocol);
    const targetDomain = extractRootDomain(withProtocol);

    // 1. Check Site Checklist (Confirmed / Strong Possible / Possible)
    const checklistExact = result.siteChecklist.find(
      (c) =>
        c.status !== 'Not Found' &&
        c.listingUrl &&
        (normalizeListingUrl(c.listingUrl) === normTarget ||
          doesUrlMatchRegistryDomain(withProtocol, c.searchDomain))
    );

    if (checklistExact && checklistExact.status !== 'Not Found') {
      foundCount++;
      items.push({
        inputUrl: rawInputUrl,
        normalizedUrl: normTarget,
        domain: targetDomain,
        outcome: 'Found',
        status: checklistExact.status as ListingMatchStatus,
        matchedUrl: checklistExact.listingUrl,
        locationTab: 'Site Checklist',
        matchScore: checklistExact.matchScore,
        why: checklistExact.why,
      });
      continue;
    }

    // 2. Check Other Sites Found
    const otherMatch = result.otherSitesFound.find(
      (o) =>
        normalizeListingUrl(o.url) === normTarget ||
        (targetDomain && o.domain === targetDomain && normalizeListingUrl(o.url).startsWith(normTarget.split('?')[0]))
    ) || result.otherSitesFound.find((o) => targetDomain && o.domain === targetDomain);

    if (otherMatch) {
      foundCount++;
      items.push({
        inputUrl: rawInputUrl,
        normalizedUrl: normTarget,
        domain: targetDomain,
        outcome: 'Found',
        status: otherMatch.status,
        matchedUrl: otherMatch.url,
        locationTab: 'Other Sites Found',
        matchScore: otherMatch.matchScore,
        why: otherMatch.why,
      });
      continue;
    }

    // 3. Check Own Properties
    const ownMatch = result.ownProperties.find(
      (p) => normalizeListingUrl(p.url) === normTarget || (targetDomain && p.domain === targetDomain)
    );
    if (ownMatch) {
      foundCount++;
      items.push({
        inputUrl: rawInputUrl,
        normalizedUrl: normTarget,
        domain: targetDomain,
        outcome: 'Found',
        status: 'Confirmed',
        matchedUrl: ownMatch.url,
        locationTab: 'Own Properties',
        matchScore: 100,
        why: `Matched ${ownMatch.propertyType}`,
      });
      continue;
    }

    // 4. Check Rejected Results (found by search queries, but rejected by strict matching engine)
    const rejectedList = result.rejectedResults || [];
    const rejectedMatch =
      rejectedList.find((r) => normalizeListingUrl(r.url) === normTarget) ||
      rejectedList.find((r) => targetDomain && r.domain === targetDomain);

    if (rejectedMatch) {
      rejectedCount++;
      items.push({
        inputUrl: rawInputUrl,
        normalizedUrl: normTarget,
        domain: targetDomain,
        outcome: 'Rejected',
        status: 'Rejected',
        matchedUrl: rejectedMatch.url,
        locationTab: 'Debug (Rejected)',
        matchScore: rejectedMatch.matchScore,
        rejectionReason: rejectedMatch.rejectionReason,
        why: rejectedMatch.why,
      });
      continue;
    }

    // 5. Missed (not returned in any search query)
    missedCount++;
    items.push({
      inputUrl: rawInputUrl,
      normalizedUrl: normTarget,
      domain: targetDomain,
      outcome: 'Missed',
      status: 'Not Returned',
      matchedUrl: '',
      locationTab: '-',
      matchScore: 0,
      rejectionReason: 'not returned by search queries',
      why: 'URL/domain did not appear in Serper.dev or DataForSEO query responses',
    });
  }

  const totalKnown = cleanUrls.length;
  const recallPercent = totalKnown > 0 ? Math.round((foundCount / totalKnown) * 1000) / 10 : 0;

  return {
    totalKnown,
    foundCount,
    rejectedCount,
    missedCount,
    recallPercent,
    items,
  };
}

export async function executeDiscoverySearch(
  searchId: number,
  clientId: number,
  input: SearchInput
): Promise<SearchExecutionResult> {
  const startTime = Date.now();
  const settings = getServerSettings();

  // Requirement B.1: Resolve distinctive name tokens (with Gemini one-time fallback + cache if needed)
  const distinctiveTokens = await resolveDistinctiveTokens(input.businessName, input.industry);
  input.distinctiveTokensOverride = distinctiveTokens;

  const providers: DiscoveryProvider[] = [
    new DataForSeoDiscoveryProvider(),
    new SerperDiscoveryProvider(),
  ];

  const activeProviders = providers.filter((p) => p.isEnabled(settings, input));
  if (activeProviders.length === 0) {
    const appErr = new Error(
      'App Error: No discovery provider is enabled/configured. Please configure Serper.dev in Admin Settings.'
    ) as Error & { errorSource?: ErrorSource };
    appErr.errorSource = 'App';
    throw appErr;
  }

  // Requirement A.1: Never default to "in"; auto-infer from address or fallback to "us"
  const resolvedCountryCode = (
    input.country ||
    inferCountryFromAddress(input.address, input.city, (input.phones || [])[0]) ||
    'us'
  )
    .toLowerCase()
    .slice(0, 2);

  const countryMeta = COUNTRY_META[resolvedCountryCode] || {
    gl: resolvedCountryCode || 'us',
    hl: settings.defaultLanguage || 'en',
    name: 'United States',
  };
  const gl = countryMeta.gl;
  const hl = resolvedCountryCode === 'us' ? 'en' : countryMeta.hl || settings.defaultLanguage || 'en';
  const serperLocation = buildSerperLocation(
    input.city,
    input.address,
    resolvedCountryCode,
    input.state
  );

  const maxCalls = Math.max(settings.maxCallsPerSearch || 200, input.scanMode === 'full' ? 200 : 90);
  // Requirement A.3: Full mode: up to 5 pages, num=10; Quick mode: 1 page
  const maxPagesPhase1 =
    input.scanMode === 'full' ? Math.max(1, Math.min(5, settings.pagesPerQuery || 5)) : 1;

  const registryRows = db
    .prepare(
      'SELECT id, name, search_domain, category_group, create_url, enabled FROM site_registry WHERE enabled = 1 ORDER BY id ASC'
    )
    .all();

  let serperCallsUsed = 0;
  let dataForSeoCallsUsed = 0;
  const providerWarnings: ProviderWarningItem[] = [];
  const rawResults: RawQueryLogItem[] = [];
  const collectedByNormUrl = new Map<string, CollectedCandidateItem>();

  const recordCandidate = (
    provider: 'Serper' | 'DataForSEO',
    item: { title: string; link: string; snippet: string; isBacklink?: boolean }
  ) => {
    if (!item.link) return;
    const normKey = normalizeListingUrl(item.link);
    if (!normKey) return;

    const existing = collectedByNormUrl.get(normKey);
    if (existing) {
      existing.sources.add(provider);
      if (!existing.title && item.title) existing.title = item.title;
      if (item.snippet && !existing.snippet.includes(item.snippet)) {
        existing.snippet = existing.snippet
          ? `${existing.snippet} | ${item.snippet}`
          : item.snippet;
      }
      if (item.isBacklink) {
        existing.isBacklink = true;
      }
    } else {
      collectedByNormUrl.set(normKey, {
        title: item.title || '',
        link: item.link.trim(),
        snippet: item.snippet || '',
        isBacklink: Boolean(item.isBacklink),
        sources: new Set([provider]),
      });
    }
  };

  const providerContext: DiscoveryProviderContext = {
    searchId,
    clientId,
    input,
    settings,
    gl,
    hl,
    serperLocation,
    maxCalls,
    maxPagesPhase1,
    registryRows,
    getTotalCallsUsed: () => serperCallsUsed + dataForSeoCallsUsed,
    incrementSerperCalls: (n = 1) => {
      serperCallsUsed += n;
    },
    incrementDataForSeoCalls: (n = 1) => {
      dataForSeoCallsUsed += n;
    },
    recordCandidate,
    getCollectedItems: () => Array.from(collectedByNormUrl.values()),
    rawResults,
    providerWarnings,
    updateProgress: (pct, msg) =>
      updateSearchProgress(searchId, pct, msg, serperCallsUsed, dataForSeoCallsUsed),
  };

  for (const provider of activeProviders) {
    await provider.discover(providerContext);
  }

  const allCollectedItems = Array.from(collectedByNormUrl.values());
  const clientRootDomain = extractRootDomain(input.website);

  // =========================================================
  // REQUIREMENT B.4 & B.7: DEEP VERIFY
  // Auto Deep-Verify all STRONG POSSIBLE results, and when deepVerify is ON (default),
  // also Deep-Verify POSSIBLE results via scrape.serper.dev (fallback to snippet on failure).
  // =========================================================
  if (
    settings.serperEnabled &&
    settings.serperKeyConfigured &&
    serperCallsUsed + dataForSeoCallsUsed < maxCalls
  ) {
    const strongPossibleCandidates: CollectedCandidateItem[] = [];
    const regularPossibleCandidates: CollectedCandidateItem[] = [];

    for (const item of allCollectedItems) {
      const itemRoot = extractRootDomain(item.link);
      if (
        clientRootDomain &&
        (itemRoot === clientRootDomain || itemRoot.endsWith(`.${clientRootDomain}`))
      ) {
        continue;
      }
      const ev = evaluateListingMatch(input, item);
      if (ev.status === 'Strong Possible') {
        strongPossibleCandidates.push(item);
      } else if (input.deepVerify && ev.status === 'Possible') {
        regularPossibleCandidates.push(item);
      }
    }

    const combinedCandidates = [...strongPossibleCandidates, ...regularPossibleCandidates];
    const remainingCap = Math.max(0, maxCalls - (serperCallsUsed + dataForSeoCallsUsed));
    const maxScrapes = Math.min(combinedCandidates.length, Math.min(30, remainingCap));
    const toScrape = combinedCandidates.slice(0, maxScrapes);

    if (toScrape.length > 0) {
      updateSearchProgress(
        searchId,
        89,
        `Deep Verify: Scraping ${toScrape.length} Strong Possible / Possible listings...`,
        serperCallsUsed,
        dataForSeoCallsUsed
      );

      const CONCURRENCY = 4;
      for (let i = 0; i < toScrape.length; i += CONCURRENCY) {
        const chunk = toScrape.slice(i, i + CONCURRENCY);
        const pct = 89 + Math.round(((i + chunk.length) / Math.max(1, toScrape.length)) * 7);
        updateSearchProgress(
          searchId,
          pct,
          `Deep Verify: Verifying page content (${Math.min(
            i + chunk.length,
            toScrape.length
          )}/${toScrape.length})`,
          serperCallsUsed,
          dataForSeoCallsUsed
        );

        await Promise.all(
          chunk.map(async (cand) => {
            const scrapeRes = await scrapePageText(cand.link, { clientId, searchId });
            if (scrapeRes.creditUsed) serperCallsUsed++;
            if (scrapeRes.text) {
              cand.scrapedText = scrapeRes.text;
            }
            rawResults.push({
              provider: 'Serper.dev',
              phase: 'Deep Verify Scrape',
              query: `scrape:${cand.link}`,
              page: 1,
              httpStatus: scrapeRes.httpStatus,
              resultsCount: scrapeRes.text ? 1 : 0,
              creditsUsed: scrapeRes.creditUsed ? 1 : 0,
              error: scrapeRes.error,
              errorSource: scrapeRes.error ? 'Serper.dev' : undefined,
              organic: scrapeRes.text
                ? [
                    {
                      title: cand.title,
                      link: cand.link,
                      snippet: scrapeRes.text.slice(0, 300),
                    },
                  ]
                : [],
            });
          })
        );
      }
    }
  }

  updateSearchProgress(
    searchId,
    97,
    'Running strict matching engine & classifying listings...',
    serperCallsUsed,
    dataForSeoCallsUsed
  );

  // =========================================================
  // CLASSIFY & ORGANIZE INTO TABS (Requirement B.4, B.5, B.6, E)
  // =========================================================
  const ownProperties: OwnPropertyItem[] = [];
  const otherSitesFound: OpenWebItem[] = [];
  const napIssues: NapIssueItem[] = [];
  const rejectedResults: RejectedResultItem[] = [];

  const gbpNormalized = (input.gbpUrl || '').trim().toLowerCase();

  const externalItems: CollectedCandidateItem[] = [];
  for (const item of allCollectedItems) {
    const itemRoot = extractRootDomain(item.link);
    const lowerLink = item.link.toLowerCase();
    const itemSource = resolveDiscoverySource(item.sources);

    if (
      clientRootDomain &&
      (itemRoot === clientRootDomain || itemRoot.endsWith(`.${clientRootDomain}`))
    ) {
      ownProperties.push({
        propertyType:
          itemRoot === clientRootDomain ? 'Official Website' : 'Subdomain / Brand Property',
        domain: itemRoot,
        url: item.link,
        title: item.title,
        snippet: item.snippet,
        source: itemSource,
      });
      continue;
    }

    if (gbpNormalized && lowerLink.includes(gbpNormalized.replace(/^https?:\/\//, ''))) {
      ownProperties.push({
        propertyType: 'Google Business Profile',
        domain: itemRoot,
        url: item.link,
        title: item.title,
        snippet: item.snippet,
        source: itemSource,
      });
    }

    externalItems.push(item);
  }

  const ambiguousForGemini: Array<{ url: string; title: string; snippet: string }> = [];
  const syncTypeMap = new Map<string, ListingType>();

  for (const item of externalItems) {
    const detected = detectListingTypeSync(item.link, item.title);
    syncTypeMap.set(item.link, detected.type);
    if (!detected.confident) {
      ambiguousForGemini.push({ url: item.link, title: item.title, snippet: item.snippet });
    }
  }

  const geminiTypeOverrides = await classifyAmbiguousListingsWithGemini(ambiguousForGemini);
  const getFinalListingType = (url: string): ListingType => {
    return geminiTypeOverrides[url] || syncTypeMap.get(url) || 'Business Profile';
  };

  const statusPriority: Record<ListingMatchStatus, number> = {
    Confirmed: 0,
    'Strong Possible': 1,
    Possible: 2,
  };

  const primaryUrlsShownInChecklist = new Set<string>();
  const siteChecklist: SiteChecklistItem[] = [];

  for (const reg of registryRows) {
    const siteId = Number(reg.id);
    const siteName = String(reg.name);
    const searchDomain = String(reg.search_domain);
    const group = String(reg.category_group);
    const createUrl = String(reg.create_url || `https://${searchDomain}`);

    const domainCandidates = externalItems.filter((item) =>
      doesUrlMatchRegistryDomain(item.link, searchDomain)
    );

    let bestItem: CollectedCandidateItem | null = null;
    let bestEval: ReturnType<typeof evaluateListingMatch> | null = null;
    const domainCombinedSources = new Set<'Serper' | 'DataForSEO'>();

    for (const cand of domainCandidates) {
      const ev = evaluateListingMatch(input, cand);
      if (ev.status === 'Discard') continue;

      for (const s of cand.sources) {
        domainCombinedSources.add(s);
      }

      if (!bestEval) {
        bestItem = cand;
        bestEval = ev;
      } else {
        const curRank = statusPriority[ev.status];
        const bestRank = statusPriority[bestEval.status as ListingMatchStatus];
        if (
          curRank < bestRank ||
          (curRank === bestRank && ev.matchScore > bestEval.matchScore)
        ) {
          bestItem = cand;
          bestEval = ev;
        }
      }
    }

    if (bestItem && bestEval && bestEval.status !== 'Discard') {
      primaryUrlsShownInChecklist.add(normalizeListingUrl(bestItem.link));
      const listingType = getFinalListingType(bestItem.link);
      const resolvedSource = resolveDiscoverySource(
        domainCombinedSources.size > 0 ? domainCombinedSources : bestItem.sources
      );

      siteChecklist.push({
        siteId,
        siteName,
        searchDomain,
        group,
        createUrl,
        status: bestEval.status,
        badge: bestEval.badge,
        source: resolvedSource,
        listingUrl: bestItem.link,
        listingTitle: bestItem.title,
        listingType,
        matchedSignals: bestEval.matchedSignals,
        matchScore: bestEval.matchScore,
        why: bestEval.why,
        foundName: bestEval.foundName,
        foundPhone: bestEval.foundPhone,
        foundAddress: bestEval.foundAddress,
        snippet: bestItem.snippet,
        napMismatch: bestEval.napMismatch,
        napDiscrepancies: bestEval.napDiscrepancies,
        deepVerified: Boolean(bestItem.scrapedText),
      });

      // Requirement B.6: Show "NAP Mismatch" ONLY on truly Confirmed listings
      if (bestEval.status === 'Confirmed' && bestEval.napMismatch) {
        napIssues.push({
          sourceName: siteName,
          domain: searchDomain,
          url: bestItem.link,
          status: 'Confirmed',
          source: resolvedSource,
          listingType,
          matchedSignals: bestEval.matchedSignals,
          matchScore: bestEval.matchScore,
          why: bestEval.why,
          foundName: bestEval.foundName,
          expectedName: input.businessName,
          foundPhone: bestEval.foundPhone || 'Not listed / Different',
          expectedPhone: (input.phones || [])[0] || '-',
          foundAddress: bestEval.foundAddress,
          expectedAddress: `${input.address}, ${input.city}`,
          discrepancies: bestEval.napDiscrepancies,
        });
      }
    } else {
      siteChecklist.push({
        siteId,
        siteName,
        searchDomain,
        group,
        createUrl,
        status: 'Not Found',
        source: '-',
        listingUrl: '',
        listingTitle: '',
        listingType: '-',
        matchedSignals: [],
        matchScore: 0,
        why: 'Not found in search queries',
        foundName: 'Name not found on page',
        foundPhone: '',
        foundAddress: '—',
        snippet: '',
        napMismatch: false,
        napDiscrepancies: [],
        deepVerified: false,
      });
    }
  }

  // Requirement B.6: Sort: Confirmed, Strong Possible, Possible (then Not Found)
  const checklistRank: Record<ChecklistMatchStatus, number> = {
    Confirmed: 0,
    'Strong Possible': 1,
    Possible: 2,
    'Not Found': 3,
  };
  siteChecklist.sort((a, b) => {
    const rankDiff = checklistRank[a.status] - checklistRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return a.siteName.localeCompare(b.siteName);
  });

  for (const item of externalItems) {
    const normUrl = normalizeListingUrl(item.link);
    if (primaryUrlsShownInChecklist.has(normUrl)) continue;

    const ev = evaluateListingMatch(input, item);
    const domain = extractRootDomain(item.link);
    const resolvedSource = resolveDiscoverySource(item.sources);

    if (ev.status === 'Confirmed' || ev.status === 'Strong Possible' || ev.status === 'Possible') {
      const listingType = getFinalListingType(item.link);

      otherSitesFound.push({
        domain,
        url: item.link,
        title: item.title,
        snippet: item.snippet,
        status: ev.status,
        badge: ev.badge,
        source: resolvedSource,
        listingType,
        matchedSignals: ev.matchedSignals,
        matchScore: ev.matchScore,
        why: ev.why,
        foundName: ev.foundName,
        foundPhone: ev.foundPhone,
        foundAddress: ev.foundAddress,
        napMismatch: ev.napMismatch,
        napDiscrepancies: ev.napDiscrepancies,
        deepVerified: Boolean(item.scrapedText),
      });

      if (ev.status === 'Confirmed' && ev.napMismatch) {
        napIssues.push({
          sourceName: domain,
          domain,
          url: item.link,
          status: 'Confirmed',
          source: resolvedSource,
          listingType,
          matchedSignals: ev.matchedSignals,
          matchScore: ev.matchScore,
          why: ev.why,
          foundName: ev.foundName,
          expectedName: input.businessName,
          foundPhone: ev.foundPhone || 'Not listed / Different',
          expectedPhone: (input.phones || [])[0] || '-',
          foundAddress: ev.foundAddress,
          expectedAddress: `${input.address}, ${input.city}`,
          discrepancies: ev.napDiscrepancies,
        });
      }
    } else {
      // Rejected result -> record for Admin Debug Panel (Requirement E)
      rejectedResults.push({
        url: item.link,
        domain,
        title: item.title,
        snippet: item.snippet,
        source: resolvedSource,
        rejectionReason: ev.rejectionReason || 'no signals',
        why: ev.why,
        matchScore: ev.matchScore,
        isNonListingPage: ev.isNonListingPage,
      });
    }
  }

  // Requirement B.6: Sort Other Sites Found: Confirmed, Strong Possible, Possible, then by Match Score desc
  otherSitesFound.sort((a, b) => {
    const rankDiff = statusPriority[a.status] - statusPriority[b.status];
    if (rankDiff !== 0) return rankDiff;
    return b.matchScore - a.matchScore;
  });

  const confirmedRegistryCount = siteChecklist.filter((s) => s.status === 'Confirmed').length;
  const strongPossibleRegistryCount = siteChecklist.filter(
    (s) => s.status === 'Strong Possible'
  ).length;
  const possibleRegistryCount = siteChecklist.filter((s) => s.status === 'Possible').length;
  const notFoundRegistryCount = siteChecklist.filter((s) => s.status === 'Not Found').length;

  const confirmedOtherCount = otherSitesFound.filter((s) => s.status === 'Confirmed').length;
  const strongPossibleOtherCount = otherSitesFound.filter(
    (s) => s.status === 'Strong Possible'
  ).length;
  const possibleOtherCount = otherSitesFound.filter((s) => s.status === 'Possible').length;

  const totalStrongPossible = strongPossibleRegistryCount + strongPossibleOtherCount;
  const totalPossibleCombined =
    totalStrongPossible + possibleRegistryCount + possibleOtherCount;

  const durationMs = Date.now() - startTime;
  const warningMessage =
    providerWarnings.length > 0
      ? providerWarnings.map((w) => `${w.source} Warning: ${w.message}`).join(' | ')
      : undefined;
  const clientWarningMessage =
    providerWarnings.length > 0 ? 'Some optional sources were unavailable.' : undefined;

  const resultPayload: SearchExecutionResult = {
    summary: {
      sitesChecked: siteChecklist.length,
      confirmedCount: confirmedRegistryCount + confirmedOtherCount,
      strongPossibleCount: totalStrongPossible,
      possibleCount: totalPossibleCombined,
      notFoundCount: notFoundRegistryCount,
      otherSitesCount: otherSitesFound.length,
      napIssuesCount: napIssues.length,
      ownPropertiesCount: ownProperties.length,
      rejectedCount: rejectedResults.length,
      serperCallsUsed,
      dataForSeoCallsUsed,
      cached: false,
      durationMs,
      locationUsed: serperLocation,
      glUsed: gl,
      hlUsed: hl,
      distinctiveTokens,
      warningMessage,
      clientWarningMessage,
      providerWarnings: providerWarnings.length > 0 ? providerWarnings : undefined,
    },
    siteChecklist,
    otherSitesFound,
    napIssues,
    ownProperties,
    rawResults,
    rejectedResults,
  };

  if (input.benchmarkUrls && input.benchmarkUrls.length > 0) {
    resultPayload.benchmarkReport = buildBenchmarkReport(input.benchmarkUrls, resultPayload);
  }

  return resultPayload;
}
