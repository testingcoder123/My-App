import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit3,
  Trash2,
  Power,
  Search,
  ExternalLink,
  Server,
  Globe,
  Link2,
  X,
} from 'lucide-react';
import { AdminSettingsData, RegistrySite } from '../types.ts';
import { apiFetch } from '../utils/api.ts';

interface AdminSettingsProps {
  onSettingsUpdated: (newTimezone: string) => void;
}

const REGISTRY_CATEGORIES = [
  'Business & Maps',
  'Reviews & Reputation',
  'B2B / Software / Agency',
  'Social',
  'Q&A / Forums / Dev',
  'General Directories & Citations',
  'Classifieds',
  'India-Specific',
  'Company Databases',
  'Startup / Product / AI Directories',
  'Content Publishing',
  'Video & Podcast',
  'Press Release',
  'Journalist / Earned Media',
  'Industry-Specific',
  'Wikis & Knowledge Graph',
];

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onSettingsUpdated }) => {
  const [activeSubTab, setActiveSubTab] = useState<'engine' | 'registry' | 'deployment'>('engine');
  const [settings, setSettings] = useState<AdminSettingsData | null>(null);
  const [sites, setSites] = useState<RegistrySite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Engine Config Form State
  const [newSerperKey, setNewSerperKey] = useState('');
  const [serperEnabled, setSerperEnabled] = useState(true);
  const [newDataForSeoLogin, setNewDataForSeoLogin] = useState('');
  const [newDataForSeoPassword, setNewDataForSeoPassword] = useState('');
  const [useDataForSeoBacklinks, setUseDataForSeoBacklinks] = useState(false);
  const [defaultCountry, setDefaultCountry] = useState('us');
  const [defaultLanguage, setDefaultLanguage] = useState('en');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [defaultScanMode, setDefaultScanMode] = useState<'quick' | 'full'>('full');
  const [pagesPerQuery, setPagesPerQuery] = useState(5);
  const [maxCallsPerSearch, setMaxCallsPerSearch] = useState(200);
  const [savingSettings, setSavingSettings] = useState(false);

  // Test Serper Key State
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    remainingCredits?: number | null;
    latencyMs?: number;
  } | null>(null);

  // Test DataForSEO Credentials State
  const [testingDfs, setTestingDfs] = useState(false);
  const [dfsTestResult, setDfsTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Site Registry Filter & Modal State
  const [regGroupFilter, setRegGroupFilter] = useState('all');
  const [regStatusFilter, setRegStatusFilter] = useState('all');
  const [regSearch, setRegSearch] = useState('');
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editingSite, setEditingSite] = useState<RegistrySite | null>(null);
  const [siteName, setSiteName] = useState('');
  const [siteDomain, setSiteDomain] = useState('');
  const [siteGroup, setSiteGroup] = useState(REGISTRY_CATEGORIES[0]);
  const [siteCreateUrl, setSiteCreateUrl] = useState('');
  const [siteEnabled, setSiteEnabled] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [sData, rData] = await Promise.all([
        apiFetch<AdminSettingsData>('/api/admin/settings'),
        apiFetch<{ sites: RegistrySite[] }>('/api/admin/registry'),
      ]);
      setSettings(sData);
      setSerperEnabled(sData.serperEnabled !== false);
      setUseDataForSeoBacklinks(Boolean(sData.useDataForSeoBacklinks));
      setDefaultCountry(sData.defaultCountry);
      setDefaultLanguage(sData.defaultLanguage);
      setTimezone(sData.timezone);
      setDefaultScanMode(sData.defaultScanMode);
      setPagesPerQuery(sData.pagesPerQuery);
      setMaxCallsPerSearch(sData.maxCallsPerSearch);
      setSites(rData.sites || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    setSuccessMsg('');
    try {
      const updated = await apiFetch<AdminSettingsData>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          serperApiKey: newSerperKey.trim() || undefined,
          serperEnabled,
          dataForSeoLogin: newDataForSeoLogin.trim() || undefined,
          dataForSeoPassword: newDataForSeoPassword.trim() || undefined,
          useDataForSeoBacklinks,
          defaultCountry,
          defaultLanguage,
          timezone,
          defaultScanMode,
          pagesPerQuery,
          maxCallsPerSearch,
        }),
      });
      setSettings((prev) => (prev ? { ...prev, ...updated } : updated));
      setNewSerperKey('');
      setNewDataForSeoLogin('');
      setNewDataForSeoPassword('');
      onSettingsUpdated(updated.timezone);
      setSuccessMsg('Platform settings and provider credentials saved & encrypted on the server.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestKey = async () => {
    setTestingKey(true);
    setTestResult(null);
    setError('');
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
        remainingCredits?: number | null;
        latencyMs?: number;
      }>('/api/admin/settings/test-key', {
        method: 'POST',
        body: JSON.stringify({
          apiKey: newSerperKey.trim() || undefined,
        }),
      });
      setTestResult(res);
      loadAll();
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Key verification failed.',
      });
    } finally {
      setTestingKey(false);
    }
  };

  const handleTestDataForSeo = async () => {
    setTestingDfs(true);
    setDfsTestResult(null);
    setError('');
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
        latencyMs?: number;
      }>('/api/admin/settings/test-dataforseo', {
        method: 'POST',
        body: JSON.stringify({
          login: newDataForSeoLogin.trim() || undefined,
          password: newDataForSeoPassword.trim() || undefined,
        }),
      });
      setDfsTestResult(res);
      loadAll();
    } catch (err) {
      setDfsTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'DataForSEO verification failed.',
      });
    } finally {
      setTestingDfs(false);
    }
  };

  const openAddSiteModal = () => {
    setEditingSite(null);
    setSiteName('');
    setSiteDomain('');
    setSiteGroup(REGISTRY_CATEGORIES[0]);
    setSiteCreateUrl('');
    setSiteEnabled(true);
    setShowSiteModal(true);
  };

  const openEditSiteModal = (s: RegistrySite) => {
    setEditingSite(s);
    setSiteName(s.name);
    setSiteDomain(s.searchDomain);
    setSiteGroup(s.group);
    setSiteCreateUrl(s.createUrl);
    setSiteEnabled(s.enabled);
    setShowSiteModal(true);
  };

  const handleSaveSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingSite) {
        await apiFetch(`/api/admin/registry/${editingSite.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: siteName,
            searchDomain: siteDomain,
            group: siteGroup,
            createUrl: siteCreateUrl,
            enabled: siteEnabled,
          }),
        });
      } else {
        await apiFetch('/api/admin/registry', {
          method: 'POST',
          body: JSON.stringify({
            name: siteName,
            searchDomain: siteDomain,
            group: siteGroup,
            createUrl: siteCreateUrl,
            enabled: siteEnabled,
          }),
        });
      }
      setShowSiteModal(false);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save registry site.');
    }
  };

  const handleToggleSiteEnabled = async (s: RegistrySite) => {
    try {
      await apiFetch(`/api/admin/registry/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      setSites((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, enabled: !s.enabled } : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update site.');
    }
  };

  const handleDeleteSite = async (s: RegistrySite) => {
    try {
      await apiFetch(`/api/admin/registry/${s.id}`, { method: 'DELETE' });
      setSites((prev) => prev.filter((item) => item.id !== s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete site.');
    }
  };

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      if (regGroupFilter !== 'all' && s.group !== regGroupFilter) return false;
      if (regStatusFilter === 'enabled' && !s.enabled) return false;
      if (regStatusFilter === 'disabled' && s.enabled) return false;
      if (regSearch.trim()) {
        const q = regSearch.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.searchDomain.toLowerCase().includes(q) ||
          s.group.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sites, regGroupFilter, regStatusFilter, regSearch]);

  if (loading && !settings) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading settings & site registry...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Settings & Site Registry</h1>
          <p className="text-xs text-slate-500">
            Configure server-side Serper.dev and DataForSEO discovery providers, search defaults, and the 200+ directory registry.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setActiveSubTab('engine')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeSubTab === 'engine'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Discovery Sources & Defaults
          </button>
          <button
            onClick={() => setActiveSubTab('registry')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeSubTab === 'registry'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Site Registry Editor ({sites.length})
          </button>
          <button
            onClick={() => setActiveSubTab('deployment')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeSubTab === 'deployment'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Public URL & Deployment Guide
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* SUB-TAB 1: DISCOVERY SOURCES (SERPER + DATAFORSEO) & GLOBAL DEFAULTS */}
      {activeSubTab === 'engine' && settings && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* SOURCE 1: Serper.dev Key Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Source 1: Serper.dev Web Search & Deep Scrape
                  </h2>
                  <p className="text-xs text-slate-500">
                    Encrypted with AES-256-GCM in SQLite. Never exposed to browser clients or API responses.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serperEnabled}
                    onChange={(e) => setSerperEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900"
                  />
                  <span>Enable Serper Search</span>
                </label>

                <div className="text-right font-mono tabular-nums text-xs border-l border-slate-200 pl-4">
                  <div className="text-slate-500">
                    Total Serper Credits:{' '}
                    <strong className="text-slate-900">{settings.totalCreditsUsed.toLocaleString()}</strong>
                  </div>
                  <div className="text-slate-400">
                    Used Today: <strong className="text-emerald-700">{settings.creditsUsedToday}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Current Active Key Status
                </label>
                <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                  {settings.serperKeyConfigured ? (
                    <>
                      <span className="font-mono font-semibold text-slate-900">
                        {settings.serperKeyMasked}
                      </span>
                      <span className="text-emerald-700 font-medium">
                        {settings.serperKeySource === 'db' ? 'Saved in DB' : 'From ENV'}
                      </span>
                    </>
                  ) : (
                    <span className="text-red-600 font-medium">Not Configured</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-5">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Enter New / Updated Serper.dev API Key
                </label>
                <input
                  type="password"
                  value={newSerperKey}
                  onChange={(e) => setNewSerperKey(e.target.value)}
                  placeholder="Paste Serper.dev API key to save or replace..."
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestKey}
                  disabled={testingKey}
                  className="flex-1 py-2.5 px-3 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {testingKey ? 'Testing...' : 'Test Key'}
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 py-2.5 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Save Key
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
                  testResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                {testResult.remainingCredits !== null && testResult.remainingCredits !== undefined && (
                  <span className="font-mono tabular-nums font-semibold">
                    Remaining Account Credits: {testResult.remainingCredits.toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* SOURCE 2: DataForSEO Backlinks Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <Link2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Source 2: DataForSEO Backlinks API
                  </h2>
                  <p className="text-xs text-slate-500">
                    Queries live referring domains (<code>/v3/backlinks/backlinks/live</code>) via HTTP Basic Auth and merges with Serper results.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDataForSeoBacklinks}
                    onChange={(e) => setUseDataForSeoBacklinks(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900"
                  />
                  <span>Use DataForSEO Backlinks</span>
                </label>

                <div className="text-right font-mono tabular-nums text-xs border-l border-slate-200 pl-4">
                  <div className="text-slate-500">
                    Total DataForSEO Calls:{' '}
                    <strong className="text-slate-900">
                      {(settings.totalDataForSeoCallsUsed || 0).toLocaleString()}
                    </strong>
                  </div>
                  <div className="text-slate-400">
                    Calls Today:{' '}
                    <strong className="text-emerald-700">{settings.dataForSeoCallsToday || 0}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Active Credentials Status
                </label>
                <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                  {settings.dataForSeoConfigured ? (
                    <>
                      <span className="font-mono font-semibold text-slate-900 truncate" title={settings.dataForSeoLoginMasked}>
                        {settings.dataForSeoLoginMasked} ({settings.dataForSeoPasswordMasked})
                      </span>
                      <span className="text-emerald-700 font-medium shrink-0 ml-1">
                        {settings.dataForSeoSource === 'db' ? 'Saved' : 'ENV'}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-500 font-medium">Not Configured</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  DataForSEO Login
                </label>
                <input
                  type="text"
                  value={newDataForSeoLogin}
                  onChange={(e) => setNewDataForSeoLogin(e.target.value)}
                  placeholder="API login / email..."
                  autoComplete="off"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  DataForSEO API Password
                </label>
                <input
                  type="password"
                  value={newDataForSeoPassword}
                  onChange={(e) => setNewDataForSeoPassword(e.target.value)}
                  placeholder="API password (masked)..."
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestDataForSeo}
                  disabled={testingDfs}
                  className="flex-1 py-2.5 px-3 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {testingDfs ? 'Testing...' : 'Test'}
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 py-2.5 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            {dfsTestResult && (
              <div
                className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
                  dfsTestResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {dfsTestResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{dfsTestResult.message}</span>
                </div>
              </div>
            )}
          </div>

          {/* Global Search Engine Parameters */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-base font-semibold text-slate-900">
                Global Search Engine & Timezone Configuration
              </h2>
              <p className="text-xs text-slate-500">
                Controls default geolocation (gl), language (hl), display timezone, pagination depth, and shared per-search API call caps.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Default Country Code (gl)
                </label>
                <select
                  value={defaultCountry}
                  onChange={(e) => setDefaultCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  <option value="us">United States (us)</option>
                  <option value="gb">United Kingdom (gb)</option>
                  <option value="ca">Canada (ca)</option>
                  <option value="au">Australia (au)</option>
                  <option value="in">India (in)</option>
                  <option value="ae">United Arab Emirates (ae)</option>
                  <option value="sg">Singapore (sg)</option>
                  <option value="de">Germany (de)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Default Language Code (hl)
                </label>
                <select
                  value={defaultLanguage}
                  onChange={(e) => setDefaultLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  <option value="en">English (en)</option>
                  <option value="hi">Hindi (hi)</option>
                  <option value="es">Spanish (es)</option>
                  <option value="fr">French (fr)</option>
                  <option value="de">German (de)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Display Timezone (UTC stored in DB)
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Default Scan Mode
                </label>
                <select
                  value={defaultScanMode}
                  onChange={(e) => setDefaultScanMode(e.target.value === 'full' ? 'full' : 'quick')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  <option value="quick">Quick Scan</option>
                  <option value="full">Full Discovery Scan</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Pages per Query (Phase 1 Full Mode)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={pagesPerQuery}
                  onChange={(e) => setPagesPerQuery(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Max Calls Allowed per Single Search (Serper + DataForSEO)
                </label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={maxCallsPerSearch}
                  onChange={(e) => setMaxCallsPerSearch(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                {savingSettings ? 'Saving Configuration...' : 'Save Global Settings'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* SUB-TAB 2: SITE REGISTRY EDITOR */}
      {activeSubTab === 'registry' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={regGroupFilter}
                onChange={(e) => setRegGroupFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
              >
                <option value="all">All Groups ({REGISTRY_CATEGORIES.length})</option>
                {REGISTRY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={regStatusFilter}
                onChange={(e) => setRegStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
              >
                <option value="all">All States</option>
                <option value="enabled">Enabled Only</option>
                <option value="disabled">Disabled Only</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={regSearch}
                  onChange={(e) => setRegSearch(e.target.value)}
                  placeholder="Search directory or domain..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
            </div>

            <button
              onClick={openAddSiteModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Directory Site</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-3 px-4">Site Name</th>
                    <th className="py-3 px-4">Search Domain (site:)</th>
                    <th className="py-3 px-4">Category Group</th>
                    <th className="py-3 px-4">Create Listing URL</th>
                    <th className="py-3 px-4">State</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredSites.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-medium text-slate-900">{s.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{s.searchDomain}</td>
                      <td className="py-3 px-4 text-slate-600">{s.group}</td>
                      <td className="py-3 px-4 max-w-xs">
                        {s.createUrl ? (
                          <a
                            href={s.createUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-mono truncate max-w-[220px]"
                          >
                            <span className="truncate">{s.createUrl}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            s.enabled ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {s.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditSiteModal(s)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                            title="Edit Site"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleSiteEnabled(s)}
                            className={`p-1.5 rounded-md cursor-pointer ${
                              s.enabled
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={s.enabled ? 'Disable Site' : 'Enable Site'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSite(s)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                            title="Delete Site"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PUBLIC DEPLOYMENT & ACCESS INSTRUCTIONS */}
      {activeSubTab === 'deployment' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Deploying & Sharing With Clients via Public URL
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Follow these steps to publish your Citation & Listing Discovery Platform so clients can sign in from anywhere.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Server className="w-4 h-4 text-emerald-600" />
                <span>01. Configure Serper & DataForSEO</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Save your Serper.dev API key and optional DataForSEO Login/Password in the <strong>Discovery Sources & Defaults</strong> tab above. All credentials are encrypted at rest on the server and never sent to client browsers.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span>02. Deploy to Cloud Run / VPS</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Click the <strong>Deploy / Share</strong> button in the top bar to publish to a public Cloud Run URL, or run <code>npm run build && npm run start</code> on any Node 22+ host (Render, Railway, Fly.io, DigitalOcean, or AWS).
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>03. Share Client Credentials</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                In the <strong>Clients</strong> tab, click <strong>Add Client Account</strong>, copy the one-time generated User ID and password, and send them to your client along with your public app URL.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-900 text-slate-200 rounded-lg font-mono text-xs space-y-1.5">
            <div className="text-slate-400 font-sans font-medium">Current Public / Origin URL:</div>
            <div className="text-emerald-400 select-all">{window.location.origin}</div>
          </div>
        </div>
      )}

      {/* ADD / EDIT REGISTRY SITE MODAL */}
      {showSiteModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {editingSite ? 'Edit Registry Site' : 'Add Site to Registry'}
              </h3>
              <button
                onClick={() => setShowSiteModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Directory / Platform Name
                </label>
                <input
                  type="text"
                  required
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="e.g. Trustpilot"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Public Search Domain (used for site: queries)
                </label>
                <input
                  type="text"
                  required
                  value={siteDomain}
                  onChange={(e) => setSiteDomain(e.target.value)}
                  placeholder="e.g. trustpilot.com"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Category Group
                </label>
                <select
                  value={siteGroup}
                  onChange={(e) => setSiteGroup(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  {REGISTRY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Listing Creation / Claim URL
                </label>
                <input
                  type="text"
                  value={siteCreateUrl}
                  onChange={(e) => setSiteCreateUrl(e.target.value)}
                  placeholder="https://business.trustpilot.com/signup"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={siteEnabled}
                  onChange={(e) => setSiteEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span>Enabled in Phase 2 Registry Checks</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSiteModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  {editingSite ? 'Update Site' : 'Add Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
