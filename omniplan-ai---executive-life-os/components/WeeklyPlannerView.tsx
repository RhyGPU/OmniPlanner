
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Plus, Zap, Check, Trash2, Activity, Layout, List, Flame, Target, Link2, Clock, CalendarDays } from 'lucide-react';
import { CalendarEventKind, WeekData, DailyPlan, Habit, HabitStreak, GoalItem, Todo } from '../types';
import { getFocusGoalItems } from '../utils/goalManager';
import {
  getWeekDays, formatDateKey, DAYS, MONTHS,
  START_HOUR, PIXELS_PER_HOUR, formatHour, generateTimeSlots
} from '../constants';
import { calculateCrossWeekStreak } from '../utils/weekManager';
import { getMilestoneForStreak, getFlameColorClass } from '../utils/habitMilestones';
import { CheckableList } from './CheckableList';
import { ConfirmDialog } from './Dialog';
import { predictMainEvent } from '../services/ai';
import { getUnscheduledWeeklyLinkedTodos } from '../utils/planningIntelligence';

const GOAL_TIMEFRAME_LABELS: Record<string, string> = {
  ten_year: '10Y', five_year: '5Y', three_year: '3Y',
  one_year: '1Y', monthly: 'MO', weekly: 'WK',
};

const EVENT_KIND_COLORS: Record<CalendarEventKind, string> = {
  meeting:    'bg-blue-50 border-blue-200 text-blue-700 shadow-sm',
  focus:      'bg-purple-50 border-purple-200 text-purple-700 shadow-sm',
  task_block: 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm',
  routine:    'bg-slate-50 border-slate-200 text-slate-600 shadow-sm',
};
const DEFAULT_EVENT_COLOR = 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm';

const EVENT_KINDS: { id: CalendarEventKind; label: string; activeClass: string }[] = [
  { id: 'meeting',    label: 'Meeting',  activeClass: 'bg-blue-100 text-blue-700' },
  { id: 'focus',      label: 'Focus',    activeClass: 'bg-purple-100 text-purple-700' },
  { id: 'task_block', label: 'Task',     activeClass: 'bg-indigo-100 text-indigo-700' },
  { id: 'routine',    label: 'Routine',  activeClass: 'bg-slate-100 text-slate-600' },
];

interface WeeklyPlannerProps {
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  currentWeek: WeekData;
  updateCurrentWeek: (week: WeekData) => void;
  setAiLoading: (loading: boolean) => void;
  onDeleteHabit: (habitId: string) => void;
  onAddHabit: (habit: Habit) => void;
  allWeeks: Record<string, WeekData>;
  goalItems: GoalItem[];
}

