import React, { useState } from 'react';
import { Bell, BellOff, Clock, Moon, Zap, Sun, Trash2, Plus, Globe, Timer, Play } from 'lucide-react';
import type { NotificationSettings, WeekData, CustomAlarm, ActualEventLog } from '../types';
import { deriveAlarmsForDay } from '../utils/alarmRules';
import { formatDateKey, DAYS } from '../constants';
import { WorldClockTab } from './WorldClockTab';
import { TimerTab } from './TimerTab';
import { StopwatchTab } from './StopwatchTab';
import { PomodoroTab } from './PomodoroTab';
import { playAlarmSound, stopAlarmSound } from '../utils/soundSynth';

interface AlarmsViewProps {
  notificationSettings: NotificationSettings;
  onNotificationSettingsChange: (settings: NotificationSettings) => void;
  currentWeek: WeekData;
  onLogActual: (log: ActualEventLog) => void;
  pomodoroProps: {
    mode: 'focus' | 'break';
    setMode: (mode: 'focus' | 'break') => void;
    duration: number;
    setDuration: (dur: number) => void;
    timeLeft: number;
    setTimeLeft: React.Dispatch<React.SetStateAction<number>>;
    isRunning: boolean;
    setIsRunning: (run: boolean) => void;
  };
}

type PulseTab = 'alarms' | 'world' | 'timer' | 'stopwatch' | 'pomodoro';

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
  onLogActual,
  pomodoroProps,
}) => {
  const today = new Date();
  const todayKey = formatDateKey(today);
  const isEnabled = notificationSettings.enabled;

  // Tabs navigation state
  const [activeTab, setActiveTab] = useState<PulseTab>('alarms');

  // Custom Alarm Creator State
  const [showCreator, setShowCreator] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('07:00');
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [newMission, setNewMission] = useState<'none' | 'math' | 'checklist' | 'theme'>('none');
  const [newSnooze, setNewSnooze] = useState(5);
  const [newFadeIn, setNewFadeIn] = useState(0);
  const [newSoundPreset, setNewSoundPreset] = useState<'chime' | 'beep' | 'pulse' | 'gentle' | 'custom'>('chime');

  // Testing sound states
  const [testingSound, setTestingSound] = useState(false);

  const customAlarms = notificationSettings.customAlarms || [];

  const updateSettings = (partial: Partial<NotificationSettings>) => {
    onNotificationSettingsChange({ ...notificationSettings, ...partial });
  };

  const handleAddCustomAlarm = () => {
    if (!newTitle.trim()) return;
    const [hStr, mStr] = newTime.split(':');
    const hour = parseInt(hStr || '7', 10);
    const minute = parseInt(mStr || '0', 10);

    const newAlarm: CustomAlarm = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      hour,
      minute,
      enabled: true,
      daysOfWeek: newDays,
      missionType: newMission,
      snoozeDuration: newSnooze,
      fadeInDuration: newFadeIn,
      soundPreset: newSoundPreset,
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

  // Custom Audio uploading handler (Base64 conversion)
  const handleCustomSoundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        updateSettings({
          customSoundData: base64,
          customSoundName: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Previewing selected alarm preset tone
  const handleTestTone = (preset: 'chime' | 'beep' | 'pulse' | 'gentle' | 'custom') => {
    if (testingSound) {
      stopAlarmSound();
      setTestingSound(false);
    } else {
      setTestingSound(true);
      playAlarmSound(preset, notificationSettings.customSoundData, 0);
      setTimeout(() => {
        stopAlarmSound();
        setTestingSound(false);
      }, 4000); // Ring for 4 seconds then stop
    }
  };

  // Event-based alarms today
  const dayPlan = currentWeek.dailyPlans?.[todayKey];
  const eventAlarms = dayPlan?.events
    ? deriveAlarmsForDay(today, dayPlan.events).filter(a => a.scheduledAt.getTime() > Date.now())
    : [];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      
      {/* Redesigned Cockpit Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-100">
              <Clock size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Pulse</h1>
              <p className="text-xs text-slate-400 font-medium">Clock · Alarms · Focus Utilities</p>
            </div>
          </div>

          <button
            onClick={() => updateSettings({ enabled: !isEnabled })}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all select-none ${
              isEnabled
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
          >
            {isEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            {isEnabled ? 'Alarms Active' : 'Alarms Off'}
          </button>
        </div>

        {/* Unified Clock Tab Navigation Menu */}
        <div className="flex gap-1.5 mt-4 border-t border-slate-100 pt-3 overflow-x-auto">
          {[
            { id: 'alarms' as const, label: 'Alarms', icon: <Bell size={14} /> },
            { id: 'world' as const, label: 'World Clock', icon: <Globe size={14} /> },
            { id: 'timer' as const, label: 'Timer', icon: <Timer size={14} /> },
            { id: 'stopwatch' as const, label: 'Stopwatch', icon: <Play size={14} className="rotate-90" /> },
            { id: 'pomodoro' as const, label: 'Pomodoro', icon: <Zap size={14} /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                activeTab === t.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-500'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 lg:p-6 max-w-2xl mx-auto w-full font-sans">
        
        {/* Switch tab screens */}
        {activeTab === 'world' && <WorldClockTab />}
        {activeTab === 'timer' && <TimerTab />}
        {activeTab === 'stopwatch' && <StopwatchTab />}
        {activeTab === 'pomodoro' && <PomodoroTab onLogActual={onLogActual} {...pomodoroProps} />}

        {activeTab === 'alarms' && (
          <div className="space-y-5">
            {/* Alarm active status warning */}
            {!isEnabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex items-center gap-3">
                <BellOff size={18} className="text-amber-500 flex-shrink-0 animate-pulse" />
                <div>
                  <div className="text-xs font-black text-amber-800">Alarms are currently muted</div>
                  <div className="text-[10px] font-bold text-amber-500">Enable the switch in the header to activate chimes.</div>
                </div>
              </div>
            )}

            {/* Custom Sound Uploader Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3.5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Personalize Alarm Tones</div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-slate-700 truncate max-w-xs">
                    {notificationSettings.customSoundName ? notificationSettings.customSoundName : 'No custom sound selected'}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 mt-0.5">Import any MP3 or WAV audio track</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="custom-sound-upload-view"
                    accept="audio/mp3,audio/wav"
                    className="hidden"
                    onChange={handleCustomSoundUpload}
                  />
                  <label
                    htmlFor="custom-sound-upload-view"
                    className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all shadow-sm active:scale-95 text-center"
                  >
                    Upload Tone
                  </label>
                  {notificationSettings.customSoundData && (
                    <button
                      onClick={() => handleTestTone('custom')}
                      className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 ${
                        testingSound ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-100' : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-100'
                      }`}
                    >
                      {testingSound ? 'Stop' : 'Test'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ===== BUILT-IN DAILY REMINDERS ===== */}
            <section className="space-y-3">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 font-sans">Daily Routine Reminders</h2>
              <div className="space-y-2">
                {/* Morning planner */}
                <div className="bg-white rounded-3xl border border-slate-200 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <Sun size={16} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-slate-800">Morning Planner</div>
                    <div className="text-[10px] text-slate-400 font-bold">Prompts you to plan the day</div>
                  </div>
                  <div className="flex items-center gap-3">
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
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors cursor-pointer font-sans"
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

                {/* Evening habit */}
                <div className="bg-white rounded-3xl border border-slate-200 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Moon size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-slate-800">Evening Habit Sync</div>
                    <div className="text-[10px] text-slate-400 font-bold">Prompts you to check off habits</div>
                  </div>
                  <div className="flex items-center gap-3">
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
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors cursor-pointer font-sans"
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

                {/* Focus block alert */}
                <div className="bg-white rounded-3xl border border-slate-200 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Zap size={16} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-slate-800">Focus Block Alert</div>
                    <div className="text-[10px] text-slate-400 font-bold">Reminds you before focus sessions</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      disabled={!isEnabled}
                      value={notificationSettings.focusBlockReminder.minutesBefore}
                      onChange={(e) => updateSettings({
                        focusBlockReminder: {
                          ...notificationSettings.focusBlockReminder,
                          minutesBefore: parseInt(e.target.value, 10),
                        },
                      })}
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors cursor-pointer font-sans"
                    >
                      <option value={0}>At start</option>
                      <option value={5}>5 min before</option>
                      <option value={10}>10 min before</option>
                      <option value={15}>15 min before</option>
                      <option value={30}>30 min before</option>
                    </select>
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
              </div>
            </section>

            {/* ===== CUSTOM ALARMS ===== */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 font-sans">Custom Alarm Routines</h2>
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
                <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Alarm Label</label>
                      <input
                        type="text"
                        placeholder="e.g. Morning Jog"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Time</label>
                      <input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Wake Mission</label>
                      <select
                        value={newMission}
                        onChange={(e) => setNewMission(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                      >
                        <option value="none">None (Simple)</option>
                        <option value="math">Math Puzzles</option>
                        <option value="checklist">Planner Checklist</option>
                        <option value="theme">Retype Focus Theme</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Alarm Sound</label>
                      <div className="flex gap-1">
                        <select
                          value={newSoundPreset}
                          onChange={(e) => setNewSoundPreset(e.target.value as any)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                        >
                          <option value="chime">Rising Chime</option>
                          <option value="beep">Classic Beep</option>
                          <option value="pulse">Digital Pulse</option>
                          <option value="gentle">Gentle Wake</option>
                          {notificationSettings.customSoundData && (
                            <option value="custom">Custom Audio</option>
                          )}
                        </select>
                        <button
                          onClick={() => handleTestTone(newSoundPreset)}
                          className="bg-slate-100 hover:bg-slate-200 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider"
                          title="Test Sound Preset"
                        >
                          Test
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Snooze</label>
                      <select
                        value={newSnooze}
                        onChange={(e) => setNewSnooze(parseInt(e.target.value, 10))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
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
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
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
                      className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-100 text-white disabled:text-slate-400 px-5 py-2.5 rounded-2xl text-xs font-black transition-all active:scale-95 shadow-lg shadow-blue-100 disabled:shadow-none"
                    >
                      Save Alarm
                    </button>
                  </div>
                </div>
              )}

              {/* Alarms list */}
              {customAlarms.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center text-xs text-slate-400">
                  No custom alarm routines set. Click "+ Add Alarm" to configure one.
                </div>
              ) : (
                <div className="space-y-2">
                  {customAlarms.map((alarm) => {
                    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                    const formattedTime = formatHour(alarm.hour + alarm.minute / 60);

                    return (
                      <div
                        key={alarm.id}
                        className={`bg-white rounded-3xl border border-slate-200 p-4 flex items-center gap-3 transition-opacity duration-200 ${
                          alarm.enabled && isEnabled ? 'opacity-100' : 'opacity-60'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Bell size={16} className="text-blue-500" />
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
                                      ? 'bg-blue-100 text-blue-600 font-bold'
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
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {alarm.missionType !== 'none' && (
                                <span className="bg-amber-50 border border-amber-100 text-amber-600 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                  ⚡ {alarm.missionType} mission
                                </span>
                              )}
                              <span className="bg-slate-50 border border-slate-100 text-slate-500 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                🎵 {alarm.soundPreset || 'chime'} tone
                              </span>
                              {alarm.snoozeDuration !== 5 && (
                                <span className="bg-slate-50 border border-slate-100 text-slate-500 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                  Snooze: {alarm.snoozeDuration}m
                                </span>
                              )}
                              {alarm.fadeInDuration > 0 && (
                                <span className="bg-indigo-50 border border-indigo-100 text-indigo-500 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
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
                            className="text-slate-300 hover:text-red-500 p-1.5 transition-colors"
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

            {/* ===== DERIVED ALARMS TODAY ===== */}
            <section className="space-y-3">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 font-sans">Event-derived Alarms (Today)</h2>
              {eventAlarms.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center text-xs text-slate-400">
                  No upcoming calendar events with derived alarms today.
                </div>
              ) : (
                <div className="space-y-2">
                  {eventAlarms.map((alarm, idx) => (
                    <div key={idx} className="bg-white rounded-3xl border border-slate-200 p-4 flex items-center gap-3 opacity-80">
                      <div className="w-9 h-9 rounded-2xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                        <Clock size={16} className="text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-slate-800">
                          {formatHour(alarm.scheduledAt.getHours() + alarm.scheduledAt.getMinutes() / 60)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold truncate mt-0.5">
                          {alarm.title} — {alarm.body}
                        </div>
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        Auto
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

      </div>
    </div>
  );
};
