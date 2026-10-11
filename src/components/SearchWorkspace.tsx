import React, { useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  History,
  Download,
  Eye,
  Play,
  FileText,
} from 'lucide-react';
import { AuthUser, SearchRecord } from '../types.ts';
import { apiFetch, downloadCsv, formatDateTime } from '../utils/api.ts';
import { ResultsViewer } from './ResultsViewer.tsx';

interface SearchWorkspaceProps {
  user: AuthUser;
  timezone: string;
  initialSearchId?: number | null;
  onClearInitialSearchId?: () => void;
}

interface QuotaInfo {
  dailyLimit: number;
  monthlyLimit: number;
  searchesToday: number;
  searchesThisMonth: number;
  totalSearches: number;
  remainingDaily: number;
  remainingMonthly: number;
  serperConfigured: boolean;
  timezone: string;
  defaultCountry: string;
  defaultScanMode: 'quick' | 'full';
}

export const SearchWorkspace: React.FC<SearchWorkspaceProps> = ({
  user,
  timezone,
  initialSearchId,
  onClearInitialSearchId,
}) => {
  const [subView, setSubView] = useState<'form' | 'history' | 'result'>('form');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [mySearches, setMySearches] = useState<SearchRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form fields (Section 3)
  const [businessName, setBusinessName] = useState('');
  const [alternateNamesInput, setAlternateNamesInput] = useState('');
  const [website, setWebsite] = useState('');
  const [gbpUrl, setGbpUrl] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('us');
  const [countryManuallySet, setCountryManuallySet] = useState(false);
  const [phones, setPhones] = useState<string[]>(['']);
  const [industry, setIndustry] = useState('');
  const [scanMode, setScanMode] = useState<'quick' | 'full'>('full');
  const [deepVerify, setDeepVerify] = useState(true);
  const [bypassCache, setBypassCache] = useState(false);
  const [benchmarkUrlsInput, setBenchmarkUrlsInput] = useState('');

  // Auto-detect country and state from business address
  useEffect(() => {
    if (!address.trim()) return;
    const lower = address.toLowerCase();

    // Auto-detect US state if not manually typed
    const usStates: Record<string, string> = {
      AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
      CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
      HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
      KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
      MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
      MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
      NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
      OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
      SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
      VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
      DC: 'District of Columbia',
    };

    const stateMatch = address.match(/(?:,\s*|\b)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?|\s*,|\s*$)/);
    if (stateMatch && usStates[stateMatch[1]]) {
      setState(usStates[stateMatch[1]]);
      if (!countryManuallySet) setCountry('us');
      return;
    }

    if (!countryManuallySet) {
      if (/\b(united states|usa|u\.s\.a\.|u\.s\.)\b/i.test(address) || /\b\d{5}(?:-\d{4})?\b/.test(address)) {
        setCountry('us');
      } else if (/\b(united kingdom|uk|england|scotland|wales|london)\b/i.test(lower)) {
        setCountry('gb');
      } else if (/\b(canada|ontario|quebec|british columbia|alberta)\b/i.test(lower)) {
        setCountry('ca');
      } else if (/\b(australia|sydney|melbourne|queensland|victoria)\b/i.test(lower)) {
        setCountry('au');
      } else if (/\b(united arab emirates|uae|dubai|abu dhabi)\b/i.test(lower)) {
        setCountry('ae');
      } else if (/\b(india|mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|kolkata|pune)\b/i.test(lower)) {
        setCountry('in');
      }
    }
  }, [address, countryManuallySet]);

  // Active scan state
  const [activeSearch, setActiveSearch] = useState<SearchRecord | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadQuotaAndHistory = async () => {
    try {
      const [qData, sData] = await Promise.all([
        apiFetch<QuotaInfo>('/api/client/quota'),
        apiFetch<{ searches: SearchRecord[] }>('/api/searches'),
      ]);
      setQuota(qData);
      setMySearches(sData.searches || []);
      if (!country && qData.defaultCountry) {
        setCountry(qData.defaultCountry);
      }
    } catch (err) {
      console.error('Failed to load quota/history:', err);
    }
  };

  useEffect(() => {
    loadQuotaAndHistory();
  }, []);

  useEffect(() => {
    if (initialSearchId) {
      openSavedSearch(initialSearchId);
      if (onClearInitialSearchId) onClearInitialSearchId();
    }
  }, [initialSearchId]);

  // Poll active running search
  useEffect(() => {
    if (!activeSearch || activeSearch.status !== 'running') return;

    const timer = setInterval(async () => {
      try {
        const updated = await apiFetch<SearchRecord>(`/api/searches/${activeSearch.id}`);
        setActiveSearch(updated);
        if (updated.status !== 'running') {
          clearInterval(timer);
          setSubmitting(false);
          loadQuotaAndHistory();
          if (updated.status === 'completed' || updated.status === 'cached') {
            setSubView('result');
          } else if (updated.status === 'failed') {
            setFormError(updated.errorMessage || 'Search failed.');
          }
        }
      } catch (err) {
        console.error('Error polling search progress:', err);
      }
    }, 750);

    return () => clearInterval(timer);
  }, [activeSearch]);

  const openSavedSearch = async (id: number) => {
    setLoadingHistory(true);
    setFormError('');
    try {
      const fullRecord = await apiFetch<SearchRecord>(`/api/searches/${id}`);
      setActiveSearch(fullRecord);
      setSubView('result');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not load search result.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePhoneChange = (idx: number, val: string) => {
    const next = [...phones];
    next[idx] = val;
    setPhones(next);
  };

  const addPhoneField = () => {
    setPhones([...phones, '']);
  };

  const removePhoneField = (idx: number) => {
    if (phones.length <= 1) {
      setPhones(['']);
      return;
    }
    setPhones(phones.filter((_, i) => i !== idx));
  };

  const fillDemoSample = () => {
    setBusinessName('Intelligent Garage Door & Gate Repair');
    setAlternateNamesInput('Intelligent Garage Doors');
    setWebsite('https://intelligentgaragedoors.com/');
    setGbpUrl('');
    setAddress('23046 Avenida De La Carlota #600, Laguna Hills, CA 92653, United States');
    setCity('Laguna Hills');
    setState('California');
    setCountry('us');
    setPhones(['+18889912471']);
    setIndustry('Garage door supplier');
    setScanMode('full');
    setDeepVerify(true);
  };

  const handleRunSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (quota && !quota.serperConfigured) {
      setFormError('Search is not configured. Please contact your admin.');
      return;
    }

    if (user.role === 'CLIENT' && quota) {
      if (quota.remainingDaily <= 0) {
        setFormError(
          `Daily search limit reached (${quota.searchesToday}/${quota.dailyLimit}). Your limit resets tomorrow.`
        );
        return;
      }
      if (quota.remainingMonthly <= 0) {
        setFormError(
          `Monthly search limit reached (${quota.searchesThisMonth}/${quota.monthlyLimit}). Please contact your admin.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const cleanPhones = phones.map((p) => p.trim()).filter(Boolean);
      const cleanAlts = alternateNamesInput
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const startRes = await apiFetch<{ searchId: number; cached: boolean }>('/api/searches/start', {
        method: 'POST',
        body: JSON.stringify({
          businessName: businessName.trim(),
          alternateNames: cleanAlts,
          website: website.trim(),
          gbpUrl: gbpUrl.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          country: country.trim(),
          phones: cleanPhones,
          industry: industry.trim(),
          scanMode,
          deepVerify,
          bypassCache,
          benchmarkUrls:
            user.role === 'ADMIN'
              ? benchmarkUrlsInput
                  .split(/[\r\n,]+/)
                  .map((u) => u.trim())
                  .filter(Boolean)
              : undefined,
        }),
      });

      const initialRec = await apiFetch<SearchRecord>(`/api/searches/${startRes.searchId}`);
      setActiveSearch(initialRec);

      if (initialRec.status === 'completed' || initialRec.status === 'cached') {
        setSubmitting(false);
        loadQuotaAndHistory();
        setSubView('result');
      }
    } catch (err) {
      setSubmitting(false);
      setFormError(err instanceof Error ? err.message : 'Could not start search.');
    }
  };

  const exportHistoryCsv = () => {
    downloadCsv(
      'my-search-history.csv',
      [
        'Search ID',
        'Date & Time',
        'Business Name',
        'City',
        'Website',
        'Phones',
        'Scan Mode',
        'Confirmed Listings',
        'Possible Listings',
        'NAP Issues',
        'Serper Calls Used',
        'Status',
      ],
      mySearches.map((s) => [
        s.id,
        formatDateTime(s.createdAt, timezone).full,
        s.businessName,
        s.city,
        s.website,
        (s.phones || []).join(' | '),
        s.scanMode,
        s.confirmedCount,
        s.possibleCount,
        s.napIssuesCount,
        s.serperCallsUsed,
        s.status,
      ])
    );
  };

  const limitReached =
    user.role === 'CLIENT' &&
    quota !== null &&
    (quota.remainingDaily <= 0 || quota.remainingMonthly <= 0);

  return (
    <div className="space-y-6">
      {/* Top Sub-Navigation & Quota Summary Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubView('form')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              subView === 'form'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>New Citation Scan</span>
          </button>
          <button
            onClick={() => {
              loadQuotaAndHistory();
              setSubView('history');
            }}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              subView === 'history'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>My Searches ({mySearches.length})</span>
          </button>
          {activeSearch && activeSearch.results && (
            <button
              onClick={() => setSubView('result')}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                subView === 'result'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Active Report: {activeSearch.businessName}</span>
            </button>
          )}
        </div>

        {/* Remaining Daily & Monthly Quota */}
        {quota && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
            <div>
              <span className="text-slate-400">Daily Remaining:</span>{' '}
              <span
                className={`font-mono tabular-nums font-semibold ${
                  quota.remainingDaily === 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {user.role === 'ADMIN' ? 'Unlimited' : `${quota.remainingDaily} / ${quota.dailyLimit}`}
              </span>
            </div>
            <span className="text-slate-300">·</span>
            <div>
              <span className="text-slate-400">Monthly Remaining:</span>{' '}
              <span
                className={`font-mono tabular-nums font-semibold ${
                  quota.remainingMonthly === 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {user.role === 'ADMIN' ? 'Unlimited' : `${quota.remainingMonthly} / ${quota.monthlyLimit}`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Warning if Serper API key is not configured */}
      {quota && !quota.serperConfigured && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Search is not configured. Please contact your admin.</div>
            {user.role === 'ADMIN' && (
              <p className="mt-1 text-red-700">
                As Administrator, open the <strong>Settings & Registry</strong> section in the left sidebar to save and test your Serper.dev API key.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Warning if Client Daily/Monthly Limit Reached */}
      {limitReached && quota && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Search Quota Reached</div>
            <p className="mt-0.5">
              {quota.remainingDaily <= 0
                ? `You have used all ${quota.dailyLimit} of your allowed daily searches today.`
                : `You have used all ${quota.monthlyLimit} of your allowed monthly searches this month.`}{' '}
              New searches are temporarily blocked until your quota resets or your administrator increases your limit. You can still view and export all past reports in "My Searches".
            </p>
          </div>
        </div>
      )}

      {formError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              {formError.includes('Serper.dev')
                ? 'Serper.dev API Error'
                : formError.includes('DataForSEO')
                ? 'DataForSEO Warning'
                : 'App Error'}
            </div>
            <div className="mt-0.5">{formError}</div>
          </div>
        </div>
      )}

      {/* Live Running Progress Bar */}
      {activeSearch && activeSearch.status === 'running' && (
        <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
              <div>
                <div className="text-sm font-semibold">
                  Scanning Citations for "{activeSearch.businessName}"
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {activeSearch.progressMessage || 'Executing Serper.dev discovery queries...'}
                </div>
              </div>
            </div>
            <div className="text-right font-mono tabular-nums">
              <div className="text-lg font-semibold text-emerald-400">
                {activeSearch.progressPercent || 5}%
              </div>
              <div className="text-xs text-slate-400">
                {activeSearch.serperCallsUsed || 0} Serper calls used
              </div>
            </div>
          </div>

          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.max(5, activeSearch.progressPercent || 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* SUBVIEW 1: SEARCH FORM */}
      {subView === 'form' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 mb-6 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Citation & Listing Discovery Scan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter canonical business details to run Phase 1 open-web discovery and Phase 2 site-registry verification.
              </p>
            </div>
            <button
              type="button"
              onClick={fillDemoSample}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors self-start sm:self-auto whitespace-nowrap cursor-pointer"
            >
              Load Sample Business
            </button>
          </div>

          <form onSubmit={handleRunSearch} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Acme Digital Solutions Pvt Ltd"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Alternate Names <span className="text-slate-400 font-normal">(optional, comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={alternateNamesInput}
                  onChange={(e) => setAlternateNamesInput(e.target.value)}
                  placeholder="e.g. Acme Digital, Acme Solutions"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Official Website URL
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://www.example.com"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Google Business Profile (GBP) URL <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={gbpUrl}
                  onChange={(e) => setGbpUrl(e.target.value)}
                  placeholder="https://g.page/r/... or google.com/maps/..."
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Full Street Address & Postal Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 4th Floor, Cyber Towers, Hitec City, Madhapur, 500081"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Laguna Hills, New York, London"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    State / Province
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. California"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Search Country (gl/hl)
                  </label>
                  <select
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value);
                      setCountryManuallySet(true);
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                  >
                    <option value="us">United States (gl=us, hl=en)</option>
                    <option value="gb">United Kingdom (gl=gb, hl=en)</option>
                    <option value="ca">Canada (gl=ca, hl=en)</option>
                    <option value="au">Australia (gl=au, hl=en)</option>
                    <option value="in">India (gl=in, hl=en)</option>
                    <option value="ae">UAE (gl=ae, hl=en)</option>
                    <option value="sg">Singapore (gl=sg, hl=en)</option>
                    <option value="de">Germany (gl=de, hl=de)</option>
                    <option value="fr">France (gl=fr, hl=fr)</option>
                    <option value="es">Spain (gl=es, hl=es)</option>
                    <option value="nl">Netherlands (gl=nl, hl=nl)</option>
                    <option value="nz">New Zealand (gl=nz, hl=en)</option>
                    <option value="ie">Ireland (gl=ie, hl=en)</option>
                    <option value="za">South Africa (gl=za, hl=en)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Industry / Category
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Garage door supplier"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Multiple Phone Numbers Section */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-700">
                  Phone Numbers <span className="text-slate-400 font-normal">(compares last 10 digits + searches multiple formats)</span>
                </label>
                <button
                  type="button"
                  onClick={addPhoneField}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Phone</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {phones.map((phoneVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={phoneVal}
                      onChange={(e) => handlePhoneChange(idx, e.target.value)}
                      placeholder={idx === 0 ? 'Primary phone (e.g. +1 888-991-2471)' : `Alternate phone #${idx + 1}`}
                      className="flex-1 px-3.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                    />
                    {phones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePhoneField(idx)}
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg border border-slate-200 hover:border-red-200 cursor-pointer"
                        title="Remove phone"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Admin-Only Known Listing URLs to Verify (Benchmark) */}
            {user.role === 'ADMIN' && (
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Known Listing URLs to verify (benchmark){' '}
                    <span className="text-slate-400 font-normal">
                      (Admin only — optional, paste one URL per line to measure recall % & inspect missed/rejected URLs)
                    </span>
                  </label>
                  {benchmarkUrlsInput && (
                    <button
                      type="button"
                      onClick={() => setBenchmarkUrlsInput('')}
                      className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Clear URLs
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={benchmarkUrlsInput}
                  onChange={(e) => setBenchmarkUrlsInput(e.target.value)}
                  placeholder="https://www.yelp.com/biz/...\nhttps://www.bbb.org/us/ca/...\nhttps://www.mapquest.com/us/california/..."
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white"
                />
              </div>
            )}

            {/* Scan Mode & Deep Verify Options */}
            <div className="pt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-6 space-y-2">
                <label className="block text-xs font-medium text-slate-700">Scan Depth Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setScanMode('quick')}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      scanMode === 'quick'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-semibold">Quick Mode</div>
                    <div
                      className={`text-[11px] mt-0.5 ${
                        scanMode === 'quick' ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      Phase 1 (1 page, num=10) + Batched Registry (max 3/query)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScanMode('full')}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      scanMode === 'full'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-semibold">Full Discovery Mode</div>
                    <div
                      className={`text-[11px] mt-0.5 ${
                        scanMode === 'full' ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      Phase 1 (up to 5 pages, num=10) + Individual Registry Checks
                    </div>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deepVerify}
                      onChange={(e) => setDeepVerify(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>
                      <strong>Deep Verify</strong> (ON by default for Possible / Strong Possible via <code>scrape.serper.dev</code>)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bypassCache}
                      onChange={(e) => setBypassCache(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>Bypass 24-hour result cache (run fresh live Serper queries)</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting || limitReached || (quota !== null && !quota.serperConfigured)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Running Discovery...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Run Search</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* SUBVIEW 2: MY SEARCHES HISTORY */}
      {subView === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">My Searches</h2>
              <p className="text-xs text-slate-500">
                Historical log of your citation discovery scans. Click any scan to re-open or export its full results.
              </p>
            </div>
            {mySearches.length > 0 && (
              <button
                onClick={exportHistoryCsv}
                className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export History CSV</span>
              </button>
            )}
          </div>

          {mySearches.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="text-sm font-medium text-slate-900">No searches recorded yet</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Run your first citation discovery scan to check 155+ business directories and open-web mentions.
              </p>
              <button
                onClick={() => setSubView('form')}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Start First Search
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-3 px-4">Date & Time ({timezone})</th>
                    <th className="py-3 px-4">Business Name & City</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4 text-right">Confirmed</th>
                    <th className="py-3 px-4 text-right">Possible</th>
                    <th className="py-3 px-4 text-right">NAP Issues</th>
                    <th className="py-3 px-4 text-right">Calls Used</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {mySearches.map((item) => {
                    const dt = formatDateTime(item.createdAt, timezone);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          <div>{dt.date}</div>
                          <div className="text-slate-400">{dt.time}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{item.businessName}</div>
                          <div className="text-slate-500">
                            {item.city} {item.website ? `· ${item.website}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 capitalize text-slate-600 whitespace-nowrap">
                          {item.scanMode}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-emerald-700">
                          {item.confirmedCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-amber-700">
                          {item.possibleCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-600">
                          {item.napIssuesCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {item.serperCallsUsed}
                        </td>
                        <td className="py-3 px-4 capitalize whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              item.status === 'completed'
                                ? 'text-emerald-700'
                                : item.status === 'cached'
                                ? 'text-amber-700'
                                : item.status === 'failed'
                                ? 'text-red-600'
                                : 'text-slate-600'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => openSavedSearch(item.id)}
                            disabled={loadingHistory || item.status === 'failed'}
                            className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Open Results</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 3: FULL RESULTS VIEWER */}
      {subView === 'result' && activeSearch && (
        <ResultsViewer
          record={activeSearch}
          userRole={user.role}
          timezone={timezone}
          onBack={() => setSubView('history')}
        />
      )}
    </div>
  );
};
