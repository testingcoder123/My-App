import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { getSeededSiteRegistry } from './seedRegistry.ts';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (filename: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      get(...params: unknown[]): Record<string, any> | undefined;
      all(...params: unknown[]): Array<Record<string, any>>;
    };
  };
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'citation_platform.db');
export const db = new DatabaseSync(DB_PATH);

// Encryption key derived from JWT_SECRET or server secret
const ENCRYPTION_SECRET = process.env.JWT_SECRET || 'citation-discovery-platform-server-secret-2026';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Failed to decrypt secret:', err);
    return '';
  }
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 6) {
    return '****' + trimmed.slice(-2);
  }
  return `sk-****${trimmed.slice(-4)}`;
}

export function maskLogin(login: string): string {
  if (!login) return '';
  const trimmed = login.trim();
  if (trimmed.includes('@')) {
    const [userPart, domainPart] = trimmed.split('@');
    const prefix = userPart.slice(0, Math.min(2, userPart.length));
    return `${prefix}***@${domainPart}`;
  }
  if (trimmed.length <= 4) {
    return `${trimmed[0] || '*'}***`;
  }
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
}

export function initDatabase(): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'CLIENT')),
      name TEXT NOT NULL,
      company TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      daily_limit INTEGER DEFAULT 15,
      monthly_limit INTEGER DEFAULT 200,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      last_login TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      search_domain TEXT UNIQUE NOT NULL,
      category_group TEXT NOT NULL,
      create_url TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      business_name TEXT NOT NULL,
      alternate_names TEXT DEFAULT '[]',
      website TEXT DEFAULT '',
      gbp_url TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      country TEXT DEFAULT '',
      phones TEXT DEFAULT '[]',
      industry TEXT DEFAULT '',
      scan_mode TEXT DEFAULT 'quick',
      deep_verify INTEGER DEFAULT 0,
      serper_calls_used INTEGER DEFAULT 0,
      dataforseo_calls_used INTEGER DEFAULT 0,
      confirmed_count INTEGER DEFAULT 0,
      possible_count INTEGER DEFAULT 0,
      not_found_count INTEGER DEFAULT 0,
      nap_issues_count INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      progress_percent INTEGER DEFAULT 0,
      progress_message TEXT DEFAULT 'Initializing...',
      error_message TEXT DEFAULT '',
      cache_key TEXT DEFAULT '',
      results_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      completed_at TEXT DEFAULT NULL,
      FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS serper_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      search_id INTEGER DEFAULT NULL,
      endpoint TEXT NOT NULL,
      query TEXT NOT NULL,
      credits_used INTEGER DEFAULT 1,
      status_code INTEGER DEFAULT 200,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dataforseo_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      search_id INTEGER DEFAULT NULL,
      endpoint TEXT NOT NULL,
      target TEXT NOT NULL,
      calls_used INTEGER DEFAULT 1,
      status_code INTEGER DEFAULT 200,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS distinctive_tokens_cache (
      cache_key TEXT PRIMARY KEY,
      tokens_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_searches_client_id ON searches(client_id);
    CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches(created_at);
    CREATE INDEX IF NOT EXISTS idx_searches_cache_key ON searches(cache_key);
    CREATE INDEX IF NOT EXISTS idx_serper_logs_created_at ON serper_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_serper_logs_client_id ON serper_logs(client_id);
    CREATE INDEX IF NOT EXISTS idx_dataforseo_logs_created_at ON dataforseo_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_dataforseo_logs_client_id ON dataforseo_logs(client_id);
  `);

  // Safe migration for existing databases that were created before dataforseo_calls_used existed
  try {
    db.exec('ALTER TABLE searches ADD COLUMN dataforseo_calls_used INTEGER DEFAULT 0;');
  } catch {
    // Column already exists
  }

  // Seed default settings if not present
  const now = new Date().toISOString();
  const defaultSettings: Record<string, string> = {
    serper_api_key_encrypted: '',
    serper_enabled: '1',
    dataforseo_login_encrypted: '',
    dataforseo_password_encrypted: '',
    use_dataforseo_backlinks: '0',
    default_country: 'us',
    default_language: 'en',
    timezone: 'Asia/Kolkata',
    default_scan_mode: 'full',
    pages_per_query: '5',
    max_calls_per_search: '200',
  };

  const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSettingStmt = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');

  for (const [key, val] of Object.entries(defaultSettings)) {
    const existing = getSettingStmt.get(key);
    if (!existing) {
      insertSettingStmt.run(key, val, now);
    }
  }

  // Ensure Use DataForSEO Backlinks is OFF by default unless explicitly configured
  const dfsDefaultOffMigration = getSettingStmt.get('dfs_default_off_v2');
  if (!dfsDefaultOffMigration) {
    const dfsLoginRow = getSettingStmt.get('dataforseo_login_encrypted');
    if (!dfsLoginRow || !dfsLoginRow.value) {
      db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run('0', now, 'use_dataforseo_backlinks');
    }
    insertSettingStmt.run('dfs_default_off_v2', '1', now);
  }

  // Migrate legacy default_country='in' or low max_calls_per_search
  const countryRow = getSettingStmt.get('default_country');
  if (countryRow && String(countryRow.value) === 'in') {
    db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run('us', now, 'default_country');
  }
  const maxCallsRow = getSettingStmt.get('max_calls_per_search');
  if (maxCallsRow && Number(maxCallsRow.value) < 150) {
    db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run('200', now, 'max_calls_per_search');
  }
  const pagesRow = getSettingStmt.get('pages_per_query');
  if (pagesRow && Number(pagesRow.value) < 5) {
    db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run('5', now, 'pages_per_query');
  }

  // Seed Site Registry if empty
  const registryCountRow = db.prepare('SELECT COUNT(*) as cnt FROM site_registry').get();
  const registryCount = Number(registryCountRow?.cnt || 0);
  if (registryCount === 0) {
    const seedSites = getSeededSiteRegistry();
    const insertSite = db.prepare(`
      INSERT OR IGNORE INTO site_registry (name, search_domain, category_group, create_url, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const site of seedSites) {
      insertSite.run(
        site.name,
        site.searchDomain,
        site.group,
        site.createUrl,
        site.enabled ? 1 : 0,
        now
      );
    }
  }
}

