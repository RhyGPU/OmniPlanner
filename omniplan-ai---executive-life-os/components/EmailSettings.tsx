
import React, { useState } from 'react';
import { Plus, Trash2, TestTube, Check, X, Mail, AlertTriangle, LogIn, Lock } from 'lucide-react';
import { EmailAccount } from '../types';
import { platform } from '../services/platform';
import { storage, LOCAL_STORAGE_KEYS } from '../services/storage';
import { getEmailUserMessage } from '../services/email/errors';
import { PROVIDER_CAPABILITIES, providerSupportsOAuth, type EmailProviderKey } from '../services/email/providers';

// ---------------------------------------------------------------------------
// Storage helpers — accounts are persisted WITHOUT passwords or tokens.
// Passwords live in Electron safeStorage (keychain:set / keychain:get IPC).
// All reads/writes go through the storage adapter so IndexedDB is used on web.
// ---------------------------------------------------------------------------

export function getEmailAccounts(): EmailAccount[] {
  return storage.get<EmailAccount[]>(LOCAL_STORAGE_KEYS.EMAIL_ACCOUNTS) ?? [];
}

function saveEmailAccounts(accounts: EmailAccount[]) {
  // Strip any lingering password fields before persisting.
  const sanitised = accounts.map(({ password: _pw, ...rest }) => rest as EmailAccount);
  storage.set(LOCAL_STORAGE_KEYS.EMAIL_ACCOUNTS, sanitised);
}

// Providers shown in the dropdown — all providers from the capability registry.
const ORDERED_PROVIDERS: EmailProviderKey[] = ['gmail', 'outlook', 'yahoo', 'naver', 'daum', 'custom'];

