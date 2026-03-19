
import React, { useState } from 'react';
import { Target, Flag, Rocket, Compass, Sparkles, ChevronLeft, ChevronRight, Check, Archive, Plus, RotateCcw } from 'lucide-react';
import { GoalItem, GoalTimeframe, WeekData } from '../types';
import { storage, LOCAL_STORAGE_KEYS } from '../services/storage';
import {
  createGoalItem,
  updateGoalItem,
  completeGoalItem,
  archiveGoalItem,
  restoreGoalItem,
  getGoalItemsForYear,
  getGoalItemsByTimeframe,
  getGoalExecutionSummary,
  GoalProgress,
} from '../utils/goalManager';

interface GoalsViewProps {
  goalItems: GoalItem[];
  setGoalItems: React.Dispatch<React.SetStateAction<GoalItem[]>>;
  /** Used to derive linked-Todo progress per goal. Read-only — not mutated here. */
  allWeeks: Record<string, WeekData>;
}

type GoalTab = 'ten_year' | 'five_year' | 'three_year' | 'one_year' | 'monthly';

const TABS: { id: GoalTab; icon: React.ReactNode; label: string; yearNav: boolean; yearCount?: number }[] = [
  { id: 'ten_year',   icon: <Compass size={16}/>,  label: 'Horizon',     yearNav: true,  yearCount: 10 },
  { id: 'five_year',  icon: <Rocket size={16}/>,   label: 'Trajectory',  yearNav: true,  yearCount: 5  },
  { id: 'three_year', icon: <Flag size={16}/>,     label: 'Milestones',  yearNav: true,  yearCount: 3  },
  { id: 'one_year',   icon: <Target size={16}/>,   label: 'Annual',      yearNav: false               },
  { id: 'monthly',    icon: <Sparkles size={16}/>, label: 'Focus',       yearNav: false               },
];

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface GoalRowProps {
  item: GoalItem;
  /** Derived from allWeeks via getGoalProgress(). Undefined when allWeeks is empty. */
  progress?: GoalProgress;
  onUpdate: (id: string, changes: Partial<GoalItem>) => void;
  onComplete: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}

