
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { EmailView } from './components/EmailView';
import { MonthlyView } from './components/MonthlyView';
import { WeeklyPlannerView } from './components/WeeklyPlannerView';
import { GoalsView } from './components/GoalsView';
import { DataView } from './components/DataView';
import { DashboardView } from './components/DashboardView';
import { AlarmsView } from './components/AlarmsView';
import { AlertDialog, ConfirmDialog } from './components/Dialog';
import { UndoToast } from './components/UndoToast';
import { Tab, Email, GoalItem, WeekData, CalendarEvent, Habit, NotificationSettings, ActualEventLog, Todo } from './types';
import { createEmptyDailyPlan, getAllWeeks, saveAllWeeks, getOrCreateWeek, getWeekStorageKey } from './utils/weekManager';
import { downloadBackup, uploadBackup } from './utils/dataManager';
import { saveGoalItems } from './utils/goalManager';
import { initAICredentials, migrateCredentials, runMobileSecureMigration } from './services/storage/secureSettings';
import { getNotificationSettings, saveNotificationSettings } from './services/storage/notificationSettings';
import { syncReminders } from './utils/reminderSync';
import { formatDateKey, getWeekDays } from './constants';
import { storage, LOCAL_STORAGE_KEYS, getStorageStatus } from './services/storage';
import { isElectron } from './services/platform';
import type { StorageStatus } from './services/storage';
import { getOnboardingDismissed, setOnboardingDismissed, hasPlannerData } from './services/storage/onboardingState';
import { WelcomeCard } from './components/WelcomeCard';
import { MorningBriefing } from './components/MorningBriefing';
import { CarryForwardDialog } from './components/CarryForwardDialog';
import { AlarmMissionOverlay } from './components/AlarmMissionOverlay';
import {
  getCarryForwardCandidates,
  groupCandidatesByGoal,
  buildCarriedTodo,
  type CarryForwardGroup,
  type CarryForwardDecision,
} from './utils/carryForward';