export interface ServerSettings {
  defaultCountry: string;
  defaultLanguage: string;
  timezone: string;
  defaultScanMode: 'quick' | 'full';
  pagesPerQuery: number;
  maxCallsPerSearch: number;
  serperEnabled: boolean;
  serperKeyConfigured: boolean;
  serperKeySource: 'db' | 'env' | 'none';
  serperKeyMasked: string;
  useDataForSeoBacklinks: boolean;
  dataForSeoConfigured: boolean;
  dataForSeoSource: 'db' | 'env' | 'none';
  dataForSeoLoginMasked: string;
  dataForSeoPasswordMasked: string;
}

export function getResolvedSerperApiKey(): { key: string; source: 'db' | 'env' | 'none' } {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('serper_api_key_encrypted');
  if (row && row.value) {
    const decrypted = decryptSecret(String(row.value));
    if (decrypted && decrypted.trim().length > 0) {
      return { key: decrypted.trim(), source: 'db' };
    }
  }
  const envKey = process.env.SERPER_API_KEY;
  if (envKey && envKey.trim().length > 0 && envKey !== 'MY_SERPER_API_KEY') {
    return { key: envKey.trim(), source: 'env' };
  }
  return { key: '', source: 'none' };
}

export function getResolvedDataForSeoCredentials(): {
  login: string;
  password: string;
  source: 'db' | 'env' | 'none';
} {
  const loginRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('dataforseo_login_encrypted');
  const passRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('dataforseo_password_encrypted');

  const dbLogin = loginRow && loginRow.value ? decryptSecret(String(loginRow.value)).trim() : '';
  const dbPass = passRow && passRow.value ? decryptSecret(String(passRow.value)).trim() : '';

  if (dbLogin && dbPass) {
    return { login: dbLogin, password: dbPass, source: 'db' };
  }

  const envLogin = (process.env.DATAFORSEO_LOGIN || '').trim();
  const envPass = (process.env.DATAFORSEO_PASSWORD || '').trim();
  if (envLogin && envPass) {
    return { login: envLogin, password: envPass, source: 'env' };
  }

  return { login: dbLogin || envLogin, password: '', source: 'none' };
}

export function getServerSettings(): ServerSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[String(r.key)] = String(r.value);
  }

  const resolvedSerper = getResolvedSerperApiKey();
  const resolvedDfs = getResolvedDataForSeoCredentials();

  return {
    defaultCountry: map.default_country || 'us',
    defaultLanguage: map.default_language || 'en',
    timezone: map.timezone || 'Asia/Kolkata',
    defaultScanMode: map.default_scan_mode === 'full' ? 'full' : 'quick',
    pagesPerQuery: Math.max(1, Math.min(5, parseInt(map.pages_per_query || '5', 10) || 5)),
    maxCallsPerSearch: Math.max(5, Math.min(500, parseInt(map.max_calls_per_search || '200', 10) || 200)),
    serperEnabled: map.serper_enabled !== '0',
    serperKeyConfigured: resolvedSerper.source !== 'none',
    serperKeySource: resolvedSerper.source,
    serperKeyMasked: resolvedSerper.key ? maskApiKey(resolvedSerper.key) : '',
    useDataForSeoBacklinks: map.use_dataforseo_backlinks === '1',
    dataForSeoConfigured: resolvedDfs.source !== 'none',
    dataForSeoSource: resolvedDfs.source,
    dataForSeoLoginMasked: resolvedDfs.login ? maskLogin(resolvedDfs.login) : '',
    dataForSeoPasswordMasked: resolvedDfs.password ? maskApiKey(resolvedDfs.password) : '',
  };
}

export function updateSetting(key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}
