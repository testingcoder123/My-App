import React, { useEffect, useState } from 'react';
import {
  Search,
  Download,
  Eye,
  Filter,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import { ClientAccount, SearchRecord } from '../types.ts';
import { apiFetch, downloadCsv, formatDateTime } from '../utils/api.ts';
import { ResultsViewer } from './ResultsViewer.tsx';

interface AdminLogsProps {
  timezone: string;
  initialSelectedSearchId?: number | null;
  onClearSelectedSearchId?: () => void;
}

export const AdminLogs: React.FC<AdminLogsProps> = ({
  timezone,
  initialSelectedSearchId,
  onClearSelectedSearchId,
}) => {
  const [logs, setLogs] = useState<SearchRecord[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters (Section 2C)
  const [clientIdFilter, setClientIdFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [queryText, setQueryText] = useState('');

  // Viewing full saved search result
  const [selectedRecord, setSelectedRecord] = useState<SearchRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  // Per-client usage view toggle
  const [showPerClientBreakdown, setShowPerClientBreakdown] = useState(false);

  const fetchLogsAndClients = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (clientIdFilter !== 'all') params.set('clientId', clientIdFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (queryText.trim()) params.set('q', queryText.trim());

      const [logsData, clientsData] = await Promise.all([
        apiFetch<{ logs: SearchRecord[] }>(`/api/admin/logs?${params.toString()}`),
        apiFetch<{ clients: ClientAccount[] }>('/api/admin/clients'),
      ]);
      setLogs(logsData.logs || []);
      setClients(clientsData.clients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load search logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsAndClients();
  }, [clientIdFilter, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    if (initialSelectedSearchId) {
      openSearchRecord(initialSelectedSearchId);
      if (onClearSelectedSearchId) onClearSelectedSearchId();
    }
  }, [initialSelectedSearchId]);

  const openSearchRecord = async (id: number) => {
    setLoadingRecord(true);
    setError('');
    try {
      const fullRec = await apiFetch<SearchRecord>(`/api/searches/${id}`);
      setSelectedRecord(fullRec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open search record.');
    } finally {
      setLoadingRecord(false);
    }
  };

  const handleExportLogsCsv = () => {
    downloadCsv(
      'all-client-search-logs.csv',
      [
        'Search ID',
        'Date',
        'Exact Time',
        'Client Name',
        'Client User ID',
        'Business Name',
        'Website',
        'Phone Numbers',
        'Address',
        'City',
        'Scan Mode',
        'Serper Calls Used',
        'DataForSEO Calls Used',
        'Confirmed Results',
        'Possible Results',
        'NAP Issues',
        'Duration (s)',
        'Status',
      ],
      logs.map((r) => {
        const dt = formatDateTime(r.createdAt, timezone);
        return [
          r.id,
          dt.date,
          dt.time,
          r.clientName || '',
          r.clientUserId || '',
          r.businessName,
          r.website,
          (r.phones || []).join(' | '),
          r.address,
          r.city,
          r.scanMode,
          r.serperCallsUsed,
          r.dataForSeoCallsUsed || 0,
          r.confirmedCount,
          r.possibleCount,
          r.napIssuesCount,
          (r.durationMs / 1000).toFixed(1),
          r.status,
        ];
      })
    );
  };

  if (selectedRecord) {
    return (
      <ResultsViewer
        record={selectedRecord}
        userRole="ADMIN"
        timezone={timezone}
        onBack={() => setSelectedRecord(null)}
      />
    );
  }

  // Compute daily & hourly summary for currently filtered logs (per-client usage view)
  const dayCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0);
  for (const log of logs) {
    const dt = formatDateTime(log.createdAt, timezone);
    dayCounts.set(dt.date, (dayCounts.get(dt.date) || 0) + 1);
    const hr = parseInt(dt.time.slice(0, 2), 10);
    if (!isNaN(hr) && hr >= 0 && hr < 24) {
      hourCounts[hr]++;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Search Logs & Queries</h1>
          <p className="text-xs text-slate-500">
            Audit trail of all searches across all clients. Click any row to inspect the full saved result.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowPerClientBreakdown(!showPerClientBreakdown)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              showPerClientBreakdown
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showPerClientBreakdown ? 'Hide Usage Distribution' : 'Per-Client Usage View'}</span>
          </button>

          <button
            onClick={handleExportLogsCsv}
            disabled={logs.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Logs CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Client</label>
          <select
            value={clientIdFilter}
            onChange={(e) => setClientIdFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Clients & Admin</option>
            {clients.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.userId})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">From Date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-800"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">To Date</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-800"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="cached">Cached</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            Business Name / City / Website
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchLogsAndClients();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search business, city, client..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>
          </form>
        </div>
      </div>

      {/* Optional Per-Client / Filtered Usage Distribution Panel */}
      {showPerClientBreakdown && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-900 mb-3">
              Searches per Day (Filtered Selection)
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-2">
              {Array.from(dayCounts.entries()).map(([dateStr, cnt]) => (
                <div key={dateStr} className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-slate-600">{dateStr}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 bg-slate-900 rounded"
                      style={{ width: `${Math.min(180, cnt * 16)}px` }}
                    />
                    <span className="font-semibold text-slate-900 w-8 text-right">{cnt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 mb-3">
              Searches by Hour of Day ({timezone})
            </h3>
            <div className="h-36 flex items-end gap-1 pt-4 border-b border-slate-200">
              {hourCounts.map((cnt, hr) => {
                const maxHr = Math.max(1, ...hourCounts);
                const pct = Math.max(5, Math.round((cnt / maxHr) * 100));
                return (
                  <div
                    key={hr}
                    title={`${String(hr).padStart(2, '0')}:00 — ${cnt} searches`}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                  >
                    <div
                      className={`w-full rounded-t ${
                        cnt > 0 ? 'bg-emerald-600' : 'bg-slate-100'
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1.5">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>23:00</span>
            </div>
          </div>
        </div>
      )}

      {/* Search Logs Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading search logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No search logs match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                  <th className="py-3 px-4">Date & Exact Time</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Business Name & Website</th>
                  <th className="py-3 px-4">Phone & Address / City</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4 text-right">Serper / DFS Calls</th>
                  <th className="py-3 px-4 text-right">Confirmed / Possible</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {logs.map((row) => {
                  const dt = formatDateTime(row.createdAt, timezone);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => row.status !== 'failed' && openSearchRecord(row.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-900">{dt.date}</div>
                        <div className="text-slate-400">{dt.time}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{row.clientName}</div>
                        <div className="font-mono text-slate-400">{row.clientUserId}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate">{row.businessName}</div>
                        <div className="font-mono text-slate-400 truncate">
                          {row.website || 'No website'}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-mono tabular-nums text-slate-700 truncate">
                          {(row.phones || [])[0] || '—'}
                        </div>
                        <div className="text-slate-500 truncate" title={`${row.address}, ${row.city}`}>
                          {row.city} {row.address ? `· ${row.address}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-600 whitespace-nowrap">
                        {row.scanMode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {row.serperCallsUsed} <span className="text-slate-300">/</span>{' '}
                        <span className="text-sky-700">{row.dataForSeoCallsUsed || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-emerald-700 font-semibold">{row.confirmedCount}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-amber-700 font-semibold">{row.possibleCount}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {(row.durationMs / 1000).toFixed(1)}s
                      </td>
                      <td className="py-3 px-4 capitalize whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            row.status === 'completed'
                              ? 'text-emerald-700'
                              : row.status === 'cached'
                              ? 'text-amber-700'
                              : row.status === 'failed'
                              ? 'text-red-600'
                              : 'text-slate-600'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={loadingRecord || row.status === 'failed'}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSearchRecord(row.id);
                          }}
                          className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
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
    </div>
  );
};
