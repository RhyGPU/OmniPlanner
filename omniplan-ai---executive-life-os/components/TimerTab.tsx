import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Trash2, Clock, Plus, AlertCircle, X } from 'lucide-react';
import { playAlarmSound, stopAlarmSound } from '../utils/soundSynth';

interface ActiveTimer {
  id: string;
  label: string;
  totalDurationMs: number;
  remainingMs: number;
  running: boolean;
}

export const TimerTab: React.FC = () => {
  const [timers, setTimers] = useState<ActiveTimer[]>(() => {
    try {
      const saved = localStorage.getItem('omni_active_timers');
      if (saved) {
        // Restore but pause all on startup for safety
        const list: ActiveTimer[] = JSON.parse(saved);
        return list.map(t => ({ ...t, running: false }));
      }
    } catch (_) {}
    return [];
  });

  // Custom Input State
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(5); // Default 5 mins
  const [seconds, setSeconds] = useState(0);
  const [label, setLabel] = useState('');

  // Ringing Timer State (Modal Overlay)
  const [ringingTimer, setRingingTimer] = useState<ActiveTimer | null>(null);

  // Sync timers to localStorage
  useEffect(() => {
    localStorage.setItem('omni_active_timers', JSON.stringify(timers));
  }, [timers]);

  // Main Ticker Effect
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        let updated = false;
        const nextList = prev.map(t => {
          if (!t.running) return t;
          updated = true;
          const nextRemaining = Math.max(0, t.remainingMs - 100);
          
          if (nextRemaining === 0) {
            // Timer expired! Trigger sound & notification
            t.running = false;
            triggerTimerEnd(t);
          }

          return { ...t, remainingMs: nextRemaining };
        });
        return updated ? nextList : prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const triggerTimerEnd = (timer: ActiveTimer) => {
    setRingingTimer(timer);
    
    // Play synthesizer alarm ring
    playAlarmSound('chime', undefined, 0);

    // Fire desktop toast notification
    if (typeof window !== 'undefined' && window.electronAPI?.notificationShow) {
      window.electronAPI.notificationShow('Timer Completed', `"${timer.label || 'Timer'}" has finished!`);
    }
  };

  const handleStopRinging = () => {
    stopAlarmSound();
    setRingingTimer(null);
  };

  const handleAddTimer = () => {
    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    if (totalMs <= 0) return;

    const newTimer: ActiveTimer = {
      id: Date.now().toString(),
      label: label.trim() || `Timer (${hours}h ${minutes}m ${seconds}s)`,
      totalDurationMs: totalMs,
      remainingMs: totalMs,
      running: true,
    };

    setTimers([...timers, newTimer]);
    setLabel('');
    setHours(0);
    setMinutes(5);
    setSeconds(0);
  };

  const handleToggleTimer = (id: string) => {
    setTimers(timers.map(t => t.id === id ? { ...t, running: !t.running } : t));
  };

  const handleResetTimer = (id: string) => {
    setTimers(timers.map(t => t.id === id ? { ...t, remainingMs: t.totalDurationMs, running: false } : t));
  };

  const handleDeleteTimer = (id: string) => {
    setTimers(timers.filter(t => t.id !== id));
  };

  // Helper to format remaining time
  const formatTime = (ms: number) => {
    const totalSecs = Math.ceil(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4 select-none relative">
      
      {/* Ringing Modal overlay */}
      {ringingTimer && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-200 p-6 max-w-sm w-full text-center shadow-2xl space-y-4 animate-bounce">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-500">
              <Clock size={28} className="animate-spin" />
            </div>
            <div>
              <h4 className="text-lg font-black text-slate-800">Timer Finished</h4>
              <p className="text-xs font-bold text-slate-400 mt-0.5">"{ringingTimer.label}"</p>
            </div>
            <button
              onClick={handleStopRinging}
              className="w-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl shadow-lg shadow-red-100"
            >
              Stop Sound
            </button>
          </div>
        </div>
      )}

      {/* Timer Creator Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Create Countdown</div>
        
        {/* Custom Hour / Minute / Second Wheels */}
        <div className="flex justify-center items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4">
          <div className="text-center">
            <input
              type="number"
              min={0}
              max={23}
              value={hours}
              onChange={(e) => setHours(Math.max(0, Math.min(23, parseInt(e.target.value || '0', 10))))}
              className="w-12 bg-white border border-slate-200 rounded-xl py-1 text-center text-sm font-black focus:outline-none focus:border-blue-500"
            />
            <span className="text-[8px] font-black uppercase text-slate-400 block mt-1">Hours</span>
          </div>
          <span className="font-bold text-slate-400 text-lg mb-4">:</span>
          <div className="text-center">
            <input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10))))}
              className="w-12 bg-white border border-slate-200 rounded-xl py-1 text-center text-sm font-black focus:outline-none focus:border-blue-500"
            />
            <span className="text-[8px] font-black uppercase text-slate-400 block mt-1">Mins</span>
          </div>
          <span className="font-bold text-slate-400 text-lg mb-4">:</span>
          <div className="text-center">
            <input
              type="number"
              min={0}
              max={59}
              value={seconds}
              onChange={(e) => setSeconds(Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10))))}
              className="w-12 bg-white border border-slate-200 rounded-xl py-1 text-center text-sm font-black focus:outline-none focus:border-blue-500"
            />
            <span className="text-[8px] font-black uppercase text-slate-400 block mt-1">Secs</span>
          </div>
        </div>

        {/* Input Label & Add Button */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Timer Label (e.g. Pasta)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={handleAddTimer}
            disabled={hours === 0 && minutes === 0 && seconds === 0}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-black text-xs uppercase tracking-wider px-4 rounded-xl transition-colors flex items-center gap-1 active:scale-95"
          >
            <Plus size={14} />
            Start
          </button>
        </div>

        {/* Quick Presets */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { label: '1 Min', h: 0, m: 1, s: 0 },
            { label: '3 Min', h: 0, m: 3, s: 0 },
            { label: '5 Min', h: 0, m: 5, s: 0 },
            { label: '10 Min', h: 0, m: 10, s: 0 },
            { label: '15 Min', h: 0, m: 15, s: 0 },
            { label: '30 Min', h: 0, m: 30, s: 0 },
          ].map(p => (
            <button
              key={p.label}
              onClick={() => {
                setHours(p.h);
                setMinutes(p.m);
                setSeconds(p.s);
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-2.5 py-1 text-[10px] font-black tracking-wide uppercase transition-colors shrink-0"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Timers List */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Active Countdowns</h3>
        {timers.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center text-xs text-slate-400">
            No countdown timers currently active.
          </div>
        ) : (
          <div className="space-y-2">
            {timers.map((t) => {
              const progress = t.totalDurationMs > 0 ? (t.remainingMs / t.totalDurationMs) * 100 : 0;
              return (
                <div key={t.id} className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2.5 shadow-sm relative overflow-hidden">
                  {/* Progress Line */}
                  <div
                    style={{ width: `${progress}%` }}
                    className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-100"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-800 truncate">{t.label}</div>
                      <div className="text-2xl font-black font-mono tracking-tight text-slate-700 mt-0.5">
                        {formatTime(t.remainingMs)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleTimer(t.id)}
                        className={`p-2 rounded-xl transition-colors ${
                          t.running ? 'bg-amber-50 hover:bg-amber-100 text-amber-600' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        {t.running ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={() => handleResetTimer(t.id)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl transition-colors"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteTimer(t.id)}
                        className="p-2 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
