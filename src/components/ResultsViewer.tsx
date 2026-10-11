import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Download,
  Search,
  PlusCircle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ShieldAlert,
  Target,
  Filter,
} from 'lucide-react';
import {
  ChecklistMatchStatus,
  DiscoverySource,
  ListingBadge,
  ListingMatchStatus,
  RejectionReason,
  SearchRecord,
  UserRole,
} from '../types.ts';
import { downloadCsv, formatDateTime } from '../utils/api.ts';

interface ResultsViewerProps {
  record: SearchRecord;
  userRole: UserRole;
  timezone: string;
  onBack?: () => void;
}

type ResultTab = 'checklist' | 'other' | 'nap' | 'own' | 'raw';
type DebugSubTab = 'queries' | 'rejected' | 'benchmark';

const STATUS_SORT_ORDER: Record<string, number> = {
  Confirmed: 1,
  'Strong Possible': 2,
  Possible: 3,
  'Not Found': 4,
};

export const ResultsViewer: React.FC<ResultsViewerProps> = ({
  record,
  userRole,
  timezone,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<ResultTab>('checklist');
  const [debugSubTab, setDebugSubTab] = useState<DebugSubTab>('queries');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [rejectionFilter, setRejectionFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [expandedRawIdx, setExpandedRawIdx] = useState<number | null>(0);

  const results = record.results;
  if (!results) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        {record.errorMessage && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-left flex items-start gap-3 text-xs text-red-900">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">
                {record.errorMessage.includes('Serper.dev')
                  ? 'Serper.dev API Error (Source: Serper.dev)'
                  : 'Application Error (Source: App)'}
              </div>
              <div className="font-mono mt-0.5">{record.errorMessage}</div>
            </div>
          </div>
        )}
        <p className="text-sm text-slate-600">No detailed results payload available for this search record.</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            Back
          </button>
        )}
      </div>
    );
  }

  const {
    summary,
    siteChecklist = [],
    otherSitesFound = [],
    napIssues = [],
    ownProperties = [],
    rawResults = [],
    rejectedResults = [],
    benchmarkReport = null,
  } = results;

  const activeWarnings = useMemo(() => {
    if (summary.providerWarnings && summary.providerWarnings.length > 0) {
      return summary.providerWarnings;
    }
    if (summary.warningMessage) {
      const isDfs = summary.warningMessage.toLowerCase().includes('dataforseo');
      return [
        {
          source: (isDfs ? 'DataForSEO' : 'Serper.dev') as 'DataForSEO' | 'Serper.dev' | 'App',
          message: summary.warningMessage,
        },
      ];
    }
    return [];
  }, [summary.providerWarnings, summary.warningMessage]);

  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    for (const s of siteChecklist) {
      set.add(s.group);
    }
    return Array.from(set);
  }, [siteChecklist]);

  const filteredChecklist = useMemo(() => {
    const filtered = siteChecklist.filter((item) => {
      if (groupFilter !== 'all' && item.group !== groupFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (sourceFilter !== 'all') {
        const itemSrc = item.source || (item.status === 'Not Found' ? '-' : 'Serper');
        if (itemSrc !== sourceFilter) return false;
      }
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          item.siteName.toLowerCase().includes(q) ||
          item.searchDomain.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q) ||
          item.listingUrl.toLowerCase().includes(q) ||
          (item.why || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const rankDiff = (STATUS_SORT_ORDER[a.status] || 9) - (STATUS_SORT_ORDER[b.status] || 9);
      if (rankDiff !== 0) return rankDiff;
      return (b.matchScore || 0) - (a.matchScore || 0);
    });
  }, [siteChecklist, groupFilter, statusFilter, sourceFilter, searchFilter]);

  const groupedChecklist = useMemo(() => {
    const map = new Map<string, typeof filteredChecklist>();
    for (const item of filteredChecklist) {
      if (!map.has(item.group)) {
        map.set(item.group, []);
      }
      map.get(item.group)!.push(item);
    }
    return Array.from(map.entries());
  }, [filteredChecklist]);

  const filteredOtherSites = useMemo(() => {
    const filtered = otherSitesFound.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (sourceFilter !== 'all') {
        const itemSrc = item.source || 'Serper';
        if (itemSrc !== sourceFilter) return false;
      }
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          item.domain.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.url.toLowerCase().includes(q) ||
          item.listingType.toLowerCase().includes(q) ||
          (item.why || '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const rankDiff = (STATUS_SORT_ORDER[a.status] || 9) - (STATUS_SORT_ORDER[b.status] || 9);
      if (rankDiff !== 0) return rankDiff;
      return (b.matchScore || 0) - (a.matchScore || 0);
    });
  }, [otherSitesFound, statusFilter, sourceFilter, searchFilter]);

  const filteredRejected = useMemo(() => {
    return rejectedResults.filter((item) => {
      if (rejectionFilter !== 'all' && item.rejectionReason !== rejectionFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          item.domain.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.url.toLowerCase().includes(q) ||
          item.rejectionReason.toLowerCase().includes(q) ||
          item.why.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rejectedResults, rejectionFilter, searchFilter]);

  const renderSourceText = (src?: DiscoverySource | '-') => {
    if (!src || src === '-') return <span className="text-slate-400">—</span>;
    if (src === 'Both') {
      return <span className="font-semibold text-indigo-700">Both</span>;
    }
    if (src === 'DataForSEO') {
      return <span className="font-medium text-sky-700">DataForSEO</span>;
    }
    return <span className="font-medium text-slate-700">Serper</span>;
  };

  const renderStatusBadge = (
    status: ChecklistMatchStatus | ListingMatchStatus,
    badge?: ListingBadge,
    isChecklist = false
  ) => {
    return (
      <div className="space-y-1">
        {status === 'Confirmed' && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{isChecklist ? 'Listed (Confirmed)' : 'Confirmed'}</span>
          </span>
        )}
        {status === 'Strong Possible' && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Strong Possible</span>
          </span>
        )}
        {status === 'Possible' && (
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Possible</span>
          </span>
        )}
        {status === 'Not Found' && (
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <XCircle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span>Not Found</span>
          </span>
        )}
        {badge && (
          <div className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 inline-block">
            {badge}
          </div>
        )}
      </div>
    );
  };

  const handleExportCurrentTabCsv = () => {
    const slug = record.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (activeTab === 'checklist') {
      downloadCsv(
        `${slug}-site-checklist.csv`,
        [
          'Category Group',
          'Site Name',
          'Domain',
          'Status',
          'Badge',
          'Match Score',
          'Why',
          'Source',
          'Listing Type',
          'Matched Signals',
          'Listing URL',
          'Found Name',
          'Found Address',
          'Found Phone',
          'NAP Mismatch',
          'NAP Discrepancies',
          'Create Listing URL',
        ],
        filteredChecklist.map((r) => [
          r.group,
          r.siteName,
          r.searchDomain,
          r.status === 'Confirmed' ? 'Listed (Confirmed)' : r.status,
          r.badge || '',
          r.status === 'Not Found' ? 0 : r.matchScore ?? 0,
          r.why || '',
          r.source || (r.status === 'Not Found' ? '-' : 'Serper'),
          r.listingType,
          r.matchedSignals.join(' | '),
          r.listingUrl,
          r.foundName,
          r.foundAddress,
          r.foundPhone,
          r.status === 'Confirmed' && r.napMismatch ? 'Yes' : 'No',
          r.status === 'Confirmed' && r.napDiscrepancies
            ? r.napDiscrepancies.map((d) => `${d.field}: ${d.detail}`).join(' ; ')
            : '',
          r.status === 'Not Found' ? r.createUrl : '',
        ])
      );
    } else if (activeTab === 'other') {
      downloadCsv(
        `${slug}-other-sites-found.csv`,
        [
          'Domain',
          'Status',
          'Badge',
          'Match Score',
          'Why',
          'Source',
          'Listing Type',
          'Matched Signals',
          'URL',
          'Title',
          'Found Name',
          'Found Address',
          'Found Phone',
          'NAP Mismatch',
          'NAP Discrepancies',
        ],
        filteredOtherSites.map((r) => [
          r.domain,
          r.status,
          r.badge || '',
          r.matchScore ?? 0,
          r.why || '',
          r.source || 'Serper',
          r.listingType,
          r.matchedSignals.join(' | '),
          r.url,
          r.title,
          r.foundName,
          r.foundAddress,
          r.foundPhone,
          r.status === 'Confirmed' && r.napMismatch ? 'Yes' : 'No',
          r.status === 'Confirmed' && r.napDiscrepancies
            ? r.napDiscrepancies.map((d) => `${d.field}: ${d.detail}`).join(' ; ')
            : '',
        ])
      );
    } else if (activeTab === 'nap') {
      downloadCsv(
        `${slug}-nap-issues.csv`,
        [
          'Source / Directory',
          'Discovery Source',
          'Status',
          'Listing Type',
          'URL',
          'Found Name',
          'Expected Name',
          'Found Phone',
          'Expected Phone',
          'Found Address',
          'Expected Address',
          'Discrepancy Details',
        ],
        napIssues.map((r) => [
          r.sourceName,
          r.source || 'Serper',
          r.status,
          r.listingType,
          r.url,
          r.foundName,
          r.expectedName,
          r.foundPhone,
          r.expectedPhone,
          r.foundAddress,
          r.expectedAddress,
          r.discrepancies.map((d) => `${d.field}: ${d.detail}`).join(' ; '),
        ])
      );
    } else if (activeTab === 'own') {
      downloadCsv(
        `${slug}-own-properties.csv`,
        ['Property Type', 'Source', 'Domain', 'URL', 'Title', 'Snippet'],
        ownProperties.map((r) => [
          r.propertyType,
          r.source || 'Serper',
          r.domain,
          r.url,
          r.title,
          r.snippet,
        ])
      );
    } else if (activeTab === 'raw' && userRole === 'ADMIN') {
      if (debugSubTab === 'rejected') {
        downloadCsv(
          `${slug}-rejected-results.csv`,
          ['URL', 'Domain', 'Title', 'Rejection Reason', 'Match Score', 'Why', 'Source'],
          filteredRejected.map((r) => [
            r.url,
            r.domain,
            r.title,
            r.rejectionReason,
            r.matchScore,
            r.why,
            r.source,
          ])
        );
        return;
      }
      if (debugSubTab === 'benchmark' && benchmarkReport) {
        downloadCsv(
          `${slug}-benchmark-recall.csv`,
          ['Known URL', 'Outcome', 'Status', 'Match Score', 'Tab Location', 'Rejection Reason', 'Why'],
          benchmarkReport.items.map((b) => [
            b.inputUrl,
            b.outcome,
            b.status || '',
            b.matchScore ?? 0,
            b.locationTab || '-',
            b.rejectionReason || '',
            b.why || '',
          ])
        );
        return;
      }
      const rows: Array<Array<string | number>> = [];
      for (const qLog of rawResults) {
        if (qLog.organic.length === 0) {
          rows.push([
            qLog.provider || 'Serper',
            qLog.phase,
            qLog.query,
            qLog.page,
            qLog.httpStatus ?? 200,
            0,
            qLog.creditsUsed ?? 0,
            qLog.error || '',
            '',
            '',
            '',
          ]);
        } else {
          for (const org of qLog.organic) {
            rows.push([
              qLog.provider || 'Serper',
              qLog.phase,
              qLog.query,
              qLog.page,
              qLog.httpStatus ?? 200,
              qLog.resultsCount,
              qLog.creditsUsed ?? 1,
              qLog.error || '',
              org.title,
              org.link,
              org.snippet,
            ]);
          }
        }
      }
      downloadCsv(
        `${slug}-debug-provider-queries.csv`,
        [
          'Provider',
          'Phase',
          'Query / Endpoint Sent',
          'Page',
          'HTTP Status',
          'Results Count',
          'Calls Used',
          'Error',
          'Title',
          'URL',
          'Snippet',
        ],
        rows
      );
    }
  };

  const dt = formatDateTime(record.createdAt, timezone);
  const dfsCallsUsed = summary.dataForSeoCallsUsed ?? record.dataForSeoCallsUsed ?? 0;
  const strongPossibleCount = summary.strongPossibleCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Error Banner (when entire scan failed — clearly shows real error source) */}
      {record.errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-900">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              {record.errorMessage.includes('Serper.dev')
                ? 'Serper.dev API Error (Source: Serper.dev)'
                : 'Application Error (Source: App)'}
            </div>
            <div className="font-mono mt-0.5">{record.errorMessage}</div>
          </div>
        </div>
      )}

      {/* Non-blocking Yellow Warning Banners (Admin Only for DataForSEO warnings; shows exact real source) */}
      {!record.errorMessage &&
        activeWarnings.map((warn, wIdx) => {
          if (warn.source === 'DataForSEO' && userRole !== 'ADMIN') {
            return null;
          }
          return (
            <div
              key={wIdx}
              className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">
                  {warn.source === 'DataForSEO'
                    ? 'DataForSEO Warning (Source: DataForSEO — Scan continued with Serper.dev)'
                    : `${warn.source} Warning (Source: ${warn.source})`}
                </div>
                <div className="font-mono mt-0.5">{warn.message}</div>
              </div>
            </div>
          );
        })}

      {/* Admin Benchmark Recall Summary Banner (when benchmark URLs were provided) */}
      {userRole === 'ADMIN' && benchmarkReport && benchmarkReport.totalKnown > 0 && (
        <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-indigo-950">
                Benchmark Verification Recall: {benchmarkReport.recallPercent}% (
                {benchmarkReport.foundCount} of {benchmarkReport.totalKnown} known URLs found)
              </div>
              <p className="text-xs text-indigo-800 mt-0.5">
                {benchmarkReport.missedCount === 0 && benchmarkReport.rejectedCount === 0
                  ? 'All submitted benchmark listing URLs were discovered and matched!'
                  : `${benchmarkReport.rejectedCount} rejected by strict matching rules · ${benchmarkReport.missedCount} not returned by search queries. Click "Inspect Benchmark Report" for full details.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setActiveTab('raw');
              setDebugSubTab('benchmark');
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer self-start sm:self-auto"
          >
            Inspect Benchmark Report ({benchmarkReport.totalKnown})
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              {onBack && (
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 pr-2 border-r border-slate-200 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              )}
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Scan #{record.id} · {dt.full} ({timezone})
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-medium text-slate-700 capitalize">
                {record.scanMode} Mode {record.deepVerify ? '+ Auto Deep Verify' : ''}
              </span>
              {summary.glUsed && (
                <>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs font-mono text-slate-600">
                    gl={summary.glUsed} hl={summary.hlUsed || 'en'}
                    {summary.locationUsed ? ` · location="${summary.locationUsed}"` : ''}
                  </span>
                </>
              )}
              {summary.distinctiveTokens && summary.distinctiveTokens.length > 0 && (
                <>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs font-mono text-emerald-700">
                    Distinctive Tokens: [{summary.distinctiveTokens.join(', ')}]
                  </span>
                </>
              )}
              {summary.cached && (
                <>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs font-medium text-amber-700">24h Cached Result</span>
                </>
              )}
            </div>
            <h2 className="text-xl font-semibold text-slate-900">{record.businessName}</h2>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{record.address ? `${record.address}, ${record.city}` : record.city}</span>
              {record.phones?.length > 0 && (
                <>
                  <span>·</span>
                  <span className="font-mono tabular-nums">{record.phones.join(', ')}</span>
                </>
              )}
              {record.website && (
                <>
                  <span>·</span>
                  <span className="font-mono">{record.website}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportCurrentTabCsv}
              className="px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Current View CSV</span>
            </button>
          </div>
        </div>

        {/* Summary Metric Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mt-6 pt-6 border-t border-slate-200">
          <div>
            <div className="text-xs text-slate-500">Sites Checked</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {summary.sitesChecked}
            </div>
          </div>
          <div>
            <div className="text-xs text-emerald-700 font-medium">Confirmed</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-600 mt-1">
              {summary.confirmedCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-amber-700 font-medium">Strong Possible</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-amber-600 mt-1">
              {strongPossibleCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-amber-600 font-medium">Total Possible</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-amber-500 mt-1">
              {summary.possibleCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Not Found (Registry)</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-slate-700 mt-1">
              {summary.notFoundCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-red-700 font-medium">NAP Issues (Confirmed)</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-red-600 mt-1">
              {summary.napIssuesCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Serper Calls</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {summary.serperCallsUsed}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">DataForSEO Calls</div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
              {dfsCallsUsed}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Tabs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'checklist'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Site Checklist ({siteChecklist.length})
          </button>
          <button
            onClick={() => setActiveTab('other')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'other'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Other Sites Found ({otherSitesFound.length})
          </button>
          <button
            onClick={() => setActiveTab('nap')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'nap'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. NAP Issues ({napIssues.length})
          </button>
          <button
            onClick={() => setActiveTab('own')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'own'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4. Own Properties ({ownProperties.length})
          </button>
          {userRole === 'ADMIN' && (
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'raw'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              5. Raw Results & Debug ({rawResults.length} Calls · {rejectedResults.length} Rejected
              {benchmarkReport ? ` · ${benchmarkReport.recallPercent}% Recall` : ''})
            </button>
          )}
        </div>

        {/* Filters for Checklist & Other Sites */}
        {(activeTab === 'checklist' || activeTab === 'other') && (
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'checklist' && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900"
              >
                <option value="all">All Categories ({availableGroups.length})</option>
                {availableGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900"
            >
              <option value="all">All Statuses</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Strong Possible">Strong Possible</option>
              <option value="Possible">Possible</option>
              {activeTab === 'checklist' && <option value="Not Found">Not Found</option>}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900"
            >
              <option value="all">All Sources</option>
              <option value="Serper">Serper</option>
              <option value="DataForSEO">DataForSEO</option>
              <option value="Both">Both</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter domain, name, or why..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: SITE CHECKLIST */}
      {activeTab === 'checklist' && (
        <div className="space-y-6">
          {groupedChecklist.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No registry sites match the current filters.
            </div>
          ) : (
            groupedChecklist.map(([groupName, items]) => {
              const confirmedInGroup = items.filter((i) => i.status === 'Confirmed').length;
              const strongPossibleInGroup = items.filter((i) => i.status === 'Strong Possible').length;
              const possibleInGroup = items.filter((i) => i.status === 'Possible').length;

              return (
                <div key={groupName} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{groupName}</h3>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      <span>{confirmedInGroup} Confirmed</span>
                      <span className="mx-1.5">·</span>
                      <span>{strongPossibleInGroup} Strong Possible</span>
                      <span className="mx-1.5">·</span>
                      <span>{possibleInGroup} Possible</span>
                      <span className="mx-1.5">·</span>
                      <span>{items.length} Total</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/40">
                          <th className="py-2.5 px-3">Directory / Site</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Source</th>
                          <th className="py-2.5 px-3">Listing URL / Action</th>
                          <th className="py-2.5 px-3">Found Name</th>
                          <th className="py-2.5 px-3">Found Address</th>
                          <th className="py-2.5 px-3 text-right">Match Score</th>
                          <th className="py-2.5 px-3">Why</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {items.map((item) => (
                          <tr key={item.siteId} className="hover:bg-slate-50/80 transition-colors align-top">
                            <td className="py-3 px-3">
                              <div className="font-medium text-slate-900">{item.siteName}</div>
                              <div className="text-slate-400 font-mono">{item.searchDomain}</div>
                              {item.status !== 'Not Found' && (
                                <div className="text-[11px] text-slate-400 mt-0.5">{item.listingType}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {renderStatusBadge(item.status, item.badge, true)}
                              {/* NAP Mismatch ONLY on truly Confirmed listings */}
                              {item.status === 'Confirmed' && item.napMismatch && (
                                <div className="mt-1 space-y-0.5">
                                  <div className="text-red-600 font-semibold">NAP Mismatch</div>
                                  {item.napDiscrepancies &&
                                    item.napDiscrepancies.map((d, dIdx) => (
                                      <div
                                        key={dIdx}
                                        className="text-[11px] text-red-700 whitespace-normal max-w-[210px]"
                                      >
                                        <strong>{d.field}:</strong> {d.detail}
                                      </div>
                                    ))}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {renderSourceText(
                                item.source || (item.status === 'Not Found' ? '-' : 'Serper')
                              )}
                            </td>
                            <td className="py-3 px-3 max-w-[220px]">
                              {item.status !== 'Not Found' && item.listingUrl ? (
                                <a
                                  href={item.listingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-700 hover:text-emerald-800 hover:underline inline-flex items-center gap-1 font-mono truncate max-w-[210px]"
                                  title={item.listingUrl}
                                >
                                  <span className="truncate">
                                    {item.listingUrl.replace(/^https?:\/\/(www\.)?/, '')}
                                  </span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              ) : (
                                <a
                                  href={item.createUrl || `https://${item.searchDomain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-700 hover:text-slate-900 hover:underline inline-flex items-center gap-1 font-medium"
                                >
                                  <PlusCircle className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Create listing</span>
                                  <ExternalLink className="w-3 h-3 text-slate-400" />
                                </a>
                              )}
                            </td>
                            <td className="py-3 px-3 max-w-[180px]">
                              {item.status === 'Not Found' ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div
                                  className={
                                    item.foundName === 'Name not found on page'
                                      ? 'text-slate-400 italic'
                                      : 'text-slate-900 font-medium break-words'
                                  }
                                >
                                  {item.foundName || 'Name not found on page'}
                                </div>
                              )}
                              {item.status !== 'Not Found' && item.foundPhone && (
                                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                  Tel: {item.foundPhone}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 max-w-[180px]">
                              {item.status === 'Not Found' ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="text-slate-700 break-words">
                                  {item.foundAddress || '—'}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {item.status === 'Not Found' ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <span
                                  className={`font-semibold ${
                                    (item.matchScore || 0) >= 80
                                      ? 'text-emerald-700'
                                      : (item.matchScore || 0) >= 50
                                      ? 'text-amber-700'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {item.matchScore ?? 0}/100
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 max-w-[260px]">
                              {item.status === 'Not Found' ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="text-[11px] font-mono text-slate-600 leading-relaxed">
                                  {item.why}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: OTHER SITES FOUND */}
      {activeTab === 'other' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredOtherSites.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No additional open-web listings found outside the Site Registry for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-3 px-3">Domain & Title</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 px-3">Listing URL</th>
                    <th className="py-3 px-3">Found Name</th>
                    <th className="py-3 px-3">Found Address</th>
                    <th className="py-3 px-3 text-right">Match Score</th>
                    <th className="py-3 px-3">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredOtherSites.map((item, idx) => (
                    <tr key={`${item.url}-${idx}`} className="hover:bg-slate-50/80 align-top">
                      <td className="py-3 px-3 max-w-[220px]">
                        <div className="font-mono font-medium text-slate-900">{item.domain}</div>
                        <div className="text-slate-500 truncate mt-0.5" title={item.title}>
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{item.listingType}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderStatusBadge(item.status, item.badge, false)}
                        {/* NAP Mismatch ONLY on truly Confirmed listings */}
                        {item.status === 'Confirmed' && item.napMismatch && (
                          <div className="mt-1 space-y-0.5">
                            <div className="text-red-600 font-semibold">NAP Mismatch</div>
                            {item.napDiscrepancies &&
                              item.napDiscrepancies.map((d, dIdx) => (
                                <div
                                  key={dIdx}
                                  className="text-[11px] text-red-700 whitespace-normal max-w-[210px]"
                                >
                                  <strong>{d.field}:</strong> {d.detail}
                                </div>
                              ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderSourceText(item.source || 'Serper')}
                      </td>
                      <td className="py-3 px-3 max-w-[210px]">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-mono truncate max-w-[200px]"
                          title={item.url}
                        >
                          <span className="truncate">{item.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </td>
                      <td className="py-3 px-3 max-w-[180px]">
                        <div
                          className={
                            item.foundName === 'Name not found on page'
                              ? 'text-slate-400 italic'
                              : 'text-slate-900 font-medium break-words'
                          }
                        >
                          {item.foundName || 'Name not found on page'}
                        </div>
                        {item.foundPhone && (
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            Tel: {item.foundPhone}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 max-w-[180px]">
                        <div className="text-slate-700 break-words">
                          {item.foundAddress || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            (item.matchScore || 0) >= 80
                              ? 'text-emerald-700'
                              : (item.matchScore || 0) >= 50
                              ? 'text-amber-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {item.matchScore ?? 0}/100
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-[260px]">
                        <div className="text-[11px] font-mono text-slate-600 leading-relaxed">
                          {item.why}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NAP ISSUES (Strictly Confirmed Listings Only) */}
      {activeTab === 'nap' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {napIssues.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-sm font-medium text-slate-900">
                No Confirmed NAP Discrepancies Detected
              </div>
              <p className="text-xs text-slate-500 mt-1">
                All Confirmed listings match your canonical Name, Street Address, and Phone signals without conflicting records.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-3 px-4">Directory / URL</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Name (Found vs Expected)</th>
                    <th className="py-3 px-4">Phone (Found vs Expected)</th>
                    <th className="py-3 px-4">Address (Found vs Expected)</th>
                    <th className="py-3 px-4">Field Differences (Found vs Expected)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {napIssues.map((issue, idx) => (
                    <tr key={`${issue.url}-${idx}`} className="hover:bg-slate-50/80 align-top">
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{issue.sourceName}</div>
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-mono mt-0.5 truncate max-w-[200px]"
                        >
                          <span className="truncate">{issue.domain}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        <div className="text-emerald-700 font-medium mt-1">
                          {issue.status} · {issue.listingType}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderSourceText(issue.source || 'Serper')}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-slate-900">
                          <span className="text-slate-400">Found:</span> {issue.foundName}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          <span className="text-slate-400">Expected:</span> {issue.expectedName}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums">
                        <div className="text-slate-900">
                          <span className="text-slate-400 font-sans">Found:</span> {issue.foundPhone || '—'}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          <span className="text-slate-400 font-sans">Expected:</span> {issue.expectedPhone}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-slate-900 break-words">
                          <span className="text-slate-400">Found:</span> {issue.foundAddress}
                        </div>
                        <div className="text-slate-500 mt-0.5 break-words">
                          <span className="text-slate-400">Expected:</span> {issue.expectedAddress}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-sm">
                        <ul className="space-y-1 text-red-700">
                          {issue.discrepancies.map((d, dIdx) => (
                            <li key={dIdx}>
                              <strong className="font-semibold">{d.field}:</strong> {d.detail}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: OWN PROPERTIES */}
      {activeTab === 'own' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {ownProperties.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No client-owned domains or GBP URLs were returned in the search results.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-3 px-4">Property Type</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Domain</th>
                    <th className="py-3 px-4">Page Title & URL</th>
                    <th className="py-3 px-4">Snippet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {ownProperties.map((prop, idx) => (
                    <tr key={`${prop.url}-${idx}`} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {prop.propertyType}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderSourceText(prop.source || 'Serper')}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {prop.domain}
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-medium text-slate-900 truncate">{prop.title}</div>
                        <a
                          href={prop.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-mono truncate max-w-xs"
                        >
                          <span className="truncate">{prop.url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-md">{prop.snippet}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DEBUG & BENCHMARK PANEL (ADMIN ONLY) */}
      {activeTab === 'raw' && userRole === 'ADMIN' && (
        <div className="space-y-4">
          {/* Sub-navigation inside Admin Debug Panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setDebugSubTab('queries')}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  debugSubTab === 'queries'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                1. Raw Queries & API Log ({rawResults.length})
              </button>
              <button
                onClick={() => setDebugSubTab('rejected')}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  debugSubTab === 'rejected'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                2. Rejected URLs & Reasons ({rejectedResults.length})
              </button>
              <button
                onClick={() => setDebugSubTab('benchmark')}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  debugSubTab === 'benchmark'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                3. Known URLs Benchmark Recall (
                {benchmarkReport ? `${benchmarkReport.recallPercent}%` : '0 URLs'})
              </button>
            </div>

            {debugSubTab === 'rejected' && (
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={rejectionFilter}
                  onChange={(e) => setRejectionFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-slate-900"
                >
                  <option value="all">All Rejection Reasons ({rejectedResults.length})</option>
                  <option value="search page">search page</option>
                  <option value="generic name only">generic name only</option>
                  <option value="city-only address">city-only address</option>
                  <option value="no signals">no signals</option>
                </select>
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter rejected URL..."
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
            )}
          </div>

          {/* SUB-TAB 1: RAW QUERIES LOG */}
          {debugSubTab === 'queries' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Admin Debug Panel — Every Query Sent, Page, HTTP Status, Results & Credits
                  </h3>
                  <p className="text-xs text-slate-500">
                    Click any query row to inspect returned URLs and snippets. Non-listing search/category pages (/search, ?find_desc, /best-, etc.) are kept here in Raw Results and never Confirmed.
                  </p>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-600">
                  Total Calls: <strong>{rawResults.length}</strong> · Serper:{' '}
                  <strong>{summary.serperCallsUsed}</strong> · DataForSEO:{' '}
                  <strong>{dfsCallsUsed}</strong>
                </div>
              </div>

              {rawResults.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No raw provider logs stored for this scan.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                        <th className="py-2.5 px-4">#</th>
                        <th className="py-2.5 px-4">Provider</th>
                        <th className="py-2.5 px-4">Phase</th>
                        <th className="py-2.5 px-4">Query / Request Sent</th>
                        <th className="py-2.5 px-4 text-right">Page</th>
                        <th className="py-2.5 px-4">HTTP Status</th>
                        <th className="py-2.5 px-4 text-right">Results</th>
                        <th className="py-2.5 px-4 text-right">Calls Used</th>
                        <th className="py-2.5 px-4">Error / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {rawResults.map((rawItem, idx) => {
                        const isOpen = expandedRawIdx === idx;
                        const httpStatus = rawItem.httpStatus ?? 200;
                        const credits = rawItem.creditsUsed ?? (httpStatus === 200 ? 1 : 0);
                        const providerName = rawItem.provider || 'Serper';
                        return (
                          <React.Fragment key={idx}>
                            <tr
                              onClick={() => setExpandedRawIdx(isOpen ? null : idx)}
                              className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                            >
                              <td className="py-3 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  {isOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                  <span>{idx + 1}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {providerName === 'DataForSEO' ? (
                                  <span className="font-semibold text-sky-700">DataForSEO</span>
                                ) : (
                                  <span className="font-medium text-slate-800">Serper.dev</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                {rawItem.phase}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-900 max-w-md">
                                <div className="break-all">{rawItem.query}</div>
                                {(rawItem.gl || rawItem.location) && (
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    gl={rawItem.gl || 'us'} · hl={rawItem.hl || 'en'}
                                    {rawItem.location ? ` · location="${rawItem.location}"` : ''}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                {rawItem.page}
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                                <span
                                  className={`font-semibold ${
                                    httpStatus === 200
                                      ? 'text-emerald-700'
                                      : httpStatus >= 400
                                      ? 'text-red-600'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  HTTP {httpStatus}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                                {rawItem.resultsCount}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                {credits}
                              </td>
                              <td className="py-3 px-4 max-w-xs">
                                {rawItem.error ? (
                                  <span className="text-red-600 font-mono break-words">
                                    {rawItem.error}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">OK</span>
                                )}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={9} className="bg-slate-50/70 px-6 py-3 border-t border-slate-100">
                                  {rawItem.organic.length === 0 ? (
                                    <div className="text-xs text-slate-400 py-2">
                                      0 results returned for this request.
                                    </div>
                                  ) : (
                                    <div className="divide-y divide-slate-200/70">
                                      {rawItem.organic.map((org, oIdx) => (
                                        <div key={oIdx} className="py-2.5 text-xs space-y-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-slate-900">
                                              {oIdx + 1}. {org.title}
                                            </span>
                                            <a
                                              href={org.link}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="font-mono text-emerald-700 hover:underline inline-flex items-center gap-1 shrink-0"
                                            >
                                              <span>Open URL</span>
                                              <ExternalLink className="w-3 h-3" />
                                            </a>
                                          </div>
                                          <div className="font-mono text-slate-500 truncate">{org.link}</div>
                                          <div className="text-slate-600">{org.snippet}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: REJECTED RESULTS & REJECTION REASONS */}
          {debugSubTab === 'rejected' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Rejected Results & Strict Filter Reasons
                  </h3>
                  <p className="text-xs text-slate-500">
                    Every non-matching or non-listing URL returned by Serper or DataForSEO, with its exact rejection classification and signal diagnostic.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-600">
                  Showing {filteredRejected.length} of {rejectedResults.length} rejected URLs
                </span>
              </div>

              {filteredRejected.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No rejected results match the current filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                        <th className="py-3 px-4">URL & Title</th>
                        <th className="py-3 px-4">Rejection Reason</th>
                        <th className="py-3 px-4">Source</th>
                        <th className="py-3 px-4 text-right">Score</th>
                        <th className="py-3 px-4">Why (Signal Breakdown)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filteredRejected.map((rej, idx) => (
                        <tr key={`${rej.url}-${idx}`} className="hover:bg-slate-50/80 align-top">
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-mono font-medium text-slate-900">{rej.domain}</div>
                            <div className="text-slate-600 truncate mt-0.5" title={rej.title}>
                              {rej.title}
                            </div>
                            <a
                              href={rej.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-mono truncate max-w-[240px] mt-0.5"
                              title={rej.url}
                            >
                              <span className="truncate">{rej.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                              <ShieldAlert className="w-3 h-3 text-red-600" />
                              <span>{rej.rejectionReason}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {renderSourceText(rej.source)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                            {rej.matchScore}/100
                          </td>
                          <td className="py-3 px-4 max-w-md font-mono text-[11px] text-slate-600">
                            {rej.why}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 3: BENCHMARK RECALL VERIFICATION */}
          {debugSubTab === 'benchmark' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {!benchmarkReport || benchmarkReport.totalKnown === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="text-sm font-medium text-slate-900">
                    No Benchmark URLs Provided for This Scan
                  </div>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto">
                    When starting a new scan as Admin, paste a list of known listing URLs into the{' '}
                    <strong>"Known Listing URLs to verify (benchmark)"</strong> box to automatically compute recall % and see which URLs were found or missed.
                  </p>
                </div>
              ) : (
                <>
                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Known Listing URLs Benchmark Verification Report
                      </h3>
                      <p className="text-xs text-slate-500">
                        Compares your pasted list of known listing URLs against all discovered and evaluated pages.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                      <div>
                        Submitted: <strong>{benchmarkReport.totalKnown}</strong>
                      </div>
                      <div className="text-emerald-700">
                        Found: <strong>{benchmarkReport.foundCount}</strong>
                      </div>
                      <div className="text-amber-700">
                        Rejected: <strong>{benchmarkReport.rejectedCount}</strong>
                      </div>
                      <div className="text-red-600">
                        Missed: <strong>{benchmarkReport.missedCount}</strong>
                      </div>
                      <div className="px-2.5 py-1 bg-slate-900 text-white rounded font-semibold">
                        Recall: {benchmarkReport.recallPercent}%
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                          <th className="py-3 px-4">#</th>
                          <th className="py-3 px-4">Known Listing URL</th>
                          <th className="py-3 px-4">Outcome</th>
                          <th className="py-3 px-4">Match Status</th>
                          <th className="py-3 px-4">Tab Location</th>
                          <th className="py-3 px-4">Rejection / Miss Reason</th>
                          <th className="py-3 px-4">Why / Matched URL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {benchmarkReport.items.map((bItem, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 align-top">
                            <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-3 px-4 max-w-sm">
                              <a
                                href={bItem.inputUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-mono break-all"
                              >
                                <span>{bItem.inputUrl}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {bItem.outcome === 'Found' ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Found</span>
                                </span>
                              ) : bItem.outcome === 'Rejected' ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Rejected</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                                  <span>Missed</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800">
                              {bItem.status}
                              {bItem.matchScore !== undefined && bItem.status !== 'Not Returned' && (
                                <span className="ml-1.5 font-mono text-slate-500">
                                  ({bItem.matchScore}/100)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                              {bItem.locationTab || '—'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {bItem.outcome === 'Found' ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <span className="font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                                  {bItem.rejectionReason || 'Not returned by search queries'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 max-w-md space-y-1">
                              {bItem.why && (
                                <div className="font-mono text-[11px] text-slate-700">{bItem.why}</div>
                              )}
                              {bItem.matchedUrl && (
                                <div className="font-mono text-[11px] text-slate-400 break-all">
                                  Matched: {bItem.matchedUrl}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
