
import React, { useState } from 'react';
import {
  Mail, ChevronLeft, Archive, Trash2, CheckCircle, RefreshCw,
  CalendarPlus, Loader2, AlertTriangle, CalendarCheck, X,
} from 'lucide-react';
import { Email, CalendarEvent, WeekData } from '../types';
import { getEmailAccounts } from './EmailSettings';
import { extractEventFromEmail } from '../services/ai';
import { platform } from '../services/platform';
import { getAIReadiness } from '../services/ai/readiness';
import { EmailError, getEmailUserMessage } from '../services/email/errors';

interface EmailViewProps {
  emails: Email[];
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  allWeeks: Record<string, WeekData>;
  onAddEvent: (date: Date, event: CalendarEvent) => void;
}

type ExtractState =
  | { phase: 'idle' }
  | { phase: 'extracting' }
  | { phase: 'preview'; data: { title: string; date: string; startHour: number; duration: number } }
  | { phase: 'not_found' }
  | { phase: 'error'; message: string }
  | { phase: 'saved'; title: string; date: string };

/** Format a decimal hour to a human-readable time string, e.g. 14.5 → "2:30 PM" */
function formatHour(h: number): string {
  const totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 || 12;
  return `${hour12}:${mm.toString().padStart(2, '0')} ${ampm}`;
}

