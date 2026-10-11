import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  db,
  encryptSecret,
  getResolvedDataForSeoCredentials,
  getResolvedSerperApiKey,
  getServerSettings,
  initDatabase,
  maskApiKey,
  maskLogin,
  updateSetting,
} from './src/server/db.ts';
import {
  computeCacheKey,
  executeDiscoverySearch,
  SearchExecutionResult,
} from './src/server/searchEngine.ts';
import { inferCountryFromAddress, SearchInput } from './src/server/matchingEngine.ts';

dotenv.config();

initDatabase();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'citation-discovery-platform-server-secret-2026';
const COOKIE_NAME = 'cdp_session_token';

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

export interface AuthUser {
  id: number;
  userId: string;
  role: 'ADMIN' | 'CLIENT';
  name: string;
  company: string;
  email: string;
  phone: string;
  dailyLimit: number;
  monthlyLimit: number;
  active: boolean;
}

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

function generateStrongPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;

  const chars = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  for (let i = chars.length; i < length; i++) {
    chars.push(all[crypto.randomInt(all.length)]);
  }
  // Shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function generateClientUserId(name: string, company: string): string {
  const baseSource = (company || name || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8) || 'client';
  const rand = crypto.randomInt(1000, 9999);
  return `${baseSource}_${rand}`;
}

function signUserToken(user: { id: number; userId: string; role: 'ADMIN' | 'CLIENT' }): string {
  return jwt.sign(
    { sub: user.id, userId: user.userId, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function extractAuthUser(req: Request): AuthUser | null {
  let token = req.cookies?.[COOKIE_NAME];
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub?: number | string };
    const userIdNum = Number(decoded.sub);
    if (!userIdNum) return null;

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userIdNum);
    if (!row || Number(row.active) !== 1) return null;

    return {
      id: Number(row.id),
      userId: String(row.user_id),
      role: row.role === 'ADMIN' ? 'ADMIN' : 'CLIENT',
      name: String(row.name),
      company: String(row.company || ''),
      email: String(row.email || ''),
      phone: String(row.phone || ''),
      dailyLimit: Number(row.daily_limit || 15),
      monthlyLimit: Number(row.monthly_limit || 200),
      active: Number(row.active) === 1,
    };
  } catch {
    return null;
  }
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  if (user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    return;
  }
  req.user = user;
  next();
}

/**
 * Helper to get start of Today, Week, and Month in UTC or configured timezone
 */
function getTimeBoundaries(timezone: string): {
  startOfTodayIso: string;
  startOfWeekIso: string;
  startOfMonthIso: string;
  startOf30DaysIso: string;
} {
  const now = new Date();
  let tzDateStr: string;
  try {
    tzDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    tzDateStr = now.toISOString().slice(0, 10);
  }

  const [y, m, d] = tzDateStr.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const startOfTodayIso = new Date(todayUtc.getTime() - 5.5 * 3600 * 1000).toISOString();

  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  return {
    startOfTodayIso,
    startOfWeekIso: weekAgo.toISOString(),
    startOfMonthIso: monthStart.toISOString(),
    startOf30DaysIso: thirtyDaysAgo.toISOString(),
  };
}

function formatDateInTz(isoStr: string, timezone: string): { dateKey: string; hour: number } {
  try {
    const dt = new Date(isoStr);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(dt);

    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    const dateKey = `${map.year}-${map.month}-${map.day}`;
    const hour = parseInt(map.hour || '0', 10) % 24;
    return { dateKey, hour };
  } catch {
    const dt = new Date(isoStr);
    return {
      dateKey: dt.toISOString().slice(0, 10),
      hour: dt.getUTCHours(),
    };
  }
}

// =========================================================
// 1. AUTH & INITIAL SETUP ROUTES
// =========================================================

app.get('/api/auth/status', (req: Request, res: Response) => {
  const adminCountRow = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN'").get();
  const initialized = Number(adminCountRow?.cnt || 0) > 0;
  const user = extractAuthUser(req);
  const settings = getServerSettings();

  res.json({
    initialized,
    user,
    timezone: settings.timezone,
    defaultCountry: settings.defaultCountry,
    defaultScanMode: settings.defaultScanMode,
    serperConfigured: settings.serperKeyConfigured,
  });
});

