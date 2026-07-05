import React, { useState } from 'react';
import { Play, Pause, RotateCcw, Flame, Coffee, Check, Sliders } from 'lucide-react';
import type { ActualEventLog } from '../types';

interface PomodoroTabProps {
  onLogActual: (log: ActualEventLog) => void;
  mode: 'focus' | 'break';
  setMode: (mode: 'focus' | 'break') => void;
  duration: number;
  setDuration: (dur: number) => void;
  timeLeft: number;
  setTimeLeft: React.Dispatch<React.SetStateAction<number>>;
  isRunning: boolean;
  setIsRunning: (run: boolean) => void;
}

export const PomodoroTab: React.FC<PomodoroTabProps> = ({
  onLogActual,
  mode,
  setMode,
  duration,
  setDuration,
  timeLeft,
  setTimeLeft,
  isRunning,
  setIsRunning,
}) => {
  const [customMins, setCustomMins] = useState(Math.round(duration / 60));

  const handleToggle = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(duration);
  };

  const handleSelectPreset = (minutes: number, newMode: 'focus' | 'break') => {
    setIsRunning(false);
    setMode(newMode);
    setDuration(minutes * 60);
    setTimeLeft(minutes * 60);
    setCustomMins(minutes);
  };

  const handleCustomDurationChange = (minutes: number) => {
    const minClamped = Math.max(1, Math.min(180, minutes));
    setCustomMins(minClamped);
    setIsRunning(false);
    setDuration(minClamped * 60);
    setTimeLeft(minClamped * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // SVG circular progress calculation
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = ((duration - timeLeft) / duration) * 100;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="space-y-4 select-none">
      
      {/* Circle Cockpit */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col items-center shadow-sm relative">
        <div className="relative w-56 h-56 flex items-center justify-center">
          
          {/* Radial SVG progress */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="112"
              cy="112"
              r={radius}
              className="stroke-slate-100 fill-none"
              strokeWidth="10"
            />
            <circle
              cx="112"
              cy="112"
              r={radius}
              className={`fill-none transition-all duration-300 ${
                mode === 'focus' ? 'stroke-blue-500' : 'stroke-emerald-500'
              }`}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>

          {/* Time & Mode Info inside circle */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1.5 justify-center mb-0.5">
              {mode === 'focus' ? (
                <Flame size={18} className="text-orange-400 fill-orange-400 animate-pulse" />
              ) : (
                <Coffee size={18} className="text-emerald-500 animate-pulse" />
              )}
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {mode === 'focus' ? 'Focusing' : 'Break'}
              </span>
            </div>
            
            <div className="text-4xl font-black font-mono tracking-tighter text-slate-800 leading-none">
              {formatTime(timeLeft)}
            </div>

            <div className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
              {Math.round(duration / 60)}m Session
            </div>
          </div>

        </div>

        {/* Play/Pause/Reset Controllers */}
        <div className="flex gap-3 mt-4 w-full max-w-xs">
          <button
            onClick={handleReset}
            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-2xl transition-colors active:scale-95 flex items-center justify-center gap-1"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          
          <button
            onClick={handleToggle}
            className={`flex-2 py-3 font-black text-xs uppercase tracking-widest rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-lg ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-100'
                : mode === 'focus'
                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-100'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-100'
            }`}
          >
            {isRunning ? <Pause size={14} /> : <Play size={14} />}
            {isRunning ? 'Pause' : 'Start'}
          </button>
        </div>
      </div>

      {/* Preset Selectors */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Quick Presets</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { min: 25, label: '25m Focus', mode: 'focus' as const },
            { min: 50, label: '50m Focus', mode: 'focus' as const },
            { min: 5, label: '5m Break', mode: 'break' as const },
            { min: 15, label: '15m Break', mode: 'break' as const },
          ].map(p => (
            <button
              key={p.label}
              onClick={() => handleSelectPreset(p.min, p.mode)}
              className={`py-2 rounded-xl text-xs font-black transition-all ${
                duration === p.min * 60 && mode === p.mode
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Duration Slider */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Custom Duration</span>
          <span className="text-xs font-black text-slate-700 font-mono">{customMins} Minutes</span>
        </div>
        <div className="flex items-center gap-4 py-2">
          <Sliders size={16} className="text-slate-400" />
          <input
            type="range"
            min="1"
            max="120"
            value={customMins}
            onChange={(e) => handleCustomDurationChange(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
          />
        </div>
      </div>

    </div>
  );
};
