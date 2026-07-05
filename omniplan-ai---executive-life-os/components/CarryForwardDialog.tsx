/**
 * Monday carry-forward ritual dialog.
 *
 * Shown once per week (first launch of a new week) when the previous week
 * left goal-linked todos unfinished. The user decides each item's fate:
 *   Carry      → copied to this week's Monday
 *   Reschedule → copied to a chosen day this week
 *   Drop       → left behind in last week's record
 * Unlinked todos never appear here — week isolation stays the rule for them.
 *
 * Domain logic lives in utils/carryForward.ts; this component only renders
 * groups and collects decisions.
 */

import React, { useState, useCallback } from 'react';
import { ArrowRight, Target, RefreshCw } from 'lucide-react';
import type { CarryForwardGroup, CarryForwardCandidate, CarryForwardDecision } from '../utils/carryForward';

interface CarryForwardDialogProps {
  groups: CarryForwardGroup[];
  /** Days of the NEW week, for the reschedule picker. */
  weekDays: { dateKey: string; label: string }[];
  onApply: (decisions: CarryForwardDecision[]) => void;
  onDismiss: () => void;
}

type ItemChoice = 'carry' | 'drop' | string; // string = reschedule target dateKey

function candidateKey(c: CarryForwardCandidate): string {
  const src = c.source.kind === 'daily' ? c.source.dateKey : c.source.section;
  return `${src}:${c.todo.id}`;
}

export const CarryForwardDialog: React.FC<CarryForwardDialogProps> = ({
  groups,
  weekDays,
  onApply,
  onDismiss,
}) => {
  const [choices, setChoices] = useState<Record<string, ItemChoice>>({});
  const allCandidates = groups.flatMap(g => g.items);

  const choiceFor = (c: CarryForwardCandidate): ItemChoice => choices[candidateKey(c)] ?? 'carry';

  const setChoice = useCallback((c: CarryForwardCandidate, choice: ItemChoice) => {
    setChoices(prev => ({ ...prev, [candidateKey(c)]: choice }));
  }, []);

  const setAll = useCallback((choice: ItemChoice) => {
    setChoices(Object.fromEntries(allCandidates.map(c => [candidateKey(c), choice])));
  }, [allCandidates]);

  const handleApply = useCallback(() => {
    const decisions: CarryForwardDecision[] = allCandidates.map(candidate => {
      const choice = choices[candidateKey(candidate)] ?? 'carry';
      return {
        candidate,
        action: choice === 'carry' ? 'carry' : choice === 'drop' ? 'drop' : { rescheduleTo: choice },
      };
    });
    onApply(decisions);
  }, [allCandidates, choices, onApply]);

  const carryCount = allCandidates.filter(c => choiceFor(c) !== 'drop').length;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
              <RefreshCw size={20} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest">New week</p>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Carry forward?</h2>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-3">
            These goal-linked tasks went unfinished last week. Decide their fate — everything
            else stays behind by design, so the new week starts clean.
          </p>
        </div>

        {/* Bulk actions */}
        <div className="px-6 md:px-8 pb-3 flex items-center gap-2">
          <button
            onClick={() => setAll('carry')}
            className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            Carry all
          </button>
          <button
            onClick={() => setAll('drop')}
            className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            Drop all
          </button>
        </div>

        {/* Grouped items */}
        <div className="px-6 md:px-8 overflow-y-auto flex-1 space-y-5 pb-4">
          {groups.map(group => (
            <div key={group.goalId}>
              <div className="flex items-center gap-1.5 mb-2">
                <Target size={13} className="text-indigo-500 shrink-0" />
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest truncate">
                  {group.goalText}
                </p>
              </div>
              <div className="space-y-2">
                {group.items.map(item => {
                  const choice = choiceFor(item);
                  const isDrop = choice === 'drop';
                  return (
                    <div
                      key={candidateKey(item)}
                      className={`flex flex-wrap items-center gap-2 md:gap-3 p-3 rounded-2xl border transition-colors ${
                        isDrop ? 'bg-slate-50 border-slate-100' : 'bg-blue-50/50 border-blue-100'
                      }`}
                    >
                      <div className="flex-1 min-w-[150px]">
                        <p className={`text-sm font-bold leading-snug ${isDrop ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {item.todo.text}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">from {item.sourceLabel}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={choice === 'drop' ? 'drop' : choice}
                          onChange={e => setChoice(item, e.target.value as ItemChoice)}
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
                        >
                          <option value="carry">Carry → Monday</option>
                          {weekDays.map(d => (
                            <option key={d.dateKey} value={d.dateKey}>Move → {d.label}</option>
                          ))}
                          <option value="drop">Drop</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 md:px-8 py-5 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onDismiss}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            Don't show this week
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl transition-colors"
          >
            {carryCount > 0 ? `Bring ${carryCount} into this week` : 'Start clean'}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
