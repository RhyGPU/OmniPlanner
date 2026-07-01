
export interface Todo {
  id: string;
  text: string;
  done: boolean;
  /** Phase 2: optional link to a GoalItem.id. Picker UI in Phase 3. */
  parentGoalId?: string;
  /** Phase 2: when set, this todo is scheduled and appears on the calendar.
   *  Format: "YYYY-MM-DD" date key. */
  scheduledDateKey?: string;
  /** Phase 2: decimal hour when scheduled (e.g. 14.5 = 2:30 PM).
   *  Only meaningful when scheduledDateKey is set. */
  scheduledHour?: number;
  /** Phase 2: duration in hours when scheduled (default 1). */
  scheduledDuration?: number;
  /** Phase 2: mark as a sleep event for auto-alarm rules. */
  isSleepEvent?: boolean;
  /** Dashboard priority: 1-5 stars. Higher = more important. */
  priority?: 1 | 2 | 3 | 4 | 5;
}

export type GoalTimeframe = 'ten_year' | 'five_year' | 'three_year' | 'one_year' | 'monthly' | 'weekly';
export type GoalStatus = 'active' | 'completed' | 'archived';

export interface GoalItem {
  id: string;
  text: string;
  timeframe: GoalTimeframe;
  parentGoalId?: string;
  /**
   * @deprecated Phase 3: Not persisted. Use Todo.parentGoalId as the sole link
   * source and getTodosLinkedToGoal() / getGoalProgress() selectors to derive
   * linked state from allWeeks at read time.
   */
  linkedWeeklyGoalIds?: string[];
  order: number;
  status: GoalStatus;
  notes?: string;
  targetDate?: string;    // YYYY-MM-DD
  createdAt: string;      // ISO datetime
  updatedAt: string;      // ISO datetime
  completedAt?: string;
  archivedAt?: string;
}

export interface Habit {
  id: string;
  name: string;
  completions: Record<string, boolean>; // key is dateKey
  createdAt: number; // timestamp when habit was created
  deletedAt?: number; // timestamp when habit was deleted (null means active)
  lastUsedAt?: number; // timestamp of last completion
  archived?: boolean;
}

export interface HabitStreak {
  current: number; // Current streak count
  longest: number; // Longest streak ever
  totalDays: number; // Total days completed
  percentageComplete: number; // Completion percentage
}

/** Phase 5: discriminates calendar block purpose for scheduling intelligence. */
export type CalendarEventKind = 'meeting' | 'focus' | 'task_block' | 'routine';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startHour: number;
  duration: number;
  color: string;
  repeating?: boolean; // Whether this event repeats to future weeks
  // Phase 5: execution linkage — all optional, backward-compatible
  eventKind?: CalendarEventKind;
  /** Link to a GoalItem.id — this block supports that goal. */
  parentGoalId?: string;
  /** Link to a specific Todo.id — this block is scheduled time for that task. */
  linkedTodoId?: string;
  /** Dashboard priority: 1-5 stars. Higher = more important. Manual override always wins. */
  priority?: 1 | 2 | 3 | 4 | 5;
}

/** Actual event log — created when user taps "Event Start/Skip" or AI detects attendance */
export interface ActualEventLog {
  id: string;
  plannedEventId?: string;
  title: string;
  dateKey: string;
  scheduledHour: number;
  actualStartHour?: number;
  actualEndHour?: number;
  source: 'manual' | 'notification' | 'ai';
  attended: boolean;
  snoozedCount: number;
  notes?: string;
  loggedAt: number; // timestamp
}

/** Dashboard data — computed for the main screen */
export interface DashboardData {
  today: string; // dateKey
  upcomingEvents: DashboardEvent[];
  habitsDue: DashboardHabit[];
  recentEmails: DashboardEmail[];
  topTodos: DashboardTodo[];
}

export interface DashboardEvent {
  event: CalendarEvent;
  dateKey: string;
  dayOffset: number; // 0=today, 1=tomorrow, etc.
  actual?: ActualEventLog;
  isSleep: boolean;
  alarmRules: string[];
}

export interface DashboardHabit {
  habit: Habit;
  completedToday: boolean;
  streak: number;
  dueBy?: string; // HH:MM
}

export interface DashboardEmail {
  email: Email;
  hasActionableEvent: boolean;
  suggestedTitle?: string;
  suggestedDate?: string;
  suggestedHour?: number;
}

export interface DashboardTodo {
  todo: Todo;
  score: number; // computed: priority * urgency. Higher = show first.
  source: 'weekly' | 'daily' | 'habit-linked';
}

