
import React from 'react';
import { Mail, Calendar as CalendarIcon, Clock, Target, Settings, Save, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Tab } from '../types';

interface SidebarProps {
  emailsCount: number;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onQuickSave: () => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

const NavButton = ({ id, icon, label, count, activeTab, setActiveTab }: {
  id: Tab,
  icon: React.ReactNode,
  label: string,
  count?: number,
  activeTab: Tab,
  setActiveTab: (tab: Tab) => void
}) => (
  <button
    onClick={() => setActiveTab(id)}
    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
      activeTab === id
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-semibold'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`}
  >
    <div className="flex-shrink-0">{icon}</div>
    <span className="hidden md:block flex-1 text-left">{label}</span>
    {count !== undefined && count > 0 && (
      <span className="hidden md:flex h-5 w-5 bg-red-500 rounded-full text-[10px] items-center justify-center font-bold text-white">
        {count}
      </span>
    )}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ emailsCount, activeTab, setActiveTab, onQuickSave, zoomPercent, onZoomIn, onZoomOut, onZoomReset }) => {
  return (
    <div className="w-20 md:w-64 bg-slate-900 text-white flex flex-col h-full flex-shrink-0 transition-all duration-300 z-20 border-r border-slate-800">
      <div className="p-6 flex items-center justify-center md:justify-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <span className="text-white font-black text-xl italic">O</span>
        </div>
        <span className="hidden md:block font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
          OmniPlan
        </span>
      </div>

      <nav className="flex-1 mt-4 space-y-1.5 px-3">
        <NavButton activeTab={activeTab} setActiveTab={setActiveTab} id={Tab.Inbox} icon={<Mail size={20} />} label="Priority Inbox" count={emailsCount} />
        <NavButton activeTab={activeTab} setActiveTab={setActiveTab} id={Tab.Monthly} icon={<CalendarIcon size={20} />} label="Month View" />
        <NavButton activeTab={activeTab} setActiveTab={setActiveTab} id={Tab.Weekly} icon={<Clock size={20} />} label="Deep Planner" />
        <NavButton activeTab={activeTab} setActiveTab={setActiveTab} id={Tab.Goals} icon={<Target size={20} />} label="Life Vision" />

        <div className="pt-6 border-t border-slate-800 mt-6 space-y-1.5">
          <NavButton activeTab={activeTab} setActiveTab={setActiveTab} id={Tab.Data} icon={<Settings size={20} />} label="Settings & Data" />
          <button
            onClick={onQuickSave}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-emerald-400 hover:bg-emerald-950/30 hover:text-emerald-300 transition-all duration-200 mt-1"
          >
            <div className="flex-shrink-0"><Save size={20} /></div>
            <span className="hidden md:block flex-1 text-left font-medium">Auto-Backup</span>
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-800 hidden md:block space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Zoom</span>
          <span className="text-[10px] text-slate-400 font-mono font-bold">{zoomPercent}%</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onZoomOut} className="flex-1 flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all" title="Zoom Out (Ctrl -)">
            <ZoomOut size={14}/>
          </button>
          <button onClick={onZoomReset} className="flex-1 flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all" title="Reset Zoom (Ctrl 0)">
            <RotateCcw size={14}/>
          </button>
          <button onClick={onZoomIn} className="flex-1 flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all" title="Zoom In (Ctrl +)">
            <ZoomIn size={14}/>
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
           <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
           <span className="text-xs text-slate-500 font-medium">Real-time Sync Active</span>
        </div>
        <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Enterprise Edition</div>
      </div>
    </div>
  );
};
