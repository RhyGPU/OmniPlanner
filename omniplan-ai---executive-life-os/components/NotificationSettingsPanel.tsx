/**
 * Notification reminder settings panel.
 *
 * Rendered inside DataView. Lets the user configure local notification
 * reminders for the daily planner, habit check-in, and focus blocks.
 *
 * PLATFORM MESSAGING:
 *   - Capacitor (mobile): Full support — shows permission request button.
 *   - Web (PWA):          Best-effort — shown with a caveat that notifications
 *                         only fire while the tab is open.
 *   - Electron (desktop): Not implemented — shown with an informational message.
 *
 * STATE OWNERSHIP:
 *   This component is stateless with respect to notification settings —
 *   the parent passes settings and an onChange callback. This keeps the
 *   notification state in App.tsx where it can drive the syncReminders() effect.
 */

import React, { useState, useCallback } from 'react';
import { Bell, BellOff, BellRing, Smartphone, Monitor, Globe, Shield } from 'lucide-react';
import type { NotificationSettings } from '../types';
import { platform, isElectron, isCapacitor } from '../services/platform';
import { requestNotificationPermission } from '../utils/notificationScheduler';
import type { NotificationPermission } from '../services/platform';

interface NotificationSettingsPanelProps {
  settings: NotificationSettings;
  onChange: (settings: NotificationSettings) => void;
}

// ---------------------------------------------------------------------------
// Hour / minute options
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const MINUTES_BEFORE = [0, 5, 10, 15, 30];

function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

function formatMinute(m: number): string {
  return m === 0 ? '00' : String(m);
}

