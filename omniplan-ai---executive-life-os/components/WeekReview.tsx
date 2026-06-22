/**
 * Week Review Summary Component — Phase 2.
 *
 * Shows plan-vs-actual comparison for the week.
 * Embedded in the WeeklyPlannerView as a collapsible "Week Review" panel.
 */

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Moon, Zap, CheckCircle, XCircle, AlertTriangle, Award, Target } from 'lucide-react';
import type { WeekData } from '../types';
import { compareWeek, type WeekComparison } from '../utils/planVsActual';

interface WeekReviewProps {
  weekData: WeekData;
}

export const WeekReview: React.FC<WeekReviewProps> = ({ weekData }) => {
  const comparison: WeekComparison | null = useMemo(() => {
    try {
      return compareWeek(weekData);
    } catch (e) {
      console.error('[WeekReview] comparison failed:', e);
      return null;
    }
  }, [weekData]);

  if (!comparison) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/50 p-4 lg:p-6">
        <div className="text-xs text-slate-400 text-center">Week review unavailable</div>
      </div>
    );
  }

  const { summary } = comparison;

  const adherenceColor = summary.overallAdherence >= 70
    ? 'text-emerald-600'
    : summary.overallAdherence >= 40
      ? 'text-amber-600'
      : 'text-red-600';

  const adherenceBg = summary.overallAdherence >= 70
    ? 'bg-emerald-50 border-emerald-200'
    : summary.overallAdherence >= 40
      ? 'bg-amber-50 border-amber-200'
      : 'bg-red-50 border-red-200';

  return (
    <div className="border-t border-slate-200 bg-slate-50/50 p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-indigo-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Week Review — Plan vs Actual</span>
        </div>
        <div className={`px-3 py-1 rounded-full border text-xs font-black ${adherenceBg} ${adherenceColor}`}>
          {summary.overallAdherence}% adherence
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Events */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <Zap size={12} className="text-blue-500" />
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Events</span>
          </div>
          <div className="text-lg font-black text-slate-900">
            {summary.totalAttendedEvents}/{summary.totalPlannedEvents}
          </div>
          <div className="text-[10px] text-slate-500">
            {summary.totalMissedEvents > 0 && (
              <span className="text-red-500 font-bold">{summary.totalMissedEvents} missed</span>
            )}
            {summary.totalUnplannedEvents > 0 && (
              <span className="text-amber-500 font-bold ml-1">{summary.totalUnplannedEvents} unplanned</span>
            )}
          </div>
        </div>

        {/* Habits */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle size={12} className="text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Habits</span>
          </div>
          <div className="text-lg font-black text-slate-900">
            {summary.habitCompletionRate}%
          </div>
          <div className="text-[10px] text-slate-500">
            completion rate
          </div>
        </div>

        {/* Sleep */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <Moon size={12} className="text-indigo-500" />
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Sleep</span>
          </div>
          <div className="text-lg font-black text-slate-900">
            {summary.avgSleepDebt > 0 ? (
              <span className="text-red-500">-{summary.avgSleepDebt}h</span>
            ) : (
              <span className="text-emerald-600">On track</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500">
            avg sleep debt
          </div>
        </div>

        {/* Todos */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={12} className="text-purple-500" />
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Todos</span>
          </div>
          <div className="text-lg font-black text-slate-900">
            {comparison.days.reduce((s, d) => s + d.todos.completed, 0)}/{comparison.days.reduce((s, d) => s + d.todos.planned, 0)}
          </div>
          <div className="text-[10px] text-slate-500">
            completed
          </div>
        </div>
      </div>

      {/* Top gap and win */}
      <div className="flex gap-3">
        <div className="flex-1 bg-white rounded-xl border border-red-100 p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-wider text-red-400 mb-0.5">Biggest Gap</div>
            <div className="text-xs font-bold text-slate-700">{summary.topGap}</div>
          </div>
        </div>
        <div className="flex-1 bg-white rounded-xl border border-emerald-100 p-3 flex items-start gap-2">
          <Award size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-wider text-emerald-400 mb-0.5">Biggest Win</div>
            <div className="text-xs font-bold text-slate-700">{summary.topWin}</div>
          </div>
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="space-y-2">
        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 px-1">Daily Breakdown</div>
        <div className="grid grid-cols-7 gap-1">
          {comparison.days.map((day) => {
            const date = new Date(day.dateKey + 'T00:00:00');
            const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
            const dayName = dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1];
            const hasActuals = weekData.dailyPlans[day.dateKey]?.actuals;

            return (
              <div
                key={day.dateKey}
                className={`rounded-lg p-2 text-center border ${
                  day.adherenceScore >= 70
                    ? 'bg-emerald-50 border-emerald-200'
                    : day.adherenceScore >= 40
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="text-[9px] font-black text-slate-500 mb-1">{dayName}</div>
                <div className={`text-sm font-black ${
                  day.adherenceScore >= 70 ? 'text-emerald-700' : day.adherenceScore >= 40 ? 'text-amber-700' : 'text-red-700'
                }`}>
                  {hasActuals ? `${day.adherenceScore}%` : '—'}
                </div>
                {hasActuals && (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-[8px] text-slate-500">
                      {day.events.attended}/{day.events.planned} evt
                    </div>
                    <div className="text-[8px] text-slate-500">
                      {day.todos.completed}/{day.todos.planned} td
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