export const WeeklyPlannerView: React.FC<WeeklyPlannerProps> = ({
  currentDate, setCurrentDate, currentWeek, updateCurrentWeek, setAiLoading, onDeleteHabit, onAddHabit, allWeeks, goalItems
}) => {
  const weekDates = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const [eventEditor, setEventEditor] = useState<any>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [activeDayIdx, setActiveDayIdx] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const [mobileTab, setMobileTab] = useState<'plan' | 'strategy'>('plan');
  const [newHabitName, setNewHabitName] = useState('');
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Which weekly-goal Todo's goal-picker popover is open. Id format: `{field}-{todo.id}`
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 1024;
  const activeHabits = (currentWeek.habits || []).filter(h => !h.deletedAt && !h.archived);
  const focusItems = useMemo(() => getFocusGoalItems(goalItems, currentDate), [goalItems, currentDate]);
  const unscheduledLinked = useMemo(() => getUnscheduledWeeklyLinkedTodos(currentWeek), [currentWeek]);

  // Auto-archive stale habits (only runs once when week changes)
  useEffect(() => {
    const now = Date.now();
    const staleLimit = 14 * 24 * 60 * 60 * 1000; // 14 days
    const staleHabits = currentWeek.habits.filter(h => !h.archived && h.lastUsedAt && (now - h.lastUsedAt > staleLimit));

    if (staleHabits.length > 0) {
      const staleIds = new Set(staleHabits.map(h => h.id));
      const updatedHabits = currentWeek.habits.map(h =>
        staleIds.has(h.id) ? { ...h, archived: true } : h
      );
      updateCurrentWeek({ ...currentWeek, habits: updatedHabits });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeek.weekStartDate]);

  // Close goal picker on the next outside click
  useEffect(() => {
    if (!openPickerId) return;
    const close = () => setOpenPickerId(null);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [openPickerId]);

  /**
   * Shared goal-link suffix renderer. Used by both makeGoalSuffix (weekly goals)
   * and makeDailyGoalSuffix (daily todos). Renders either:
   *   - A purple pill (linked goal name + × unlink) when parentGoalId is set, or
   *   - A link icon button that opens a compact goal-picker popover.
   * Only active GoalItems are shown as selectable options.
   */
  const renderGoalLinkSuffix = (
    item: Todo,
    pickerId: string,
    linkTo: (goalId: string | undefined) => void,
  ): React.ReactNode => {
    const linkedGoal = item.parentGoalId
      ? goalItems.find(g => g.id === item.parentGoalId)
      : undefined;
    const activeGoals = goalItems.filter(g => g.status === 'active');
    const isOpen = openPickerId === pickerId;

    return (
      <div className="relative flex-shrink-0 self-center">
        {linkedGoal ? (
          <button
            onClick={() => linkTo(undefined)}
            title={`Linked: ${linkedGoal.text || '(untitled)'} — click to unlink`}
            className="flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 hover:bg-red-100 hover:text-red-500 transition-colors max-w-[80px] group/pill"
          >
            <Target size={8} className="flex-shrink-0"/>
            <span className="truncate">{linkedGoal.text || '(goal)'}</span>
            <X size={8} className="flex-shrink-0 opacity-0 group-hover/pill:opacity-100"/>
          </button>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setOpenPickerId(isOpen ? null : pickerId); }}
              title="Link to a life goal"
              className="p-0.5 rounded text-slate-300 hover:text-purple-500 hover:bg-purple-50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <Link2 size={11}/>
            </button>
            {isOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[200px] max-h-[220px] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                {activeGoals.length === 0 ? (
                  <div className="px-3 py-3 text-[11px] text-slate-400 italic">No active goals yet — add some in Life Goals</div>
                ) : (
                  activeGoals.map(goal => (
                    <button
                      key={goal.id}
                      onClick={() => linkTo(goal.id)}
                      className="w-full text-left px-3 py-2 text-[11px] hover:bg-purple-50 flex items-center gap-2 border-b border-slate-50 last:border-0"
                    >
                      <span className="text-[8px] font-black uppercase text-purple-400 flex-shrink-0 min-w-[22px]">
                        {GOAL_TIMEFRAME_LABELS[goal.timeframe] ?? goal.timeframe}
                      </span>
                      <span className="truncate text-slate-700">{goal.text || '(untitled)'}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const makeGoalSuffix = (field: 'business' | 'personal', fieldItems: Todo[]) =>
    (item: Todo, index: number): React.ReactNode => {
      const pickerId = `${field}-${String(item.id)}`;
      const linkTo = (goalId: string | undefined) => {
        const updated = fieldItems.map((t, i) =>
          i === index ? { ...t, parentGoalId: goalId } : t,
        );
        updateCurrentWeek({ ...currentWeek, goals: { ...currentWeek.goals, [field]: updated } });
        setOpenPickerId(null);
      };
      return renderGoalLinkSuffix(item, pickerId, linkTo);
    };

  const makeDailyGoalSuffix = (dateKey: string, dayPlan: DailyPlan) =>
    (item: Todo, index: number): React.ReactNode => {
      const pickerId = `daily-${dateKey}-${String(item.id)}`;
      const linkTo = (goalId: string | undefined) => {
        const updatedTodos = dayPlan.todos.map((t, i) =>
          i === index ? { ...t, parentGoalId: goalId } : t,
        );
        const updatedPlans = {
          ...currentWeek.dailyPlans,
          [dateKey]: { ...dayPlan, todos: updatedTodos },
        };
        updateCurrentWeek({ ...currentWeek, dailyPlans: updatedPlans });
        setOpenPickerId(null);
      };
      return renderGoalLinkSuffix(item, pickerId, linkTo);
    };

  /** Open the event editor pre-filled from an unscheduled linked todo suggestion. */
  const openFocusSuggestion = useCallback((todo: Todo) => {
    const today = formatDateKey(new Date());
    const dayEntries = Object.entries(currentWeek.dailyPlans).sort(([a], [b]) => a.localeCompare(b));
    // Prefer today/future days with fewest events
    const target =
      dayEntries.find(([dk, dp]) => dk >= today && dp.events.length < 5) ??
      dayEntries.find(([, dp]) => dp.events.length < 5) ??
      dayEntries[0];
    if (!target) return;
    const [dateKey, dayPlan] = target;
    const maxEnd = dayPlan.events.reduce((m, e) => Math.max(m, e.startHour + e.duration), 9);
    setEventEditor({
      dateKey,
      title: todo.text || 'Focus block',
      startHour: Math.min(maxEnd, 17),
      duration: 1.5,
      isNew: true,
      repeating: false,
      eventKind: 'focus' as CalendarEventKind,
      parentGoalId: todo.parentGoalId,
      linkedTodoId: todo.id,
    });
  }, [currentWeek]);

  const jumpWeeks = (n: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (n * 7));
    setCurrentDate(d);
  };

  const handleOptimizeFullWeek = useCallback(async () => {
    setAiLoading(true);
    const updatedDailyPlans = { ...currentWeek.dailyPlans };
    const pastNotes = (Object.values(currentWeek.dailyPlans) as DailyPlan[])
      .map(p => p.notes)
      .filter(n => n.length > 0)
      .slice(-15);

    for (const date of weekDates) {
      const dateKey = formatDateKey(date);
      const dayPlan = updatedDailyPlans[dateKey];
      if (!dayPlan.focus || dayPlan.focus.trim() === "") {
        const currentDayTodos = dayPlan.todos.map(t => t.text);
        const prediction = await predictMainEvent(pastNotes, currentDayTodos);
        updatedDailyPlans[dateKey] = { ...dayPlan, focus: prediction };
      }
    }

    updateCurrentWeek({ ...currentWeek, dailyPlans: updatedDailyPlans });
    setAiLoading(false);
  }, [currentDate, currentWeek, updateCurrentWeek, weekDates]);

  const toggleHabit = useCallback((habitId: string, dateKey: string) => {
    const updatedHabits = currentWeek.habits.map(h => {
      if (h.id === habitId) {
        return {
          ...h,
          lastUsedAt: Date.now(),
          completions: { ...h.completions, [dateKey]: !h.completions[dateKey] }
        };
      }
      return h;
    });
    updateCurrentWeek({ ...currentWeek, habits: updatedHabits });
  }, [currentWeek, updateCurrentWeek]);

  const addNewHabit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsAddingHabit(true);
    setNewHabitName('');
  };

  const confirmAddHabit = () => {
    if (newHabitName.trim()) {
      const newHabit: Habit = {
        id: `h-${Date.now()}`,
        name: newHabitName.trim(),
        completions: {},
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        archived: false
      };
      onAddHabit(newHabit);
    }
    setIsAddingHabit(false);
    setNewHabitName('');
  };

  const removeHabit = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPendingDeleteId(id);
  }, []);

  const saveEvent = useCallback(() => {
    if (!eventEditor) return;
    const { dateKey, id, title, startHour, duration, isNew, repeating, eventKind, parentGoalId, linkedTodoId } = eventEditor;
    const updatedDailyPlans = { ...currentWeek.dailyPlans };
    const dayPlan = updatedDailyPlans[dateKey];
    const existingEvent = !isNew ? dayPlan.events.find(e => e.id === id) : undefined;
    const resolvedKind: CalendarEventKind = eventKind ?? existingEvent?.eventKind ?? 'focus';
    const baseEvent = {
      id: isNew ? Date.now() : id,
      title: title || "New Session",
      startHour: parseFloat(startHour),
      duration: parseFloat(duration),
      // Preserve color on edit; use kind-based default for new events
      color: existingEvent?.color ?? EVENT_KIND_COLORS[resolvedKind] ?? DEFAULT_EVENT_COLOR,
      repeating: typeof repeating === 'boolean' ? repeating : (existingEvent?.repeating ?? false),
      eventKind: resolvedKind,
      ...(parentGoalId ? { parentGoalId } : {}),
      ...(linkedTodoId !== undefined ? { linkedTodoId } : {}),
    };

    if (isNew) {
      dayPlan.events.push(baseEvent);
    } else {
      dayPlan.events = dayPlan.events.map(e => e.id === id ? baseEvent : e);
    }

    updateCurrentWeek({ ...currentWeek, dailyPlans: updatedDailyPlans });
    setEventEditor(null);
  }, [eventEditor, currentWeek, updateCurrentWeek]);

  const renderedDates = isMobile ? [weekDates[activeDayIdx]] : weekDates;

  return (
    <div className="flex flex-col h-full bg-white relative w-full overflow-hidden">
      {pendingDeleteId && (
        <ConfirmDialog
          message="Delete this habit from this week and all future weeks?"
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            onDeleteHabit(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {/* Event Editor Modal */}
      {eventEditor && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-200">
            <div className="flex justify-between items-center mb-5">
               <h3 className="text-xl font-black text-slate-900">{eventEditor.isNew ? 'New Block' : 'Edit Block'}</h3>
               <button onClick={() => setEventEditor(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={24}/></button>
            </div>
            <div className="space-y-5">
              {/* Block type */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Block Type</label>
                <div className="flex gap-1.5">
                  {EVENT_KINDS.map(k => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setEventEditor({ ...eventEditor, eventKind: k.id })}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        (eventEditor.eventKind ?? 'focus') === k.id
                          ? k.activeClass
                          : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Description</label>
                <input autoFocus className="w-full border border-slate-200 rounded-xl p-3.5 text-sm font-bold bg-slate-50" value={eventEditor.title} onChange={e => setEventEditor({...eventEditor, title: e.target.value})} placeholder="Title..." />
              </div>
              {/* Linked goal context — shown when pre-filled from a suggestion */}
              {eventEditor.parentGoalId && (() => {
                const g = goalItems.find(gi => gi.id === eventEditor.parentGoalId);
                return g ? (
                  <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                    <Target size={12} className="text-purple-500 flex-shrink-0"/>
                    <span className="text-[11px] font-bold text-purple-700 truncate">{g.text || '(untitled goal)'}</span>
                    <button
                      type="button"
                      onClick={() => setEventEditor({ ...eventEditor, parentGoalId: undefined, linkedTodoId: undefined })}
                      className="ml-auto text-purple-400 hover:text-purple-600 flex-shrink-0"
                    >
                      <X size={12}/>
                    </button>
                  </div>
                ) : null;
              })()}
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Start</label>
                    <select className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 font-bold" value={eventEditor.startHour} onChange={e => setEventEditor({...eventEditor, startHour: e.target.value})}>
                        {generateTimeSlots().map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Duration</label>
                    <input type="number" step="0.5" className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 font-bold" value={eventEditor.duration} onChange={e => setEventEditor({...eventEditor, duration: e.target.value})} />
                 </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={!!eventEditor.repeating}
                  onChange={e => setEventEditor({ ...eventEditor, repeating: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Repeat Weekly
              </label>
              <div className="flex gap-3 pt-3">
                 {!eventEditor.isNew && <button onClick={() => { 
                   const updatedDailyPlans = { ...currentWeek.dailyPlans };
                   updatedDailyPlans[eventEditor.dateKey].events = updatedDailyPlans[eventEditor.dateKey].events.filter(e => e.id !== eventEditor.id);
                   updateCurrentWeek({ ...currentWeek, dailyPlans: updatedDailyPlans });
                   setEventEditor(null); 
                 }} className="flex-1 bg-red-50 text-red-600 font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest">Delete</button>}
                 <button onClick={saveEvent} className="flex-1 bg-blue-600 text-white font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest shadow-xl">Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header / Week Navigation */}
      <div className="flex-shrink-0 border-b border-slate-200 flex flex-wrap min-h-[140px] bg-slate-50/40 w-full">
        <div className="w-full lg:w-56 border-b lg:border-b-0 lg:border-r border-slate-200 p-4 lg:p-6 flex flex-row lg:flex-col justify-between items-center lg:items-start shrink-0">
          <div>
            <span className="text-[10px] text-blue-500 font-black uppercase tracking-widest block mb-1">Horizon</span>
            <div className="text-xl lg:text-3xl font-black text-slate-900 leading-none truncate">{MONTHS[currentDate.getMonth()].toUpperCase()}</div>
            <div className="text-xs font-bold text-slate-400 mt-1.5">Week of {weekDates[0].getDate()}</div>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => jumpWeeks(-1)} className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 hover:bg-slate-50"><ChevronLeft size={20}/></button>
             <button onClick={() => jumpWeeks(1)} className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-600 hover:bg-slate-50"><ChevronRight size={20}/></button>
          </div>
        </div>
        
        <div className="flex-1 border-r border-slate-200 p-4 lg:p-6 flex flex-col min-w-[200px]">
            <div className="text-[10px] font-black uppercase text-blue-600 tracking-[0.2em] mb-3">Business Goals</div>
            <CheckableList
              items={currentWeek.goals.business}
              onChange={items => updateCurrentWeek({...currentWeek, goals: {...currentWeek.goals, business: items}})}
              onAdd={() => updateCurrentWeek({...currentWeek, goals: {...currentWeek.goals, business: [...currentWeek.goals.business, { id: `bg-${Date.now()}`, text: '', done: false }]}}) }
              placeholder="Strategic aim..."
              renderSuffix={makeGoalSuffix('business', currentWeek.goals.business)}
            />
        </div>
        <div className="flex-1 p-4 lg:p-6 flex flex-col min-w-[200px]">
            <div className="text-[10px] font-black uppercase text-emerald-600 tracking-[0.2em] mb-3">Well-being & Growth</div>
            <CheckableList
              items={currentWeek.goals.personal}
              onChange={items => updateCurrentWeek({...currentWeek, goals: {...currentWeek.goals, personal: items}})}
              onAdd={() => updateCurrentWeek({...currentWeek, goals: {...currentWeek.goals, personal: [...currentWeek.goals.personal, { id: `pg-${Date.now()}`, text: '', done: false }]}}) }
              placeholder="Personal win..."
              renderSuffix={makeGoalSuffix('personal', currentWeek.goals.personal)}
            />
        </div>
      </div>
      
      {/* Mobile Tabs */}
      {isMobile && (
        <div className="flex border-b border-slate-200 bg-white">
            <button onClick={() => setMobileTab('plan')} className={`flex-1 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 ${mobileTab === 'plan' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-400'}`}><Layout size={14}/> Daily Planner</button>
            <button onClick={() => setMobileTab('strategy')} className={`flex-1 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 ${mobileTab === 'strategy' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-400'}`}><List size={14}/> Habits & Syncs</button>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden">
        {/* Strategy Sidebar (Habits) */}
        {(!isMobile || mobileTab === 'strategy') && (
            <div className={`w-full lg:w-56 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/20 overflow-y-auto custom-scrollbar ${isMobile ? 'flex-1' : ''}`}>
                <div className="p-4 lg:p-5 border-b border-slate-200 bg-indigo-50/50">
                    <button onClick={handleOptimizeFullWeek} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl shadow-lg transition-all active:scale-95 group">
                        <Zap size={16} className="group-hover:animate-pulse fill-white"/>
                        <span className="text-xs font-black uppercase tracking-tight">AI Optimize Week</span>
                    </button>
                </div>

                {/* Focus Goals — active annual + this month's monthly goals */}
                <div className="flex flex-col border-b border-slate-200 p-5 bg-white/60">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Target size={12} className="text-purple-500"/> Focus Goals
                    </span>
                    {focusItems.length === 0 ? (
                        <div className="text-[10px] italic text-slate-400 text-center py-2">
                            Set annual &amp; monthly goals in Life Goals →
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {focusItems.map(item => (
                                <div key={item.id} className="flex items-start gap-2">
                                    <span className={`text-[8px] font-black uppercase mt-0.5 px-1.5 py-0.5 rounded flex-shrink-0 ${
                                        item.timeframe === 'monthly'
                                            ? 'bg-purple-100 text-purple-600'
                                            : 'bg-blue-100 text-blue-600'
                                    }`}>
                                        {item.timeframe === 'monthly' ? 'MO' : 'AN'}
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-700 leading-snug">{item.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Focus Gaps — unscheduled linked weekly goals */}
                {unscheduledLinked.length > 0 && (
                  <div className="flex flex-col border-b border-slate-200 p-5 bg-amber-50/40">
                    <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <Clock size={12}/> Focus Gaps
                      <span className="ml-auto bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5 font-black">
                        {unscheduledLinked.length}
                      </span>
                    </span>
                    <div className="space-y-2">
                      {unscheduledLinked.slice(0, 3).map(todo => (
                        <div key={String(todo.id)} className="flex items-center gap-2">
                          <span className="flex-1 text-[10px] text-slate-700 font-medium truncate min-w-0">
                            {todo.text || '(untitled)'}
                          </span>
                          <button
                            onClick={() => openFocusSuggestion(todo)}
                            title="Create focus block"
                            className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-black px-2 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all whitespace-nowrap"
                          >
                            <CalendarDays size={9}/>
                            Block
                          </button>
                        </div>
                      ))}
                      {unscheduledLinked.length > 3 && (
                        <p className="text-[9px] text-amber-500 font-bold">
                          +{unscheduledLinked.length - 3} more unscheduled
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col border-b border-slate-200 p-5 bg-white/60">
                    <div className="flex items-center justify-between mb-5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Activity size={12} className="text-blue-500"/> Habitual Protocols</span>
                        <button onClick={addNewHabit} className="text-blue-600 hover:bg-blue-600 hover:text-white p-2 rounded-lg transition-all shadow-sm bg-white border border-blue-100"><Plus size={14}/></button>
                    </div>
                    <div className="space-y-6">
                        {isAddingHabit && (
                          <div className="flex items-center gap-2 bg-blue-50/50 rounded-xl p-2 border border-blue-100">
                            <input
                              autoFocus
                              className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-200"
                              placeholder="e.g. Meditate, Exercise..."
                              value={newHabitName}
                              onChange={e => setNewHabitName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmAddHabit();
                                if (e.key === 'Escape') { setIsAddingHabit(false); setNewHabitName(''); }
                              }}
                            />
                            <button onClick={confirmAddHabit} className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"><Check size={12}/></button>
                            <button onClick={() => { setIsAddingHabit(false); setNewHabitName(''); }} className="text-slate-400 hover:text-slate-600 p-1.5 flex-shrink-0"><X size={12}/></button>
                          </div>
                        )}
                        {activeHabits.length === 0 && !isAddingHabit && <div className="text-[10px] italic text-slate-400 text-center py-6 bg-slate-100/50 rounded-2xl border-2 border-dashed border-slate-200 cursor-pointer hover:bg-blue-50/50 hover:border-blue-200 hover:text-blue-400 transition-all" onClick={addNewHabit}>Click + to add a habit...</div>}
                        {activeHabits
                          .sort((a, b) => a.createdAt - b.createdAt) // Sort by creation date
                          .map(habit => {
                          const streak = calculateCrossWeekStreak(habit.id, allWeeks, currentWeek.weekEndDate);
                          const milestone = getMilestoneForStreak(streak.currentStreak);
                          return (
                            <div key={habit.id} className="flex flex-col gap-2.5 group/habit">
                              <div className="flex justify-between items-center px-0.5">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-[11px] font-black text-slate-800 tracking-tight truncate">{habit.name}</span>
                                  <span
                                    title={milestone ? `${milestone.message} (${streak.currentStreak} day streak)` : `${streak.currentStreak}d streak • Best: ${streak.longestStreak}d • Total: ${streak.totalDays}d`}
                                    className={`text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-1.5 flex-shrink-0 ${milestone ? `${milestone.bgColor} ${milestone.color}` : 'text-slate-500 bg-slate-100'} ${milestone?.animate ? 'animate-pulse' : ''}`}
                                  >
                                    <Flame size={12} className={getFlameColorClass(streak.currentStreak)}/>
                                    <span className="text-[10px]">{streak.currentStreak}d</span>
                                  </span>
                                </div>
                                <button onClick={(e) => removeHabit(habit.id, e)} className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover/habit:opacity-100'} text-slate-300 hover:text-red-500 transition-all p-1`}>
                                  <Trash2 size={12}/>
                                </button>
                              </div>
                              {milestone && (
                                <div className={`text-[9px] font-black uppercase tracking-wider px-1 ${milestone.color}`}>
                                  {milestone.message}
                                </div>
                              )}
                              <div className="flex justify-between items-center bg-white rounded-xl p-2 border border-slate-100 shadow-sm ring-1 ring-slate-200/50">
                                {weekDates.map((date, idx) => {
                                  const dateKey = formatDateKey(date);
                                  const isDone = !!habit.completions[dateKey];
                                  return (
                                    <button 
                                      key={idx}
                                      onClick={() => toggleHabit(habit.id, dateKey)}
                                      className={`w-5 h-5 flex items-center justify-center text-[8px] font-black transition-all rounded-full border-2 ${
                                        isDone ? 'bg-blue-600 border-blue-600 text-white shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500'
                                      }`}
                                    >
                                      {isDone ? <Check size={8} strokeWidth={5}/> : DAYS[idx][0]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                </div>

                <div className="flex-1 flex flex-col p-5 overflow-y-auto">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Meetings & Syncs</div>
                    <CheckableList 
                      items={currentWeek.meetings} 
                      onChange={meetings => updateCurrentWeek({...currentWeek, meetings})} 
                      onAdd={() => updateCurrentWeek({...currentWeek, meetings: [...currentWeek.meetings, {id: `m-${Date.now()}`, text: '', done: false}]})} 
                      placeholder="Meeting..." 
                    />
                </div>
            </div>
        )}

        {/* Main Planner Grid */}
        {(!isMobile || mobileTab === 'plan') && (
            <div className="flex-1 h-full overflow-auto min-w-0 bg-slate-50 relative custom-scrollbar">
                {!isMobile && (
                    <div className="flex w-full border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
                        {weekDates.map((date, idx) => {
                        const isToday = new Date().toDateString() === date.toDateString();
                        return (
                            <div key={idx} className="flex-1 min-w-[200px] flex flex-col border-r border-slate-200 last:border-r-0">
                                <div className={`h-16 px-4 py-3 flex items-center justify-between border-b border-slate-100 ${isToday ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                                    <div>
                                        <div className={`text-[9px] font-black uppercase tracking-widest ${isToday ? 'text-blue-100' : 'text-slate-400'}`}>{DAYS[idx]}</div>
                                        <div className={`text-xl font-black ${isToday ? 'text-white' : 'text-slate-900'}`}>{date.getDate()}</div>
                                    </div>
                                    {isToday && <div className="w-2 h-2 rounded-full bg-white animate-ping"></div>}
                                </div>
                            </div>
                        )
                        })}
                    </div>
                )}

                <div className="flex w-full border-b border-slate-200 bg-white">
                    {renderedDates.map((date, idx) => {
                        const dateKey = formatDateKey(date);
                        const dayPlan = currentWeek.dailyPlans[dateKey];
                        return (
                            <div key={idx} className="flex-1 min-w-[200px] border-r border-slate-200 last:border-r-0 flex flex-col">
                                <div className="p-6 bg-gradient-to-br from-blue-50/20 via-white to-white border-b border-slate-100 min-h-[160px]">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
                                        <div className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">Daily Focus</div>
                                    </div>
                                    <textarea 
                                        className="w-full min-h-[100px] bg-transparent border-none text-[18px] font-black text-slate-900 leading-[1.3] resize-none p-0 focus:ring-0 placeholder:text-slate-200 placeholder:font-black italic" 
                                        placeholder="The absolute priority..." 
                                        value={dayPlan.focus || ""} 
                                        onChange={(e) => {
                                          const updatedPlans = { ...currentWeek.dailyPlans };
                                          updatedPlans[dateKey] = { ...dayPlan, focus: e.target.value };
                                          updateCurrentWeek({ ...currentWeek, dailyPlans: updatedPlans });
                                        }}
                                    />
                                </div>
                                <div className="p-6 bg-white min-h-[300px]">
                                    <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">To Do List<div className="flex-1 h-px bg-slate-50"></div></div>
                                    <CheckableList
                                      items={dayPlan.todos}
                                      onChange={(newTodos) => {
                                        const updatedPlans = { ...currentWeek.dailyPlans };
                                        updatedPlans[dateKey] = { ...dayPlan, todos: newTodos };
                                        updateCurrentWeek({ ...currentWeek, dailyPlans: updatedPlans });
                                      }}
                                      onAdd={() => {
                                        const updatedPlans = { ...currentWeek.dailyPlans };
                                        updatedPlans[dateKey] = { ...dayPlan, todos: [...dayPlan.todos, {id: `t-${Date.now()}`, text: '', done: false}] };
                                        updateCurrentWeek({ ...currentWeek, dailyPlans: updatedPlans });
                                      }}
                                      placeholder="Next action..."
                                      renderSuffix={makeDailyGoalSuffix(dateKey, dayPlan)}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                <div className="flex w-full bg-slate-50 relative">
                    {renderedDates.map((date, idx) => {
                        const dateKey = formatDateKey(date);
                        const dayPlan = currentWeek.dailyPlans[dateKey];
                        
                        return (
                            <div key={idx} className="flex-1 min-w-[200px] border-r border-slate-200 last:border-r-0 relative bg-white/40" style={{ height: `${24 * PIXELS_PER_HOUR}px` }}>
                                {generateTimeSlots().map((hour) => (
                                    <div 
                                        key={hour} 
                                        className="h-20 border-b border-slate-100/40 flex items-start px-3 py-1.5 relative group cursor-pointer hover:bg-blue-50/50" 
                                        onClick={() => setEventEditor({ dateKey, startHour: hour, duration: 1, title: "", isNew: true, repeating: false, eventKind: 'focus' as CalendarEventKind })}
                                    >
                                        <span className="text-[9px] font-black text-slate-200 group-hover:text-blue-500 pointer-events-none">{formatHour(hour)}</span>
                                    </div>
                                ))}
                                {dayPlan.events.map(evt => {
                                    const top = (evt.startHour - START_HOUR) * PIXELS_PER_HOUR; 
                                    const height = evt.duration * PIXELS_PER_HOUR;
                                    return (
                                        <div
                                            key={`${evt.id}-${dateKey}`}
                                            onClick={(e) => { e.stopPropagation(); setEventEditor({ dateKey, id: evt.id, title: evt.title, startHour: evt.startHour, duration: evt.duration, isNew: false, repeating: evt.repeating ?? false, eventKind: evt.eventKind, parentGoalId: evt.parentGoalId, linkedTodoId: evt.linkedTodoId }); }}
                                            style={{ top: `${top}px`, height: `${height - 1}px` }}
                                            className={`absolute left-0 right-0 mx-1 rounded-2xl border-l-4 shadow-xl shadow-slate-200/50 p-3.5 text-[11px] leading-tight cursor-pointer hover:brightness-95 z-10 overflow-hidden transition-all hover:scale-[1.03] active:scale-95 ${evt.color}`}
                                        >
                                            <div className="font-black truncate uppercase tracking-tight text-slate-900">{evt.title}</div>
                                            <div className="opacity-70 font-bold text-[9px] mt-1 uppercase tracking-wider">{formatHour(evt.startHour)} - {formatHour(evt.startHour + evt.duration)}</div>
                                            {evt.parentGoalId && (() => {
                                              const g = goalItems.find(gi => gi.id === evt.parentGoalId);
                                              return g ? (
                                                <div className="opacity-70 text-[8px] font-black mt-0.5 flex items-center gap-0.5 truncate">
                                                  <Target size={7} className="flex-shrink-0"/>
                                                  <span className="truncate">{g.text}</span>
                                                </div>
                                              ) : null;
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
