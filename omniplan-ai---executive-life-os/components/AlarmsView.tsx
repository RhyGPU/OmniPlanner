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

import React, { useState } from 'react';
import { Bell, BellOff, Clock, Moon, Zap, Target, Sun, Timer, Check, Trash2, Plus } from 'lucide-react';
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

  const [showCreator, setShowCreator] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('07:00');
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [newMission, setNewMission] = useState<'none' | 'math' | 'checklist' | 'theme'>('none');
  const [newSnooze, setNewSnooze] = useState(5);
  const [newFadeIn, setNewFadeIn] = useState(0);

  const customAlarms = notificationSettings.customAlarms || [];

  const handleAddCustomAlarm = () => {
    if (!newTitle.trim()) return;
    const [hStr, mStr] = newTime.split(':');
    const hour = parseInt(hStr || '7', 10);
    const minute = parseInt(mStr || '0', 10);

    const newAlarm = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      hour,
      minute,
      enabled: true,
      daysOfWeek: newDays,
      missionType: newMission,
      snoozeDuration: newSnooze,
      fadeInDuration: newFadeIn,
    };

    updateSettings({
      customAlarms: [...customAlarms, newAlarm],
    });

    setNewTitle('');
    setShowCreator(false);
  };

  const handleToggleCustomAlarm = (id: string) => {
    const updated = customAlarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a);
    updateSettings({ customAlarms: updated });
  };

  const handleDeleteCustomAlarm = (id: string) => {
    const updated = customAlarms.filter(a => a.id !== id);
    updateSettings({ customAlarms: updated });
  };

  const toggleDay = (day: number) => {
    if (newDays.includes(day)) {
      setNewDays(newDays.filter(d => d !== day));
    } else {
      setNewDays([...newDays, day]);
    }
  };

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
                <input
                  type="time"
                  disabled={!isEnabled}
                  value={`${notificationSettings.dailyPlannerReminder.hour.toString().padStart(2, '0')}:${notificationSettings.dailyPlannerReminder.minute.toString().padStart(2, '0')}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(':');
                    if (parts.length === 2) {
                      updateSettings({
                        dailyPlannerReminder: {
                          ...notificationSettings.dailyPlannerReminder,
                          hour: parseInt(parts[0], 10),
                          minute: parseInt(parts[1], 10),
                        },
                      });
                    }
                  }}
                  className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
                />
                <button
                  disabled={!isEnabled}
                  onClick={() => updateSettings({
                    dailyPlannerReminder: {
                      ...notificationSettings.dailyPlannerReminder,
                      enabled: !notificationSettings.dailyPlannerReminder.enabled,
                    },
                  })}
                  className={`w-10 h-6 rounded-full transition-colors relative disabled:opacity-50 ${
                    notificationSettings.dailyPlannerReminder.enabled && isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                    notificationSettings.dailyPlannerReminder.enabled && isEnabled ? 'left-5' : 'left-1'
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
                <input
                  type="time"
                  disabled={!isEnabled}
                  value={`${notificationSettings.habitReminder.hour.toString().padStart(2, '0')}:${notificationSettings.habitReminder.minute.toString().padStart(2, '0')}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(':');
                    if (parts.length === 2) {
                      updateSettings({
                        habitReminder: {
                          ...notificationSettings.habitReminder,
                          hour: parseInt(parts[0], 10),
                          minute: parseInt(parts[1], 10),
                        },
                      });
                    }
                  }}
                  className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
                />
                <button
                  disabled={!isEnabled}
                  onClick={() => updateSettings({
                    habitReminder: {
                      ...notificationSettings.habitReminder,
                      enabled: !notificationSettings.habitReminder.enabled,
                    },
                  })}
                  className={`w-10 h-6 rounded-full transition-colors relative disabled:opacity-50 ${
                    notificationSettings.habitReminder.enabled && isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                    notificationSettings.habitReminder.enabled && isEnabled ? 'left-5' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Focus block reminder */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Zap size={16} className="text-blue-500" />
              </div>
              <div className="flex-1 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-800">Focus Block Alert</div>
                  <div className="text-[10px] text-slate-400">
                    Remind me before each focus block
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    disabled={!isEnabled}
                    value={notificationSettings.focusBlockReminder.minutesBefore}
                    onChange={(e) => updateSettings({
                      focusBlockReminder: {
                        ...notificationSettings.focusBlockReminder,
                        minutesBefore: parseInt(e.target.value, 10),
                      },
                    })}
                    className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <option value={0}>At start</option>
                    <option value={5}>5 min before</option>
                    <option value={10}>10 min before</option>
                    <option value={15}>15 min before</option>
                    <option value={30}>30 min before</option>
                  </select>
                </div>
              </div>
              <button
                disabled={!isEnabled}
                onClick={() => updateSettings({
                  focusBlockReminder: {
                    ...notificationSettings.focusBlockReminder,
                    enabled: !notificationSettings.focusBlockReminder.enabled,
                  },
                })}
                className={`w-10 h-6 rounded-full transition-colors relative disabled:opacity-50 ${
                  notificationSettings.focusBlockReminder.enabled && isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                  notificationSettings.focusBlockReminder.enabled && isEnabled ? 'left-5' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </section>

        {/* ===== CUSTOM ALARMS ===== */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Custom Alarms</h2>
            <button
              disabled={!isEnabled}
              onClick={() => setShowCreator(!showCreator)}
              className="text-xs font-black text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors uppercase tracking-wider flex items-center gap-1"
            >
              <Plus size={14} />
              {showCreator ? 'Close' : 'Add Alarm'}
            </button>
          </div>

          {/* Creator form */}
          {showCreator && isEnabled && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Alarm Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Gym Time"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Time</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Days repeat selector */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Repeat Days</label>
                <div className="flex gap-1.5">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName, idx) => {
                    const isSelected = newDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleDay(idx)}
                        className={`w-7 h-7 rounded-full text-[10px] font-black transition-all ${
                          isSelected
                            ? 'bg-blue-500 text-white shadow-md shadow-blue-100 scale-105'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {dayName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mission type and settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Wake Mission</label>
                  <select
                    value={newMission}
                    onChange={(e) => setNewMission(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  >
                    <option value="none">None (Simple)</option>
                    <option value="math">Math Puzzles</option>
                    <option value="checklist">Planner Checklist</option>
                    <option value="theme">Retype Daily Theme</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Snooze</label>
                  <select
                    value={newSnooze}
                    onChange={(e) => setNewSnooze(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  >
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Fade-In Sound</label>
                  <select
                    value={newFadeIn}
                    onChange={(e) => setNewFadeIn(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  >
                    <option value={0}>Instant</option>
                    <option value={10}>10 seconds</option>
                    <option value={20}>20 seconds</option>
                    <option value={30}>30 seconds</option>
                  </select>
                </div>
              </div>

              {/* Save trigger */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleAddCustomAlarm}
                  disabled={!newTitle.trim()}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-200 text-white disabled:text-slate-400 px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 shadow-lg shadow-blue-100 disabled:shadow-none"
                >
                  Save Alarm
                </button>
              </div>
            </div>
          )}

          {/* Alarms list */}
          {customAlarms.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-400">
              No custom alarms configured. Add alarms to schedule custom routines.
            </div>
          ) : (
            <div className="space-y-2">
              {customAlarms.map((alarm) => {
                const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                const formattedTime = formatHour(alarm.hour + alarm.minute / 60);

                return (
                  <div
                    key={alarm.id}
                    className={`bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 transition-opacity ${
                      alarm.enabled && isEnabled ? 'opacity-100' : 'opacity-60'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Clock size={16} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-black text-slate-800">{formattedTime}</span>
                        <span className="text-xs font-black text-slate-700 truncate">{alarm.title}</span>
                      </div>

                      {/* Repeat days indicator */}
                      <div className="flex gap-1 mt-1">
                        {dayLabels.map((day, idx) => {
                          const active = alarm.daysOfWeek.includes(idx);
                          return (
                            <span
                              key={idx}
                              className={`text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                                active
                                  ? 'bg-blue-100 text-blue-600'
                                  : 'bg-slate-50 text-slate-300'
                              }`}
                            >
                              {day}
                            </span>
                          );
                        })}
                      </div>

                      {/* Mission & settings badges */}
                      {alarm.enabled && isEnabled && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {alarm.missionType !== 'none' && (
                            <span className="bg-amber-50 border border-amber-100 text-amber-600 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              ⚡ {alarm.missionType} mission
                            </span>
                          )}
                          {alarm.snoozeDuration !== 5 && (
                            <span className="bg-slate-50 border border-slate-100 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              Snooze: {alarm.snoozeDuration}m
                            </span>
                          )}
                          {alarm.fadeInDuration > 0 && (
                            <span className="bg-indigo-50 border border-indigo-100 text-indigo-500 text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              Fade: {alarm.fadeInDuration}s
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        disabled={!isEnabled}
                        onClick={() => handleToggleCustomAlarm(alarm.id)}
                        className={`w-10 h-6 rounded-full transition-colors relative disabled:opacity-50 ${
                          alarm.enabled && isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                          alarm.enabled && isEnabled ? 'left-5' : 'left-1'
                        }`} />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomAlarm(alarm.id)}
                        className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
