import React, { useEffect, useState } from 'react';
import {
  UserPlus,
  Copy,
  Check,
  Edit3,
  KeyRound,
  Trash2,
  Power,
  BarChart3,
  X,
  AlertCircle,
} from 'lucide-react';
import { ClientAccount } from '../types.ts';
import { apiFetch, formatDateTime } from '../utils/api.ts';

interface AdminClientsProps {
  timezone: string;
  onOpenSearchResult: (searchId: number) => void;
}

interface GeneratedCredentials {
  userId: string;
  password: string;
  name?: string;
}

interface ClientUsagePayload {
  client: {
    id: number;
    userId: string;
    name: string;
    company: string;
    dailyLimit: number;
    monthlyLimit: number;
    active: boolean;
  };
  searchesPerDay: Array<{ date: string; count: number }>;
  searchesByHour: Array<{ hour: number; label: string; count: number }>;
  searches: Array<{
    id: number;
    businessName: string;
    city: string;
    scanMode: string;
    serperCallsUsed: number;
    dataForSeoCallsUsed?: number;
    confirmedCount: number;
    possibleCount: number;
    durationMs: number;
    status: string;
    createdAt: string;
  }>;
}

export const AdminClients: React.FC<AdminClientsProps> = ({ timezone, onOpenSearchResult }) => {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Client Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDailyLimit, setNewDailyLimit] = useState(15);
  const [newMonthlyLimit, setNewMonthlyLimit] = useState(200);
  const [newActive, setNewActive] = useState(true);
  const [savingClient, setSavingClient] = useState(false);

  // Edit Client Modal State
  const [editingClient, setEditingClient] = useState<ClientAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDailyLimit, setEditDailyLimit] = useState(15);
  const [editMonthlyLimit, setEditMonthlyLimit] = useState(200);

  // One-time Generated Credentials Modal
  const [credentialsModal, setCredentialsModal] = useState<GeneratedCredentials | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Per-client Usage Modal
  const [usageModal, setUsageModal] = useState<ClientUsagePayload | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const loadClients = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ clients: ClientAccount[] }>('/api/admin/clients');
      setClients(data.clients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingClient(true);
    setError('');
    try {
      const res = await apiFetch<{
        client: ClientAccount;
        generatedCredentials: GeneratedCredentials;
      }>('/api/admin/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          company: newCompany,
          email: newEmail,
          phone: newPhone,
          dailyLimit: newDailyLimit,
          monthlyLimit: newMonthlyLimit,
          active: newActive,
        }),
      });
      setShowAddModal(false);
      setNewName('');
      setNewCompany('');
      setNewEmail('');
      setNewPhone('');
      setNewDailyLimit(15);
      setNewMonthlyLimit(200);
      setNewActive(true);
      setCredentialsModal({
        ...res.generatedCredentials,
        name: res.client.name,
      });
      setCopiedCreds(false);
      loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client.');
    } finally {
      setSavingClient(false);
    }
  };

  const openEditModal = (c: ClientAccount) => {
    setEditingClient(c);
    setEditName(c.name);
    setEditCompany(c.company);
    setEditEmail(c.email);
    setEditPhone(c.phone);
    setEditDailyLimit(c.dailyLimit);
    setEditMonthlyLimit(c.monthlyLimit);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setSavingClient(true);
    try {
      await apiFetch(`/api/admin/clients/${editingClient.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName,
          company: editCompany,
          email: editEmail,
          phone: editPhone,
          dailyLimit: editDailyLimit,
          monthlyLimit: editMonthlyLimit,
        }),
      });
      setEditingClient(null);
      loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update client.');
    } finally {
      setSavingClient(false);
    }
  };

  const handleToggleActive = async (c: ClientAccount) => {
    try {
      await apiFetch(`/api/admin/clients/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !c.active }),
      });
      loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  const handleResetPassword = async (c: ClientAccount) => {
    try {
      const res = await apiFetch<{ generatedCredentials: GeneratedCredentials }>(
        `/api/admin/clients/${c.id}/reset-password`,
        { method: 'POST' }
      );
      setCredentialsModal(res.generatedCredentials);
      setCopiedCreds(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    }
  };

  const handleDeleteClient = async (c: ClientAccount) => {
    try {
      await apiFetch(`/api/admin/clients/${c.id}`, { method: 'DELETE' });
      loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete client.');
    }
  };

  const handleViewClientUsage = async (clientId: number) => {
    setLoadingUsage(true);
    try {
      const data = await apiFetch<ClientUsagePayload>(`/api/admin/clients/${clientId}/usage`);
      setUsageModal(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client usage.');
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!credentialsModal) return;
    const text = `Citation & Listing Discovery Platform Credentials\nLogin URL: ${window.location.origin}\nUser ID: ${credentialsModal.userId}\nPassword: ${credentialsModal.password}`;
    navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Client Accounts & Quotas</h1>
          <p className="text-xs text-slate-500">
            Create isolated client credentials, manage daily/monthly search limits, and inspect per-client usage.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Client Account</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Client Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading client accounts...</div>
        ) : clients.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="text-sm font-medium text-slate-900">No clients provisioned yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Add your first client account. The system will auto-generate a unique User ID and strong password for you to copy.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              Add First Client
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                  <th className="py-3 px-4">Client & User ID</th>
                  <th className="py-3 px-4">Company & Contact</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created / Last Login</th>
                  <th className="py-3 px-4 text-right">Today / Limit</th>
                  <th className="py-3 px-4 text-right">Month / Limit</th>
                  <th className="py-3 px-4 text-right">Total Searches</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {clients.map((c) => {
                  const createdDt = formatDateTime(c.createdAt, timezone);
                  const loginDt = c.lastLogin ? formatDateTime(c.lastLogin, timezone).full : 'Never';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="font-mono text-slate-500 mt-0.5">{c.userId}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800">{c.company || '—'}</div>
                        <div className="text-slate-400">
                          {[c.email, c.phone].filter(Boolean).join(' · ') || 'No email/phone'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            c.active ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {c.active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        <div>Created: {createdDt.date}</div>
                        <div className="text-slate-400">Login: {loginDt}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <span
                          className={
                            c.searchesToday >= c.dailyLimit ? 'text-red-600 font-semibold' : 'text-slate-900'
                          }
                        >
                          {c.searchesToday}
                        </span>{' '}
                        <span className="text-slate-400">/ {c.dailyLimit}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <span
                          className={
                            c.searchesThisMonth >= c.monthlyLimit ? 'text-red-600 font-semibold' : 'text-slate-900'
                          }
                        >
                          {c.searchesThisMonth}
                        </span>{' '}
                        <span className="text-slate-400">/ {c.monthlyLimit}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">{c.totalSearches}</div>
                        <div className="text-slate-400">
                          {c.creditsUsed} Serper · {c.dataForSeoCallsUsed || 0} DFS
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleViewClientUsage(c.id)}
                            disabled={loadingUsage}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                            title="View Per-Client Usage & Timestamps"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(c)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                            title="Edit Limits & Details"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(c)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                            title="Reset Password (Generates New Strong Password)"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(c)}
                            className={`p-1.5 rounded-md cursor-pointer ${
                              c.active
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={c.active ? 'Disable Client' : 'Enable Client'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClient(c)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                            title="Delete Client"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD CLIENT */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Add New Client</h3>
                <p className="text-xs text-slate-500">
                  User ID and a strong 14-character password will be auto-generated.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Rohan Sharma"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="e.g. Horizon SEO Agency"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="client@company.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone (optional)
                  </label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Daily Search Limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newDailyLimit}
                    onChange={(e) => setNewDailyLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Search Limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newMonthlyLimit}
                    onChange={(e) => setNewMonthlyLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newActive}
                  onChange={(e) => setNewActive(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span>Account is Active immediately</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingClient}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer"
                >
                  {savingClient ? 'Generating Credentials...' : 'Create Client & Generate Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ONE-TIME GENERATED CREDENTIALS */}
      {credentialsModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 text-white border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">Client Credentials Generated</h3>
                <p className="text-xs text-slate-400">
                  Save or copy these credentials now. For security, the password is shown only once.
                </p>
              </div>
              <button
                onClick={() => setCredentialsModal(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3 font-mono text-xs">
              <div>
                <div className="text-slate-500 font-sans">User ID</div>
                <div className="text-sm font-semibold text-emerald-400 mt-0.5 select-all">
                  {credentialsModal.userId}
                </div>
              </div>
              <div>
                <div className="text-slate-500 font-sans">Strong Password (One-Time View)</div>
                <div className="text-sm font-semibold text-white mt-0.5 select-all">
                  {credentialsModal.password}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleCopyCredentials}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedCreds ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Credentials</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setCredentialsModal(null)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT CLIENT LIMITS & INFO */}
      {editingClient && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Edit Client ({editingClient.userId})
                </h3>
                <p className="text-xs text-slate-500">Update contact information and daily/monthly search quotas.</p>
              </div>
              <button
                onClick={() => setEditingClient(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Daily Search Limit
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editDailyLimit}
                    onChange={(e) => setEditDailyLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Search Limit
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editMonthlyLimit}
                    onChange={(e) => setEditMonthlyLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingClient}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: PER-CLIENT USAGE BREAKDOWN */}
      {usageModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Client Usage Analytics: {usageModal.client.name} ({usageModal.client.userId})
                </h3>
                <p className="text-xs text-slate-500">
                  Searches per day, hourly distribution, and exact timestamp log ({timezone}).
                </p>
              </div>
              <button
                onClick={() => setUsageModal(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Mini Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-800 mb-3">
                    Searches per Day (Last 30 Days)
                  </div>
                  <div className="h-28 flex items-end gap-1 border-b border-slate-200 pt-2">
                    {usageModal.searchesPerDay.map((d) => {
                      const maxD = Math.max(1, ...usageModal.searchesPerDay.map((x) => x.count));
                      const pct = Math.max(5, Math.round((d.count / maxD) * 100));
                      return (
                        <div
                          key={d.date}
                          title={`${d.date}: ${d.count} searches`}
                          className={`flex-1 rounded-t ${
                            d.count > 0 ? 'bg-slate-900' : 'bg-slate-100'
                          }`}
                          style={{ height: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-800 mb-3">
                    Searches by Hour of Day (00:00 – 23:00)
                  </div>
                  <div className="h-28 flex items-end gap-1 border-b border-slate-200 pt-2">
                    {usageModal.searchesByHour.map((h) => {
                      const maxH = Math.max(1, ...usageModal.searchesByHour.map((x) => x.count));
                      const pct = Math.max(5, Math.round((h.count / maxH) * 100));
                      return (
                        <div
                          key={h.hour}
                          title={`${h.label}: ${h.count} searches`}
                          className={`flex-1 rounded-t ${
                            h.count > 0 ? 'bg-emerald-600' : 'bg-slate-100'
                          }`}
                          style={{ height: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Exact Timestamps Table */}
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2">
                  Chronological Search Log ({usageModal.searches.length} total searches)
                </h4>
                {usageModal.searches.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4">No searches executed by this client.</div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="py-2 px-3">Exact Timestamp ({timezone})</th>
                          <th className="py-2 px-3">Business & City</th>
                          <th className="py-2 px-3">Mode</th>
                          <th className="py-2 px-3 text-right">Confirmed / Possible</th>
                          <th className="py-2 px-3 text-right">Serper / DFS Calls</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {usageModal.searches.map((s) => {
                          const dt = formatDateTime(s.createdAt, timezone);
                          return (
                            <tr key={s.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                                {dt.date} · {dt.time}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {s.businessName} ({s.city})
                              </td>
                              <td className="py-2.5 px-3 capitalize text-slate-600">{s.scanMode}</td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {s.confirmedCount} / {s.possibleCount}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {s.serperCallsUsed} <span className="text-slate-300">/</span> {s.dataForSeoCallsUsed || 0}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => {
                                    setUsageModal(null);
                                    onOpenSearchResult(s.id);
                                  }}
                                  className="text-emerald-700 hover:underline font-medium cursor-pointer"
                                >
                                  Open Result
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
          </div>
        </div>
      )}
    </div>
  );
};