const INITIAL_EMAILS: Email[] = [
  { id: 1, provider: 'internal', sender: "OmniPlan Core", subject: "Executive System Ready", preview: "Your dashboard is ready...", body: "Welcome to OmniPlan!\n\nThis system is designed for high-performance scheduling. Your weekly planner, monthly overview, and life vision board are now active.\n\nUse the 'AI Optimize Week' feature to automatically generate focus themes based on your historical data and current tasks.\n\nBest,\nOmniPlan Team", time: "09:00 AM", read: false },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Dashboard);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [aiLoading, setAiLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [showMorningBrief, setShowMorningBrief] = useState(false);

  // Undo toast state
  const [undoToast, setUndoToast] = useState<{
    message: string;
    onUndo: () => void;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const showUndoToast = useCallback((message: string, onUndo: () => void) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ message, onUndo });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
  }, []);
  const dismissUndoToast = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
  }, []);

  // All weeks data - central source of truth
  const [allWeeks, setAllWeeks] = useState<Record<string, WeekData>>(() => {
    return getAllWeeks();
  });

  // Current week data (derived from allWeeks)
  const currentWeek = getOrCreateWeek(currentDate, allWeeks);

  // Log an actual event (from Dashboard "Start"/"Skip"/"Done" buttons).
  // NOTE: allWeeks is keyed by getWeekStorageKey (omni_week_YYYY-MM-DD) — the
  // previous implementation indexed by the bare date and silently no-oped.
  const handleLogActual = useCallback((log: ActualEventLog) => {
    const logDate = new Date(log.dateKey + 'T00:00:00');
    const weekKey = getWeekStorageKey(logDate);

    setAllWeeks(prev => {
      const week = prev[weekKey] ?? getOrCreateWeek(logDate, prev);
      const dayPlan = week.dailyPlans[log.dateKey] ?? createEmptyDailyPlan();
      const actuals = dayPlan.actuals ?? { events: [], habits: {} };

      const events = [...actuals.events];
      const existingIdx = events.findIndex(
        (a: ActualEventLog) => a.plannedEventId === log.plannedEventId && a.dateKey === log.dateKey
      );
      if (existingIdx >= 0) {
        events[existingIdx] = log;
      } else {
        events.push(log);
      }

      return {
        ...prev,
        [weekKey]: {
          ...week,
          dailyPlans: {
            ...week.dailyPlans,
            [log.dateKey]: { ...dayPlan, actuals: { ...actuals, events } },
          },
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  // Toggle habit completion from Dashboard
  const handleCompleteHabit = useCallback((habitId: string) => {
    const dateKey = formatDateKey(new Date());
    const weekKey = getWeekStorageKey(currentDate);
    setAllWeeks(prev => {
      const week = prev[weekKey] ?? getOrCreateWeek(currentDate, prev);

      const habit = week.habits.find(h => h.id === habitId);
      if (!habit) return prev;

      const wasCompleted = !!habit.completions[dateKey];
      const habits = week.habits.map(h =>
        h.id === habitId
          ? { ...h, completions: { ...h.completions, [dateKey]: !wasCompleted }, lastUsedAt: Date.now() }
          : h
      );

      const dayPlan = week.dailyPlans[dateKey] ?? createEmptyDailyPlan();
      const actuals = dayPlan.actuals ?? { events: [], habits: {} };

      return {
        ...prev,
        [weekKey]: {
          ...week,
          habits,
          dailyPlans: {
            ...week.dailyPlans,
            [dateKey]: {
              ...dayPlan,
              actuals: { ...actuals, habits: { ...actuals.habits, [habitId]: !wasCompleted } },
            },
          },
          updatedAt: Date.now(),
        },
      };
    });
  }, [currentDate]);

  // Toggle todo completion from Dashboard
  const handleDashboardToggleTodo = useCallback((dateKey: string, todoId: string) => {
    const date = new Date(dateKey + 'T00:00:00');
    const weekKey = getWeekStorageKey(date);
    setAllWeeks(prev => {
      const week = prev[weekKey];
      if (!week) return prev;
      const dayPlan = week.dailyPlans?.[dateKey];
      if (!dayPlan) return prev;
      return {
        ...prev,
        [weekKey]: {
          ...week,
          dailyPlans: {
            ...week.dailyPlans,
            [dateKey]: {
              ...dayPlan,
              todos: dayPlan.todos.map(t => (t.id === todoId ? { ...t, done: !t.done } : t)),
            },
          },
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  // Add new todo from Dashboard (to today)
  const handleDashboardAddTodo = useCallback((todo: Todo, dateKey: string) => {
    const date = new Date(dateKey + 'T00:00:00');
    const weekKey = getWeekStorageKey(date);
    setAllWeeks(prev => {
      const week = prev[weekKey] ?? getOrCreateWeek(date, prev);
      const dayPlan = week.dailyPlans[dateKey] ?? createEmptyDailyPlan();
      return {
        ...prev,
        [weekKey]: {
          ...week,
          dailyPlans: {
            ...week.dailyPlans,
            [dateKey]: { ...dayPlan, todos: [...dayPlan.todos, todo] },
          },
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  // Add new habit from Dashboard
  const handleDashboardAddHabit = useCallback((habit: Habit) => {
    const weekKey = getWeekStorageKey(currentDate);
    setAllWeeks(prev => {
      const week = prev[weekKey] ?? getOrCreateWeek(currentDate, prev);
      if (week.habits.some(h => h.id === habit.id)) return prev;
      return {
        ...prev,
        [weekKey]: { ...week, habits: [...week.habits, habit], updatedAt: Date.now() },
      };
    });
  }, [currentDate]);

  // Storage health — read once at mount (set synchronously during startup before render)
  const [storageStatus] = useState<StorageStatus>(() => getStorageStatus());

  // First-run welcome card — shown once to users with no meaningful planner data.
  // Reading storage directly here (same pattern as other lazy initialisers) so we
  // don't need to wait for React state to be assigned.
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (getOnboardingDismissed()) return false;
    const savedGoals = storage.get<GoalItem[]>(LOCAL_STORAGE_KEYS.GOAL_ITEMS) ?? [];
    const savedWeeks = storage.get<Record<string, WeekData>>(LOCAL_STORAGE_KEYS.ALL_WEEKS) ?? {};
    return !hasPlannerData(savedWeeks, savedGoals);
  });

  const handleDismissWelcome = useCallback(() => {
    setOnboardingDismissed();
    setShowWelcome(false);
  }, []);

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

  // Active alarm state & triggers (v4.1)
  const [activeAlarm, setActiveAlarm] = useState<{
    id: string;
    title: string;
    body: string;
    missionType: 'none' | 'math' | 'checklist' | 'theme';
    snoozeDuration: number;
    fadeInDuration: number;
    soundPreset?: 'chime' | 'beep' | 'pulse' | 'gentle' | 'custom';
  } | null>(null);

  // Lifted Pomodoro Timer Shared State (v4.2)
  const [pomMode, setPomMode] = useState<'focus' | 'break'>('focus');
  const [pomDuration, setPomDuration] = useState(25 * 60);
  const [pomTimeLeft, setPomTimeLeft] = useState(25 * 60);
  const [pomIsRunning, setPomIsRunning] = useState(false);

  const pomodoroProps = useMemo(() => ({
    mode: pomMode,
    setMode: setPomMode,
    duration: pomDuration,
    setDuration: setPomDuration,
    timeLeft: pomTimeLeft,
    setTimeLeft: setPomTimeLeft,
    isRunning: pomIsRunning,
    setIsRunning: setPomIsRunning
  }), [pomMode, pomDuration, pomTimeLeft, pomIsRunning]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.notificationOnTrigger) {
      const cleanup = window.electronAPI.notificationOnTrigger((alarmData: any) => {
        setActiveAlarm(alarmData);
      });
      return cleanup;
    }
  }, []);

  const handleSnoozeAlarm = useCallback((minutes: number) => {
    if (!activeAlarm) return;
    
    // 1. Schedule one-shot snooze alarm in main process
    if (typeof window !== 'undefined' && window.electronAPI?.notificationSchedule) {
      window.electronAPI.notificationSchedule(
        Date.now(),
        `Snooze: ${activeAlarm.title}`,
        activeAlarm.body,
        Date.now() + minutes * 60_000
      );
    }

    // 2. Smart Planner Snooze: Reschedule matching calendar events
    const todayKey = formatDateKey(currentDate);
    const dayPlan = currentWeek.dailyPlans?.[todayKey];
    if (dayPlan?.events) {
      const shiftHours = minutes / 60;
      let shifted = false;
      const updatedEvents = dayPlan.events.map(ev => {
        const isMatch = activeAlarm.title.toLowerCase().includes(ev.title.toLowerCase()) ||
                        activeAlarm.body.toLowerCase().includes(ev.title.toLowerCase());
        if (isMatch) {
          shifted = true;
          return {
            ...ev,
            startHour: Math.min(23.75, ev.startHour + shiftHours)
          };
        }
        return ev;
      });

      if (shifted) {
        setAllWeeks(prev => {
          const wKey = getWeekStorageKey(currentDate);
          const week = prev[wKey];
          if (!week) return prev;
          return {
            ...prev,
            [wKey]: {
              ...week,
              dailyPlans: {
                ...week.dailyPlans,
                [todayKey]: {
                  ...dayPlan,
                  events: updatedEvents
                }
              }
            }
          };
        });
      }
    }

    setActiveAlarm(null);
  }, [activeAlarm, currentDate, currentWeek]);

  const handleDismissAlarm = useCallback(() => {
    setActiveAlarm(null);
  }, []);

  // Daily Morning Briefing trigger and handlers
  useEffect(() => {
    const lastBriefDate = storage.get<string>(LOCAL_STORAGE_KEYS.LAST_BRIEFING_DATE);
    const todayStr = formatDateKey(currentDate);
    if (lastBriefDate !== todayStr) {
      setShowMorningBrief(true);
    }
  }, [currentDate]);

  // Monday carry-forward ritual — on the first launch of a new week, surface
  // last week's unfinished GOAL-LINKED todos (unlinked todos stay week-isolated
  // by design). Anchored to the real current week, not the viewed week.
  // Runs once per week: LOCAL_STORAGE_KEYS.CARRY_FORWARD_WEEK stores the week
  // key it last ran for. Shown before the Morning Briefing.
  const [carryForwardGroups, setCarryForwardGroups] = useState<CarryForwardGroup[] | null>(null);
  useEffect(() => {
    const today = new Date();
    const thisWeekKey = getWeekStorageKey(today);
    if (storage.get<string>(LOCAL_STORAGE_KEYS.CARRY_FORWARD_WEEK) === thisWeekKey) return;
    const prevDate = new Date(today);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevWeek = allWeeks[getWeekStorageKey(prevDate)];
    const candidates = getCarryForwardCandidates(prevWeek);
    if (candidates.length === 0) {
      // Nothing to decide — mark the week done so we don't re-scan every launch.
      storage.set(LOCAL_STORAGE_KEYS.CARRY_FORWARD_WEEK, thisWeekKey);
      return;
    }
    setCarryForwardGroups(groupCandidatesByGoal(candidates, goalItems));
    // Startup snapshot only — allWeeks/goalItems changes after mount must not re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeCarryForward = useCallback(() => {
    storage.set(LOCAL_STORAGE_KEYS.CARRY_FORWARD_WEEK, getWeekStorageKey(new Date()));
    setCarryForwardGroups(null);
  }, []);

  const handleCarryForwardApply = useCallback((decisions: CarryForwardDecision[]) => {
    const today = new Date();
    const weekKey = getWeekStorageKey(today);
    const mondayKey = formatDateKey(getWeekDays(today)[0]);
    setAllWeeks(prev => {
      const week = prev[weekKey] ?? getOrCreateWeek(today, prev);
      let dailyPlans = week.dailyPlans;
      let changed = false;
      for (const decision of decisions) {
        if (decision.action === 'drop') continue;
        const targetKey = decision.action === 'carry' ? mondayKey : decision.action.rescheduleTo;
        const plan = dailyPlans[targetKey] ?? createEmptyDailyPlan();
        dailyPlans = {
          ...dailyPlans,
          [targetKey]: { ...plan, todos: [...plan.todos, buildCarriedTodo(decision.candidate.todo)] },
        };
        changed = true;
      }
      if (!changed) return prev;
      return { ...prev, [weekKey]: { ...week, dailyPlans, updatedAt: Date.now() } };
    });
    closeCarryForward();
  }, [closeCarryForward]);

  const carryForwardWeekDays = useMemo(() => {
    return getWeekDays(new Date()).map(d => ({
      dateKey: formatDateKey(d),
      label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
    }));
  }, []);

  // One-time launch-at-startup prompt (desktop only). Opt-in per plan:
  // never enabled silently — the user answers once, changeable later in
  // Settings & Data → Notifications.
  const [showStartupPrompt, setShowStartupPrompt] = useState(false);
  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.startupSet) return;
    if (storage.get<boolean>(LOCAL_STORAGE_KEYS.STARTUP_PROMPT_DONE)) return;
    setShowStartupPrompt(true);
  }, []);

  const answerStartupPrompt = useCallback(async (enable: boolean) => {
    storage.set(LOCAL_STORAGE_KEYS.STARTUP_PROMPT_DONE, true);
    setShowStartupPrompt(false);
    if (enable) {
      try {
        await window.electronAPI!.startupSet(true);
      } catch (e) {
        console.error('[OmniPlanner] Failed to enable launch at startup:', e);
      }
    }
  }, []);

  const handleSetFocusTheme = useCallback((dateKey: string, theme: string) => {
    const date = new Date(dateKey + 'T00:00:00');
    const weekKey = getWeekStorageKey(date);
    setAllWeeks(prev => {
      const week = prev[weekKey] ?? getOrCreateWeek(date, prev);
      const dayPlan = week.dailyPlans[dateKey] ?? createEmptyDailyPlan();
      return {
        ...prev,
        [weekKey]: {
          ...week,
          dailyPlans: { ...week.dailyPlans, [dateKey]: { ...dayPlan, focusTheme: theme } },
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  const handleDismissMorningBrief = useCallback(() => {
    const todayStr = formatDateKey(currentDate);
    storage.set(LOCAL_STORAGE_KEYS.LAST_BRIEFING_DATE, todayStr);
    setShowMorningBrief(false);
  }, [currentDate]);

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

  const addEventToWeek = useCallback((date: Date, event: CalendarEvent, sourceWeeks: Record<string, WeekData>) => {
    const week = getOrCreateWeek(date, sourceWeeks);
    const dateKey = formatDateKey(date);
    const dayPlan = week.dailyPlans[dateKey] ?? createEmptyDailyPlan();
    return {
      ...week,
      dailyPlans: {
        ...week.dailyPlans,
        [dateKey]: { ...dayPlan, events: [...dayPlan.events, event] },
      },
      updatedAt: Date.now(),
    };
  }, []);

  // Add calendar event from email
  const addEventFromEmail = useCallback((date: Date, event: CalendarEvent) => {
    updateWeekForDate(date, addEventToWeek(date, event, allWeeks));
  }, [addEventToWeek, allWeeks, updateWeekForDate]);

  // Import multiple events from an ICS file
  const importIcsEvents = useCallback((events: { date: Date; event: CalendarEvent }[]) => {
    setAllWeeks(prev => {
      const updated = { ...prev };
      for (const { date, event } of events) {
        const weekKey = getWeekStorageKey(date);
        updated[weekKey] = addEventToWeek(date, event, updated[weekKey] ? updated : prev);
      }
      return updated;
    });
  }, [addEventToWeek]);

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
  const deleteHabitGlobally = useCallback((habitId: string, habitName?: string) => {
    const now = Date.now();
    const currentWeekKey = getWeekStorageKey(currentDate);
    // Capture habit name from current week for the toast
    const name = habitName || currentWeek.habits?.find(h => h.id === habitId)?.name || 'Habit';
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
    // Show undo toast
    showUndoToast(`${name} deleted`, () => {
      setAllWeeks(prev => {
        const updated = { ...prev };
        for (const weekKey of Object.keys(updated)) {
          if (weekKey < currentWeekKey) continue;
          const week = updated[weekKey];
          if (week.habits?.some(h => h.id === habitId)) {
            updated[weekKey] = {
              ...week,
              habits: week.habits.map(h =>
                h.id === habitId ? { ...h, deletedAt: undefined } : h
              ),
              updatedAt: Date.now(),
            };
          }
        }
        return updated;
      });
    });
  }, [currentDate, currentWeek.habits, showUndoToast]);

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
  const handleLoadData = async (file: File): Promise<void> => {
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

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      // Ctrl+S: save/export backup
      if (ctrl && e.key === 's') {
        e.preventDefault();
        handleSaveData();
      }
      // Undo toast: Undo button handles Enter, Escape handles dismiss — done in UndoToast
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveData]);

  const zoomStyle = useMemo(() => ({
    transform: `scale(${currentZoom})`,
    transformOrigin: 'top left',
    width: `${100 / currentZoom}%`,
    height: `${100 / currentZoom}%`,
  }), [currentZoom]);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 select-none overflow-hidden antialiased">
      {alertMsg && <AlertDialog message={alertMsg} onClose={() => setAlertMsg(null)} />}
      {showStartupPrompt && (
        <ConfirmDialog
          message={'Would you like OmniPlanner to start automatically when you log in?\n\nRecommended for alarms and notifications — you can change this anytime in Settings & Data → Notifications.'}
          confirmLabel="Yes, enable"
          cancelLabel="No thanks"
          onConfirm={() => answerStartupPrompt(true)}
          onCancel={() => answerStartupPrompt(false)}
        />
      )}

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
        onLogActual={handleLogActual}
        pomodoroProps={pomodoroProps}
      />

      <main className="flex-1 flex flex-col p-2 md:p-4 bg-slate-100 min-w-0 h-screen overflow-hidden">
        <div className="flex-1 bg-white rounded-3xl shadow-2xl shadow-slate-200/40 border border-slate-200 relative overflow-auto">
          {showWelcome && <WelcomeCard onDismiss={handleDismissWelcome} />}
          <div style={zoomStyle}>
            {activeTab === Tab.Dashboard && (
              <DashboardView
                today={currentDate}
                currentWeek={currentWeek}
                allWeeks={allWeeks}
                emails={emails}
                onLogActual={handleLogActual}
                onCompleteHabit={handleCompleteHabit}
                onToggleTodo={handleDashboardToggleTodo}
                onSetPriority={() => {}}
                onNavigateToWeek={navigateToWeeklyView}
                onAddTodo={handleDashboardAddTodo}
                onAddHabit={handleDashboardAddHabit}
                onShowMorningBrief={() => setShowMorningBrief(true)}
              />
            )}
            {activeTab === Tab.Alarms && (
              <AlarmsView
                notificationSettings={notificationSettings}
                onNotificationSettingsChange={handleNotificationSettingsChange}
                currentWeek={currentWeek}
                onLogActual={handleLogActual}
                pomodoroProps={pomodoroProps}
              />
            )}
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
                notificationSettings={notificationSettings}
                onNotificationSettingsChange={handleNotificationSettingsChange}
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

      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={undoToast.onUndo}
          onDismiss={dismissUndoToast}
        />
      )}

      {/* Carry-forward ritual takes precedence over the Morning Briefing so
          the week's first decision happens before the day's first one. */}
      {showMorningBrief && !carryForwardGroups && (
        <MorningBriefing
          currentWeek={currentWeek}
          today={currentDate}
          onSetFocusTheme={handleSetFocusTheme}
          onDismiss={handleDismissMorningBrief}
        />
      )}

      {carryForwardGroups && (
        <CarryForwardDialog
          groups={carryForwardGroups}
          weekDays={carryForwardWeekDays}
          onApply={handleCarryForwardApply}
          onDismiss={closeCarryForward}
        />
      )}

      {activeAlarm && (
        <AlarmMissionOverlay
          alarmData={activeAlarm}
          currentWeek={currentWeek}
          todayDateKey={formatDateKey(currentDate)}
          focusTheme={currentWeek.dailyPlans?.[formatDateKey(currentDate)]?.focusTheme || ''}
          onToggleTodo={handleDashboardToggleTodo}
          onSnooze={handleSnoozeAlarm}
          onDismiss={handleDismissAlarm}
          customSoundData={notificationSettings.customSoundData}
        />
      )}
    </div>
  );
}
