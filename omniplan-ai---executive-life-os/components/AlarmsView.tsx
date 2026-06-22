/**
 * Alarms & Reminders View — "Pulse"
 *
 * Shows all configured alarms and reminders:
 * - Daily planner reminder (morning)
 * - Habit reminder (evening)
 * - Focus block reminders
 * - Event-derived alarms (sleep wind-down, meeting prep, etc.)
 * - Notification master toggle
 *
 * Each alarm shows: time, what it's for, enable/disable toggle.
 */

import React from 'react';
import { Bell, BellOff, Clock, Moon, Zap, Target, Sun, Timer, Check } from 'lucide-react';
import type { NotificationSettings, WeekData } from '../types';
import { deriveAlarmsForDay } from '../utils/alarmRules';
import { formatDateKey, DAYS } from '../constants';
import { getWeekDays } from '../constants';

interface AlarmsViewProps {
  notificationSettings: NotificationSettings;
  onNotificationSettingsChange: (settings: NotificationSettings) => void;
  currentWeek: WeekData;
}

function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const AlarmsView: React.FC<AlarmsViewProps> = ({
  notificationSettings,
  onNotificationSettingsChange,
  currentWeek,
}) => {
  const today = new Date();
  const todayKey = formatDateKey(today);
  const isEnabled = notificationSettings.enabled;

  // Derive event-based alarms for today
  const dayPlan = currentWeek.dailyPlans?.[todayKey];
  const eventAlarms = dayPlan?.events
    ? deriveAlarmsForDay(today, dayPlan.events).filter(a => a.scheduledAt.getTime() > Date.now())
    : [];

  // Build quick overview of upcoming alarms for next 3 days
  const upcomingAlarms: Array<{ time: string; title: string; body: string; day: string }> = [];
  for (let d = 0; d < 3; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    const dk = formatDateKey(date);
    const dp = currentWeek.dailyPlans?.[dk];
    if (!dp?.events) continue;
    const alarms = deriveAlarmsForDay(date, dp.events);
    for (const alarm of alarms.slice(0, 3)) {
      upcomingAlarms.push({
        time: formatHour(alarm.scheduledAt.getHours() + alarm.scheduledAt.getMinutes() / 60),
        title: alarm.title,
        body: alarm.body,
        day: d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1],
      });
    }
  }

  const updateSettings = (partial: Partial<NotificationSettings>) => {
    onNotificationSettingsChange({ ...notificationSettings, ...partial });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center">
              <Bell size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Pulse</h1>
              <p className="text-xs text-slate-400 font-medium">Alarms · Reminders · Nudges</p>
            </div>
          </div>
          <button
            onClick={() => updateSettings({ enabled: !isEnabled })}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              isEnabled
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
          >
            {isEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            {isEnabled ? 'Active' : 'Off'}
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 lg:p-6 space-y-5 max-w-2xl mx-auto w-full">

        {/* ===== MASTER TOGGLE ===== */}
        {!isEnabled && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
            <BellOff size={16} className="text-amber-500 flex-shrink-0" />
            <div>
              <div className="text-xs font-bold text-amber-700">Alarms are disabled</div>
              <div className="text-[10px] text-amber-500">Toggle the switch above to enable reminders.</div>
            </div>
          </div>
        )}

        {/* ===== FIXED REMINDERS ===== */}
        <section>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">Daily Reminders</h2>
          <div className="space-y-2">

            {/* Morning planner */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className='w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0'>
                <Sun size={16} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-slate-800">Morning Planner</div>
                <div className="text-[10px] text-slate-400">Review your day each morning</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                  {formatHour(notificationSettings.dailyPlannerReminder.hour + notificationSettings.dailyPlannerReminder.minute / 60)}
                </span>
                <button
                  onClick={() => updateSettings({
                    dailyPlannerReminder: {
                      ...notificationSettings.dailyPlannerReminder,
                      enabled: !notificationSettings.dailyPlannerReminder.enabled,
                    },
                  })}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    notificationSettings.dailyPlannerReminder.enabled ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                    notificationSettings.dailyPlannerReminder.enabled ? 'left-5' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Habit check-in */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Target size={16} className="text-purple-500" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-slate-800">Habit Check-In</div>
                <div className="text-[10px] text-slate-400">Evening reminder to log habits</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                  {formatHour(notificationSettings.habitReminder.hour + notificationSettings.habitReminder.minute / 60)}
                </span>
                <button
                  onClick={() => updateSettings({
                    habitReminder: {
                      ...notificationSettings.habitReminder,
                      enabled: !notificationSettings.habitReminder.enabled,
                    },
                  })}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    notificationSettings.habitReminder.enabled ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                    notificationSettings.habitReminder.enabled ? 'left-5' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Focus block reminder */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Zap size={16} className="text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold text-slate-800">Focus Block Alert</div>
                <div className="text-[10px] text-slate-400">
                  {notificationSettings.focusBlockReminder.minutesBefore} min before each focus block
                </div>
              </div>
              <button
                onClick={() => updateSettings({
                  focusBlockReminder: {
                    ...notificationSettings.focusBlockReminder,
                    enabled: !notificationSettings.focusBlockReminder.enabled,
                  },
                })}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  notificationSettings.focusBlockReminder.enabled ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                  notificationSettings.focusBlockReminder.enabled ? 'left-5' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </section>

        {/* ===== EVENT-DERIVED ALARMS ===== */}
        <section>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">Event Alarms</h2>
          <p className="text-[10px] text-slate-400 mb-3">
            Auto-generated from your calendar events. Sleep events create wind-down + wake alarms. Meetings create prep reminders.
          </p>

          {upcomingAlarms.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-400">
              No upcoming event alarms. Add events with sleep/meeting/routine types to generate alarms.
            </div>
          ) : (
            <div className="space-y-1.5">
              {upcomingAlarms.map((alarm, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    {alarm.title.includes('Sleep') || alarm.title.includes('Wind')
                      ? <Moon size={14} className="text-indigo-400" />
                      : alarm.title.includes('Wake')
                        ? <Sun size={14} className="text-amber-400" />
                        : <Timer size={14} className="text-blue-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-700 truncate">{alarm.title}</div>
                    <div className="text-[9px] text-slate-400 truncate">{alarm.body}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-black text-slate-600">{alarm.time}</div>
                    <div className="text-[8px] text-slate-400 font-bold">{alarm.day}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ===== ALARM RULES ===== */}
        <section>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">Sleep Alarm Rules</h2>
          <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 space-y-2">
            {[
              { label: 'Wind-down reminder', desc: '60 min before sleep event', icon: <Moon size={12} className="text-indigo-400" /> },
              { label: 'Wake-up alarm', desc: '8 hours after sleep start', icon: <Sun size={12} className="text-amber-400" /> },
            ].map((rule, i) => (
              <div key={i} className="flex items-center gap-2">
                {rule.icon}
                <div className="flex-1">
                  <div className="text-xs font-bold text-indigo-800">{rule.label}</div>
                  <div className="text-[9px] text-indigo-500">{rule.desc}</div>
                </div>
                <Check size={12} className="text-indigo-400" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
