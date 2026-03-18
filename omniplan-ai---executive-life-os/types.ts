
export interface Todo {
  id: string | number;
  text: string;
  done: boolean;
  /** Phase 2: optional link to a GoalItem.id. Picker UI in Phase 3. */
  parentGoalId?: string;
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

export interface CalendarEvent {
  id: string | number;
  title: string;
  description?: string;
  startHour: number;
  duration: number;
  color: string;
  repeating?: boolean; // Whether this event repeats to future weeks
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
  /** TODO(security/email-password): stored in plaintext localStorage.
   *  Phase 3 migration: Electron safeStorage keychain via IPC.
   *  Phase 5 migration: OAuth tokens; remove this field for web/mobile. */
  password: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'naver' | 'custom';
  imapHost?: string;
  imapPort?: number;
  enabled: boolean;
}

export enum Tab {
  Inbox = 'email',
  Monthly = 'monthly',
  Weekly = 'weekly',
  Goals = 'goals',
  Data = 'data'
}