app.post('/api/auth/setup-admin', (req: Request, res: Response) => {
  const adminCountRow = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN'").get();
  if (Number(adminCountRow?.cnt || 0) > 0) {
    res.status(400).json({ error: 'Admin account is already initialized. Please log in.' });
    return;
  }

  const { userId, password, name } = req.body || {};
  const cleanUserId = String(userId || '').trim();
  const cleanPassword = String(password || '');
  const cleanName = String(name || 'Platform Administrator').trim();

  if (cleanUserId.length < 3) {
    res.status(400).json({ error: 'User ID must be at least 3 characters.' });
    return;
  }
  if (cleanPassword.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(cleanPassword, 10);
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO users (user_id, password_hash, role, name, company, daily_limit, monthly_limit, active, created_at, last_login)
    VALUES (?, ?, 'ADMIN', ?, 'Administration', 9999, 99999, 1, ?, ?)
  `).run(cleanUserId, passwordHash, cleanName, now, now);

  const newId = Number(result.lastInsertRowid);
  const token = signUserToken({ id: newId, userId: cleanUserId, role: 'ADMIN' });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  });

  res.json({
    token,
    user: {
      id: newId,
      userId: cleanUserId,
      role: 'ADMIN',
      name: cleanName,
      company: 'Administration',
      email: '',
      phone: '',
      dailyLimit: 9999,
      monthlyLimit: 99999,
      active: true,
    },
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { userId, password } = req.body || {};
  const cleanUserId = String(userId || '').trim();
  const cleanPassword = String(password || '');

  if (!cleanUserId || !cleanPassword) {
    res.status(400).json({ error: 'Please enter both User ID and Password.' });
    return;
  }

  const row = db.prepare('SELECT * FROM users WHERE user_id = ?').get(cleanUserId);
  if (!row) {
    res.status(401).json({ error: 'Invalid User ID or password.' });
    return;
  }

  if (Number(row.active) !== 1) {
    res.status(403).json({ error: 'Your account has been disabled. Please contact your administrator.' });
    return;
  }

  const valid = bcrypt.compareSync(cleanPassword, String(row.password_hash));
  if (!valid) {
    res.status(401).json({ error: 'Invalid User ID or password.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, row.id);

  const user: AuthUser = {
    id: Number(row.id),
    userId: String(row.user_id),
    role: row.role === 'ADMIN' ? 'ADMIN' : 'CLIENT',
    name: String(row.name),
    company: String(row.company || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    dailyLimit: Number(row.daily_limit || 15),
    monthlyLimit: Number(row.monthly_limit || 200),
    active: true,
  };

  const token = signUserToken({ id: user.id, userId: user.userId, role: user.role });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  });

  res.json({ token, user });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// =========================================================
// 2. CLIENT QUOTA & SEARCH EXECUTION ROUTES
// =========================================================

function getClientUsageCounts(clientId: number, timezone: string): { today: number; month: number; total: number } {
  const { startOfTodayIso, startOfMonthIso } = getTimeBoundaries(timezone);
  const todayRow = db
    .prepare("SELECT COUNT(*) as cnt FROM searches WHERE client_id = ? AND created_at >= ? AND status != 'failed'")
    .get(clientId, startOfTodayIso);
  const monthRow = db
    .prepare("SELECT COUNT(*) as cnt FROM searches WHERE client_id = ? AND created_at >= ? AND status != 'failed'")
    .get(clientId, startOfMonthIso);
  const totalRow = db
    .prepare('SELECT COUNT(*) as cnt FROM searches WHERE client_id = ?')
    .get(clientId);

  return {
    today: Number(todayRow?.cnt || 0),
    month: Number(monthRow?.cnt || 0),
    total: Number(totalRow?.cnt || 0),
  };
}

app.get('/api/client/quota', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const settings = getServerSettings();
  const usage = getClientUsageCounts(user.id, settings.timezone);

  res.json({
    dailyLimit: user.dailyLimit,
    monthlyLimit: user.monthlyLimit,
    searchesToday: usage.today,
    searchesThisMonth: usage.month,
    totalSearches: usage.total,
    remainingDaily: Math.max(0, user.dailyLimit - usage.today),
    remainingMonthly: Math.max(0, user.monthlyLimit - usage.month),
    serperConfigured: settings.serperKeyConfigured,
    timezone: settings.timezone,
    defaultCountry: settings.defaultCountry,
    defaultScanMode: settings.defaultScanMode,
  });
});

app.post('/api/searches/start', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const settings = getServerSettings();

  // Mandatory provider check:
  const hasSerperReady = settings.serperEnabled && settings.serperKeyConfigured;
  const hasDfsReady = settings.useDataForSeoBacklinks && settings.dataForSeoConfigured;
  if (!hasSerperReady && !hasDfsReady) {
    res.status(400).json({ error: 'Search is not configured. Please contact your admin.' });
    return;
  }

  // Enforce daily/monthly search limits for CLIENT role
  if (user.role === 'CLIENT') {
    const usage = getClientUsageCounts(user.id, settings.timezone);
    if (usage.today >= user.dailyLimit) {
      res.status(429).json({
        error: `Daily search limit reached (${usage.today}/${user.dailyLimit}). Your quota resets tomorrow, or contact your admin to increase your limit.`,
      });
      return;
    }
    if (usage.month >= user.monthlyLimit) {
      res.status(429).json({
        error: `Monthly search limit reached (${usage.month}/${user.monthlyLimit}). Please contact your admin to upgrade your monthly allocation.`,
      });
      return;
    }
  }

  const body = req.body || {};
  const businessName = String(body.businessName || '').trim();
  const city = String(body.city || '').trim();
  const address = String(body.address || '').trim();

  if (!businessName) {
    res.status(400).json({ error: 'Business Name is required.' });
    return;
  }
  if (!city) {
    res.status(400).json({ error: 'City is required.' });
    return;
  }

  const alternateNames: string[] = Array.isArray(body.alternateNames)
    ? body.alternateNames.map((s: unknown) => String(s || '').trim()).filter(Boolean)
    : String(body.alternateNames || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const phones: string[] = Array.isArray(body.phones)
    ? body.phones.map((s: unknown) => String(s || '').trim()).filter(Boolean)
    : String(body.phones || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const inferredCountry = inferCountryFromAddress(address, city, phones[0]);
  const resolvedCountry = String(body.country || inferredCountry || settings.defaultCountry || 'us').trim().toLowerCase();

  const benchmarkUrls: string[] =
    user.role === 'ADMIN'
      ? Array.isArray(body.benchmarkUrls)
        ? body.benchmarkUrls.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : String(body.benchmarkUrls || '')
            .split(/[\r\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
      : [];

  const input: SearchInput = {
    businessName,
    alternateNames,
    website: String(body.website || '').trim(),
    gbpUrl: String(body.gbpUrl || '').trim(),
    address,
    city,
    state: String(body.state || '').trim(),
    country: resolvedCountry,
    phones,
    industry: String(body.industry || '').trim(),
    scanMode: body.scanMode === 'full' ? 'full' : 'quick',
    deepVerify: body.deepVerify !== undefined ? Boolean(body.deepVerify) : true,
    bypassCache: Boolean(body.bypassCache) || benchmarkUrls.length > 0,
    benchmarkUrls,
  };

  const cacheKey = computeCacheKey(input);
  const now = new Date();
  const nowIso = now.toISOString();
  const twentyFourHoursAgoIso = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

  // Check 24-hour cache unless bypassCache is requested
  if (!input.bypassCache) {
    const cachedRow = db
      .prepare(`
        SELECT * FROM searches
        WHERE cache_key = ? AND status IN ('completed', 'cached') AND created_at >= ?
        ORDER BY id DESC LIMIT 1
      `)
      .get(cacheKey, twentyFourHoursAgoIso);

    if (cachedRow && cachedRow.results_json) {
      try {
        const parsedResults = JSON.parse(String(cachedRow.results_json)) as SearchExecutionResult;
        parsedResults.summary.cached = true;
        parsedResults.summary.serperCallsUsed = 0;
        parsedResults.summary.dataForSeoCallsUsed = 0;

        const insertRes = db.prepare(`
          INSERT INTO searches (
            client_id, business_name, alternate_names, website, gbp_url,
            address, city, country, phones, industry, scan_mode, deep_verify,
            serper_calls_used, dataforseo_calls_used, confirmed_count, possible_count, not_found_count, nap_issues_count,
            duration_ms, status, progress_percent, progress_message, cache_key, results_json, created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'cached', 100, 'Loaded from 24h cache (0 credits used)', ?, ?, ?, ?)
        `).run(
          user.id,
          input.businessName,
          JSON.stringify(input.alternateNames),
          input.website,
          input.gbpUrl,
          input.address,
          input.city,
          input.country,
          JSON.stringify(input.phones),
          input.industry,
          input.scanMode,
          input.deepVerify ? 1 : 0,
          Number(cachedRow.confirmed_count || 0),
          Number(cachedRow.possible_count || 0),
          Number(cachedRow.not_found_count || 0),
          Number(cachedRow.nap_issues_count || 0),
          Number(cachedRow.duration_ms || 120),
          cacheKey,
          JSON.stringify(parsedResults),
          nowIso,
          nowIso
        );

        res.json({
          searchId: Number(insertRes.lastInsertRowid),
          cached: true,
        });
        return;
      } catch (e) {
        console.warn('Cache parse error, proceeding with live scan:', e);
      }
    }
  }

  // Insert running search record
  const insertRes = db.prepare(`
    INSERT INTO searches (
      client_id, business_name, alternate_names, website, gbp_url,
      address, city, country, phones, industry, scan_mode, deep_verify,
      serper_calls_used, status, progress_percent, progress_message, cache_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'running', 2, 'Starting Phase 1: Open Web Discovery...', ?, ?)
  `).run(
    user.id,
    input.businessName,
    JSON.stringify(input.alternateNames),
    input.website,
    input.gbpUrl,
    input.address,
    input.city,
    input.country,
    JSON.stringify(input.phones),
    input.industry,
    input.scanMode,
    input.deepVerify ? 1 : 0,
    cacheKey,
    nowIso
  );

  const searchId = Number(insertRes.lastInsertRowid);

  // Run discovery asynchronously in background so UI can poll live progress
  (async () => {
    try {
      const results = await executeDiscoverySearch(searchId, user.id, input);
      const completedIso = new Date().toISOString();
      db.prepare(`
        UPDATE searches
        SET serper_calls_used = ?,
            dataforseo_calls_used = ?,
            confirmed_count = ?,
            possible_count = ?,
            not_found_count = ?,
            nap_issues_count = ?,
            duration_ms = ?,
            status = 'completed',
            progress_percent = 100,
            progress_message = 'Discovery scan completed',
            results_json = ?,
            completed_at = ?
        WHERE id = ?
      `).run(
        results.summary.serperCallsUsed,
        results.summary.dataForSeoCallsUsed || 0,
        results.summary.confirmedCount,
        results.summary.possibleCount,
        results.summary.notFoundCount,
        results.summary.napIssuesCount,
        results.summary.durationMs,
        JSON.stringify(results),
        completedIso,
        searchId
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unexpected search error occurred.';
      console.error(`Search #${searchId} failed:`, errMsg);
      db.prepare(`
        UPDATE searches
        SET status = 'failed',
            progress_percent = 100,
            progress_message = ?,
            error_message = ?,
            completed_at = ?
        WHERE id = ?
      `).run(errMsg, errMsg, new Date().toISOString(), searchId);
    }
  })();

  res.json({ searchId, cached: false });
});

