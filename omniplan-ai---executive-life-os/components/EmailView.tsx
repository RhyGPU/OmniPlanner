
import React, { useState } from 'react';
import { Mail, ChevronLeft, Archive, Trash2, CheckCircle, RefreshCw, CalendarPlus, Loader2 } from 'lucide-react';
import { Email, CalendarEvent, WeekData } from '../types';
import { getEmailAccounts } from './EmailSettings';
import { extractEventFromEmail } from '../services/ai';

interface EmailViewProps {
  emails: Email[];
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  allWeeks: Record<string, WeekData>;
  onAddEvent: (date: Date, event: CalendarEvent) => void;
}

const electronAPI = (window as any).electronAPI;

export const EmailView: React.FC<EmailViewProps> = ({ emails, setEmails, allWeeks, onAddEvent }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const selectedEmail = emails.find(e => e.id === selectedId);

  const markRead = (id: number) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, read: true } : e));
    setSelectedId(id);
  };

  const deleteEmail = (id: number) => {
    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const fetchAllEmails = async () => {
    const accounts = getEmailAccounts().filter(a => a.enabled);
    if (accounts.length === 0) {
      alert('No email accounts configured. Go to Settings & Data to add one.');
      return;
    }
    if (!electronAPI?.fetchEmails) {
      alert('Email fetching requires the desktop (Electron) app.');
      return;
    }

    setFetching(true);
    try {
      let nextId = Math.max(0, ...emails.map(e => e.id)) + 1;
      const newEmails: Email[] = [];

      for (const account of accounts) {
        const result = await electronAPI.fetchEmails(account);
        if (result.success) {
          for (const msg of result.emails) {
            newEmails.push({
              id: nextId++,
              provider: account.provider,
              sender: msg.sender,
              subject: msg.subject,
              preview: msg.preview || msg.subject.substring(0, 60),
              body: '', // Body loaded on demand
              time: msg.date ? new Date(msg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
              read: msg.read,
              _uid: msg.uid,
              _accountId: account.id,
            } as any);
          }
        } else {
          console.warn(`Failed to fetch from ${account.email}: ${result.error}`);
        }
      }

      if (newEmails.length > 0) {
        setEmails(prev => [...newEmails, ...prev]);
      }
    } finally {
      setFetching(false);
    }
  };

  const loadEmailBody = async (email: any) => {
    if (email.body || !email._uid || !email._accountId) return;
    const accounts = getEmailAccounts();
    const account = accounts.find(a => a.id === email._accountId);
    if (!account || !electronAPI?.fetchEmailBody) return;

    const result = await electronAPI.fetchEmailBody(account, email._uid);
    if (result.success) {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, body: result.body } : e));
    }
  };

  const handleAddToCalendar = async () => {
    if (!selectedEmail?.body) return;
    setAddingEvent(true);
    try {
      const eventData = await extractEventFromEmail(selectedEmail.body);
      if (eventData) {
        const date = new Date(eventData.date + 'T12:00:00');
        const event: CalendarEvent = {
          id: crypto.randomUUID(),
          title: eventData.title,
          startHour: eventData.startHour,
          duration: eventData.duration,
          color: '#3b82f6',
        };
        onAddEvent(date, event);
        alert(`Event "${eventData.title}" added to ${eventData.date}!`);
      } else {
        alert('No calendar event could be extracted from this email.');
      }
    } catch (err) {
      console.error('Event extraction error:', err);
      alert('Failed to extract event. Check your AI settings.');
    } finally {
      setAddingEvent(false);
    }
  };

  const handleSelectEmail = (email: Email) => {
    markRead(email.id);
    loadEmailBody(email);
  };

  return (
    <div className="flex h-full bg-white relative">
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-slate-200`}>
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
           <h2 className="text-2xl font-black text-slate-900 tracking-tight">Inbox</h2>
           <button
             onClick={fetchAllEmails}
             disabled={fetching}
             className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
           >
             {fetching ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
             {fetching ? 'Fetching...' : 'Fetch Mail'}
           </button>
        </div>
        <div className="flex-1 overflow-y-auto">
            {emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 p-10 text-center">
                    <CheckCircle className="text-emerald-500 mb-2" size={32} />
                    <p className="text-slate-500 font-bold text-sm">Inbox Zero Achieved!</p>
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

      <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-col w-full flex-1 bg-white`}>
        {selectedEmail ? (
          <div className="p-8 flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                  <button onClick={() => setSelectedId(null)} className="md:hidden text-blue-600 flex items-center gap-1 font-bold text-sm">
                      <ChevronLeft size={16} /> Back
                  </button>
                  <div className="flex gap-4">
                      {selectedEmail.body && (
                        <button
                          onClick={handleAddToCalendar}
                          disabled={addingEvent}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                          title="Extract event from email and add to calendar"
                        >
                          {addingEvent ? <Loader2 size={16} className="animate-spin"/> : <CalendarPlus size={16}/>}
                          Add to Calendar
                        </button>
                      )}
                      <button onClick={() => deleteEmail(selectedEmail.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                        <Trash2 size={20}/>
                      </button>
                      <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                        <Archive size={20}/>
                      </button>
                  </div>
              </div>
              <div className="max-w-2xl">
                <h1 className="text-3xl font-black text-slate-900 mb-6 leading-tight">{selectedEmail.subject}</h1>
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">
                        {selectedEmail.sender[0]}
                    </div>
                    <div>
                        <div className="text-sm font-bold text-slate-900">{selectedEmail.sender}</div>
                        <div className="text-xs text-slate-500">To: you@omniplan.ai</div>
                    </div>
                </div>
                <div className="text-slate-700 leading-relaxed whitespace-pre-line text-lg font-medium">
                    {selectedEmail.body || <span className="text-slate-400 italic">Loading email body...</span>}
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
