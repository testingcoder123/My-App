import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Search,
  Settings,
  LogOut,
  Loader2,
} from 'lucide-react';
import { AuthUser } from './types.ts';
import { apiFetch, setStoredToken } from './utils/api.ts';
import { AuthViews } from './components/AuthViews.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AdminClients } from './components/AdminClients.tsx';
import { AdminLogs } from './components/AdminLogs.tsx';
import { AdminSettings } from './components/AdminSettings.tsx';
import { SearchWorkspace } from './components/SearchWorkspace.tsx';

type AdminNavTab = 'dashboard' | 'clients' | 'logs' | 'search' | 'settings';

export default function App() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [initialized, setInitialized] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  // Navigation for ADMIN (CLIENT only ever sees SearchWorkspace)
  const [adminTab, setAdminTab] = useState<AdminNavTab>('dashboard');
  const [selectedLogSearchId, setSelectedLogSearchId] = useState<number | null>(null);

  const checkStatus = async () => {
    setCheckingAuth(true);
    try {
      const status = await apiFetch<{
        initialized: boolean;
        user: AuthUser | null;
        timezone: string;
      }>('/api/auth/status');
      setInitialized(status.initialized);
      setUser(status.user);
      if (status.timezone) setTimezone(status.timezone);
    } catch {
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    }
    setStoredToken(null);
    setUser(null);
  };

  const handleOpenSearchFromAdmin = (searchId: number) => {
    setSelectedLogSearchId(searchId);
    setAdminTab('logs');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center gap-3 text-sm">
        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
        <span>Loading Citation & Listing Discovery Platform...</span>
      </div>
    );
  }

  if (!initialized || !user) {
    return (
      <AuthViews
        initialized={initialized}
        onAuthenticated={(authedUser) => {
          setInitialized(true);
          setUser(authedUser);
          setAdminTab(authedUser.role === 'ADMIN' ? 'dashboard' : 'search');
        }}
      />
    );
  }

  // =========================================================
  // CLIENT ROLE VIEW (Section 3: ONLY Client Search is visible)
  // =========================================================
  if (user.role === 'CLIENT') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Top Bar Contract (3 zones) */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <span className="text-base font-semibold tracking-tight text-slate-900">
            Citation & Listing Discovery Platform
          </span>

          <div className="hidden md:flex items-center gap-4 text-xs text-slate-500">
            <span>Client Workspace</span>
            <span>·</span>
            <span className="font-medium text-slate-800">{user.name}</span>
            {user.company && (
              <>
                <span>·</span>
                <span>{user.company}</span>
              </>
            )}
            <span>·</span>
            <span className="font-mono">{user.userId}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
          <SearchWorkspace user={user} timezone={timezone} />
        </main>
      </div>
    );
  }

  // =========================================================
  // ADMIN ROLE VIEW (Sidebar + Top Header + Main Viewport)
  // =========================================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Sidebar Navigation (260px) */}
      <aside className="w-full lg:w-64 bg-slate-950 text-slate-300 flex flex-col justify-between shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="px-6 py-5 border-b border-slate-800/80">
            <div className="text-sm font-semibold tracking-tight text-white">
              Citation & Listing Discovery
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Administrator Console
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <button
              onClick={() => setAdminTab('dashboard')}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors cursor-pointer ${
                adminTab === 'dashboard'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setAdminTab('clients')}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors cursor-pointer ${
                adminTab === 'clients'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Clients & Quotas</span>
            </button>

            <button
              onClick={() => setAdminTab('logs')}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors cursor-pointer ${
                adminTab === 'logs'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Search Logs & Queries</span>
            </button>

            <button
              onClick={() => setAdminTab('search')}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors cursor-pointer ${
                adminTab === 'search'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Search className="w-4 h-4 shrink-0" />
              <span>Client Search Tool</span>
            </button>

            <button
              onClick={() => setAdminTab('settings')}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors cursor-pointer ${
                adminTab === 'settings'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Settings & Site Registry</span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/80 space-y-3 text-xs">
          <div>
            <div className="text-slate-200 font-medium">{user.name}</div>
            <div className="text-slate-500 font-mono">
              {user.userId} · ADMIN
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div className="text-xs font-medium text-slate-500">
            <span>Admin Console</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 capitalize">
              {adminTab === 'search' ? 'Client Search Tool' : adminTab}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="hidden sm:inline font-mono tabular-nums">
              Timezone: {timezone}
            </span>
            <button
              onClick={() => setAdminTab('search')}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Open Client Search Page
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {adminTab === 'dashboard' && (
            <AdminDashboard
              timezone={timezone}
              onOpenSearchResult={handleOpenSearchFromAdmin}
              onNavigateTab={(t) => setAdminTab(t)}
            />
          )}

          {adminTab === 'clients' && (
            <AdminClients
              timezone={timezone}
              onOpenSearchResult={handleOpenSearchFromAdmin}
            />
          )}

          {adminTab === 'logs' && (
            <AdminLogs
              timezone={timezone}
              initialSelectedSearchId={selectedLogSearchId}
              onClearSelectedSearchId={() => setSelectedLogSearchId(null)}
            />
          )}

          {adminTab === 'search' && (
            <SearchWorkspace
              user={user}
              timezone={timezone}
            />
          )}

          {adminTab === 'settings' && (
            <AdminSettings
              onSettingsUpdated={(newTz) => setTimezone(newTz)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
