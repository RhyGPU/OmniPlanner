/**
 * Dashboard View — the main screen.
 *
 * Sections:
 * - Upcoming Events (next 48h) with Start/Skip/Snooze buttons
 * - Habits due today — tap to complete, with streaks
 * — Quick Add: new todo, new habit
 * - Recent Emails
 * - Top Todos — tap checkbox to complete
 * - Energy/Mood quick log
 *
 * All mutations write back to week data → synced with other tabs.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Clock, Zap, Check, X, Moon, Sun, Star, ChevronRight,
  Mail, Target, Bell, Play, SkipForward, Timer, Plus,
  Flame, Dumbbell, Coffee, BookOpen, Heart
} from 'lucide-react';
import type {
  CalendarEvent, ActualEventLog, Email, Habit, Todo, WeekData,
  ActualEvent,
} from '../types';
import { formatDateKey, DAYS } from '../constants';
import { getWeekDays } from '../constants';

interface DashboardProps {
  today: Date;
  currentWeek: WeekData;
  allWeeks: Record<string, WeekData>;
  emails: Email[];
  onLogActual: (log: ActualEventLog) => void;
  onCompleteHabit: (habitId: string) => void;
  onToggleTodo: (dateKey: string, todoId: string) => void;
  onSetPriority: (dateKey: string, eventId: string, priority: 1|2|3|4|5) => void;
  onNavigateToWeek: (date: Date) => void;
  onAddTodo?: (todo: Todo, dateKey: string) => void;
  onAddHabit?: (habit: Habit) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function dayLabel(dayOffset: number, today: Date): string {
  if (dayOffset === 0) return 'Today';
  if (dayOffset === 1) return 'Tomorrow';
  const date = new Date(today);
  date.setDate(date.getDate() + dayOffset);
  return DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
}

function calculateHabitStreak(habit: { completions?: Record<string, boolean> }): number {
  const completions = habit.completions || {};
  const dates = Object.keys(completions).filter(k => completions[k]).sort().reverse();
  if (dates.length === 0) return 0;
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mostRecent = new Date(dates[0] + 'T00:00:00');
  const daysSince = (today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 1) return 0;
  let checkDate = new Date(mostRecent);
  for (let i = 0; i < 365; i++) {
    const dk = formatDateKey(checkDate);
    if (completions[dk]) { streak++; } else { break; }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

const HABIT_ICONS = [Dumbbell, Coffee, BookOpen, Heart, Flame];
const HABIT_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500',
  'bg-cyan-500', 'bg-amber-500', 'bg-red-500',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DashboardView: React.FC<DashboardProps> = ({
  today,
  currentWeek,
  allWeeks,
  emails,
  onLogActual,
  onCompleteHabit,
  onToggleTodo,
  onAddTodo,
  onAddHabit,
}) => {
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [newHabitText, setNewHabitText] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState(0);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());

  const todayKey = formatDateKey(today);

  // Build upcoming events from today + next 7 days
  const upcomingEvents = useMemo(() => {
    const events: Array<{
      event: CalendarEvent;
      dateKey: string;
      dayOffset: number;
      actual?: ActualEvent;
      isSleep: boolean;
      score: number;
    }> = [];

    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      const dateKey = formatDateKey(date);
      const weekDays = getWeekDays(date);
      const weekStart = formatDateKey(weekDays[0]);
      const week = allWeeks[weekStart] || currentWeek;
      const dayPlan = week.dailyPlans?.[dateKey];
      if (!dayPlan) continue;

      for (const event of (dayPlan.events ?? [])) {
        const actual = (dayPlan.actuals as any)?.events?.find(
          (a: ActualEvent) => a.plannedEventId === event.id
        );
        const isSleep = event.eventKind === 'routine' ||
          event.title.toLowerCase().includes('sleep') ||
          (event as any).isSleepEvent === true;
        const priorityWeight = (event.priority ?? 3) * 20;
        const urgencyWeight = Math.max(0, 50 - dayOffset * 10);
        events.push({ event, dateKey, dayOffset, actual, isSleep, score: priorityWeight + urgencyWeight });
      }
    }

    return events.sort((a, b) => {
      if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
      return a.event.startHour - b.event.startHour;
    });
  }, [today, currentWeek, allWeeks]);

  // Build habits due today
  const habitsDue = useMemo(() => {
    return (currentWeek.habits || [])
      .filter(h => !h.archived && !h.deletedAt)
      .map(h => ({
        habit: h,
        completedToday: h.completions?.[todayKey] ?? false,
        streak: calculateHabitStreak(h),
      }));
  }, [currentWeek.habits, todayKey]);

  // Build top todos from today + next 3 days
  const topTodos = useMemo(() => {
    const todos: Array<{ todo: Todo; dateKey: string; score: number }> = [];
    for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      const dateKey = formatDateKey(date);
      const weekDays = getWeekDays(date);
      const weekStart = formatDateKey(weekDays[0]);
      const week = allWeeks[weekStart] || currentWeek;
      const dayPlan = week.dailyPlans?.[dateKey];
      if (!dayPlan) continue;
      for (const todo of (dayPlan.todos || [])) {
        if (!todo.done) {
          const priorityWeight = (todo.priority ?? 3) * 20;
          const urgencyWeight = Math.max(0, 40 - dayOffset * 10);
          todos.push({ todo, dateKey, score: priorityWeight + urgencyWeight });
        }
      }
    }
    return todos.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [today, currentWeek, allWeeks]);

  // Handlers
  const handleEventStart = useCallback((event: CalendarEvent, dateKey: string) => {
    const log: ActualEventLog = {
      id: `actual-${event.id}-${Date.now()}`,
      plannedEventId: event.id,
      title: event.title,
      dateKey,
      scheduledHour: event.startHour,
      actualStartHour: new Date().getHours() + new Date().getMinutes() / 60,
      source: 'manual',
      attended: true,
      snoozedCount: 0,
      loggedAt: Date.now(),
    };
    onLogActual(log);
  }, [onLogActual]);

  const handleEventSkip = useCallback((event: CalendarEvent, dateKey: string) => {
    const log: ActualEventLog = {
      id: `actual-${event.id}-skip-${Date.now()}`,
      plannedEventId: event.id,
      title: event.title,
      dateKey,
      scheduledHour: event.startHour,
      source: 'manual',
      attended: false,
      snoozedCount: 0,
      loggedAt: Date.now(),
    };
    onLogActual(log);
  }, [onLogActual]);

  const handleAddTodo = useCallback(() => {
    if (!newTodoText.trim() || !onAddTodo) return;
    const todo: Todo = {
      id: `todo-${Date.now()}`,
      text: newTodoText.trim(),
      done: false,
      priority: 3,
    };
    onAddTodo(todo, todayKey);
    setNewTodoText('');
    setShowAddTodo(false);
  }, [newTodoText, todayKey, onAddTodo]);

  const handleAddHabit = useCallback(() => {
    if (!newHabitText.trim() || !onAddHabit) return;
    const habit: Habit = {
      id: `habit-${Date.now()}`,
      name: newHabitText.trim(),
      completions: {},
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      archived: false,
    };
    onAddHabit(habit);
    setNewHabitText('');
    setShowAddHabit(false);
  }, [newHabitText, onAddHabit]);

  const todayStr = `${DAYS[today.getDay() === 0 ? 6 : today.getDay() - 1]}, ${today.getMonth() + 1}/${today.getDate()}`;
  const timeNow = formatHour(new Date().getHours() + new Date().getMinutes() / 60);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-slate-900">{todayStr}</h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Dashboard</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl">
            <Clock size={14} className="text-slate-400" />
            <span className="text-sm font-black text-slate-700">{timeNow}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 lg:p-5 space-y-4 max-w-3xl mx-auto w-full">

        {/* ===== UPCOMING EVENTS ===== */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Zap size={13} className="text-amber-500" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Upcoming Events</h2>
            <span className="text-[9px] bg-amber-100 text-amber-600 font-bold px-1.5 py-0.5 rounded-full">
              {upcomingEvents.filter(e => e.dayOffset === 0).length} today
            </span>
          </div>

          <div className="space-y-1.5">
            {upcomingEvents.slice(0, 5).map(({ event, dateKey, dayOffset, actual, isSleep }) => {
              const isStarted = actual?.attended === true;
              const isMissed = actual === false;
              const hasEnded = isStarted && (actual as any)?.actualEndHour != null;

              return (
                <div
                  key={`${dateKey}-${event.id}`}
                  className={`bg-white rounded-xl border p-3 transition-all ${
                    isMissed ? 'border-red-200 bg-red-50/50' :
                    isStarted && !hasEnded ? 'border-emerald-200 bg-emerald-50/30' :
                    'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Time */}
                    <div className="flex flex-col items-center min-w-[50px]">
                      <span className={`text-xs font-black ${dayOffset === 0 ? 'text-blue-600' : 'text-slate-500'}`}>
                        {formatHour(event.startHour)}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">
                        {dayLabel(dayOffset, today)}
                      </span>
                    </div>

                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isSleep && <Moon size={11} className="text-indigo-400 flex-shrink-0" />}
                        <span className="text-xs font-bold text-slate-800 truncate">{event.title}</span>
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {event.duration}h · {event.eventKind || 'event'}
                        {actual?.actualStartHour != null && (
                          <span className="text-emerald-500 font-bold ml-1">
                            started {formatHour(actual.actualStartHour)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {!actual && dayOffset === 0 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleEventStart(event, dateKey)}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg"
                        >
                          <Play size={10} /> {isSleep ? 'Bed' : 'Start'}
                        </button>
                        <button
                          onClick={() => handleEventSkip(event, dateKey)}
                          className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-500 text-[10px] font-bold px-2 py-1.5 rounded-lg"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}

                    {isStarted && hasEnded && (
                      <span className="text-[9px] font-bold text-slate-400 flex-shrink-0">Done</span>
                    )}
                    {isMissed && (
                      <span className="text-[9px] font-bold text-red-400 flex-shrink-0">Missed</span>
                    )}
                  </div>
                </div>
              );
            })}

            {upcomingEvents.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-400">
                No upcoming events.
              </div>
            )}
          </div>
        </section>

        {/* ===== HABITS ===== */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={13} className="text-emerald-500" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Habits</h2>
              <span className="text-[9px] bg-emerald-100 text-emerald-600 font-bold px-1.5 py-0.5 rounded-full">
                {habitsDue.filter(h => h.completedToday).length}/{habitsDue.length}
              </span>
            </div>
            <button
              onClick={() => setShowAddHabit(!showAddHabit)}
              className="flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50"
            >
              <Plus size={11} /> Add Habit
            </button>
          </div>

          {/* Add habit form */}
          {showAddHabit && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 mb-2 space-y-2">
              <input
                type="text"
                value={newHabitText}
                onChange={e => setNewHabitText(e.target.value)}
                placeholder="Habit name (e.g., Morning run)"
                className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:border-blue-400"
                onKeyDown={e => e.key === 'Enter' && handleAddHabit()}
                autoFocus
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {HABIT_ICONS.map((Icon, i) => (
                    <button
                      key={i}
                      onClick={() => setNewHabitIcon(i)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        newHabitIcon === i ? 'bg-blue-500 text-white' : 'bg-white text-slate-400 border border-slate-200'
                      }`}
                    >
                      <Icon size={12} />
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleAddHabit}
                  disabled={!newHabitText.trim()}
                  className="text-[10px] font-bold bg-blue-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Habit list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {habitsDue.map(({ habit, completedToday, streak }) => (
              <button
                key={habit.id}
                onClick={() => onCompleteHabit(habit.id)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                  completedToday
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  completedToday ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {completedToday ? <Check size={14} /> : <div className="w-2.5 h-2.5 rounded-full border-2 border-current" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-bold truncate ${completedToday ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {habit.name}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {habitIcon(habit)} · {streak > 0 ? `🔥 ${streak}d streak` : 'tap to complete'}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {habitsDue.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-xs text-slate-400 mb-2">No habits yet</p>
              <button
                onClick={() => setShowAddHabit(true)}
                className="text-[10px] font-bold text-blue-500 hover:text-blue-600"
              >
                + Add your first habit
              </button>
            </div>
          )}
        </section>

        {/* ===== QUICK ADD TODO ===== */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Check size={13} className="text-purple-500" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Quick Todo</h2>
            </div>
            <button
              onClick={() => setShowAddTodo(!showAddTodo)}
              className="flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50"
            >
              <Plus size={11} /> Add Todo
            </button>
          </div>

          {showAddTodo && (
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-3 mb-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTodoText}
                  onChange={e => setNewTodoText(e.target.value)}
                  placeholder="What needs doing?"
                  className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border border-purple-200 focus:outline-none focus:border-purple-400"
                  onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
                  autoFocus
                />
                <button
                  onClick={handleAddTodo}
                  disabled={!newTodoText.trim()}
                  className="text-[10px] font-bold bg-purple-600 text-white px-3 py-2 rounded-lg disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <div className="flex gap-1 mt-2">
                {[1, 2, 3, 4, 5].map(p => (
                  <Star key={p} size={12} className="text-purple-200" />
                ))}
              </div>
            </div>
          )}

          {/* Todo list */}
          <div className="space-y-1">
            {topTodos.slice(0, 5).map(({ todo, dateKey }) => (
              <div
                key={`${dateKey}-${todo.id}`}
                className="flex items-center gap-2.5 bg-white rounded-xl border border-slate-200 p-2.5"
              >
                <button
                  onClick={() => onToggleTodo && onToggleTodo(dateKey, todo.id)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    todo.done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 hover:border-emerald-400'
                  }`}
                >
                  {todo.done && <Check size={10} />}
                </button>
                <span className={`flex-1 text-xs font-medium truncate ${todo.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {todo.text}
                </span>
                <span className="text-[8px] text-slate-300 font-bold">{todo.priority || 3}★</span>
              </div>
            ))}

            {topTodos.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-400">
                No pending todos. <button onClick={() => setShowAddTodo(true)} className="text-blue-500 font-bold">Add one →</button>
              </div>
            )}
          </div>
        </section>

        {/* ===== RECENT EMAILS ===== */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Mail size={13} className="text-blue-500" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Recent Emails</h2>
          </div>

          {emails.filter(e => !e.read).length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center text-xs text-slate-400">
              No unread emails. <span className="text-slate-300">Connect in Settings →</span>
            </div>
          ) : (
            <div className="space-y-1">
              {emails.filter(e => !e.read).slice(0, 3).map(email => (
                <div key={email.id} className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-2.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-700 truncate">{email.subject}</div>
                    <div className="text-[9px] text-slate-400 truncate">{email.sender}</div>
                  </div>
                  <span className="text-[8px] text-slate-300">{email.time}</span>
                  <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// Habit icon helper — picks icon based on habit name hash
function habitIcon(habit: Habit): string {
  const icons = ['💪', '☕', '📖', '❤️', '🔥', '🧘', '🏃', '🎯'];
  let hash = 0;
  for (let i = 0; i < habit.name.length; i++) hash += habit.name.charCodeAt(i);
  return icons[hash % icons.length];
}