app.get('/api/searches/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const searchId = Number(req.params.id);
  const row = db
    .prepare(`
      SELECT s.*, u.name as client_name, u.user_id as client_user_id
      FROM searches s
      LEFT JOIN users u ON u.id = s.client_id
      WHERE s.id = ?
    `)
    .get(searchId);

  if (!row) {
    res.status(404).json({ error: 'Search record not found.' });
    return;
  }

  // Strict authorization: CLIENT can only read their own searches
  if (user.role !== 'ADMIN' && Number(row.client_id) !== user.id) {
    res.status(403).json({ error: 'Access denied. You can only view your own searches.' });
    return;
  }

  let parsedResults: Partial<SearchExecutionResult> | null = null;
  if (row.results_json && String(row.results_json) !== '{}') {
    try {
      parsedResults = JSON.parse(String(row.results_json));
      // Strip admin-only debug & benchmark payloads for non-admins
      if (user.role !== 'ADMIN' && parsedResults) {
        delete parsedResults.rawResults;
        delete parsedResults.rejectedResults;
        delete parsedResults.benchmarkReport;
        if (parsedResults.summary) {
          delete parsedResults.summary.providerWarnings;
          delete parsedResults.summary.warningMessage;
        }
      }
    } catch {
      parsedResults = null;
    }
  }

  res.json({
    id: Number(row.id),
    clientId: Number(row.client_id),
    clientName: user.role === 'ADMIN' ? String(row.client_name || '') : undefined,
    clientUserId: user.role === 'ADMIN' ? String(row.client_user_id || '') : undefined,
    businessName: String(row.business_name),
    alternateNames: JSON.parse(String(row.alternate_names || '[]')),
    website: String(row.website || ''),
    gbpUrl: String(row.gbp_url || ''),
    address: String(row.address || ''),
    city: String(row.city || ''),
    country: String(row.country || ''),
    phones: JSON.parse(String(row.phones || '[]')),
    industry: String(row.industry || ''),
    scanMode: String(row.scan_mode || 'quick'),
    deepVerify: Number(row.deep_verify) === 1,
    serperCallsUsed: Number(row.serper_calls_used || 0),
    dataForSeoCallsUsed: Number(row.dataforseo_calls_used || 0),
    confirmedCount: Number(row.confirmed_count || 0),
    possibleCount: Number(row.possible_count || 0),
    notFoundCount: Number(row.not_found_count || 0),
    napIssuesCount: Number(row.nap_issues_count || 0),
    durationMs: Number(row.duration_ms || 0),
    status: String(row.status),
    progressPercent: Number(row.progress_percent || 0),
    progressMessage: String(row.progress_message || ''),
    errorMessage: String(row.error_message || ''),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    results: parsedResults,
  });
});

