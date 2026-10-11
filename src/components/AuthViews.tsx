import React, { useState } from 'react';
import { Lock, ShieldCheck, KeyRound, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { AuthUser } from '../types.ts';
import { apiFetch, setStoredToken } from '../utils/api.ts';

interface AuthViewsProps {
  initialized: boolean;
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthViews: React.FC<AuthViewsProps> = ({ initialized, onAuthenticated }) => {
  const [userId, setUserId] = useState(initialized ? '' : 'admin');
  const [name, setName] = useState('Platform Administrator');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify({ userId: userId.trim(), name: name.trim(), password }),
      });
      setStoredToken(data.token);
      onAuthenticated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize admin account.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId: userId.trim(), password }),
      });
      setStoredToken(data.token);
      onAuthenticated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Top Bar Contract */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-slate-800/80">
        <span className="text-base font-semibold tracking-tight text-white">
          Citation & Listing Discovery Platform
        </span>
        <div className="text-xs text-slate-400 font-mono tabular-nums">
          {initialized ? 'Authorized Access Only' : 'First-Run System Initialization'}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Value & Architecture Context */}
          <div className="lg:col-span-7 space-y-6">
            <div className="text-xs font-medium text-emerald-400 tracking-wide">
              {initialized
                ? 'Enterprise Citation & NAP Verification'
                : 'Step 01 · Administrator Account Provisioning'}
            </div>
            <h1
              className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight"
              style={{ textWrap: 'balance' }}
            >
              {initialized
                ? 'Discover business listings, verify NAP accuracy, and audit directory presence at scale.'
                : 'Initialize your primary Administrator credentials to unlock the platform.'}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
              {initialized
                ? 'Sign in with your assigned User ID and password. Clients access isolated citation discovery workspaces, while Administrators manage Serper.dev API keys, client quotas, site registries, and global search logs.'
                : 'This is the first time the platform is running. Create your root ADMIN account below. Once signed in, you can configure your server-side Serper.dev API key and generate isolated client credentials.'}
            </p>

            <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-slate-400">
              <div>
                <div className="font-semibold text-slate-200 mb-1">2-Phase Discovery Engine</div>
                <p>Open-web search combined with batched site-registry verification across 155+ seeded directories.</p>
              </div>
              <div>
                <div className="font-semibold text-slate-200 mb-1">4-Signal NAP Matching</div>
                <p>Evaluates Phone (last 10 digits), Address token overlap, Jaro-Winkler Name score, and Root Domain.</p>
              </div>
              <div>
                <div className="font-semibold text-slate-200 mb-1">Server-Side Security</div>
                <p>Encrypted Serper.dev API key storage, strict RBAC route isolation, and per-client daily/monthly quotas.</p>
              </div>
            </div>
          </div>

          {/* Right Column: Auth Card */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-7">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400">
                  {initialized ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {initialized ? 'Sign In to Workspace' : 'Create Admin Account'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {initialized
                      ? 'Enter your User ID and password'
                      : 'Configure root administrator credentials'}
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-5 p-3.5 rounded-lg bg-red-950/60 border border-red-800/80 flex items-start gap-2.5 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!initialized ? (
                <form onSubmit={handleSetupAdmin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Administrator Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Platform Administrator"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Admin User ID
                    </label>
                    <input
                      type="text"
                      required
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="e.g. admin"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Set Strong Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full px-3.5 py-2.5 pr-10 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Confirm Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <span>{loading ? 'Provisioning Admin Account...' : 'Create Admin Account & Continue'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      User ID
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="Enter your User ID"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full px-3.5 py-2.5 pr-10 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? 'Signing In...' : 'Sign In'}</span>
                  </button>

                  <p className="text-xs text-slate-500 text-center pt-2">
                    No public registration. Contact your platform administrator for credentials.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-8 py-4 border-t border-slate-900 text-xs text-slate-500 flex items-center justify-between">
        <span>Citation & Listing Discovery Platform</span>
        <span>Role-Based Access Control · Server-Side Serper Engine</span>
      </footer>
    </div>
  );
};
