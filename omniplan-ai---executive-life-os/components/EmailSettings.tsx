
import React, { useState } from 'react';
import { Plus, Trash2, TestTube, Check, X, Mail, AlertTriangle } from 'lucide-react';
import { EmailAccount } from '../types';
import { AlertDialog } from './Dialog';
import { platform } from '../services/platform';
import { storage, LOCAL_STORAGE_KEYS } from '../services/storage';

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail', host: 'imap.gmail.com' },
  { id: 'outlook', label: 'Outlook / Microsoft', host: 'outlook.office365.com' },
  { id: 'yahoo', label: 'Yahoo', host: 'imap.mail.yahoo.com' },
  { id: 'naver', label: 'Naver', host: 'imap.naver.com' },
  { id: 'custom', label: 'Custom IMAP', host: '' },
] as const;

// ---------------------------------------------------------------------------
// Storage helpers — accounts are persisted WITHOUT passwords.
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

export const EmailSettings: React.FC = () => {
  const [accounts, setAccounts] = useState<EmailAccount[]>(getEmailAccounts);
  const [isAdding, setIsAdding] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, 'testing' | 'success' | 'error'>>({});
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [keychainUnavailable, setKeychainUnavailable] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    provider: 'gmail' as EmailAccount['provider'],
    imapHost: '',
    imapPort: 993,
  });

  const addAccount = async () => {
    const account: EmailAccount = {
      id: crypto.randomUUID(),
      name: form.name || form.email,
      email: form.email,
      provider: form.provider,
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
    setIsAdding(false);
  };

  const removeAccount = async (id: string) => {
    if (platform.credentials.isAvailable()) {
      await platform.credentials.delete(`omni_email_pw_${id}`);
    }
    const updated = accounts.filter(a => a.id !== id);
    setAccounts(updated);
    saveEmailAccounts(updated);
  };

  const testConnection = async (account: EmailAccount) => {
    if (!platform.email.isAvailable()) {
      setAlertMsg('Email testing requires the desktop app. Open OmniPlan as an Electron app to test connections.');
      return;
    }
    setTestStatus(prev => ({ ...prev, [account.id]: 'testing' }));
    try {
      // fetchEmails triggers email:fetch in main — password is looked up from
      // safeStorage there. We do not pass the password from renderer here.
      const result = await platform.email.fetchEmails(account);
      setTestStatus(prev => ({ ...prev, [account.id]: result.success ? 'success' : 'error' }));
      if (!result.success) setAlertMsg('Connection failed: ' + result.error);
    } catch {
      setTestStatus(prev => ({ ...prev, [account.id]: 'error' }));
    }
  };

  const testNewConnection = async () => {
    if (!platform.email.isAvailable()) {
      setAlertMsg('Connection testing requires the desktop app.');
      return;
    }
    setTestStatus(prev => ({ ...prev, _new: 'testing' }));
    try {
      const result = await platform.email.testConnection({
        email: form.email,
        password: form.password,
        provider: form.provider,
        imapHost: form.imapHost,
        imapPort: form.imapPort,
      });
      setTestStatus(prev => ({ ...prev, _new: result.success ? 'success' : 'error' }));
      if (!result.success) setAlertMsg('Connection failed: ' + result.error);
    } catch {
      setTestStatus(prev => ({ ...prev, _new: 'error' }));
    }
  };

  return (
    <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
      {alertMsg && <AlertDialog message={alertMsg} onClose={() => setAlertMsg(null)} />}

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
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
        >
          {isAdding ? <X size={16}/> : <Plus size={16}/>}
          {isAdding ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {isAdding && (
        <div className="bg-white rounded-2xl p-6 mb-6 border border-slate-200 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Display Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="My Gmail"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Provider</label>
              <select
                value={form.provider}
                onChange={e => setForm(p => ({ ...p, provider: e.target.value as EmailAccount['provider'] }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none bg-white"
              >
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="user@gmail.com"
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
        </div>
      )}

      {accounts.length === 0 && !isAdding && (
        <p className="text-sm text-slate-400 font-medium">No email accounts configured. Add one to fetch real emails in the Inbox.</p>
      )}

      {accounts.map(account => (
        <div key={account.id} className="flex items-center justify-between bg-white rounded-2xl p-4 mb-2 border border-slate-200">
          <div>
            <div className="text-sm font-bold text-slate-900">{account.name}</div>
            <div className="text-xs text-slate-500">{account.email} &middot; {PROVIDERS.find(p => p.id === account.provider)?.label || 'Custom'}</div>
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
      ))}
    </div>
  );
};
