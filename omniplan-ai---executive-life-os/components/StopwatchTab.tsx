import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Flag, Trophy } from 'lucide-react';

interface LapItem {
  lapIndex: number;
  lapTimeMs: number;
  overallTimeMs: number;
}

export const StopwatchTab: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [laps, setLaps] = useState<LapItem[]>([]);

  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (running) {
      const startRealTime = Date.now() - timeElapsed;
      const tick = () => {
        setTimeElapsed(Date.now() - startRealTime);
        requestRef.current = requestAnimationFrame(tick);
      };
      requestRef.current = requestAnimationFrame(tick);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [running]);

  const handleStartPause = () => {
    setRunning(!running);
  };

  const handleReset = () => {
    setRunning(false);
    setTimeElapsed(0);
    setLaps([]);
  };

  const handleLap = () => {
    const overallTime = timeElapsed;
    const previousLapsTotal = laps.reduce((acc, curr) => acc + curr.lapTimeMs, 0);
    const lapTime = overallTime - previousLapsTotal;

    const newLap: LapItem = {
      lapIndex: laps.length + 1,
      lapTimeMs: lapTime,
      overallTimeMs: overallTime,
    };

    setLaps([newLap, ...laps]);
  };

  // Helper to format time to MM:SS.CC
  const formatStopwatch = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const centis = Math.floor((ms % 1000) / 10);

    const minsStr = mins.toString().padStart(2, '0');
    const secsStr = secs.toString().padStart(2, '0');
    const centisStr = centis.toString().padStart(2, '0');

    return `${minsStr}:${secsStr}.${centisStr}`;
  };

  // Identify fastest and slowest laps
  const getLapHighlight = (lap: LapItem) => {
    if (laps.length < 2) return '';
    const lapTimes = laps.map(l => l.lapTimeMs);
    const min = Math.min(...lapTimes);
    const max = Math.max(...lapTimes);

    if (lap.lapTimeMs === min) return 'text-emerald-500 font-black';
    if (lap.lapTimeMs === max) return 'text-red-500 font-black';
    return 'text-slate-600 font-bold';
  };

  return (
    <div className="space-y-4 select-none">
      
      {/* Stopwatch Giant Timer Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden">
        <Trophy size={80} className="absolute -left-4 -bottom-4 text-slate-700/20 pointer-events-none" />
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Stopwatch</div>
        <div className="text-5xl font-black font-mono tracking-tighter mt-2 leading-none">
          {formatStopwatch(timeElapsed)}
        </div>
        <div className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
          Minutes : Seconds . Centiseconds
        </div>
      </div>

      {/* Buttons / Controls */}
      <div className="flex gap-3">
        <button
          onClick={handleReset}
          disabled={timeElapsed === 0}
          className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl transition-colors active:scale-95 flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={14} />
          Reset
        </button>

        {running && (
          <button
            onClick={handleLap}
            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl transition-colors active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Flag size={14} />
            Lap
          </button>
        )}

        <button
          onClick={handleStartPause}
          className={`flex-1 font-black text-xs uppercase tracking-widest py-3.5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-lg ${
            running
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-100'
              : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-100'
          }`}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : 'Start'}
        </button>
      </div>

      {/* Laps List */}
      <div className="space-y-2">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 font-sans">Laps Record</h3>
          {laps.length > 1 && (
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
              🟢 Fastest / 🔴 Slowest
            </span>
          )}
        </div>

        {laps.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center text-xs text-slate-400">
            No laps recorded yet. Press "Lap" while running.
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto shadow-sm">
            {laps.map((lap) => (
              <div key={lap.lapIndex} className="p-3 flex items-center justify-between text-xs font-mono">
                <span className="font-sans font-black text-slate-400">Lap {lap.lapIndex}</span>
                <span className={getLapHighlight(lap)}>+{formatStopwatch(lap.lapTimeMs)}</span>
                <span className="text-slate-500">{formatStopwatch(lap.overallTimeMs)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