export const EmailView: React.FC<EmailViewProps> = ({ emails, setEmails, allWeeks, onAddEvent }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchWarnings, setFetchWarnings] = useState<string[]>([]);
  const [extractState, setExtractState] = useState<ExtractState>({ phase: 'idle' });
  const [bodyLoadError, setBodyLoadError] = useState<string | null>(null);

  const selectedEmail = emails.find(e => e.id === selectedId);
  const emailIsDesktop = platform.email.isAvailable();
  const ai = getAIReadiness();

  // Read accounts from storage at render time for empty-state checks.
  const storedAccounts = getEmailAccounts();
  const enabledAccounts = storedAccounts.filter(a => a.enabled);

  const markRead = (id: number) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, read: true } : e));
    setSelectedId(id);
    setExtractState({ phase: 'idle' });
  };

  const deleteEmail = (id: number) => {
    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setExtractState({ phase: 'idle' });
    }
  };

  const fetchAllEmails = async () => {
    // Guard: only called when desktop + accounts exist (button is disabled otherwise)
    if (!emailIsDesktop || enabledAccounts.length === 0) return;

    setFetching(true);
    setFetchWarnings([]);
    try {
      let nextId = Math.max(0, ...emails.map(e => e.id)) + 1;
      const newEmails: Email[] = [];
      const warnings: string[] = [];

      for (const account of enabledAccounts) {
        const result = await platform.email.fetchEmails(account);
        if (result.success) {
          for (const msg of result.emails) {
            newEmails.push({
              id: nextId++,
              provider: account.provider,
              sender: msg.sender,
              subject: msg.subject,
              preview: msg.preview || msg.subject.substring(0, 60),
              body: '',
              time: msg.date ? new Date(msg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
              read: msg.read,
              _uid: msg.uid,
              _accountId: account.id,
            } as any);
          }
        } else {
          warnings.push(
            `${account.email}: ${getEmailUserMessage(result.code) || result.error || 'fetch failed'}`,
          );
        }
      }

      if (warnings.length > 0) setFetchWarnings(warnings);
      if (newEmails.length > 0) setEmails(prev => [...newEmails, ...prev]);
    } finally {
      setFetching(false);
    }
  };

  const loadEmailBody = async (email: any) => {
    if (email.body || !email._uid || !email._accountId) return;
    if (!emailIsDesktop) return;
    const account = storedAccounts.find(a => a.id === email._accountId);
    if (!account) return;
    setBodyLoadError(null);
    const result = await platform.email.fetchEmailBody(account, email._uid);
    if (result.success) {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, body: result.body } : e));
    } else {
      setBodyLoadError(getEmailUserMessage(result.code));
    }
  };

  /** Step 1: extract candidate from email body (read-only). */
  const handleStartExtract = async () => {
    if (!selectedEmail?.body) return;
    setExtractState({ phase: 'extracting' });
    try {
      const data = await extractEventFromEmail(selectedEmail.body);
      if (data) {
        setExtractState({ phase: 'preview', data });
      } else {
        setExtractState({ phase: 'not_found' });
        setTimeout(() => setExtractState({ phase: 'idle' }), 4000);
      }
    } catch (err) {
      const code = err instanceof EmailError ? err.code : undefined;
      const message = code
        ? getEmailUserMessage(code)
        : err instanceof Error
        ? err.message
        : 'Extraction failed. Check AI settings.';
      setExtractState({ phase: 'error', message });
      setTimeout(() => setExtractState({ phase: 'idle' }), 5000);
    }
  };

  /** Step 2: user confirms — write event to calendar. */
  const handleConfirmEvent = () => {
    if (extractState.phase !== 'preview') return;
    const { data } = extractState;
    const date = new Date(data.date + 'T12:00:00');
    const event: CalendarEvent = {
      id: crypto.randomUUID(),
      title: data.title,
      startHour: data.startHour,
      duration: data.duration,
      color: '#3b82f6',
    };
    onAddEvent(date, event);
    setExtractState({ phase: 'saved', title: data.title, date: data.date });
    setTimeout(() => setExtractState({ phase: 'idle' }), 5000);
  };

  const handleCancelExtract = () => setExtractState({ phase: 'idle' });

  const handleSelectEmail = (email: Email) => {
    setBodyLoadError(null);
    markRead(email.id);
    loadEmailBody(email);
  };

  /** Resolve the real "To" address for a fetched email, or null if unknown. */
  const getToAddress = (email: any): string | null => {
    if (!email._accountId) return null;
    return storedAccounts.find(a => a.id === email._accountId)?.email ?? null;
  };

  const addingEvent = extractState.phase === 'extracting';

  // Suppress unused-import warning from allWeeks — prop retained for API stability
  void allWeeks;

  return (
    <div className="flex h-full bg-white relative">

      {/* ── Left panel: inbox list ── */}
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-slate-200`}>
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Inbox</h2>
          <button
            onClick={fetchAllEmails}
            disabled={fetching || !emailIsDesktop || enabledAccounts.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-default"
          >
            {fetching ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            {fetching ? 'Fetching…' : 'Fetch Mail'}
          </button>
        </div>

        {/* Capability banner — only on web / mobile */}
        {!emailIsDesktop && (
          <div className="mx-4 mt-4 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200">
            <p className="text-xs font-black text-slate-700 mb-0.5">Desktop feature</p>
            <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
              Email inbox is only available in the desktop app. Open OmniPlanner on your computer to connect your inbox.
            </p>
          </div>
        )}

        {/* Per-fetch partial-failure warnings */}
        {fetchWarnings.length > 0 && (
          <div className="mx-4 mt-3 px-4 py-3 bg-amber-50 rounded-2xl border border-amber-100">
            <p className="text-[10px] font-black text-amber-700 mb-1 uppercase tracking-wide">
              {fetchWarnings.length} account{fetchWarnings.length > 1 ? 's' : ''} failed
            </p>
            {fetchWarnings.map((w, i) => (
              <p key={i} className="text-[10px] font-medium text-amber-600">• {w}</p>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-4">
          {emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 p-10 text-center">
              {emailIsDesktop && enabledAccounts.length === 0 ? (
                <>
                  <Mail className="text-slate-300 mb-3" size={40}/>
                  <p className="text-sm font-bold text-slate-500 mb-1">No email accounts</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Add an account in Settings &amp; Data → Email Accounts, then fetch mail.
                  </p>
                </>
              ) : emailIsDesktop ? (
                <>
                  <CheckCircle className="text-emerald-500 mb-2" size={32}/>
                  <p className="text-slate-500 font-bold text-sm">Inbox Zero</p>
                  <p className="text-xs text-slate-400 mt-1">Nothing new. Fetch mail to check for updates.</p>
                </>
              ) : (
                <>
                  <Mail className="text-slate-300 mb-3" size={40}/>
                  <p className="text-sm font-bold text-slate-500 mb-1">No messages</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Email requires the desktop app.
                  </p>
                </>
              )}
            </div>
          ) : emails.map(email => (
            <div
              key={email.id}
              onClick={() => handleSelectEmail(email)}
              className={`p-5 border-b border-slate-100 cursor-pointer hover:bg-blue-50 transition-colors relative ${!email.read ? 'bg-white' : 'bg-slate-50/50'}`}
            >
              {!email.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}
              <div className="flex justify-between items-start mb-1">
                <span className={`text-sm font-bold ${!email.read ? 'text-slate-900' : 'text-slate-500'}`}>{email.sender}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{email.time}</span>
              </div>
              <div className={`text-[13px] truncate ${!email.read ? 'text-slate-800 font-semibold' : 'text-slate-500 font-medium'}`}>{email.subject}</div>
              <div className="text-[11px] text-slate-400 truncate mt-1">{email.preview}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: email detail ── */}
      <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-col w-full flex-1 bg-white overflow-y-auto`}>
        {selectedEmail ? (
          <div className="p-8 flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">

            {/* Action bar */}
            <div className="flex items-start justify-between mb-8 pb-4 border-b border-slate-100">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden text-blue-600 flex items-center gap-1 font-bold text-sm"
              >
                <ChevronLeft size={16}/> Back
              </button>
              <div className="flex items-start gap-4 ml-auto">
                {/* "Add to Calendar" — two-step: extract → preview panel → confirm */}
                {selectedEmail.body && (
                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      onClick={handleStartExtract}
                      disabled={addingEvent || extractState.phase === 'preview' || !ai.canRun}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        ai.canRun
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-default'
                          : 'bg-slate-100 text-slate-400 cursor-default'
                      }`}
                      title={ai.canRun ? 'Extract a calendar event from this email' : ai.hint}
                    >
                      {addingEvent
                        ? <Loader2 size={16} className="animate-spin"/>
                        : extractState.phase === 'saved'
                        ? <CalendarCheck size={16}/>
                        : <CalendarPlus size={16}/>}
                      {addingEvent ? 'Extracting…' : extractState.phase === 'saved' ? 'Added' : 'Add to Calendar'}
                    </button>
                    {!ai.canRun && (
                      <p className="text-[10px] text-slate-400 text-right max-w-[200px] leading-relaxed">{ai.hint}</p>
                    )}
                  </div>
                )}
                <button
                  onClick={() => deleteEmail(selectedEmail.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title="Delete"
                >
                  <Trash2 size={20}/>
                </button>
                <button
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                  title="Archive (not yet implemented)"
                >
                  <Archive size={20}/>
                </button>
              </div>
            </div>

            <div className="max-w-2xl">
              <h1 className="text-3xl font-black text-slate-900 mb-6 leading-tight">{selectedEmail.subject}</h1>

              {/* Sender / recipient */}
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">
                  {selectedEmail.sender[0]}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{selectedEmail.sender}</div>
                  {(() => {
                    const to = getToAddress(selectedEmail as any);
                    return to ? <div className="text-xs text-slate-500">To: {to}</div> : null;
                  })()}
                </div>
              </div>

              {/* ── Inline event extraction panels ── */}

              {/* Preview: AI found an event candidate — awaiting user confirmation */}
              {extractState.phase === 'preview' && (
                <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                      Event candidate — review before saving
                    </div>
                    <button onClick={handleCancelExtract} className="text-slate-400 hover:text-slate-600 p-1 -mr-1">
                      <X size={14}/>
                    </button>
                  </div>
                  <p className="text-sm font-black text-slate-800 mb-3">{extractState.data.title}</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {([
                      { label: 'Date',     value: extractState.data.date },
                      { label: 'Time',     value: formatHour(extractState.data.startHour) },
                      { label: 'Duration', value: `${extractState.data.duration}h` },
                    ] as const).map(({ label, value }) => (
                      <div key={label} className="bg-white rounded-xl border border-emerald-100 p-2.5 text-center">
                        <div className="text-xs font-black text-slate-800">{value}</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-medium text-slate-500 mb-3 leading-relaxed">
                    Nothing is saved until you confirm. Check the details above before adding.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelExtract}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmEvent}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wide transition-all active:scale-95"
                    >
                      Add to Calendar
                    </button>
                  </div>
                </div>
              )}

              {/* No event found */}
              {extractState.phase === 'not_found' && (
                <div className="mb-6 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-500">
                    No meeting or appointment found in this email. Try an email that mentions a specific date, time, or event.
                  </p>
                </div>
              )}

              {/* Extraction error */}
              {extractState.phase === 'error' && (
                <div className="mb-6 px-4 py-3 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0"/>
                  <p className="text-xs font-bold text-red-700">{extractState.message}</p>
                </div>
              )}

              {/* Event saved confirmation */}
              {extractState.phase === 'saved' && (
                <div className="mb-6 px-4 py-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-2">
                  <CalendarCheck size={14} className="text-emerald-600 flex-shrink-0"/>
                  <p className="text-xs font-bold text-emerald-700">
                    "{extractState.title}" added to {extractState.date}.
                  </p>
                </div>
              )}

              {/* Body load error */}
              {bodyLoadError && (
                <div className="mb-4 px-4 py-2.5 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                  <AlertTriangle size={13} className="text-amber-600 mt-0.5 flex-shrink-0"/>
                  <p className="text-[11px] font-bold text-amber-700">{bodyLoadError}</p>
                </div>
              )}

              {/* Email body */}
              <div className="text-slate-700 leading-relaxed whitespace-pre-line text-lg font-medium">
                {selectedEmail.body || (
                  <span className="text-slate-400 italic text-base">
                    {bodyLoadError ? 'Message could not be loaded.' : 'Loading message…'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-10 text-center">
            <Mail size={64} strokeWidth={1} className="mb-4 opacity-20"/>
            <p className="text-xl font-bold text-slate-400">Select a message to read</p>
          </div>
        )}
      </div>
    </div>
  );
};
