import React, { useEffect, useState } from 'react';
import { RefreshCw, ArrowUpRight, AlertCircle } from 'lucide-react';
import { DashboardData } from '../types.ts';
import { apiFetch, formatDateTime } from '../utils/api.ts';

interface AdminDashboardProps {
  timezone: string;
  onOpenSearchResult: (searchId: number) => void;
  onNavigateTab: (tab: 'clients' | 'logs' | 'search' | 'settings') => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  timezone,
  onOpenSearchResult,
  onNavigateTab,
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<DashboardData>('/api/admin/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-28 bg-white border border-slate-200 rounded-xl p-5 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-xl p-6 animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl p-6 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-800">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
        <span>{error || 'Unable to load dashboard.'}</span>
      </div>
    );
  }

  const { cards, searchesPerDay, searchesByHour, topClients, recentActivity } = data;
  const maxDailyCount = Math.max(1, ...searchesPerDay.map((d) => d.count));
  const maxHourlyCount = Math.max(1, ...searchesByHour.map((h) => h.count));

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Platform Overview</h1>
          <p className="text-xs text-slate-500">
            Real-time client activity, search volume, and server-side Serper.dev credit telemetry ({timezone}).
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchDashboard}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => onNavigateTab('search')}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>Run Admin Search</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Section 2A: Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Clients</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {cards.totalClients}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
            <span className="text-emerald-700 font-medium">{cards.activeClients} active</span> ·{' '}
            {cards.totalClients - cards.activeClients} disabled
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Searches Today</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {cards.searchesToday}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            In {timezone}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Searches (Week / Month)</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {cards.searchesThisWeek} <span className="text-slate-300 font-normal">/</span> {cards.searchesThisMonth}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Last 7d vs Current Month
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Serper Credits</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {cards.totalSerperCredits.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
            Today: <span className="text-emerald-700 font-medium">{cards.creditsToday}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">DataForSEO Calls</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1.5">
            {(cards.totalDataForSeoCalls || 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
            Today: <span className="text-sky-700 font-medium">{cards.dataForSeoCallsToday || 0}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Credits Used Today</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-600 mt-1.5">
            {cards.creditsToday.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Serper + {cards.dataForSeoCallsToday || 0} DataForSEO
          </div>
        </div>
      </div>

      {/* Section 2A: Charts (Searches per day last 30 days & Searches by hour of day) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Searches per day (last 30 days) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Searches per Day (Last 30 Days)</h2>
              <p className="text-xs text-slate-500">Daily scan volume across all clients</p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Peak: {maxDailyCount} / day
            </span>
          </div>

          <div className="h-48 flex items-end gap-1.5 pt-4 border-b border-slate-200">
            {searchesPerDay.map((d) => {
              const heightPct = Math.max(4, Math.round((d.count / maxDailyCount) * 100));
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] font-mono tabular-nums px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                    {d.date}: {d.count} searches ({d.credits} calls)
                  </div>
                  <div
                    className={`w-full rounded-t transition-all ${
                      d.count > 0 ? 'bg-slate-900 group-hover:bg-emerald-600' : 'bg-slate-100'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 mt-2">
            <span>{searchesPerDay[0]?.date}</span>
            <span>{searchesPerDay[Math.floor(searchesPerDay.length / 2)]?.date}</span>
            <span>{searchesPerDay[searchesPerDay.length - 1]?.date}</span>
          </div>
        </div>

        {/* Chart 2: Searches by hour of day */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Searches by Hour of Day</h2>
              <p className="text-xs text-slate-500">24-hour distribution ({timezone})</p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Peak: {maxHourlyCount} / hr
            </span>
          </div>

          <div className="h-48 flex items-end gap-1.5 pt-4 border-b border-slate-200">
            {searchesByHour.map((h) => {
              const heightPct = Math.max(4, Math.round((h.count / maxHourlyCount) * 100));
              return (
                <div
                  key={h.hour}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] font-mono tabular-nums px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                    {h.label}: {h.count} searches
                  </div>
                  <div
                    className={`w-full rounded-t transition-all ${
                      h.count > 0 ? 'bg-emerald-600 group-hover:bg-slate-900' : 'bg-slate-100'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 mt-2">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Top Clients Table & Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Clients by Number of Searches */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Top Clients by Search Volume</h2>
              <button
                onClick={() => onNavigateTab('clients')}
                className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
              >
                Manage Clients
              </button>
            </div>

            {topClients.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No client accounts added yet. Go to Clients to create your first client.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-2.5 px-4">Client</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Today</th>
                      <th className="py-2.5 px-4 text-right">Total Searches</th>
                      <th className="py-2.5 px-4 text-right">Serper / DFS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {topClients.map((client) => (
                      <tr key={client.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{client.name}</div>
                          <div className="text-slate-400 font-mono">
                            {client.userId} {client.company ? `· ${client.company}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-medium ${
                              client.active ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {client.active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {client.searchesToday}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {client.totalSearches}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          {client.creditsUsed} <span className="text-slate-300">/</span> {client.dataForSeoCallsUsed || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Search Activity</h2>
            <button
              onClick={() => onNavigateTab('logs')}
              className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
            >
              View All Logs
            </button>
          </div>

          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No searches have been executed yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {recentActivity.slice(0, 8).map((act) => {
                const dt = formatDateTime(act.createdAt, timezone);
                return (
                  <div
                    key={act.id}
                    onClick={() => act.status !== 'failed' && onOpenSearchResult(act.id)}
                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors cursor-pointer text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {act.businessName}{' '}
                        <span className="text-slate-400 font-normal">({act.city})</span>
                      </div>
                      <div className="text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span>{act.clientName}</span>
                        <span>·</span>
                        <span className="font-mono">{act.clientUserId}</span>
                        <span>·</span>
                        <span className="capitalize">{act.scanMode}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums text-slate-700">
                        <span className="text-emerald-700 font-medium">{act.confirmedCount}</span> confirmed ·{' '}
                        <span className="text-amber-700 font-medium">{act.possibleCount}</span> possible
                      </div>
                      <div className="text-slate-400 font-mono tabular-nums mt-0.5">
                        {dt.full} · <span className="capitalize">{act.status}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