function formatTime(h: number, m: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${formatMinute(m)} ${period}`;
}

// ---------------------------------------------------------------------------
// Platform banner
// ---------------------------------------------------------------------------

function PlatformBanner(): React.ReactElement {
  if (isElectron()) {
    return (
      <div className="flex items-start gap-3 p-4 bg-slate-100 rounded-2xl border border-slate-200">
        <Monitor size={18} className="text-slate-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-slate-700">Desktop — not available</p>
          <p className="text-xs text-slate-500 mt-1">
            Local notification reminders are not implemented for the desktop app in this version.
            Electron has its own notification APIs; integration is planned for a future release.
          </p>
        </div>
      </div>
    );
  }

  if (isCapacitor()) {
    return (
      <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-200">
        <Smartphone size={18} className="text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-blue-800">Mobile — full support</p>
          <p className="text-xs text-blue-700 mt-1">
            Reminders use native iOS / Android local notifications. They persist across
            app restarts and fire even when the app is in the background.
            Notification permission is required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-200">
      <Globe size={18} className="text-amber-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-bold text-amber-800">Browser — best-effort</p>
        <p className="text-xs text-amber-700 mt-1">
          Reminders use the Web Notifications API with setTimeout scheduling.
          They only fire while this tab is open. For reliable mobile reminders,
          use the native iOS / Android app.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission button
// ---------------------------------------------------------------------------

interface PermissionButtonProps {
  onGranted: () => void;
}

function PermissionButton({ onGranted }: PermissionButtonProps): React.ReactElement | null {
  const [status, setStatus] = useState<NotificationPermission | 'idle'>('idle');

  if (isElectron()) return null;

  const handleRequest = useCallback(async () => {
    setStatus('idle');
    const result = await requestNotificationPermission();
    setStatus(result);
    if (result === 'granted') onGranted();
  }, [onGranted]);

  const label =
    status === 'idle' ? 'Request Notification Permission' :
    status === 'granted' ? 'Permission granted ✓' :
    status === 'denied' ? 'Permission denied — check device settings' :
    status === 'unavailable' ? 'Notifications unavailable on this device' :
    'Request Notification Permission';

  const buttonClass =
    status === 'granted'
      ? 'bg-emerald-600 text-white cursor-default'
      : status === 'denied' || status === 'unavailable'
      ? 'bg-red-100 text-red-700 cursor-default'
      : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer';

  return (
    <button
      onClick={status === 'idle' ? handleRequest : undefined}
      className={`flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-sm transition-all ${buttonClass}`}
    >
      <Shield size={15} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Time selector row
// ---------------------------------------------------------------------------

interface TimeRowProps {
  label: string;
  enabled: boolean;
  hour: number;
  minute: number;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
}

function TimeRow({
  label, enabled, hour, minute, disabled,
  onToggle, onHourChange, onMinuteChange,
}: TimeRowProps): React.ReactElement {
  return (
    <div className={`flex items-center gap-2 md:gap-4 py-3 px-3 md:px-4 rounded-2xl transition-colors ${
      enabled && !disabled ? 'bg-blue-50' : 'bg-slate-50'
    }`}>
      <button
        onClick={() => !disabled && onToggle(!enabled)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          enabled && !disabled ? 'bg-blue-600' : 'bg-slate-300'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>

      <span className={`text-sm font-bold flex-1 ${
        enabled && !disabled ? 'text-slate-900' : 'text-slate-400'
      }`}>
        {label}
      </span>

      {enabled && !disabled && (
        <div className="flex items-center gap-1.5 text-sm font-mono">
          <select
            value={hour}
            onChange={e => onHourChange(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 cursor-pointer"
          >
            {HOURS.map(h => (
              <option key={h} value={h}>{formatHour(h)}</option>
            ))}
          </select>
          <span className="text-slate-400 font-bold text-xs">:</span>
          <select
            value={minute}
            onChange={e => onMinuteChange(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 cursor-pointer"
          >
            {MINUTES.map(m => (
              <option key={m} value={m}>{formatMinute(m)}</option>
            ))}
          </select>
        </div>
      )}

      {enabled && !disabled && (
        <span className="hidden sm:inline text-xs text-blue-600 font-bold w-20 text-right">
          {formatTime(hour, minute)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const NotificationSettingsPanel: React.FC<NotificationSettingsPanelProps> = ({
  settings,
  onChange,
}) => {
  const isDesktop = isElectron();
  const unavailable = isDesktop || !platform.notifications.isAvailable();

  const update = useCallback((patch: Partial<NotificationSettings>) => {
    onChange({ ...settings, ...patch });
  }, [settings, onChange]);

  return (
    <div className="bg-slate-50 border-2 border-slate-50 p-5 md:p-10 rounded-[2rem] md:rounded-[2.5rem]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center text-violet-600 shadow-lg shadow-violet-100/50">
          {settings.enabled && !unavailable ? (
            <BellRing size={22} strokeWidth={2.5} />
          ) : (
            <BellOff size={22} strokeWidth={2.5} />
          )}
        </div>
        <div>
          <h3 className="font-black text-xl text-slate-900 tracking-tight">
            Local Notifications
          </h3>
          <p className="text-slate-500 text-sm font-medium">
            Reminder schedule — no server involved
          </p>
        </div>

        {/* Master toggle */}
        {!unavailable && (
          <div className="ml-auto">
            <button
              onClick={() => update({ enabled: !settings.enabled })}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                settings.enabled ? 'bg-violet-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                  settings.enabled ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Platform info banner */}
      <div className="mb-6">
        <PlatformBanner />
      </div>

      {/* Permission button (web / mobile only) */}
      {!isDesktop && (
        <div className="mb-6">
          <PermissionButton onGranted={() => update({ enabled: true })} />
        </div>
      )}

      {/* Reminder configuration — only when master is enabled */}
      {settings.enabled && !unavailable && (
        <div className="space-y-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
            Reminder schedule
          </p>

          {/* Daily planner reminder */}
          <TimeRow
            label="Daily planning reminder"
            enabled={settings.dailyPlannerReminder.enabled}
            hour={settings.dailyPlannerReminder.hour}
            minute={settings.dailyPlannerReminder.minute}
            onToggle={enabled =>
              update({ dailyPlannerReminder: { ...settings.dailyPlannerReminder, enabled } })
            }
            onHourChange={hour =>
              update({ dailyPlannerReminder: { ...settings.dailyPlannerReminder, hour } })
            }
            onMinuteChange={minute =>
              update({ dailyPlannerReminder: { ...settings.dailyPlannerReminder, minute } })
            }
          />

          {/* Habit reminder */}
          <TimeRow
            label="Habit check-in reminder"
            enabled={settings.habitReminder.enabled}
            hour={settings.habitReminder.hour}
            minute={settings.habitReminder.minute}
            onToggle={enabled =>
              update({ habitReminder: { ...settings.habitReminder, enabled } })
            }
            onHourChange={hour =>
              update({ habitReminder: { ...settings.habitReminder, hour } })
            }
            onMinuteChange={minute =>
              update({ habitReminder: { ...settings.habitReminder, minute } })
            }
          />

          {/* Focus block reminder */}
          <div className={`flex items-center gap-2 md:gap-4 py-3 px-3 md:px-4 rounded-2xl transition-colors ${
            settings.focusBlockReminder.enabled ? 'bg-blue-50' : 'bg-slate-50'
          }`}>
            <button
              onClick={() =>
                update({
                  focusBlockReminder: {
                    ...settings.focusBlockReminder,
                    enabled: !settings.focusBlockReminder.enabled,
                  },
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 cursor-pointer ${
                settings.focusBlockReminder.enabled ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.focusBlockReminder.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>

            <span className={`text-sm font-bold flex-1 ${
              settings.focusBlockReminder.enabled ? 'text-slate-900' : 'text-slate-400'
            }`}>
              Focus block reminder
            </span>

            {settings.focusBlockReminder.enabled && (
              <div className="flex items-center gap-2">
                <select
                  value={settings.focusBlockReminder.minutesBefore}
                  onChange={e =>
                    update({
                      focusBlockReminder: {
                        ...settings.focusBlockReminder,
                        minutesBefore: Number(e.target.value),
                      },
                    })
                  }
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 cursor-pointer"
                >
                  {MINUTES_BEFORE.map(m => (
                    <option key={m} value={m}>
                      {m === 0 ? 'At start' : `${m} min before`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Active reminders summary */}
          <div className="mt-4 p-4 bg-white rounded-2xl border border-slate-100">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
              Active reminders
            </p>
            <div className="space-y-1.5">
              {settings.dailyPlannerReminder.enabled && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Bell size={13} className="text-violet-500" />
                  <span>
                    Plan your day at{' '}
                    <span className="font-bold">
                      {formatTime(settings.dailyPlannerReminder.hour, settings.dailyPlannerReminder.minute)}
                    </span>
                  </span>
                </div>
              )}
              {settings.habitReminder.enabled && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Bell size={13} className="text-violet-500" />
                  <span>
                    Habit check-in at{' '}
                    <span className="font-bold">
                      {formatTime(settings.habitReminder.hour, settings.habitReminder.minute)}
                    </span>
                  </span>
                </div>
              )}
              {settings.focusBlockReminder.enabled && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Bell size={13} className="text-violet-500" />
                  <span>
                    Focus blocks —{' '}
                    <span className="font-bold">
                      {settings.focusBlockReminder.minutesBefore === 0
                        ? 'at start'
                        : `${settings.focusBlockReminder.minutesBefore} min before`}
                    </span>
                  </span>
                </div>
              )}
              {!settings.dailyPlannerReminder.enabled &&
                !settings.habitReminder.enabled &&
                !settings.focusBlockReminder.enabled && (
                  <p className="text-sm text-slate-400 italic">No reminders enabled.</p>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
