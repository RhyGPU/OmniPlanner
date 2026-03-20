
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { EmailView } from './components/EmailView';
import { MonthlyView } from './components/MonthlyView';
import { WeeklyPlannerView } from './components/WeeklyPlannerView';
import { GoalsView } from './components/GoalsView';
import { DataView } from './components/DataView';
import { AlertDialog } from './components/Dialog';
import { Tab, Email, GoalItem, WeekData, CalendarEvent, Habit, NotificationSettings } from './types';
import { getAllWeeks, saveAllWeeks, getOrCreateWeek, getWeekStorageKey } from './utils/weekManager';
import { downloadBackup, uploadBackup } from './utils/dataManager';
import { saveGoalItems } from './utils/goalManager';
import { initAICredentials, migrateCredentials, runMobileSecureMigration } from './services/storage/secureSettings';
import { getNotificationSettings, saveNotificationSettings } from './services/storage/notificationSettings';
import { syncReminders } from './utils/reminderSync';
import { formatDateKey } from './constants';
import { storage, LOCAL_STORAGE_KEYS, getStorageStatus } from './services/storage';
import type { StorageStatus } from './services/storage';

const INITIAL_EMAILS: Email[] = [
  { id: 1, provider: 'internal', sender: "OmniPlan Core", subject: "Executive System Ready", preview: "Your dashboard is ready...", body: "Welcome to OmniPlan!\n\nThis system is designed for high-performance scheduling. Your weekly planner, monthly overview, and life vision board are now active.\n\nUse the 'AI Optimize Week' feature to automatically generate focus themes based on your historical data and current tasks.\n\nBest,\nOmniPlan Team", time: "09:00 AM", read: false },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Weekly);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [aiLoading, setAiLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  // Storage health — read once at mount (set synchronously during startup before render)
  const [storageStatus] = useState<StorageStatus>(() => getStorageStatus());

  // Per-tab zoom levels
  const [zoomLevels, setZoomLevels] = useState<Record<string, number>>(
    () => storage.get<Record<string, number>>(LOCAL_STORAGE_KEYS.ZOOM_LEVELS) ?? {},
  );

  const currentZoom = zoomLevels[activeTab] || 1.0;
  const currentZoomPercent = Math.round(currentZoom * 100);

  const handleZoomIn = useCallback(() => {
    setZoomLevels(prev => {
      const current = prev[activeTab] || 1.0;
      const next = Math.min(current + 0.1, 2.0);
      const updated = { ...prev, [activeTab]: next };
      storage.set(LOCAL_STORAGE_KEYS.ZOOM_LEVELS, updated);
      return updated;
    });
  }, [activeTab]);

  const handleZoomOut = useCallback(() => {
    setZoomLevels(prev => {
      const current = prev[activeTab] || 1.0;
      const next = Math.max(current - 0.1, 0.5);
      const updated = { ...prev, [activeTab]: next };
      storage.set(LOCAL_STORAGE_KEYS.ZOOM_LEVELS, updated);
      return updated;
    });
  }, [activeTab]);

  const handleZoomReset = useCallback(() => {
    setZoomLevels(prev => {
      const updated = { ...prev, [activeTab]: 1.0 };
      storage.set(LOCAL_STORAGE_KEYS.ZOOM_LEVELS, updated);
      return updated;
    });
  }, [activeTab]);

  // All weeks data - central source of truth
  const [allWeeks, setAllWeeks] = useState<Record<string, WeekData>>(() => {
    return getAllWeeks();
  });

  // Current week data (derived from allWeeks)
  const currentWeek = getOrCreateWeek(currentDate, allWeeks);

  // Persistent State Management
  const [emails, setEmails] = useState<Email[]>(
    () => storage.get<Email[]>(LOCAL_STORAGE_KEYS.EMAILS) ?? INITIAL_EMAILS,
  );

  const [goalItems, setGoalItems] = useState<GoalItem[]>(
    () => storage.get<GoalItem[]>(LOCAL_STORAGE_KEYS.GOAL_ITEMS) ?? [],
  );

  // Notification reminder settings (non-sensitive, stored in IDB / localStorage)
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    () => getNotificationSettings(),
  );

  const handleNotificationSettingsChange = useCallback((settings: NotificationSettings) => {
    setNotificationSettings(settings);
    saveNotificationSettings(settings);
  }, []);

  // One-time startup:
  //   1. Run mobile secure migration (Phase 11A): drain @capacitor/preferences
  //      credentials into native Keychain / Keystore. No-op on Electron / web.
  //   2. Migrate plaintext localStorage credentials to platform.credentials.
  //   3. Warm the renderer-side API key cache.
  //   All operations are idempotent.
  useEffect(() => {
    runMobileSecureMigration()
      .then(() => migrateCredentials())
      .then(() => initAICredentials());
  }, []);

  // Sync local notifications whenever notification settings change, or when
  // today's focus events or habit list changes (for accurate reminder targets).
  const todayDateKey = formatDateKey(currentDate);
  const todayFocusEventsKey = useMemo(() => {
    const dayPlan = currentWeek.dailyPlans?.[todayDateKey];
    const events = (dayPlan?.events ?? []).filter(e => e.eventKind === 'focus');
    return events.map(e => `${e.id}:${e.startHour}`).join(',');
  }, [currentWeek, todayDateKey]);

  const activeHabitsKey = useMemo(() => {
    return (currentWeek.habits ?? [])
      .filter(h => !h.archived && !h.deletedAt)
      .map(h => h.id)
      .join(',');
  }, [currentWeek.habits]);

  useEffect(() => {
    syncReminders(notificationSettings, currentWeek, currentDate).catch(
      e => console.error('[OmniPlanner] syncReminders failed:', e),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationSettings, todayFocusEventsKey, activeHabitsKey]);

  // Global Persistence Effect
  useEffect(() => {
    saveAllWeeks(allWeeks);
    storage.set(LOCAL_STORAGE_KEYS.EMAILS, emails);
    saveGoalItems(goalItems);
  }, [allWeeks, emails, goalItems]);

  // Update week data
  const updateCurrentWeek = useCallback((updatedWeek: WeekData) => {
    const weekKey = getWeekStorageKey(currentDate);
    setAllWeeks(prev => ({
      ...prev,
      [weekKey]: {
        ...updatedWeek,
        updatedAt: Date.now(),
      }
    }));
  }, [currentDate]);

  // Update week data for a specific date (used by MonthlyView)
  const updateWeekForDate = useCallback((date: Date, updatedWeek: WeekData) => {
    const weekKey = getWeekStorageKey(date);
    setAllWeeks(prev => ({
      ...prev,
      [weekKey]: {
        ...updatedWeek,
        updatedAt: Date.now(),
      }
    }));
  }, []);

  const navigateToWeeklyView = useCallback((date: Date) => {
    setCurrentDate(date);
    setActiveTab(Tab.Weekly);
  }, []);

  // Add calendar event from email
  const addEventFromEmail = useCallback((date: Date, event: CalendarEvent) => {
    const week = getOrCreateWeek(date, allWeeks);
    const dateKey = formatDateKey(date);
    const dayPlan = week.dailyPlans[dateKey] || { focus: '', todos: [], notes: '', events: [] };
    const updatedWeek = {
      ...week,
      dailyPlans: { ...week.dailyPlans, [dateKey]: { ...dayPlan, events: [...dayPlan.events, event] } }
    };
    updateWeekForDate(date, updatedWeek);
  }, [allWeeks, updateWeekForDate]);

  // Import multiple events from an ICS file
  const importIcsEvents = useCallback((events: { date: Date; event: CalendarEvent }[]) => {
    setAllWeeks(prev => {
      const updated = { ...prev };
      for (const { date, event } of events) {
        const weekKey = getWeekStorageKey(date);
        const week = updated[weekKey] || getOrCreateWeek(date, prev);
        const dateKey = formatDateKey(date);
        const dayPlan = week.dailyPlans[dateKey] || { focus: '', todos: [], notes: '', events: [] };
        updated[weekKey] = {
          ...week,
          dailyPlans: {
            ...week.dailyPlans,
            [dateKey]: { ...dayPlan, events: [...dayPlan.events, event] },
          },
          updatedAt: Date.now(),
        };
      }
      return updated;
    });
  }, []);

  // Add a habit to current week AND all existing future weeks
  const addHabitGlobally = useCallback((newHabit: Habit) => {
    const now = Date.now();
    const currentWeekKey = getWeekStorageKey(currentDate);
    setAllWeeks(prev => {
      const updated = { ...prev };
      // Ensure current week exists
      if (!updated[currentWeekKey]) {
        updated[currentWeekKey] = getOrCreateWeek(currentDate, prev);
      }
      for (const weekKey of Object.keys(updated)) {
        if (weekKey < currentWeekKey) continue; // skip past weeks
        const week = updated[weekKey];
        if (!week.habits?.some(h => h.id === newHabit.id)) {
          updated[weekKey] = {
            ...week,
            habits: [...(week.habits || []), {
              ...newHabit,
              completions: weekKey === currentWeekKey ? newHabit.completions : {},
            }],
            updatedAt: now,
          };
        }
      }
      return updated;
    });
  }, [currentDate]);

  // Delete a habit from the current week AND all future weeks (preserves past records)
  const deleteHabitGlobally = useCallback((habitId: string) => {
    const now = Date.now();
    const currentWeekKey = getWeekStorageKey(currentDate);
    setAllWeeks(prev => {
      const updated = { ...prev };
      for (const weekKey of Object.keys(updated)) {
        // Only affect current week and future weeks (string comparison works for omni_week_YYYY-MM-DD keys)
        if (weekKey < currentWeekKey) continue;
        const week = updated[weekKey];
        if (week.habits?.some(h => h.id === habitId && !h.deletedAt)) {
          updated[weekKey] = {
            ...week,
            habits: week.habits.map(h =>
              h.id === habitId ? { ...h, deletedAt: now } : h
            ),
            updatedAt: now,
          };
        }
      }
      return updated;
    });
  }, [currentDate]);

  const handleSaveData = useCallback(() => {
    downloadBackup();
  }, []);

  /**
   * Restore handler — validates, writes to storage, then reloads the page.
   *
   * Why reload instead of updating React state:
   *   1. Eliminates the double-write (uploadBackup already persisted to storage).
   *   2. Ensures schema migrations re-run for old backups (importAllData may
   *      have reset schema version to 1 to trigger migration v2 on next startup).
   *   3. Gives reminder sync a clean startup trigger with the restored data.
   *   4. Prevents mixed state between old React state and new storage content.
   *
   * Device-local state that is intentionally NOT restored:
   *   - API keys / email passwords (secure credential storage, device-local)
   *   - Notification settings (device preference, not planner data)
   *   - Zoom levels (UI state)
   * Users restoring to a new device must re-enter credentials after restore.
   */
  const handleLoadData = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { warnings } = await uploadBackup(file);

      // Build the restore confirmation message shown before reload
      const warningText = warnings.length > 0
        ? `\n\nNotes:\n• ${warnings.join('\n• ')}`
        : '';

      setAlertMsg(
        `Backup restored successfully.${warningText}\n\n` +
        'The app will reload now to load your data cleanly.\n\n' +
        'Device-local settings (API keys, email passwords, notification preferences) ' +
        'were not changed — they live outside the backup by design.',
      );

      // Reload after a short delay so the alert is visible
      setTimeout(() => window.location.reload(), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[OmniPlanner] Restore failed:', message);
      setAlertMsg('Restore failed: ' + message);
    }
  };

  const zoomStyle = useMemo(() => ({
    transform: `scale(${currentZoom})`,
    transformOrigin: 'top left',
    width: `${100 / currentZoom}%`,
    height: `${100 / currentZoom}%`,
  }), [currentZoom]);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 select-none overflow-hidden antialiased">
      {alertMsg && <AlertDialog message={alertMsg} onClose={() => setAlertMsg(null)} />}

      {/* Storage degraded warning banner — shown when IDB is unavailable or quota exceeded */}
      {storageStatus.health === 'degraded' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-50 border-t-2 border-amber-300 px-4 py-2 flex items-center gap-3 text-sm">
          <span className="text-amber-600 font-black shrink-0">⚠ Storage limited</span>
          <span className="text-amber-800 font-medium flex-1 truncate">
            {storageStatus.degradedReason ?? 'Storage backend is degraded.'}
          </span>
          <button
            onClick={handleSaveData}
            className="shrink-0 bg-amber-600 text-white font-bold px-3 py-1 rounded-lg hover:bg-amber-700 transition-colors text-xs"
          >
            Export backup
          </button>
        </div>
      )}

      <Sidebar
        emailsCount={emails.filter(e => !e.read).length}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickSave={handleSaveData}
        zoomPercent={currentZoomPercent}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />

      <main className="flex-1 flex flex-col p-2 md:p-4 bg-slate-100 min-w-0 h-screen overflow-hidden">
        <div className="flex-1 bg-white rounded-3xl shadow-2xl shadow-slate-200/40 border border-slate-200 relative overflow-auto">
          <div style={zoomStyle}>
            {activeTab === Tab.Inbox && <EmailView emails={emails} setEmails={setEmails} allWeeks={allWeeks} onAddEvent={addEventFromEmail} />}
            {activeTab === Tab.Monthly && (
              <MonthlyView
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                allWeeks={allWeeks}
                onUpdateWeek={updateWeekForDate}
                onNavigateToWeek={navigateToWeeklyView}
              />
            )}
            {activeTab === Tab.Weekly && (
              <WeeklyPlannerView
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                currentWeek={currentWeek}
                updateCurrentWeek={updateCurrentWeek}
                setAiLoading={setAiLoading}
                onDeleteHabit={deleteHabitGlobally}
                onAddHabit={addHabitGlobally}
                allWeeks={allWeeks}
                goalItems={goalItems}
              />
            )}
            {activeTab === Tab.Goals && <GoalsView goalItems={goalItems} setGoalItems={setGoalItems} allWeeks={allWeeks} currentWeek={currentWeek} />}
            {activeTab === Tab.Data && (
              <DataView
                handleSaveData={handleSaveData}
                handleLoadData={handleLoadData}
                onImportIcsEvents={importIcsEvents}
                notificationSettings={notificationSettings}
                onNotificationSettingsChange={handleNotificationSettingsChange}
              />
            )}
          </div>
        </div>
      </main>

      {aiLoading && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 z-[100] border border-slate-700 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <Loader2 size={20} className="animate-spin text-blue-400"/>
          <span className="text-sm font-black tracking-wide uppercase">Gemini Optimizing Horizon...</span>
        </div>
      )}
    </div>
  );
}