app.get('/api/searches', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const rows = db
    .prepare(`
      SELECT id, business_name, website, phones, address, city, country, scan_mode, deep_verify,
             serper_calls_used, dataforseo_calls_used, confirmed_count, possible_count, not_found_count, nap_issues_count,
             duration_ms, status, error_message, created_at
      FROM searches
      WHERE client_id = ?
      ORDER BY id DESC
      LIMIT 100
    `)
    .all(user.id);

  res.json({
    searches: rows.map((r) => ({
      id: Number(r.id),
      businessName: String(r.business_name),
      website: String(r.website || ''),
      phones: JSON.parse(String(r.phones || '[]')),
      address: String(r.address || ''),
      city: String(r.city || ''),
      country: String(r.country || ''),
      scanMode: String(r.scan_mode || 'quick'),
      deepVerify: Number(r.deep_verify) === 1,
      serperCallsUsed: Number(r.serper_calls_used || 0),
      dataForSeoCallsUsed: Number(r.dataforseo_calls_used || 0),
      confirmedCount: Number(r.confirmed_count || 0),
      possibleCount: Number(r.possible_count || 0),
      notFoundCount: Number(r.not_found_count || 0),
      napIssuesCount: Number(r.nap_issues_count || 0),
      durationMs: Number(r.duration_ms || 0),
      status: String(r.status),
      errorMessage: String(r.error_message || ''),
      createdAt: String(r.created_at),
    })),
  });
});

// =========================================================
// 3. ADMIN PANEL ROUTES (Strictly protected by requireAdmin)
// =========================================================

app.get('/api/admin/dashboard', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const settings = getServerSettings();
  const { startOfTodayIso, startOfWeekIso, startOfMonthIso, startOf30DaysIso } = getTimeBoundaries(settings.timezone);

  const totalClients = Number(
    db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'CLIENT'").get()?.cnt || 0
  );
  const activeClients = Number(
    db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'CLIENT' AND active = 1").get()?.cnt || 0
  );

  const searchesToday = Number(
    db.prepare('SELECT COUNT(*) as cnt FROM searches WHERE created_at >= ?').get(startOfTodayIso)?.cnt || 0
  );
  const searchesThisWeek = Number(
    db.prepare('SELECT COUNT(*) as cnt FROM searches WHERE created_at >= ?').get(startOfWeekIso)?.cnt || 0
  );
  const searchesThisMonth = Number(
    db.prepare('SELECT COUNT(*) as cnt FROM searches WHERE created_at >= ?').get(startOfMonthIso)?.cnt || 0
  );

  const totalCreditsRow = db.prepare('SELECT COALESCE(SUM(credits_used), 0) as total FROM serper_logs').get();
  const todayCreditsRow = db
    .prepare('SELECT COALESCE(SUM(credits_used), 0) as total FROM serper_logs WHERE created_at >= ?')
    .get(startOfTodayIso);

  const totalSerperCredits = Number(totalCreditsRow?.total || 0);
  const creditsToday = Number(todayCreditsRow?.total || 0);

  const totalDfsRow = db.prepare('SELECT COALESCE(SUM(calls_used), 0) as total FROM dataforseo_logs').get();
  const todayDfsRow = db
    .prepare('SELECT COALESCE(SUM(calls_used), 0) as total FROM dataforseo_logs WHERE created_at >= ?')
    .get(startOfTodayIso);
  const totalDataForSeoCalls = Number(totalDfsRow?.total || 0);
  const dataForSeoCallsToday = Number(todayDfsRow?.total || 0);

  // Build 30-day chart & 24-hour chart in configured timezone
  const recentSearchesForCharts = db
    .prepare('SELECT created_at, serper_calls_used, dataforseo_calls_used FROM searches WHERE created_at >= ? ORDER BY created_at ASC')
    .all(startOf30DaysIso);

  const dayMap = new Map<string, { count: number; credits: number; dataForSeoCalls: number }>();
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 24 * 3600 * 1000);
    const { dateKey } = formatDateInTz(dt.toISOString(), settings.timezone);
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { count: 0, credits: 0, dataForSeoCalls: 0 });
    }
  }

  const hourCounts = new Array(24).fill(0);

  for (const s of recentSearchesForCharts) {
    const { dateKey, hour } = formatDateInTz(String(s.created_at), settings.timezone);
    const entry = dayMap.get(dateKey);
    if (entry) {
      entry.count += 1;
      entry.credits += Number(s.serper_calls_used || 0);
      entry.dataForSeoCalls += Number(s.dataforseo_calls_used || 0);
    }
    if (hour >= 0 && hour < 24) {
      hourCounts[hour] += 1;
    }
  }

  const searchesPerDay = Array.from(dayMap.entries()).map(([date, stats]) => ({
    date,
    count: stats.count,
    credits: stats.credits,
    dataForSeoCalls: stats.dataForSeoCalls,
  }));

  const searchesByHour = hourCounts.map((count, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count,
  }));

  // Top clients by number of searches
  const topClientsRows = db
    .prepare(`
      SELECT u.id, u.user_id, u.name, u.company, u.active, u.last_login,
             COUNT(s.id) as total_searches,
             COALESCE(SUM(s.serper_calls_used), 0) as credits_used,
             COALESCE(SUM(s.dataforseo_calls_used), 0) as dfs_calls_used,
             SUM(CASE WHEN s.created_at >= ? THEN 1 ELSE 0 END) as searches_today
      FROM users u
      LEFT JOIN searches s ON s.client_id = u.id
      WHERE u.role = 'CLIENT'
      GROUP BY u.id
      ORDER BY total_searches DESC, u.id DESC
      LIMIT 10
    `)
    .all(startOfTodayIso);

  const topClients = topClientsRows.map((r) => ({
    id: Number(r.id),
    userId: String(r.user_id),
    name: String(r.name),
    company: String(r.company || ''),
    active: Number(r.active) === 1,
    lastLogin: r.last_login ? String(r.last_login) : null,
    totalSearches: Number(r.total_searches || 0),
    searchesToday: Number(r.searches_today || 0),
    creditsUsed: Number(r.credits_used || 0),
    dataForSeoCallsUsed: Number(r.dfs_calls_used || 0),
  }));

  // Recent activity feed
  const recentActivityRows = db
    .prepare(`
      SELECT s.id, s.business_name, s.city, s.scan_mode, s.confirmed_count, s.possible_count,
             s.serper_calls_used, s.dataforseo_calls_used, s.status, s.created_at,
             u.name as client_name, u.user_id as client_user_id, u.role as client_role
      FROM searches s
      LEFT JOIN users u ON u.id = s.client_id
      ORDER BY s.id DESC
      LIMIT 15
    `)
    .all();

  const recentActivity = recentActivityRows.map((r) => ({
    id: Number(r.id),
    clientName: String(r.client_name || 'Unknown'),
    clientUserId: String(r.client_user_id || ''),
    clientRole: String(r.client_role || 'CLIENT'),
    businessName: String(r.business_name),
    city: String(r.city || ''),
    scanMode: String(r.scan_mode || 'quick'),
    confirmedCount: Number(r.confirmed_count || 0),
    possibleCount: Number(r.possible_count || 0),
    serperCallsUsed: Number(r.serper_calls_used || 0),
    dataForSeoCallsUsed: Number(r.dataforseo_calls_used || 0),
    status: String(r.status),
    createdAt: String(r.created_at),
  }));

  res.json({
    cards: {
      totalClients,
      activeClients,
      searchesToday,
      searchesThisWeek,
      searchesThisMonth,
      totalSerperCredits,
      creditsToday,
      totalDataForSeoCalls,
      dataForSeoCallsToday,
    },
    searchesPerDay,
    searchesByHour,
    topClients,
    recentActivity,
  });
});

