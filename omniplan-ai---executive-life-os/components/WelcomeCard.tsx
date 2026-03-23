/**
 * WelcomeCard — Phase 14 first-run onboarding surface.
 *
 * Shown once to new users (no meaningful planner data, dismiss flag not set).
 * Dismissed permanently on this device when the user clicks "Start planning".
 *
 * Design principles:
 *   - Calm and factual — no hype, no dark patterns.
 *   - Honest about local-first model and platform capabilities.
 *   - Does NOT request notification permission here — that is contextual.
 *   - Fully dismissible: a single button closes it forever on this device.
 *   - Three suggested first steps, none forced.
 *
 * Rendered as an absolute overlay inside the main white content card so the
 * sidebar remains visible — users can already see the navigation context.
 */

import React from 'react';
import { ArrowRight, Database, Bell, Target, CalendarDays, Save, Shield, Globe, Smartphone, Monitor } from 'lucide-react';
import { isElectron, isCapacitor } from '../services/platform';

interface WelcomeCardProps {
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Platform trust blurb
// ---------------------------------------------------------------------------

function PlatformNote(): React.ReactElement {
  if (isElectron()) {
    return (
      <div className="flex items-start gap-2.5 p-3 bg-slate-100 rounded-xl border border-slate-200">
        <Monitor size={15} className="text-slate-500 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="font-bold text-slate-700">Desktop:</span> Data is stored in your app data folder.
          AI keys are encrypted using your OS credential store.
        </p>
      </div>
    );
  }

  if (isCapacitor()) {
    return (
      <div className="flex items-start gap-2.5 p-3 bg-blue-50 rounded-xl border border-blue-100">
        <Smartphone size={15} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          <span className="font-bold text-blue-800">Mobile:</span> Data uses native app storage.
          Reminders use local notifications — no server or push service involved.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 p-3 bg-amber-50 rounded-xl border border-amber-100">
      <Globe size={15} className="text-amber-600 mt-0.5 shrink-0" />
      <p className="text-xs text-amber-700 leading-relaxed">
        <span className="font-bold text-amber-800">Browser:</span> Data is stored in browser storage (IndexedDB).
        Export regular backups — browser storage can be cleared by the browser.
        Credential security is limited compared to the desktop or mobile app.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step chip
// ---------------------------------------------------------------------------

interface StepProps {
  icon: React.ReactNode;
  label: string;
  where: string;
}

function Step({ icon, label, where }: StepProps): React.ReactElement {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-100">
      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800 leading-tight">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{where}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const WelcomeCard: React.FC<WelcomeCardProps> = ({ onDismiss }) => {
  return (
    <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-200/60 border border-slate-200 overflow-hidden">

        {/* Header bar */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-6 pt-8 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-white font-black text-xl italic">O</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">OmniPlanner</p>
              <h2 className="text-xl font-black text-white tracking-tight leading-tight">Welcome</h2>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Your planning data lives on this device.
            There is no account, no server sync, and no tracking.
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Local-first trust */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-slate-400" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Privacy &amp; storage
              </p>
            </div>
            <PlatformNote />
          </div>

          {/* Backup callout */}
          <div className="flex items-start gap-2.5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <Save size={15} className="text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-700 leading-relaxed">
              Use <span className="font-bold text-emerald-800">Auto-Backup</span> in the sidebar anytime to export
              a local backup file. Restore it from <span className="font-bold text-emerald-800">Settings &amp; Data</span> if you switch devices.
            </p>
          </div>

          {/* Suggested first steps */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Database size={14} className="text-slate-400" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Suggested first steps
              </p>
            </div>
            <div className="space-y-2">
              <Step
                icon={<Target size={15} className="text-purple-500" />}
                label="Add a life goal or priority"
                where="Life Vision tab"
              />
              <Step
                icon={<CalendarDays size={15} className="text-blue-500" />}
                label="Plan this week's tasks"
                where="Deep Planner tab — you're already here"
              />
              <Step
                icon={<Bell size={15} className="text-violet-500" />}
                label="Set a daily reminder (optional)"
                where="Settings &amp; Data → Notifications"
              />
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl text-sm uppercase tracking-widest shadow-lg shadow-slate-900/20 transition-all active:scale-[0.98]"
          >
            Start planning
            <ArrowRight size={16} />
          </button>

          <p className="text-center text-[10px] text-slate-400 leading-relaxed">
            This message won&apos;t appear again on this device.
          </p>
        </div>
      </div>
    </div>
  );
};