const GoalRow: React.FC<GoalRowProps> = ({ item, progress, onUpdate, onComplete, onArchive, onRestore }) => {
  const isDone = item.status === 'completed';
  const isArchived = item.status === 'archived';

  return (
    <div className="flex items-start gap-2 group py-1.5">
      <button
        onClick={() => isDone ? onRestore(item.id) : onComplete(item.id)}
        title={isDone ? 'Restore' : 'Mark complete'}
        className={`mt-1 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
          isDone ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 hover:border-blue-400 bg-white'
        }`}
      >
        {isDone && <Check size={9} strokeWidth={4}/>}
      </button>

      <div className="flex-1 min-w-0">
        <textarea
          rows={1}
          value={item.text}
          onChange={e => onUpdate(item.id, { text: e.target.value })}
          disabled={isArchived}
          className={`w-full bg-transparent border-none p-0 text-sm font-semibold leading-relaxed resize-none focus:outline-none focus:ring-0 ${
            isDone ? 'line-through text-slate-400' : isArchived ? 'text-slate-400 italic' : 'text-slate-800'
          }`}
          style={{ overflow: 'hidden' }}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
      </div>

      {/* Linked-Todo progress badge — visible only when at least one Todo is linked */}
      {progress && progress.linked > 0 && (
        <span
          title={`${progress.completed} of ${progress.linked} linked todos done${progress.allDone ? ' — all done!' : ''}`}
          className={`self-center text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 transition-colors ${
            progress.allDone
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {progress.completed}/{progress.linked}
        </span>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        {isArchived ? (
          <button onClick={() => onRestore(item.id)} title="Restore" className="p-1 rounded text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
            <RotateCcw size={11}/>
          </button>
        ) : (
          <button onClick={() => onArchive(item.id)} title="Archive" className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
            <Archive size={11}/>
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const GoalsView: React.FC<GoalsViewProps> = ({ goalItems, setGoalItems, allWeeks }) => {
  const [tab, setTab] = useState<GoalTab>('five_year');
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed

  const [baseYears, setBaseYears] = useState<Record<string, number>>(() => {
    const saved = storage.get<Record<string, number>>(LOCAL_STORAGE_KEYS.GOALS_BASE_YEARS);
    return saved ?? { ten_year: currentYear, five_year: currentYear, three_year: currentYear };
  });

  const updateBaseYear = (period: string, delta: number, count: number) => {
    setBaseYears(prev => {
      const updated = { ...prev, [period]: (prev[period] ?? currentYear) + delta * count };
      storage.set(LOCAL_STORAGE_KEYS.GOALS_BASE_YEARS, updated);
      return updated;
    });
  };

  // Mutations forwarded to App state
  const handleUpdate = (id: string, changes: Partial<GoalItem>) =>
    setGoalItems(prev => updateGoalItem(id, changes, prev));

  const handleComplete = (id: string) =>
    setGoalItems(prev => completeGoalItem(id, prev));

  const handleArchive = (id: string) =>
    setGoalItems(prev => archiveGoalItem(id, prev));

  const handleRestore = (id: string) =>
    setGoalItems(prev => restoreGoalItem(id, prev));

  const handleAdd = (timeframe: GoalTimeframe, extra: Partial<GoalItem> = {}) => {
    const newItem = createGoalItem({ text: '', timeframe, ...extra });
    setGoalItems(prev => [...prev, newItem]);
  };

  /** Returns combined weekly + daily execution progress for a GoalItem. */
  const prog = (id: string): GoalProgress => {
    const summary = getGoalExecutionSummary(id, allWeeks);
    return summary.total;
  };

  const rowProps = { onUpdate: handleUpdate, onComplete: handleComplete, onArchive: handleArchive, onRestore: handleRestore };

  // ---------------------------------------------------------------------------
  // Year-nav tabs: render items grouped by year
  // ---------------------------------------------------------------------------
  const renderYearTab = (timeframe: GoalTab, yearCount: number) => {
    const base = baseYears[timeframe] ?? currentYear;
    const years = Array.from({ length: yearCount }, (_, i) => base + i);

    return (
      <div className={`space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-400 ${timeframe === 'ten_year' ? 'grid grid-cols-1 lg:grid-cols-2 gap-8 space-y-0' : ''}`}>
        {years.map(year => {
          const yearItems = getGoalItemsForYear(goalItems, timeframe, year);
          const activeItems = yearItems.filter(i => i.status !== 'archived');
          const archivedItems = yearItems.filter(i => i.status === 'archived');

          return (
            <div key={year} className="bg-slate-50 p-8 rounded-3xl border border-slate-100 hover:border-slate-200 transition-all">
              <div className="text-3xl font-black text-blue-600 tracking-tighter mb-5">{year}</div>

              {timeframe === 'five_year' ? (
                <div className="space-y-4">
                  {activeItems.map(item => (
                    <div key={item.id} className="space-y-1.5">
                      <GoalRow item={item} progress={prog(item.id)} {...rowProps}/>
                      {/* Operational steps (notes field) */}
                      <textarea
                        rows={1}
                        value={item.notes ?? ''}
                        onChange={e => handleUpdate(item.id, { notes: e.target.value })}
                        placeholder="Operational steps..."
                        className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs text-slate-500 font-medium leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 ml-6"
                        style={{ overflow: 'hidden' }}
                        onInput={e => {
                          const el = e.currentTarget;
                          el.style.height = 'auto';
                          el.style.height = `${el.scrollHeight}px`;
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {activeItems.map(item => <GoalRow key={item.id} item={item} progress={prog(item.id)} {...rowProps}/>)}
                </div>
              )}

              <button
                onClick={() => handleAdd(timeframe as GoalTimeframe, { targetDate: `${year}-12-31` })}
                className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-blue-600 mt-3 ml-6 transition-colors uppercase tracking-wider py-1"
              >
                <Plus size={12}/> Add for {year}
              </button>

              {archivedItems.length > 0 && (
                <details className="mt-3 ml-6">
                  <summary className="text-[10px] text-slate-400 font-bold uppercase tracking-wider cursor-pointer select-none">
                    {archivedItems.length} archived
                  </summary>
                  <div className="mt-2 space-y-1 opacity-60">
                    {archivedItems.map(item => <GoalRow key={item.id} item={item} progress={prog(item.id)} {...rowProps}/>)}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Annual tab (one_year): flat list, no year grouping
  // ---------------------------------------------------------------------------
  const renderAnnualTab = () => {
    const items = getGoalItemsByTimeframe(goalItems, 'one_year');
    const active = items.filter(i => i.status !== 'archived');
    const archived = items.filter(i => i.status === 'archived');

    return (
      <div className="animate-in fade-in slide-in-from-bottom-6 duration-400 max-w-2xl">
        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
          <div className="text-3xl font-black text-blue-600 tracking-tighter mb-5">{currentYear}</div>
          <div className="space-y-1">
            {active.map(item => <GoalRow key={item.id} item={item} progress={prog(item.id)} {...rowProps}/>)}
          </div>
          <button
            onClick={() => handleAdd('one_year', { targetDate: `${currentYear}-12-31` })}
            className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-blue-600 mt-3 ml-6 transition-colors uppercase tracking-wider py-1"
          >
            <Plus size={12}/> Add goal
          </button>
          {archived.length > 0 && (
            <details className="mt-3 ml-6">
              <summary className="text-[10px] text-slate-400 font-bold uppercase tracking-wider cursor-pointer select-none">
                {archived.length} archived
              </summary>
              <div className="mt-2 space-y-1 opacity-60">
                {archived.map(item => <GoalRow key={item.id} item={item} progress={prog(item.id)} {...rowProps}/>)}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Monthly tab: 12-month grid
  // ---------------------------------------------------------------------------
  const renderMonthlyTab = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-6 duration-400">
      {SHORT_MONTHS.map((month, idx) => {
        const mm = String(idx + 1).padStart(2, '0');
        const monthPrefix = `${currentYear}-${mm}`;
        const monthItems = goalItems.filter(
          i => i.timeframe === 'monthly' && i.status !== 'archived' &&
               (i.targetDate?.startsWith(monthPrefix) ?? false)
        ).sort((a, b) => a.order - b.order);
        const isCurrentMonth = idx === currentMonth;

        return (
          <div key={month} className={`bg-slate-50 p-5 rounded-3xl border flex flex-col min-h-[180px] gap-3 transition-all ${
            isCurrentMonth ? 'border-blue-200 bg-blue-50/30 shadow-sm' : 'border-slate-100'
          }`}>
            <div className={`text-base font-black border-b pb-2 ${
              isCurrentMonth ? 'text-blue-600 border-blue-200' : 'text-slate-900 border-slate-200'
            }`}>{month}</div>
            <div className="flex-1 space-y-1">
              {monthItems.map(item => <GoalRow key={item.id} item={item} progress={prog(item.id)} {...rowProps}/>)}
            </div>
            <button
              onClick={() => handleAdd('monthly', { targetDate: `${currentYear}-${mm}-01` })}
              className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-blue-500 transition-colors uppercase tracking-wider"
            >
              <Plus size={10}/> Add
            </button>
          </div>
        );
      })}
    </div>
  );

  const activeTab = TABS.find(t => t.id === tab)!;

  return (
    <div className="flex flex-col h-full bg-white p-10 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Target className="text-blue-600" size={32} strokeWidth={2.5}/>
            <span className="text-sm font-black text-blue-600 uppercase tracking-[0.2em]">Strategy Engine</span>
          </div>
          <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Life Vision Board</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-2xl p-1.5 gap-1.5 shadow-inner">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all duration-200 ${
                  tab === t.id ? 'bg-white text-slate-900 shadow-xl shadow-slate-200/50' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {activeTab.yearNav && activeTab.yearCount && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateBaseYear(tab, -1, activeTab.yearCount!)}
                className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 transition-all"
              >
                <ChevronLeft size={14}/>
              </button>
              <span className="text-xs font-bold text-slate-500 min-w-[90px] text-center">
                {baseYears[tab] ?? currentYear}–{(baseYears[tab] ?? currentYear) + activeTab.yearCount - 1}
              </span>
              <button
                onClick={() => updateBaseYear(tab, 1, activeTab.yearCount!)}
                className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 transition-all"
              >
                <ChevronRight size={14}/>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-10">
        {tab === 'ten_year'   && renderYearTab('ten_year',   10)}
        {tab === 'five_year'  && renderYearTab('five_year',   5)}
        {tab === 'three_year' && renderYearTab('three_year',  3)}
        {tab === 'one_year'   && renderAnnualTab()}
        {tab === 'monthly'    && renderMonthlyTab()}
      </div>
    </div>
  );
};
