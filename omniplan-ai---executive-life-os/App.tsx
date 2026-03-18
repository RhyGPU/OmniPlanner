
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { EmailView } from './components/EmailView';
import { MonthlyView } from './components/MonthlyView';
import { WeeklyPlannerView } from './components/WeeklyPlannerView';
import { GoalsView } from './components/GoalsView';
import { DataView } from './components/DataView';
import { AlertDialog } from './components/Dialog';
import { Tab, Email, GoalItem, WeekData, CalendarEvent, Habit } from './types';
import { getAllWeeks, saveAllWeeks, getOrCreateWeek, getWeekStorageKey } from './utils/weekManager';
import { downloadBackup, uploadBackup } from './utils/dataManager';
import { saveGoalItems } from './utils/goalManager';
import { formatDateKey } from './constants';
import { storage, LOCAL_STORAGE_KEYS } from './services/storage';

const INITIAL_EMAILS: Email[] = [
  { id: 1, provider: 'internal', sender: "OmniPlan Core", subject: "Executive System Ready", preview: "Your dashboard is ready...", body: "Welcome to OmniPlan!\n\nThis system is designed for high-performance scheduling. Your weekly planner, monthly overview, and life vision board are now active.\n\nUse the 'AI Optimize Week' feature to automatically generate focus themes based on your historical data and current tasks.\n\nBest,\nOmniPlan Team", time: "09:00 AM", read: false },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Weekly);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [aiLoading, setAiLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

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

  const handleLoadData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await uploadBackup(file);
      setAllWeeks(data.allWeeks);
      setEmails(data.emails.length > 0 ? data.emails : emails);
      if (data.goalItems && data.goalItems.length > 0) {
        setGoalItems(data.goalItems);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Restore failed:", message);
      setAlertMsg("Restore failed: " + message);
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
            {activeTab === Tab.Goals && <GoalsView goalItems={goalItems} setGoalItems={setGoalItems} allWeeks={allWeeks} />}
            {activeTab === Tab.Data && (
              <DataView
                handleSaveData={handleSaveData}
                handleLoadData={handleLoadData}
                onImportIcsEvents={importIcsEvents}
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