export const EmailSettings: React.FC = () => {
  const [accounts, setAccounts] = useState<EmailAccount[]>(getEmailAccounts);
  const [isAdding, setIsAdding] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'success' | 'error'>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});
  const [keychainUnavailable, setKeychainUnavailable] = useState(false);

  // When adding an account: tracks whether user chose the manual IMAP form
  // over the OAuth button for an OAuth-capable provider.
  const [useManualForm, setUseManualForm] = useState(false);

  // OAuth login status
  const [oauthStatus, setOauthStatus] = useState<null | 'pending' | 'success' | 'error'>(null);
  const [oauthError, setOauthError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    provider: 'gmail' as EmailAccount['provider'],
    imapHost: '',
    imapPort: 993,
  });

  const isDesktop = platform.email.isAvailable();
  const selectedCap = PROVIDER_CAPABILITIES[form.provider as EmailProviderKey];
  const showOAuthButton =
    isDesktop &&
    providerSupportsOAuth(form.provider as EmailProviderKey) &&
    !useManualForm;

  // ── OAuth sign-in ────────────────────────────────────────────────────────

  const startOAuth = async (provider: 'gmail' | 'outlook') => {
    setOauthStatus('pending');
    setOauthError('');
    const accountId = crypto.randomUUID();
    try {
      const result = await platform.email.startOAuthLogin({ provider, accountId });
      if (result.success && result.email) {
        const account: EmailAccount = {
          id: result.accountId ?? accountId,
          name: result.email,
          email: result.email,
          provider,
          authMethod: 'oauth',
          enabled: true,
        };
        const updated = [...accounts, account];
        setAccounts(updated);
        saveEmailAccounts(updated);
        setOauthStatus('success');
        // Auto-close the add panel after a short success flash
        setTimeout(() => {
          setIsAdding(false);
          setOauthStatus(null);
          setOauthError('');
          setUseManualForm(false);
          setForm({ name: '', email: '', password: '', provider: 'gmail', imapHost: '', imapPort: 993 });
        }, 1500);
      } else {
        setOauthStatus('error');
        setOauthError(getEmailUserMessage(result.code));
      }
    } catch {
      setOauthStatus('error');
      setOauthError('Sign-in failed unexpectedly. Try again.');
    }
  };

  // ── Manual IMAP account save ─────────────────────────────────────────────

  const addAccount = async () => {
    const account: EmailAccount = {
      id: crypto.randomUUID(),
      name: form.name || form.email,
      email: form.email,
      provider: form.provider,
      authMethod: 'imap_password',
      imapHost: form.provider === 'custom' ? form.imapHost : undefined,
      imapPort: form.provider === 'custom' ? form.imapPort : undefined,
      enabled: true,
    };

    // Store password via platform credential service; fall back to inline if unavailable.
    if (platform.credentials.isAvailable()) {
      const ok = await platform.credentials.set(`omni_email_pw_${account.id}`, form.password);
      if (!ok) {
        setKeychainUnavailable(true);
        // Fallback: store in the account object (plain localStorage)
        (account as EmailAccount).password = form.password;
      }
    } else {
      // Non-Electron environment (web dev): store inline
      (account as EmailAccount).password = form.password;
    }

    const updated = [...accounts, account];
    setAccounts(updated);
    saveEmailAccounts(updated);
    setForm({ name: '', email: '', password: '', provider: 'gmail', imapHost: '', imapPort: 993 });
    setUseManualForm(false);
    setIsAdding(false);
  };

  // ── Account removal ──────────────────────────────────────────────────────

  const removeAccount = async (id: string) => {
    if (platform.credentials.isAvailable()) {
      // Delete all possible credential keys; deleteCredential is a no-op for missing keys
      await platform.credentials.delete(`omni_email_pw_${id}`);
      await platform.credentials.delete(`omni_email_oauth_access_${id}`);
      await platform.credentials.delete(`omni_email_oauth_refresh_${id}`);
    }
    const updated = accounts.filter(a => a.id !== id);
    setAccounts(updated);
    saveEmailAccounts(updated);
  };

  // ── Connection testing ───────────────────────────────────────────────────

  const testConnection = async (account: EmailAccount) => {
    if (!platform.email.isAvailable()) {
      setTestStatus(prev => ({ ...prev, [account.id]: 'error' }));
      setTestErrors(prev => ({ ...prev, [account.id]: 'Email requires the desktop app.' }));
      return;
    }
    setTestStatus(prev => ({ ...prev, [account.id]: 'testing' }));
    setTestErrors(prev => { const n = { ...prev }; delete n[account.id]; return n; });
    try {
      const result = await platform.email.fetchEmails(account);
      setTestStatus(prev => ({ ...prev, [account.id]: result.success ? 'success' : 'error' }));
      if (!result.success) {
        setTestErrors(prev => ({ ...prev, [account.id]: getEmailUserMessage(result.code) }));
      }
    } catch {
      setTestStatus(prev => ({ ...prev, [account.id]: 'error' }));
      setTestErrors(prev => ({ ...prev, [account.id]: 'Connection failed unexpectedly. Try again.' }));
    }
  };

  const testNewConnection = async () => {
    if (!platform.email.isAvailable()) {
      setTestStatus(prev => ({ ...prev, _new: 'error' }));
      setTestErrors(prev => ({ ...prev, _new: 'Email requires the desktop app.' }));
      return;
    }
    setTestStatus(prev => ({ ...prev, _new: 'testing' }));
    setTestErrors(prev => { const n = { ...prev }; delete n['_new']; return n; });
    try {
      const result = await platform.email.testConnection({
        email: form.email,
        password: form.password,
        provider: form.provider,
        imapHost: form.imapHost,
        imapPort: form.imapPort,
      });
      setTestStatus(prev => ({ ...prev, _new: result.success ? 'success' : 'error' }));
      if (!result.success) {
        setTestErrors(prev => ({ ...prev, _new: getEmailUserMessage(result.code) }));
      }
    } catch {
      setTestStatus(prev => ({ ...prev, _new: 'error' }));
      setTestErrors(prev => ({ ...prev, _new: 'Connection failed unexpectedly. Try again.' }));
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const cancelAdding = () => {
    setIsAdding(false);
    setUseManualForm(false);
    setOauthStatus(null);
    setOauthError('');
    setForm({ name: '', email: '', password: '', provider: 'gmail', imapHost: '', imapPort: 993 });
  };

  const authMethodLabel = (account: EmailAccount) => {
    if (account.authMethod === 'oauth') return 'signed in';
    return 'app password';
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">

      {/* Desktop-only capability notice */}
      {!isDesktop && (
        <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-6">
          <Mail size={16} className="text-slate-400 mt-0.5 flex-shrink-0"/>
          <div>
            <p className="text-xs font-black text-slate-700 mb-0.5">Desktop feature</p>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              IMAP email fetching and provider sign-in are only available in the desktop app.
              You can save account details here, but inbox sync will not work on web or mobile.
            </p>
          </div>
        </div>
      )}

      {keychainUnavailable && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0"/>
          <p className="text-xs font-bold text-amber-700">
            OS keychain unavailable — password saved in plain local storage. Install a keyring daemon for encrypted storage.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Mail className="text-blue-600" size={24} />
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Email Accounts</h3>
        </div>
        <button
          onClick={() => isAdding ? cancelAdding() : setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
        >
          {isAdding ? <X size={16}/> : <Plus size={16}/>}
          {isAdding ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {isAdding && (
        <div className="bg-white rounded-2xl p-6 mb-6 border border-slate-200 space-y-4">

          {/* Provider selector — always shown */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Provider</label>
              <select
                value={form.provider}
                onChange={e => {
                  setForm(p => ({ ...p, provider: e.target.value as EmailAccount['provider'] }));
                  setUseManualForm(false);
                  setOauthStatus(null);
                  setOauthError('');
                }}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none bg-white"
              >
                {ORDERED_PROVIDERS.map(id => (
                  <option key={id} value={id}>{PROVIDER_CAPABILITIES[id].displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Display Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="My work email"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              />
            </div>
          </div>

          {/* Setup note for manual-only providers */}
          {!providerSupportsOAuth(form.provider as EmailProviderKey) && selectedCap.setupNote && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              <Lock size={13} className="text-blue-500 mt-0.5 flex-shrink-0"/>
              <p className="text-[11px] font-medium text-blue-700 leading-relaxed">{selectedCap.setupNote}</p>
            </div>
          )}

          {/* OAuth path — shown for Gmail/Outlook on desktop unless user chose manual */}
          {showOAuthButton && (
            <div className="space-y-3">
              <button
                onClick={() => startOAuth(form.provider as 'gmail' | 'outlook')}
                disabled={oauthStatus === 'pending'}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
                  oauthStatus === 'success'
                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                    : oauthStatus === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {oauthStatus === 'pending' ? (
                  <LogIn size={16} className="animate-pulse"/>
                ) : oauthStatus === 'success' ? (
                  <Check size={16}/>
                ) : (
                  <LogIn size={16}/>
                )}
                {oauthStatus === 'pending'
                  ? 'Opening browser…'
                  : oauthStatus === 'success'
                  ? 'Signed in'
                  : selectedCap.oauthButtonLabel ?? 'Sign in'}
              </button>

              {oauthStatus === 'error' && oauthError && (
                <p className="text-[11px] font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle size={11} className="flex-shrink-0"/>
                  {oauthError}
                </p>
              )}

              <button
                onClick={() => setUseManualForm(true)}
                className="w-full text-xs font-medium text-slate-400 hover:text-slate-600 py-1 transition-colors"
              >
                Use app password instead
              </button>
            </div>
          )}

          {/* Manual IMAP form — shown when provider is non-OAuth or user chose manual */}
          {!showOAuthButton && (
            <>
              {/* Back-to-OAuth link (only if this provider supports OAuth) */}
              {isDesktop && providerSupportsOAuth(form.provider as EmailProviderKey) && useManualForm && (
                <button
                  onClick={() => setUseManualForm(false)}
                  className="w-full text-xs font-medium text-blue-500 hover:text-blue-700 py-1 transition-colors text-left"
                >
                  ← Use {selectedCap.oauthButtonLabel ?? 'provider sign-in'} instead
                </button>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="user@example.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">App Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="App-specific password"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                  />
                </div>
              </div>

              {/* Setup note when using manual form for an OAuth-capable provider */}
              {providerSupportsOAuth(form.provider as EmailProviderKey) && selectedCap.setupNote && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                  <Lock size={13} className="text-blue-500 mt-0.5 flex-shrink-0"/>
                  <p className="text-[11px] font-medium text-blue-700 leading-relaxed">{selectedCap.setupNote}</p>
                </div>
              )}

              {form.provider === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">IMAP Host</label>
                    <input
                      type="text"
                      value={form.imapHost}
                      onChange={e => setForm(p => ({ ...p, imapHost: e.target.value }))}
                      placeholder="imap.example.com"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">IMAP Port</label>
                    <input
                      type="number"
                      value={form.imapPort}
                      onChange={e => setForm(p => ({ ...p, imapPort: parseInt(e.target.value) || 993 }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={addAccount}
                  disabled={!form.email || !form.password}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save Account
                </button>
                <button
                  onClick={testNewConnection}
                  disabled={!form.email || !form.password}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    testStatus['_new'] === 'success' ? 'bg-emerald-100 text-emerald-700' :
                    testStatus['_new'] === 'error' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                  }`}
                >
                  {testStatus['_new'] === 'testing' ? <TestTube size={15} className="animate-pulse"/> : <TestTube size={15}/>}
                  {testStatus['_new'] === 'success' ? 'Connected' :
                   testStatus['_new'] === 'error' ? 'Failed' : 'Test Connection'}
                </button>
              </div>
              {testErrors['_new'] && testStatus['_new'] === 'error' && (
                <p className="text-[11px] font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle size={11} className="flex-shrink-0"/>
                  {testErrors['_new']}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {accounts.length === 0 && !isAdding && (
        <p className="text-sm text-slate-400 font-medium">
          {isDesktop
            ? 'No accounts configured. Add one to fetch emails in the Inbox.'
            : 'No accounts configured. Add one below — fetching requires the desktop app.'}
        </p>
      )}

      {accounts.map(account => {
        const cap = PROVIDER_CAPABILITIES[account.provider as EmailProviderKey];
        return (
          <div key={account.id} className="mb-2">
            <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-200">
              <div>
                <div className="text-sm font-bold text-slate-900">{account.name}</div>
                <div className="text-xs text-slate-500">
                  {account.email}
                  {' · '}
                  {cap?.displayName ?? 'Custom'}
                  {' · '}
                  <span className={account.authMethod === 'oauth' ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                    {authMethodLabel(account)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => testConnection(account)}
                  className={`p-2 rounded-lg transition-all ${
                    testStatus[account.id] === 'success' ? 'bg-emerald-100 text-emerald-600' :
                    testStatus[account.id] === 'error' ? 'bg-red-100 text-red-600' :
                    'bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600'
                  }`}
                  title="Test Connection"
                >
                  {testStatus[account.id] === 'success' ? <Check size={16}/> :
                   testStatus[account.id] === 'testing' ? <TestTube size={16} className="animate-pulse"/> :
                   <TestTube size={16}/>}
                </button>
                <button
                  onClick={() => removeAccount(account.id)}
                  className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-all"
                  title="Remove Account"
                >
                  <Trash2 size={16}/>
                </button>
              </div>
            </div>
            {testErrors[account.id] && testStatus[account.id] === 'error' && (
              <p className="text-[11px] font-medium text-red-600 flex items-center gap-1 px-1 pt-1">
                <AlertTriangle size={11} className="flex-shrink-0"/>
                {testErrors[account.id]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
