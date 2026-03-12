
import React, { useState } from 'react';
import { Target, Flag, Rocket, Compass, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { LifeGoals } from '../types';
import { SHORT_MONTHS } from '../constants';

interface GoalsViewProps {
  lifeGoals: LifeGoals;
  setLifeGoals: React.Dispatch<React.SetStateAction<LifeGoals>>;
}

export const GoalsView: React.FC<GoalsViewProps> = ({ lifeGoals, setLifeGoals }) => {
    const [tab, setTab] = useState<'10' | '5' | '3' | '1'>('5');
    const currentYear = new Date().getFullYear();

    const [baseYears, setBaseYears] = useState<Record<string, number>>(() => {
        const saved = localStorage.getItem('omni_goals_base_years');
        return saved ? JSON.parse(saved) : { '10': currentYear, '5': currentYear, '3': currentYear };
    });

    const updateBaseYear = (period: string, delta: number) => {
        setBaseYears(prev => {
            const updated = { ...prev, [period]: (prev[period] || currentYear) + delta };
            localStorage.setItem('omni_goals_base_years', JSON.stringify(updated));
            return updated;
        });
    };

    const getBaseYear = (period: string) => baseYears[period] || currentYear;

    const updateGoal = (period: '10'|'5'|'3'|'1', key: string, value: string, field: string | null = null) => {
        setLifeGoals(prev => {
            const newGoals = JSON.parse(JSON.stringify(prev)); // Deep clone
            if (field) {
                if (!newGoals[period][key]) newGoals[period][key] = {};
                newGoals[period][key][field] = value;
            } else {
                newGoals[period][key] = value;
            }
            return newGoals;
        });
    };

    const YearNav = ({ period, count }: { period: string; count: number }) => (
        <div className="flex items-center gap-2 ml-4">
            <button onClick={() => updateBaseYear(period, -count)} className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 transition-all">
                <ChevronLeft size={14}/>
            </button>
            <span className="text-xs font-bold text-slate-500 min-w-[80px] text-center">
                {getBaseYear(period)}–{getBaseYear(period) + count - 1}
            </span>
            <button onClick={() => updateBaseYear(period, count)} className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 transition-all">
                <ChevronRight size={14}/>
            </button>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-white p-10 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Target className="text-blue-600" size={32} strokeWidth={2.5}/>
                        <span className="text-sm font-black text-blue-600 uppercase tracking-[0.2em]">Strategy Engine</span>
                    </div>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Life Vision Board</h2>
                </div>
                <div className="flex items-center">
                    <div className="flex bg-slate-100 rounded-2xl p-1.5 gap-1.5 shadow-inner">
                        {[
                            { id: '10', icon: <Compass size={16}/>, label: 'Horizon' },
                            { id: '5', icon: <Rocket size={16}/>, label: 'Trajectory' },
                            { id: '3', icon: <Flag size={16}/>, label: 'Milestones' },
                            { id: '1', icon: <Sparkles size={16}/>, label: 'Focus' }
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id as any)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all duration-200 ${
                                    tab === t.id ? 'bg-white text-slate-900 shadow-xl shadow-slate-200/50' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                {t.icon}
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>
                    {tab !== '1' && <YearNav period={tab} count={tab === '10' ? 10 : tab === '5' ? 5 : 3} />}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-10">
                {tab === '10' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-6 duration-400">
                        {Array.from({length: 10}, (_, i) => getBaseYear('10') + i).map(year => (
                            <div key={year} className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex flex-col gap-4 group hover:bg-blue-50/30 hover:border-blue-100 transition-all duration-300">
                                <div className="text-3xl font-black text-blue-600 tracking-tighter group-hover:scale-110 transition-transform origin-left">{year}</div>
                                <textarea
                                    className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-sm font-semibold h-40 resize-none focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm"
                                    placeholder="Define the ultimate outcome for this decade mark..."
                                    value={lifeGoals['10']?.[year] || ''}
                                    onChange={e => updateGoal('10', year.toString(), e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {tab === '5' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-400">
                        {Array.from({length: 5}, (_, i) => getBaseYear('5') + i).map(year => (
                            <div key={year} className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50 p-10 rounded-3xl border border-slate-100 hover:shadow-2xl hover:shadow-slate-200/50 transition-all">
                                <div className="md:col-span-2">
                                    <div className="text-4xl font-black text-slate-900 tracking-tighter">{year}</div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Strategic Path</div>
                                </div>
                                <div className="md:col-span-5">
                                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 block">Primary Objective</label>
                                    <textarea
                                        className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-sm font-semibold h-40 resize-none focus:ring-4 focus:ring-blue-100"
                                        placeholder="What is the core target for this year?"
                                        value={lifeGoals['5']?.[year]?.goal || ''}
                                        onChange={e => updateGoal('5', year.toString(), e.target.value, 'goal')}
                                    />
                                </div>
                                <div className="md:col-span-5">
                                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3 block">Operational Steps</label>
                                    <textarea
                                        className="w-full bg-white border border-slate-200 rounded-2xl p-5 text-sm font-semibold h-40 resize-none focus:ring-4 focus:ring-emerald-100"
                                        placeholder="Specific actions to reach the objective..."
                                        value={lifeGoals['5']?.[year]?.action || ''}
                                        onChange={e => updateGoal('5', year.toString(), e.target.value, 'action')}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {tab === '3' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-400">
                        {Array.from({length: 3}, (_, i) => getBaseYear('3') + i).map(year => (
                            <div key={year} className="p-2">
                                <h3 className="text-4xl font-black text-slate-900 mb-8 flex items-center gap-4">
                                    {year}
                                    <div className="h-0.5 flex-1 bg-slate-100"></div>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    {['Q1 & Q2 Focus', 'Q3 Focus', 'Q4 Expansion'].map((p, idx) => (
                                        <div key={idx} className="bg-white p-8 rounded-3xl border-2 border-slate-50 shadow-lg shadow-slate-100 flex flex-col gap-4">
                                            <div className="text-xs font-black text-blue-600 uppercase tracking-widest">{p}</div>
                                            <textarea
                                                className="w-full bg-slate-50 border border-transparent rounded-2xl p-5 text-sm font-bold h-48 resize-none focus:bg-white focus:border-blue-400 focus:outline-none transition-all"
                                                placeholder="Phase focus..."
                                                value={lifeGoals['3']?.[`${year}_${idx}`] || ''}
                                                onChange={e => updateGoal('3', `${year}_${idx}`, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {tab === '1' && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-6 duration-400">
                        {SHORT_MONTHS.map(month => (
                            <div key={month} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col h-64 gap-4">
                                <div className="text-lg font-black text-slate-900 border-b border-slate-200 pb-2">{month}</div>
                                <textarea
                                    className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-4 text-xs font-bold leading-relaxed resize-none focus:ring-4 focus:ring-blue-100 focus:outline-none transition-all"
                                    placeholder="Immediate results..."
                                    value={lifeGoals['1']?.[month] || ''}
                                    onChange={e => updateGoal('1', month, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
