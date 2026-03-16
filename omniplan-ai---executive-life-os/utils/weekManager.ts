import { WeekData, DailyPlan, Habit } from '../types';
import { formatDateKey, getWeekDays } from '../constants';

/**
 * Create a new empty week structure
 */
export const createEmptyWeek = (date: Date): WeekData => {
  const weekDates = getWeekDays(date);
  const weekStartDate = formatDateKey(weekDates[0]); // Monday
  const weekEndDate = formatDateKey(weekDates[6]); // Sunday
  const now = Date.now();

  const dailyPlans: Record<string, DailyPlan> = {};
  weekDates.forEach(d => {
    const dateKey = formatDateKey(d);
    dailyPlans[dateKey] = {
      focus: '',
      todos: [],
      notes: '',
      events: [],
    };
  });

  return {
    weekStartDate,
    weekEndDate,
    goals: { business: [], personal: [] },
    dailyPlans,
    meetings: [],
    notes: '',
    habits: [], // Start empty - user creates habits as needed
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Get the week data key for storage
 */
export const getWeekStorageKey = (date: Date): string => {
  const weekDates = getWeekDays(date);
  const weekStart = formatDateKey(weekDates[0]);
  return `omni_week_${weekStart}`;
};

/**
 * Get or create week data for a given date
 */
export const getOrCreateWeek = (
  date: Date,
  allWeeks: Record<string, WeekData>
): WeekData => {
  const key = getWeekStorageKey(date);

  // Build a map of habitId -> earliest deletedAt timestamp across all weeks.
  // Using the earliest timestamp lets us accurately determine whether a habit
  // was alive during any given past week: if it was deleted AFTER a week ended,
  // it was still active then and should still appear in that week.
  const deletionTimestamps = new Map<string, number>();
  for (const weekData of Object.values(allWeeks)) {
    for (const h of weekData.habits || []) {
      if (h.deletedAt) {
        const existing = deletionTimestamps.get(h.id);
        if (!existing || h.deletedAt < existing) {
          deletionTimestamps.set(h.id, h.deletedAt);
        }
      }
    }
  }

  // Returns true if the habit was still alive at the end of the given week.
  const habitAliveAtWeekEnd = (habitId: string, weekEndDateStr: string): boolean => {
    const deletedAt = deletionTimestamps.get(habitId);
    if (!deletedAt) return true;
    const weekEndMs = new Date(weekEndDateStr + 'T23:59:59').getTime();
    return deletedAt > weekEndMs;
  };

  if (allWeeks[key]) {
    // Reconcile: inject habits from earlier weeks that are missing here
    const existingWeek = allWeeks[key];
    const existingIds = new Set(existingWeek.habits?.map(h => h.id) || []);
    const missingHabits: Habit[] = [];

    for (const [wk, weekData] of Object.entries(allWeeks)) {
      if (wk >= key) continue; // only look at earlier weeks
      for (const h of weekData.habits || []) {
        if (!existingIds.has(h.id) && habitAliveAtWeekEnd(h.id, existingWeek.weekEndDate)) {
          missingHabits.push({ ...h, completions: {} });
          existingIds.add(h.id);
        }
      }
    }

    if (missingHabits.length > 0) {
      return { ...existingWeek, habits: [...(existingWeek.habits || []), ...missingHabits] };
    }
    return existingWeek;
  }

  const newWeek = createEmptyWeek(date);
  const newDates = getWeekDays(date);

  // Collect habits from ALL previous weeks (by ID, to avoid duplicates)
  const habitMap = new Map<string, Habit>();
  const seenIds = new Set<string>(); // track ALL seen IDs, even deleted ones
  let currentDate = new Date(date);
  currentDate.setDate(currentDate.getDate() - 7);

  for (let i = 0; i < 520; i++) { // Look back up to 10 years
    const prevWeekKey = getWeekStorageKey(currentDate);
    const prevWeek = allWeeks[prevWeekKey];

    if (prevWeek && prevWeek.habits) {
      prevWeek.habits.forEach(h => {
        if (!seenIds.has(h.id)) {
          seenIds.add(h.id);
          // Only include if the habit was alive at the end of the NEW week being created
          if (habitAliveAtWeekEnd(h.id, newWeek.weekEndDate)) {
            habitMap.set(h.id, h);
          }
        }
      });
    }

    currentDate.setDate(currentDate.getDate() - 7);
  }

  // Convert habit map to array with reset completions
  if (habitMap.size > 0) {
    newWeek.habits = Array.from(habitMap.values())
      .filter(h => !h.deletedAt)
      .map(h => ({
        ...h,
        completions: {}, // Reset completions for new week
        createdAt: h.createdAt, // Keep original creation date
      }));
  }
  
  // Copy repeating events from previous weeks to corresponding days
  currentDate = new Date(date);
  currentDate.setDate(currentDate.getDate() - 7);
  
  for (let i = 0; i < 520; i++) {
    const prevWeekKey = getWeekStorageKey(currentDate);
    const prevWeek = allWeeks[prevWeekKey];
    
    if (prevWeek && prevWeek.dailyPlans) {
      const prevDates = getWeekDays(currentDate);
      
      prevDates.forEach((prevDate, dayIndex) => {
        const prevDayPlan = prevWeek.dailyPlans[formatDateKey(prevDate)];
        if (prevDayPlan && prevDayPlan.events && dayIndex < newDates.length) {
          const newDateKey = formatDateKey(newDates[dayIndex]);
          const newDayPlan = newWeek.dailyPlans[newDateKey];
          
          // Copy repeating events
          const repeatingEvents = prevDayPlan.events.filter(e => e.repeating !== false);
          newDayPlan.events = repeatingEvents.map(e => ({
            ...e,
            id: `${e.id}-${Date.now()}`, // Create new ID
          }));
        }
      });
      
      break; // Only copy events from the most recent week with data
    }
    
    currentDate.setDate(currentDate.getDate() - 7);
  }
  
  return newWeek;
};

/**
 * Migrate WeeklyGoals from old string[] format to Todo[] format.
 * Idempotent: no-ops on already-migrated or empty data.
 */
const migrateWeeklyGoals = (allWeeks: Record<string, WeekData>): Record<string, WeekData> => {
  for (const key of Object.keys(allWeeks)) {
    const week = allWeeks[key];
    if (!week.goals) continue;
    for (const field of ['business', 'personal'] as const) {
      const arr = week.goals[field];
      if (arr && arr.length > 0 && typeof arr[0] === 'string') {
        (week.goals as any)[field] = (arr as unknown as string[]).map((text, i) => ({
          id: `${field[0]}g-migrated-${i}`,
          text,
          done: false,
        }));
      }
    }
  }
  return allWeeks;
};

/**
 * Get all weeks from local storage
 */
export const getAllWeeks = (): Record<string, WeekData> => {
  const saved = localStorage.getItem('omni_all_weeks');
  if (!saved) return {};
  return migrateWeeklyGoals(JSON.parse(saved));
};

/**
 * Save all weeks to local storage
 */
export const saveAllWeeks = (weeks: Record<string, WeekData>) => {
  localStorage.setItem('omni_all_weeks', JSON.stringify(weeks));
};

/**
 * Get weeks for a date range (e.g., to populate monthly view)
 */
export const getWeeksInRange = (
  startDate: Date,
  endDate: Date,
  allWeeks: Record<string, WeekData>
): WeekData[] => {
  const weeks: WeekData[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const week = getOrCreateWeek(current, allWeeks);
    if (!weeks.find(w => w.weekStartDate === week.weekStartDate)) {
      weeks.push(week);
    }
    current.setDate(current.getDate() + 7);
  }

  // Always include the week containing the last day of the range
  // (the 7-day jump can skip the final partial week)
  const lastWeek = getOrCreateWeek(endDate, allWeeks);
  if (!weeks.find(w => w.weekStartDate === lastWeek.weekStartDate)) {
    weeks.push(lastWeek);
  }

  return weeks;
};

/**
 * Calculate habit streak statistics across all time (not just current week)
 */
export const calculateHabitStreak = (habit: Habit, weekDates: Date[]) => {
  const dateKeys = weekDates.map(d => formatDateKey(d));
  const completions = dateKeys.map(key => !!habit.completions[key]);
  const totalDays = completions.filter(Boolean).length;

  if (dateKeys.length === 0) {
    return { current: 0, longest: 0, totalDays: 0, percentageComplete: 0 };
  }

  // Calculate longest streak within the week
  let longest = 0;
  let temp = 0;
  completions.forEach(done => {
    if (done) {
      temp += 1;
      longest = Math.max(longest, temp);
    } else {
      temp = 0;
    }
  });

  // Current streak up to today within the week
  const todayKey = formatDateKey(new Date());
  const todayIdx = dateKeys.indexOf(todayKey);
  const endIdx = todayIdx === -1 ? dateKeys.length - 1 : todayIdx;
  let current = 0;
  for (let i = endIdx; i >= 0; i--) {
    if (completions[i]) current += 1;
    else break;
  }

  const percentageComplete = Math.round((totalDays / dateKeys.length) * 100);
  return { current, longest, totalDays, percentageComplete };
};

/**
 * Calculate habit streak across ALL weeks.
 * Streak is counted backwards from the last day of the viewed week (weekEndDate),
 * not from today's date. This way the streak reflects the page the user is viewing.
 */
export const calculateCrossWeekStreak = (
  habitId: string,
  allWeeks: Record<string, WeekData>,
  weekEndDate: string
): { currentStreak: number; longestStreak: number; totalDays: number } => {
  // Collect all completed dates across all weeks
  const completedDates = new Set<string>();
  for (const week of Object.values(allWeeks)) {
    const habit = week.habits?.find(h => h.id === habitId);
    if (!habit) continue;
    for (const [dateKey, done] of Object.entries(habit.completions)) {
      if (done) completedDates.add(dateKey);
    }
  }

  if (completedDates.size === 0) {
    return { currentStreak: 0, longestStreak: 0, totalDays: 0 };
  }

  // Sort dates chronologically
  const sortedDates = Array.from(completedDates).sort();
  const totalDays = sortedDates.length;

  const dateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Calculate current streak: walk backwards from the viewed week's end date
  let currentStreak = 0;
  const endDate = new Date(weekEndDate + 'T00:00:00');
  let cursor = new Date(endDate);
  // Find the last checked day on or before weekEndDate
  while (!completedDates.has(dateStr(cursor)) && cursor >= new Date(sortedDates[0] + 'T00:00:00')) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (completedDates.has(dateStr(cursor))) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Calculate longest streak by scanning sorted dates
  let longestStreak = 0;
  let tempStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T00:00:00');
    const curr = new Date(sortedDates[i] + 'T00:00:00');
    const diffMs = curr.getTime() - prev.getTime();
    if (diffMs === 86400000) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return { currentStreak, longestStreak, totalDays };
};

/**
 * Filter habits for a week - show all non-deleted habits
 */
export const getActiveHabitsForWeek = (allHabits: Habit[], weekStartDate: string) => {
  const weekStart = new Date(weekStartDate);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekStartMs + (7 * 24 * 60 * 60 * 1000) - 1;

  return allHabits.filter(habit => {
    const createdAt = habit.createdAt ?? 0;
    const deletedAt = habit.deletedAt ?? Number.POSITIVE_INFINITY;
    return createdAt <= weekEndMs && deletedAt > weekEndMs;
  });
};

/**
 * Handle habit deletion - marks as deleted from now forward
 */
export const deleteHabitFromWeek = (habit: Habit, weekStartDate: string): Habit => {
  return {
    ...habit,
    deletedAt: Date.now(), // Mark as deleted NOW, not at week start
  };
};