// B) Clients (User Management)
app.get('/api/admin/clients', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const settings = getServerSettings();
  const { startOfTodayIso, startOfMonthIso } = getTimeBoundaries(settings.timezone);

  const rows = db
    .prepare(`
      SELECT u.*,
             COUNT(s.id) as total_searches,
             COALESCE(SUM(s.serper_calls_used), 0) as credits_used,
             COALESCE(SUM(s.dataforseo_calls_used), 0) as dfs_calls_used,
             SUM(CASE WHEN s.created_at >= ? AND s.status != 'failed' THEN 1 ELSE 0 END) as searches_today,
             SUM(CASE WHEN s.created_at >= ? AND s.status != 'failed' THEN 1 ELSE 0 END) as searches_month
      FROM users u
      LEFT JOIN searches s ON s.client_id = u.id
      WHERE u.role = 'CLIENT'
      GROUP BY u.id
      ORDER BY u.id DESC
    `)
    .all(startOfTodayIso, startOfMonthIso);

  res.json({
    clients: rows.map((r) => ({
      id: Number(r.id),
      userId: String(r.user_id),
      name: String(r.name),
      company: String(r.company || ''),
      email: String(r.email || ''),
      phone: String(r.phone || ''),
      dailyLimit: Number(r.daily_limit || 15),
      monthlyLimit: Number(r.monthly_limit || 200),
      active: Number(r.active) === 1,
      createdAt: String(r.created_at),
      lastLogin: r.last_login ? String(r.last_login) : null,
      totalSearches: Number(r.total_searches || 0),
      searchesToday: Number(r.searches_today || 0),
      searchesThisMonth: Number(r.searches_month || 0),
      creditsUsed: Number(r.credits_used || 0),
      dataForSeoCallsUsed: Number(r.dfs_calls_used || 0),
    })),
  });
});

