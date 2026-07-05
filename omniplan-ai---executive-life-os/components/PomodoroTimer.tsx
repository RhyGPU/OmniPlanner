import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Timer, Flame, Coffee } from 'lucide-react';
import type { ActualEventLog } from '../types';
import { formatDateKey } from '../constants';

interface PomodoroTimerProps {
  onLogActual: (log: ActualEventLog) => void;
  mode: TimerMode;
  setMode: (mode: TimerMode) => void;
  duration: number;
  setDuration: (dur: number) => void;
  timeLeft: number;
  setTimeLeft: React.Dispatch<React.SetStateAction<number>>;
  isRunning: boolean;
  setIsRunning: (run: boolean) => void;
}

type TimerMode = 'focus' | 'break';

function playChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Play a friendly two-tone rising chime (A5 -> E6)
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.3); // A5
    playTone(1320, now + 0.15, 0.4); // E6
  } catch (_) {
    // Audio Context blocked or unsupported
  }
}

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, mode, duration]);

  const handleTimerComplete = () => {
    setIsRunning(false);
    playChime();

    if (mode === 'focus') {
      // Log the completed focus session as an actual event
      const now = new Date();
      const actualEndHour = now.getHours() + now.getMinutes() / 60;
      const durationHours = duration / 3600;
      const actualStartHour = Math.max(0, actualEndHour - durationHours);
      const dateKey = formatDateKey(now);

      const log: ActualEventLog = {
        id: `actual-pomodoro-${Date.now()}`,
        title: `Focus Session (${Math.round(duration / 60)}m)`,
        dateKey,
        scheduledHour: Math.floor(actualStartHour),
        actualStartHour,
        actualEndHour,
        source: 'manual',
        attended: true,
        snoozedCount: 0,
        loggedAt: Date.now(),
      };
      
      onLogActual(log);
    }

    // Auto-switch modes
    if (mode === 'focus') {
      setMode('break');
      setDuration(5 * 60); // 5m break
      setTimeLeft(5 * 60);
    } else {
      setMode('focus');
      setDuration(25 * 60); // 25m focus
      setTimeLeft(25 * 60);
    }
  };

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(duration);
  };

  const selectPreset = (minutes: number, newMode: TimerMode) => {
    setIsRunning(false);
    setMode(newMode);
    setDuration(minutes * 60);
    setTimeLeft(minutes * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = ((duration - timeLeft) / duration) * 100;

  return (
    <div className="bg-slate-850 border border-slate-700/60 rounded-2xl p-4 space-y-3.5 shadow-lg relative overflow-hidden transition-all">
      {/* Background progress indicator (very subtle overlay) */}
      <div 
        className="absolute left-0 bottom-0 top-0 bg-blue-600/5 transition-all duration-300 pointer-events-none"
        style={{ width: `${progressPercent}%` }}
      />

      <div className="flex items-center justify-between relative z-10">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          {mode === 'focus' ? (
            <><Flame size={12} className="text-orange-400 fill-orange-400"/> Focus Session</>
          ) : (
            <><Coffee size={12} className="text-emerald-400"/> Break Time</>
          )}
        </span>
        <span className="text-[10px] font-mono font-bold text-slate-500">
          {mode === 'focus' ? `${Math.round(duration / 60)}m` : 'Break'}
        </span>
      </div>

      <div className="text-center relative z-10">
        <div className="text-3xl font-black font-mono tracking-tight text-white mb-2 leading-none">
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Preset Pickers */}
      <div className="grid grid-cols-4 gap-1 relative z-10">
        {[
          { min: 25, label: '25m', mode: 'focus' as TimerMode },
          { min: 50, label: '50m', mode: 'focus' as TimerMode },
          { min: 5, label: '5m', mode: 'break' as TimerMode },
          { min: 15, label: '15m', mode: 'break' as TimerMode },
        ].map((p, i) => (
          <button
            key={i}
            onClick={() => selectPreset(p.min, p.mode)}
            className={`py-1 rounded-lg text-[9px] font-black transition-all ${
              duration === p.min * 60 && mode === p.mode
                ? 'bg-blue-600 text-white shadow shadow-blue-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 relative z-10">
        <button
          onClick={toggleTimer}
          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
            isRunning
              ? 'bg-amber-600 hover:bg-amber-700 text-white shadow shadow-amber-600/25'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow shadow-blue-600/25'
          }`}
        >
          {isRunning ? (
            <><Pause size={12} strokeWidth={3}/> Pause</>
          ) : (
            <><Play size={12} strokeWidth={3} className="fill-white"/> Start</>
          )}
        </button>
        <button
          onClick={resetTimer}
          title="Reset Session"
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center border border-slate-700/50"
        >
          <RotateCcw size={12} strokeWidth={3}/>
        </button>
      </div>
    </div>
  );
};
