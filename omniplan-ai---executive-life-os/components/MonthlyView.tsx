
import React, { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Edit3, Clock, Plus, Trash2 } from 'lucide-react';
import { WeekData, DailyPlan, CalendarEvent } from '../types';
import { MONTHS, formatDateKey, formatHour } from '../constants';
import { getWeeksInRange, getOrCreateWeek, getWeekStorageKey } from '../utils/weekManager';
import { generateTimeSlots } from '../constants';

interface MonthlyViewProps {
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  allWeeks: Record<string, WeekData>;
  onUpdateWeek: (date: Date, week: WeekData) => void;
  onNavigateToWeek: (date: Date) => void;
}

export const MonthlyView: React.FC<MonthlyViewProps> = ({
  currentDate, setCurrentDate, allWeeks, onUpdateWeek, onNavigateToWeek
}) => {
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const startOffset = (firstDay + 6) % 7;

  const [selectedDay, setSelectedDay] = useState<{ key: string; dateString: string; date: Date } | null>(null);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', startHour: '9', duration: '1' });

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const weeksInMonth = useMemo(() => getWeeksInRange(monthStart, monthEnd, allWeeks), [currentDate.getFullYear(), currentDate.getMonth(), allWeeks]);

  // Get day plan + its parent week for a given date
  const getDayDataWithWeek = useCallback((dateKey: string): { dayPlan: DailyPlan; week: WeekData } | null => {
    for (const week of weeksInMonth) {
      if (week.dailyPlans[dateKey]) {
        return { dayPlan: week.dailyPlans[dateKey], week };
      }
    }
    return null;
  }, [weeksInMonth]);

  // Get day plan (returns empty defaults if none exists yet)
  const getDayPlan = useCallback((dateKey: string): DailyPlan => {
    const result = getDayDataWithWeek(dateKey);
    return result?.dayPlan ?? { focus: '', todos: [], notes: '', events: [] };
  }, [getDayDataWithWeek]);

  // Update a day's plan within its parent week
  const updateDayPlan = useCallback((dayDate: Date, dateKey: string, updater: (plan: DailyPlan) => DailyPlan) => {
    const week = getOrCreateWeek(dayDate, allWeeks);
    const currentPlan = week.dailyPlans[dateKey] ?? { focus: '', todos: [], notes: '', events: [] };
    const updatedPlan = updater(currentPlan);
    const updatedWeek: WeekData = {
      ...week,
      dailyPlans: { ...week.dailyPlans, [dateKey]: updatedPlan },
    };
    onUpdateWeek(dayDate, updatedWeek);
  }, [allWeeks, onUpdateWeek]);

  const selectedDayPlan = selectedDay ? getDayPlan(selectedDay.key) : null;
  const selectedDayEvents = selectedDayPlan?.events || [];

  const handleAddEvent = () => {
    if (!selectedDay || !newEvent.title.trim()) return;
    const event: CalendarEvent = {
      id: String(Date.now()),
      title: newEvent.title.trim(),
      startHour: parseFloat(newEvent.startHour),
      duration: parseFloat(newEvent.duration),
      color: 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm',
    };
    updateDayPlan(selectedDay.date, selectedDay.key, plan => ({
      ...plan,
      events: [...plan.events, event],
    }));
    setNewEvent({ title: '', startHour: '9', duration: '1' });
    setAddingEvent(false);
  };

  const handleDeleteEvent = (eventId: string | number) => {
    if (!selectedDay) return;
    updateDayPlan(selectedDay.date, selectedDay.key, plan => ({
      ...plan,
      events: plan.events.filter(e => e.id !== eventId),
    }));
  };

  return (
    <div className="flex flex-col min-h-full bg-white p-8 relative overflow-visible animate-in fade-in duration-500">
      {/* Day Detail Modal */}
      {selectedDay && selectedDayPlan && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="bg-slate-900 p-8 flex justify-between items-center text-white">
                    <div>
                        <h3 className="font-black text-2xl tracking-tighter">{selectedDay.dateString}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Synced with Weekly View</p>
                        </div>
                    </div>
                    <button onClick={() => { setSelectedDay(null); setAddingEvent(false); }} className="text-slate-400 hover:text-white transition-all p-2 rounded-full hover:bg-white/10"><X size={24}/></button>
                </div>
                <div className="p-8 space-y-8 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <div>
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Daily Focus</label>
                        <textarea
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm font-bold shadow-inner leading-relaxed min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                            placeholder="Set your focus for this day..."
                            value={selectedDayPlan.focus || ''}
                            onChange={(e) => {
                              updateDayPlan(selectedDay.date, selectedDay.key, plan => ({
                                ...plan, focus: e.target.value,
                              }));
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Daily Notes</label>
                        <textarea
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm font-bold shadow-inner leading-relaxed min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                            placeholder="Add notes..."
                            value={selectedDayPlan.notes || ''}
                            onChange={(e) => {
                              updateDayPlan(selectedDay.date, selectedDay.key, plan => ({
                                ...plan, notes: e.target.value,
                              }));
                            }}
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Time Blocks ({selectedDayEvents.length})</label>
                            <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setAddingEvent(true)}
                                  className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors flex items-center gap-1"
                                >
                                  <Plus size={10}/> Add
                                </button>
                                <button
                                  onClick={() => onNavigateToWeek(selectedDay.date)}
                                  className="text-[10px] font-black text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200 hover:bg-slate-100 transition-colors flex items-center gap-1"
                                >
                                  <Edit3 size={10}/> Edit in Planner
                                </button>
                            </div>
                        </div>

                        {addingEvent && (
                          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 mb-4 space-y-3">
                            <input
                              autoFocus
                              className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold bg-white"
                              value={newEvent.title}
                              onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                              placeholder="Event title..."
                              onKeyDown={e => e.key === 'Enter' && handleAddEvent()}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Start</label>
                                <select className="w-full border border-slate-200 rounded-xl p-2 text-sm bg-white font-bold" value={newEvent.startHour} onChange={e => setNewEvent({ ...newEvent, startHour: e.target.value })}>
                                  {generateTimeSlots().map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Duration (hrs)</label>
                                <input type="number" step="0.5" min="0.5" className="w-full border border-slate-200 rounded-xl p-2 text-sm bg-white font-bold" value={newEvent.duration} onChange={e => setNewEvent({ ...newEvent, duration: e.target.value })} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setAddingEvent(false)} className="flex-1 bg-slate-100 text-slate-600 font-black py-2.5 rounded-xl text-xs uppercase">Cancel</button>
                              <button onClick={handleAddEvent} className="flex-1 bg-blue-600 text-white font-black py-2.5 rounded-xl text-xs uppercase shadow-lg">Add Event</button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                            {selectedDayEvents.length === 0 && !addingEvent ? (
                                <div className="text-slate-400 text-sm italic py-8 border-2 border-dashed border-slate-100 rounded-3xl text-center bg-slate-50/30">
                                    No events scheduled
                                </div>
                            ) : selectedDayEvents.map(evt => (
                                <div key={`${evt.id}-modal`} className="group flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                    <div className="w-1.5 h-10 rounded-full bg-blue-600"></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{evt.title}</div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-1">
                                            <Clock size={10}/> {formatHour(evt.startHour)} - {formatHour(evt.startHour + evt.duration)}
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteEvent(evt.id)} className="text-slate-300 hover:text-red-500 p-2 transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
                    <button onClick={() => onNavigateToWeek(selectedDay.date)} className="bg-white text-slate-700 border border-slate-200 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Open in Planner</button>
                    <button onClick={() => { setSelectedDay(null); setAddingEvent(false); }} className="bg-slate-900 text-white px-10 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:scale-105 active:scale-95 transition-all">Done</button>
                </div>
            </div>
        </div>
      )}

      {/* Monthly Navigation */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div>
            <div className="text-sm font-black text-blue-600 uppercase tracking-[0.3em] mb-2">{currentDate.getFullYear()}</div>
            <h2 className="text-6xl font-black text-slate-900 tracking-tighter leading-none">{MONTHS[currentDate.getMonth()]}</h2>
        </div>
        <div className="flex gap-3">
            <button onClick={prevMonth} className="p-4 bg-slate-50 hover:bg-slate-100 border-2 border-slate-100 rounded-[1.5rem] transition-all shadow-sm active:scale-95"><ChevronLeft size={28}/></button>
            <button onClick={nextMonth} className="p-4 bg-slate-50 hover:bg-slate-100 border-2 border-slate-100 rounded-[1.5rem] transition-all shadow-sm active:scale-95"><ChevronRight size={28}/></button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-6">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => (
            <div key={d} className="text-center text-[11px] font-black text-slate-400 tracking-[0.3em]">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3 flex-1">
        {Array.from({ length: startOffset }).map((_, i) => <div key={`empty-${i}`} className="min-h-[100px] bg-slate-50/20 rounded-2xl"></div>)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
           const dayNum = i + 1;
           const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
           const dateKey = formatDateKey(dayDate);
           const dayPlan = getDayPlan(dateKey);
           const dayEvents = dayPlan.events || [];
           const isToday = new Date().toDateString() === dayDate.toDateString();

           return (
            <div
                key={i}
                onClick={() => setSelectedDay({ key: dateKey, dateString: dayDate.toDateString(), date: dayDate })}
                className={`group border-2 rounded-[1.5rem] p-3 min-h-[100px] cursor-pointer flex flex-col overflow-hidden transition-all duration-300 ${
                    isToday ? 'border-blue-600 bg-blue-50/30 shadow-xl shadow-blue-100/50' : 'border-slate-50 hover:border-slate-200 hover:bg-slate-50 hover:shadow-lg hover:shadow-slate-200/50'
                }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-lg font-black tracking-tighter ${isToday ? 'text-blue-600' : 'text-slate-900'}`}>{dayNum}</span>
                {dayEvents.length > 0 && <div className="px-1.5 py-0.5 rounded-lg bg-blue-600 text-[9px] font-black text-white shadow-lg shadow-blue-200">{dayEvents.length}</div>}
              </div>
              <div className="flex-1 overflow-hidden space-y-1">
                  {dayPlan.focus && (
                    <div className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg truncate">{dayPlan.focus}</div>
                  )}
                  {dayEvents.slice(0, 2).map((e, idx) => (
                      <div key={`${e.id}-${idx}`} className="text-[8px] font-bold text-slate-700 bg-white/80 px-1.5 py-0.5 rounded-lg border border-slate-100 truncate shadow-sm group-hover:bg-white transition-colors">
                          {e.title}
                      </div>
                  ))}
                  {dayEvents.length > 2 && <div className="text-[8px] font-black text-slate-400 pl-1.5">+{dayEvents.length - 2} more</div>}
              </div>
            </div>
           );
        })}
      </div>
    </div>
  );
};