export interface LifeGoals {
  '10': Record<string, string>;
  '5': Record<string, { goal: string; action: string }>;
  '3': Record<string, string>;
  '1': Record<string, string>;
}

export interface Email {
  id: number;
  provider: string;
  sender: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  read: boolean;
}

export interface DailyPlan {
  focus?: string; // Daily focus theme
  todos: Todo[];
  notes: string;
  events: CalendarEvent[];
  /** Phase 2: what actually happened today. Logged after the fact. */
  actuals?: DailyActuals;
}

/** Phase 2: actuals — what really happened today */
export interface DailyActuals {
  /** Events that actually occurred (attended, happened). Subset of planned events + any unplanned ones. */
  events: ActualEvent[];
  /** Habit completions — overrides planned habit tracking for the day */
  habits: Record<string, boolean>; // habitId → completed
  /** Sleep log */
  sleep?: {
    bedtime: string; // HH:MM format
    wakeTime: string; // HH:MM format
    quality: 1 | 2 | 3 | 4 | 5;
    notes?: string;
  };
  /** Free-form daily journal */
  journal?: string;
  /** Energy/mood self-rating */
  energy?: 1 | 2 | 3 | 4 | 5;
  mood?: 1 | 2 | 3 | 4 | 5;
}

export interface ActualEvent {
  id: string;
  title: string;
  startHour: number;
  duration: number;
  /** If this was planned, link back to the planned event */
  plannedEventId?: string;
  /** If unplanned, note the source (e.g., "calendar", "manual", "email") */
  source?: string;
  attended: boolean;
  notes?: string;
}

export interface WeeklyGoals {
  business: Todo[]; // Enterprise/business weekly goals
  personal: Todo[]; // Personal well-being & growth goals
}

export interface WeekData {
  weekStartDate: string; // ISO format: YYYY-MM-DD (Monday of the week)
  weekEndDate: string; // ISO format: YYYY-MM-DD (Sunday of the week)
  goals: WeeklyGoals;
  dailyPlans: Record<string, DailyPlan>; // key is dateKey (YYYY-MM-DD)
  meetings: Todo[]; // Weekly meetings across all days
  notes: string; // Weekly overview/summary notes
  habits: Habit[]; // Week-specific habit tracking
  createdAt: number;
  updatedAt: number;
}

export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  /**
   * Password field is optional after Phase 4 credential hardening.
   *
   * In Electron: stored in safeStorage (credentials.enc.json) via
   *   credentialSet('omni_email_pw_<id>', password). Not persisted in
   *   localStorage after migration. Main process looks up the password
   *   directly from safeStorage before each IMAP connection.
   *
   * In non-Electron (web dev fallback): stored here as plaintext.
   */
  password?: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'naver' | 'custom';
  imapHost?: string;
  imapPort?: number;
  enabled: boolean;
}

export enum Tab {
  Dashboard = 'dashboard',
  Alarms = 'alarms',
  Inbox = 'email',
  Monthly = 'monthly',
  Weekly = 'weekly',
  Goals = 'goals',
  Data = 'data'
}

// ---------------------------------------------------------------------------
// Phase 11B: Local notification reminder configuration
// ---------------------------------------------------------------------------

/**
 * User-configured local notification reminder settings.
 *
 * Stored in non-sensitive storage (omni_notification_settings).
 * No credentials, no PII — only time preferences and enable flags.
 *
 * PLATFORM BEHAVIOUR:
 *   Capacitor (mobile): Notifications persist across app restarts via
 *     UNCalendarTrigger (iOS) / AlarmManager (Android). Requires permission.
 *   Web (PWA):          Best-effort via setTimeout + Web Notifications API.
 *     Only fires while the tab is open. No cross-session persistence.
 *   Electron:           Not implemented — nullNotifications is used.
 *     Desktop: Electron has its own notification APIs; integration is a future task.
 */
export interface NotificationSettings {
  /** Master switch. When false, all reminders are cancelled. */
  enabled: boolean;

  /** Morning prompt to open and plan the day. */
  dailyPlannerReminder: {
    enabled: boolean;
    /** Local hour (0–23). Default: 8. */
    hour: number;
    /** Local minute (0–59). Default: 0. */
    minute: number;
  };

  /** Evening habit completion check-in. */
  habitReminder: {
    enabled: boolean;
    /** Local hour (0–23). Default: 21. */
    hour: number;
    /** Local minute (0–59). Default: 0. */
    minute: number;
  };

  /** Alert before a focus block begins. */
  focusBlockReminder: {
    enabled: boolean;
    /**
     * How many minutes before the block's startHour to fire.
     * 0 = at the exact start time.
     */
    minutesBefore: number;
  };
}
