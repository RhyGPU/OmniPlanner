import React, { useState, useMemo } from 'react';
import { Target, CheckCircle, Clock, Moon, Sparkles, X } from 'lucide-react';
import type { WeekData, Todo, Habit } from '../types';
import { formatDateKey, DAYS, MONTHS } from '../constants';

interface MorningBriefingProps {
  currentWeek: WeekData;
  today: Date;
  onSetFocusTheme: (dateKey: string, theme: string) => void;
  onDismiss: () => void;
}

export const MorningBriefing: React.FC<MorningBriefingProps> = ({
  currentWeek,
  today,
  onSetFocusTheme,
  onDismiss,
}) => {
  const todayKey = formatDateKey(today);
  const yesterdayKey = useMemo(() => {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDateKey(yesterday);
  }, [today]);

  const dayPlan = currentWeek.dailyPlans?.[todayKey];
  const initialTheme = dayPlan?.focusTheme || '';
  const [themeInput, setThemeInput] = useState(initialTheme);

  const formattedDate = useMemo(() => {
    const dayName = DAYS[today.getDay() === 0 ? 6 : today.getDay() - 1];
    const monthName = MONTHS[today.getMonth()];
    return `${dayName}, ${monthName} ${today.getDate()}`;
  }, [today]);

  // 1. Calculate yesterday's habit completion
  const yesterdayHabitsStats = useMemo(() => {
    const habits = (currentWeek.habits || []).filter(h => !h.archived && !h.deletedAt);
    if (habits.length === 0) return null;
    let completedCount = 0;
    for (const habit of habits) {
      if (habit.completions?.[yesterdayKey]) {
        completedCount++;
      }
    }
    return {
      completed: completedCount,
      total: habits.length,
      rate: Math.round((completedCount / habits.length) * 100),
    };
  }, [currentWeek.habits, yesterdayKey]);

  // 2. Fetch top pending todos for today
  const pendingTodos = useMemo(() => {
    return (dayPlan?.todos || []).filter(todo => !todo.done).slice(0, 3);
  }, [dayPlan?.todos]);

  // 3. Fetch focus blocks/events for today
  const todayFocusEvents = useMemo(() => {
    return (dayPlan?.events || []).filter(evt => evt.eventKind === 'focus' || evt.eventKind === 'task_block');
  }, [dayPlan?.events]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSetFocusTheme(todayKey, themeInput.trim());
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[90] p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
        {/* Close button */}
        <button 
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white transition-all z-10"
        >
          <X size={16}/>
        </button>

        {/* Top Banner */}
        <div className="p-8 pb-4 bg-gradient-to-b from-blue-950/40 to-transparent flex items-center gap-4">
          <div className="p-3 bg-blue-600/10 rounded-2xl text-blue-400 border border-blue-500/20">
            <Sparkles size={24} className="animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest block mb-0.5">Morning Briefing</span>
            <h2 className="text-2xl font-black text-white leading-none tracking-tight">{formattedDate}</h2>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-8 pt-4 space-y-6 overflow-y-auto flex-1">
          {/* Yesterday's Stats */}
          {yesterdayHabitsStats && (
            <div className="bg-slate-850 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-4">
              <div className="p-3 bg-emerald-500/15 rounded-xl text-emerald-400">
                <CheckCircle size={20}/>
              </div>
              <div className="flex-1">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Yesterday's Habits</span>
                <p className="text-sm font-bold text-white">
                  Completed {yesterdayHabitsStats.completed} of {yesterdayHabitsStats.total} habits ({yesterdayHabitsStats.rate}%)
                </p>
              </div>
            </div>
          )}

          {/* Today's Agenda Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Todos */}
            <div className="bg-slate-850 border border-slate-800/80 rounded-2xl p-5 space-y-3">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Target size={12} className="text-orange-400"/> Top Actions Today
              </span>
              {pendingTodos.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 italic">No pending actions scheduled. Ready for a clear run!</p>
              ) : (
                <ul className="space-y-2">
                  {pendingTodos.map(todo => (
                    <li key={todo.id} className="text-xs font-bold text-slate-300 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                      <span className="truncate">{todo.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Focus Events */}
            <div className="bg-slate-850 border border-slate-800/80 rounded-2xl p-5 space-y-3">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-blue-400"/> Focus Blocks Today
              </span>
              {todayFocusEvents.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 italic">No dedicated focus blocks planned for today.</p>
              ) : (
                <ul className="space-y-2">
                  {todayFocusEvents.map(evt => {
                    const h12 = evt.startHour % 12 || 12;
                    const ampm = evt.startHour >= 12 ? 'PM' : 'AM';
                    return (
                      <li key={evt.id} className="text-xs font-bold text-slate-300 flex items-center justify-between gap-2">
                        <span className="truncate flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                          <span className="truncate">{evt.title}</span>
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 flex-shrink-0">{h12} {ampm}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Daily Focus theme block */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              What is your primary focus / theme for today?
            </label>
            <input
              type="text"
              value={themeInput}
              onChange={e => setThemeInput(e.target.value)}
              placeholder="e.g. Strategy formulation, Product dev focus, Client review..."
              className="w-full bg-slate-800 border border-slate-700/60 rounded-2xl px-4 py-3.5 text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              required
            />
            <p className="text-[9px] font-bold text-slate-500">
              Your daily focus will be displayed at the top of the dashboard and weekly planners to keep you aligned.
            </p>
          </form>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-950/40 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onDismiss}
            className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-black uppercase tracking-wider transition-all"
          >
            Dismiss
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-500/10 transition-all"
          >
            Start the Day
          </button>
        </div>
      </div>
    </div>
  );
};