app.post('/api/admin/clients', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, company, email, phone, dailyLimit, monthlyLimit, active } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    res.status(400).json({ error: 'Client Name is required.' });
    return;
  }

  let generatedUserId = generateClientUserId(cleanName, String(company || ''));
  while (db.prepare('SELECT id FROM users WHERE user_id = ?').get(generatedUserId)) {
    generatedUserId = generateClientUserId(cleanName, String(company || ''));
  }

  const plainPassword = generateStrongPassword(14);
  const passwordHash = bcrypt.hashSync(plainPassword, 10);
  const now = new Date().toISOString();

  const dLimit = Math.max(1, parseInt(String(dailyLimit ?? 15), 10) || 15);
  const mLimit = Math.max(1, parseInt(String(monthlyLimit ?? 200), 10) || 200);
  const isActive = active === false ? 0 : 1;

  const result = db.prepare(`
    INSERT INTO users (user_id, password_hash, role, name, company, email, phone, daily_limit, monthly_limit, active, created_at)
    VALUES (?, ?, 'CLIENT', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generatedUserId,
    passwordHash,
    cleanName,
    String(company || '').trim(),
    String(email || '').trim(),
    String(phone || '').trim(),
    dLimit,
    mLimit,
    isActive,
    now
  );

  res.json({
    client: {
      id: Number(result.lastInsertRowid),
      userId: generatedUserId,
      name: cleanName,
      company: String(company || '').trim(),
      email: String(email || '').trim(),
      phone: String(phone || '').trim(),
      dailyLimit: dLimit,
      monthlyLimit: mLimit,
      active: isActive === 1,
      createdAt: now,
      lastLogin: null,
      totalSearches: 0,
      searchesToday: 0,
      searchesThisMonth: 0,
      creditsUsed: 0,
    },
    generatedCredentials: {
      userId: generatedUserId,
      password: plainPassword,
    },
  });
});

app.put('/api/admin/clients/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const clientId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'CLIENT'").get(clientId);
  if (!existing) {
    res.status(404).json({ error: 'Client not found.' });
    return;
  }

  const { name, company, email, phone, dailyLimit, monthlyLimit, active } = req.body || {};
  const cleanName = name !== undefined ? String(name).trim() : String(existing.name);
  const cleanCompany = company !== undefined ? String(company).trim() : String(existing.company || '');
  const cleanEmail = email !== undefined ? String(email).trim() : String(existing.email || '');
  const cleanPhone = phone !== undefined ? String(phone).trim() : String(existing.phone || '');
  const dLimit = dailyLimit !== undefined ? Math.max(0, parseInt(String(dailyLimit), 10) || 0) : Number(existing.daily_limit);
  const mLimit = monthlyLimit !== undefined ? Math.max(0, parseInt(String(monthlyLimit), 10) || 0) : Number(existing.monthly_limit);
  const isActive = active !== undefined ? (active ? 1 : 0) : Number(existing.active);

  db.prepare(`
    UPDATE users
    SET name = ?, company = ?, email = ?, phone = ?, daily_limit = ?, monthly_limit = ?, active = ?
    WHERE id = ?
  `).run(cleanName, cleanCompany, cleanEmail, cleanPhone, dLimit, mLimit, isActive, clientId);

  res.json({ ok: true });
});

app.post('/api/admin/clients/:id/reset-password', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const clientId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'CLIENT'").get(clientId);
  if (!existing) {
    res.status(404).json({ error: 'Client not found.' });
    return;
  }

  const newPlainPassword = generateStrongPassword(14);
  const passwordHash = bcrypt.hashSync(newPlainPassword, 10);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, clientId);

  res.json({
    generatedCredentials: {
      userId: String(existing.user_id),
      name: String(existing.name),
      password: newPlainPassword,
    },
  });
});

app.delete('/api/admin/clients/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const clientId = Number(req.params.id);
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'CLIENT'").run(clientId);
  res.json({ ok: true });
});

// Per-client usage breakdown (searches per day, per hour, and exact timestamps)
app.get('/api/admin/clients/:id/usage', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const clientId = Number(req.params.id);
  const settings = getServerSettings();
  const clientRow = db.prepare('SELECT id, user_id, name, company, email, phone, daily_limit, monthly_limit, active, created_at, last_login FROM users WHERE id = ?').get(clientId);

  if (!clientRow) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const searches = db
    .prepare(`
      SELECT id, business_name, city, scan_mode, serper_calls_used, dataforseo_calls_used, confirmed_count, possible_count, duration_ms, status, created_at
      FROM searches
      WHERE client_id = ?
      ORDER BY id DESC
    `)
    .all(clientId);

  const dayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 24 * 3600 * 1000);
    const { dateKey } = formatDateInTz(dt.toISOString(), settings.timezone);
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, 0);
  }
  const hourCounts = new Array(24).fill(0);

  for (const s of searches) {
    const { dateKey, hour } = formatDateInTz(String(s.created_at), settings.timezone);
    if (dayMap.has(dateKey)) {
      dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1);
    }
    if (hour >= 0 && hour < 24) {
      hourCounts[hour]++;
    }
  }

  res.json({
    client: {
      id: Number(clientRow.id),
      userId: String(clientRow.user_id),
      name: String(clientRow.name),
      company: String(clientRow.company || ''),
      dailyLimit: Number(clientRow.daily_limit),
      monthlyLimit: Number(clientRow.monthly_limit),
      active: Number(clientRow.active) === 1,
    },
    searchesPerDay: Array.from(dayMap.entries()).map(([date, count]) => ({ date, count })),
    searchesByHour: hourCounts.map((count, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      count,
    })),
    searches: searches.map((s) => ({
      id: Number(s.id),
      businessName: String(s.business_name),
      city: String(s.city || ''),
      scanMode: String(s.scan_mode || 'quick'),
      serperCallsUsed: Number(s.serper_calls_used || 0),
      dataForSeoCallsUsed: Number(s.dataforseo_calls_used || 0),
      confirmedCount: Number(s.confirmed_count || 0),
      possibleCount: Number(s.possible_count || 0),
      durationMs: Number(s.duration_ms || 0),
      status: String(s.status),
      createdAt: String(s.created_at),
    })),
  });
});

// C) Search Logs / Queries
app.get('/api/admin/logs', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { clientId, dateFrom, dateTo, status, q } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (clientId && String(clientId) !== 'all') {
    conditions.push('s.client_id = ?');
    params.push(Number(clientId));
  }
  if (status && String(status) !== 'all') {
    conditions.push('s.status = ?');
    params.push(String(status));
  }
  if (dateFrom) {
    conditions.push('s.created_at >= ?');
    params.push(`${String(dateFrom)}T00:00:00.000Z`);
  }
  if (dateTo) {
    conditions.push('s.created_at <= ?');
    params.push(`${String(dateTo)}T23:59:59.999Z`);
  }
  if (q && String(q).trim()) {
    const likeTerm = `%${String(q).trim()}%`;
    conditions.push('(s.business_name LIKE ? OR s.city LIKE ? OR s.website LIKE ? OR u.name LIKE ?)');
    params.push(likeTerm, likeTerm, likeTerm, likeTerm);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(`
      SELECT s.*, u.name as client_name, u.user_id as client_user_id, u.company as client_company
      FROM searches s
      LEFT JOIN users u ON u.id = s.client_id
      ${whereSql}
      ORDER BY s.id DESC
      LIMIT 500
    `)
    .all(...params);

  res.json({
    logs: rows.map((r) => ({
      id: Number(r.id),
      clientId: Number(r.client_id),
      clientName: String(r.client_name || 'Unknown'),
      clientUserId: String(r.client_user_id || ''),
      clientCompany: String(r.client_company || ''),
      businessName: String(r.business_name),
      website: String(r.website || ''),
      phones: JSON.parse(String(r.phones || '[]')),
      address: String(r.address || ''),
      city: String(r.city || ''),
      country: String(r.country || ''),
      scanMode: String(r.scan_mode || 'quick'),
      deepVerify: Number(r.deep_verify) === 1,
      serperCallsUsed: Number(r.serper_calls_used || 0),
      dataForSeoCallsUsed: Number(r.dataforseo_calls_used || 0),
      confirmedCount: Number(r.confirmed_count || 0),
      possibleCount: Number(r.possible_count || 0),
      notFoundCount: Number(r.not_found_count || 0),
      napIssuesCount: Number(r.nap_issues_count || 0),
      durationMs: Number(r.duration_ms || 0),
      status: String(r.status),
      createdAt: String(r.created_at),
    })),
  });
});

// E) Admin Settings & Serper / DataForSEO Management
app.get('/api/admin/settings', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const settings = getServerSettings();
  const { startOfTodayIso } = getTimeBoundaries(settings.timezone);

  const totalCredits = Number(
    db.prepare('SELECT COALESCE(SUM(credits_used), 0) as total FROM serper_logs').get()?.total || 0
  );
  const creditsToday = Number(
    db.prepare('SELECT COALESCE(SUM(credits_used), 0) as total FROM serper_logs WHERE created_at >= ?').get(startOfTodayIso)?.total || 0
  );

  const totalDfsCalls = Number(
    db.prepare('SELECT COALESCE(SUM(calls_used), 0) as total FROM dataforseo_logs').get()?.total || 0
  );
  const dfsCallsToday = Number(
    db.prepare('SELECT COALESCE(SUM(calls_used), 0) as total FROM dataforseo_logs WHERE created_at >= ?').get(startOfTodayIso)?.total || 0
  );

  res.json({
    ...settings,
    totalCreditsUsed: totalCredits,
    creditsUsedToday: creditsToday,
    totalDataForSeoCallsUsed: totalDfsCalls,
    dataForSeoCallsToday: dfsCallsToday,
  });
});

app.put('/api/admin/settings', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const {
    serperApiKey,
    clearSerperApiKey,
    serperEnabled,
    dataForSeoLogin,
    dataForSeoPassword,
    clearDataForSeoCredentials,
    useDataForSeoBacklinks,
    defaultCountry,
    defaultLanguage,
    timezone,
    defaultScanMode,
    pagesPerQuery,
    maxCallsPerSearch,
  } = req.body || {};

  if (clearSerperApiKey) {
    updateSetting('serper_api_key_encrypted', '');
  } else if (typeof serperApiKey === 'string' && serperApiKey.trim().length > 0) {
    const encrypted = encryptSecret(serperApiKey.trim());
    updateSetting('serper_api_key_encrypted', encrypted);
  }

  if (serperEnabled !== undefined) {
    updateSetting('serper_enabled', serperEnabled ? '1' : '0');
  }

  if (clearDataForSeoCredentials) {
    updateSetting('dataforseo_login_encrypted', '');
    updateSetting('dataforseo_password_encrypted', '');
  } else {
    if (typeof dataForSeoLogin === 'string' && dataForSeoLogin.trim().length > 0) {
      updateSetting('dataforseo_login_encrypted', encryptSecret(dataForSeoLogin.trim()));
    }
    if (typeof dataForSeoPassword === 'string' && dataForSeoPassword.trim().length > 0) {
      updateSetting('dataforseo_password_encrypted', encryptSecret(dataForSeoPassword.trim()));
    }
  }

  if (useDataForSeoBacklinks !== undefined) {
    updateSetting('use_dataforseo_backlinks', useDataForSeoBacklinks ? '1' : '0');
  }

  if (defaultCountry !== undefined) {
    updateSetting('default_country', String(defaultCountry).trim().toLowerCase() || 'us');
  }
  if (defaultLanguage !== undefined) {
    updateSetting('default_language', String(defaultLanguage).trim().toLowerCase() || 'en');
  }
  if (timezone !== undefined) {
    updateSetting('timezone', String(timezone).trim() || 'Asia/Kolkata');
  }
  if (defaultScanMode !== undefined) {
    updateSetting('default_scan_mode', defaultScanMode === 'full' ? 'full' : 'quick');
  }
  if (pagesPerQuery !== undefined) {
    const p = Math.max(1, Math.min(5, parseInt(String(pagesPerQuery), 10) || 5));
    updateSetting('pages_per_query', String(p));
  }
  if (maxCallsPerSearch !== undefined) {
    const m = Math.max(5, Math.min(500, parseInt(String(maxCallsPerSearch), 10) || 200));
    updateSetting('max_calls_per_search', String(m));
  }

  const updated = getServerSettings();
  res.json(updated);
});

app.post('/api/admin/settings/test-dataforseo', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const resolved = getResolvedDataForSeoCredentials();
  const candidateLogin =
    typeof req.body?.login === 'string' && req.body.login.trim()
      ? req.body.login.trim()
      : resolved.login;
  const candidatePassword =
    typeof req.body?.password === 'string' && req.body.password.trim()
      ? req.body.password.trim()
      : resolved.password;

  if (!candidateLogin || !candidatePassword) {
    res.status(400).json({
      ok: false,
      error: 'Please enter both DataForSEO Login and Password/API key to test.',
    });
    return;
  }

  const basicAuth = Buffer.from(`${candidateLogin}:${candidatePassword}`, 'utf8').toString('base64');
  const startMs = Date.now();

  try {
    const testRes = await fetch('https://api.dataforseo.com/v3/backlinks/backlinks/live', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          target: 'dataforseo.com',
          mode: 'one_per_domain',
          limit: 1,
        },
      ]),
    });

    const latencyMs = Date.now() - startMs;
    let bodyJson: any = null;
    try {
      bodyJson = await testRes.json();
    } catch {
      bodyJson = null;
    }

    const task = bodyJson?.tasks?.[0];
    const statusCode = Number(task?.status_code || bodyJson?.status_code || testRes.status);
    const statusMsg = String(task?.status_message || bodyJson?.status_message || testRes.statusText || '');
    const isOk = testRes.ok && (statusCode === 20000 || !task?.status_code);

    db.prepare(`
      INSERT INTO dataforseo_logs (client_id, search_id, endpoint, target, calls_used, status_code, created_at)
      VALUES (?, NULL, 'test-credentials', 'dataforseo.com', ?, ?, ?)
    `).run(
      user.id,
      isOk ? 1 : 0,
      testRes.ok ? (statusCode === 20000 ? 200 : statusCode) : testRes.status,
      new Date().toISOString()
    );

    if (!isOk) {
      res.status(400).json({
        ok: false,
        error: `DataForSEO returned ${testRes.ok ? `Code ${statusCode}` : `HTTP ${testRes.status}`}: ${statusMsg || 'Invalid credentials or Backlinks API subscription inactive.'}`,
      });
      return;
    }

    res.json({
      ok: true,
      maskedLogin: maskLogin(candidateLogin),
      latencyMs,
      message: `DataForSEO Backlinks API verified (${latencyMs}ms response, HTTP Basic Auth OK).`,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'Network error while reaching https://api.dataforseo.com/v3/backlinks/backlinks/live.',
    });
  }
});

app.post('/api/admin/settings/test-key', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const candidateKey = typeof req.body?.apiKey === 'string' && req.body.apiKey.trim()
    ? req.body.apiKey.trim()
    : getResolvedSerperApiKey().key;

  if (!candidateKey) {
    res.status(400).json({ ok: false, error: 'No Serper.dev API key is configured to test.' });
    return;
  }

  const startMs = Date.now();
  try {
    const searchRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': candidateKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: 'Google Business Profile', num: 1, page: 1 }),
    });

    const latencyMs = Date.now() - startMs;

    // Log 1 credit in serper_logs
    db.prepare(`
      INSERT INTO serper_logs (client_id, search_id, endpoint, query, credits_used, status_code, created_at)
      VALUES (?, NULL, 'test-key', 'API Key Verification Test', 1, ?, ?)
    `).run(user.id, searchRes.status, new Date().toISOString());

    if (!searchRes.ok) {
      res.status(400).json({
        ok: false,
        error: `Serper.dev returned HTTP ${searchRes.status}. Please check that the API key is valid and has active credits.`,
      });
      return;
    }

    // Also try fetching account balance if Serper supports /account
    let remainingCredits: number | null = null;
    try {
      const acctRes = await fetch('https://google.serper.dev/account', {
        method: 'GET',
        headers: { 'X-API-KEY': candidateKey },
      });
      if (acctRes.ok) {
        const acctData = (await acctRes.json()) as { balance?: number; credit?: number; creditsLeft?: number };
        if (typeof acctData.balance === 'number') remainingCredits = acctData.balance;
        else if (typeof acctData.credit === 'number') remainingCredits = acctData.credit;
        else if (typeof acctData.creditsLeft === 'number') remainingCredits = acctData.creditsLeft;
      }
    } catch {
      // Optional account endpoint
    }

    res.json({
      ok: true,
      maskedKey: maskApiKey(candidateKey),
      latencyMs,
      remainingCredits,
      message: `Serper.dev API key verified (${latencyMs}ms response).`,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'Network error while reaching https://google.serper.dev/search.',
    });
  }
});

// Site Registry CRUD Routes
app.get('/api/admin/registry', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare('SELECT id, name, search_domain, category_group, create_url, enabled, created_at FROM site_registry ORDER BY category_group ASC, name ASC')
    .all();

  res.json({
    sites: rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      searchDomain: String(r.search_domain),
      group: String(r.category_group),
      createUrl: String(r.create_url || ''),
      enabled: Number(r.enabled) === 1,
      createdAt: String(r.created_at),
    })),
  });
});

app.post('/api/admin/registry', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, searchDomain, group, createUrl, enabled } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanDomain = String(searchDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
  const cleanGroup = String(group || 'General Directories & Citations').trim();
  const cleanCreateUrl = String(createUrl || `https://${cleanDomain}`).trim();

  if (!cleanName || !cleanDomain) {
    res.status(400).json({ error: 'Site Name and Search Domain are required.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM site_registry WHERE search_domain = ?').get(cleanDomain);
  if (existing) {
    res.status(400).json({ error: `Domain "${cleanDomain}" already exists in the Site Registry.` });
    return;
  }

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO site_registry (name, search_domain, category_group, create_url, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cleanName, cleanDomain, cleanGroup, cleanCreateUrl, enabled === false ? 0 : 1, now);

  res.json({
    site: {
      id: Number(result.lastInsertRowid),
      name: cleanName,
      searchDomain: cleanDomain,
      group: cleanGroup,
      createUrl: cleanCreateUrl,
      enabled: enabled !== false,
      createdAt: now,
    },
  });
});

app.put('/api/admin/registry/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const siteId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM site_registry WHERE id = ?').get(siteId);
  if (!existing) {
    res.status(404).json({ error: 'Registry site not found.' });
    return;
  }

  const { name, searchDomain, group, createUrl, enabled } = req.body || {};
  const cleanName = name !== undefined ? String(name).trim() : String(existing.name);
  const cleanDomain = searchDomain !== undefined
    ? String(searchDomain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
    : String(existing.search_domain);
  const cleanGroup = group !== undefined ? String(group).trim() : String(existing.category_group);
  const cleanCreateUrl = createUrl !== undefined ? String(createUrl).trim() : String(existing.create_url);
  const isEnabled = enabled !== undefined ? (enabled ? 1 : 0) : Number(existing.enabled);

  db.prepare(`
    UPDATE site_registry
    SET name = ?, search_domain = ?, category_group = ?, create_url = ?, enabled = ?
    WHERE id = ?
  `).run(cleanName, cleanDomain, cleanGroup, cleanCreateUrl, isEnabled, siteId);

  res.json({ ok: true });
});

app.delete('/api/admin/registry/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const siteId = Number(req.params.id);
  db.prepare('DELETE FROM site_registry WHERE id = ?').run(siteId);
  res.json({ ok: true });
});

// =========================================================
// VITE DEV SERVER / STATIC PRODUCTION SERVING
// =========================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Citation & Listing Discovery Platform running at http://localhost:${PORT}`);
  });
}

startServer();
