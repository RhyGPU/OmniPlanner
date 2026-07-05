import React, { useState, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import type { WeekData } from '../types';
import { playAlarmSound, stopAlarmSound } from '../utils/soundSynth';

interface AlarmMissionOverlayProps {
  alarmData: {
    id: string;
    title: string;
    body: string;
    missionType: 'none' | 'math' | 'checklist' | 'theme';
    snoozeDuration: number;
    fadeInDuration: number;
    soundPreset?: 'chime' | 'beep' | 'pulse' | 'gentle' | 'custom';
  };
  currentWeek: WeekData;
  todayDateKey: string;
  focusTheme: string;
  onToggleTodo: (dateKey: string, todoId: string) => void;
  onSnooze: (snoozeMinutes: number) => void;
  onDismiss: () => void;
  customSoundData?: string;
}

export const AlarmMissionOverlay: React.FC<AlarmMissionOverlayProps> = ({
  alarmData,
  currentWeek,
  todayDateKey,
  focusTheme,
  onToggleTodo,
  onSnooze,
  onDismiss,
  customSoundData,
}) => {
  const { title, body, missionType, snoozeDuration, fadeInDuration, soundPreset } = alarmData;

  // Mission State
  const [missionComplete, setMissionComplete] = useState(false);

  // 1. Math Mission State
  const [mathStage, setMathStage] = useState(1);
  const [currentEqu, setCurrentEqu] = useState({ text: '12 + 15', answer: 27 });
  const [mathInput, setMathInput] = useState('');
  const [mathError, setMathError] = useState(false);

  // 2. Theme Mission State
  const [themeInput, setThemeInput] = useState('');
  const [themeError, setThemeError] = useState(false);

  // 3. Checklist Mission State
  const todayTodos = currentWeek.dailyPlans?.[todayDateKey]?.todos || [];
  const activeTodos = todayTodos.filter(t => !t.archived && !t.deletedAt);
  // Count how many items were completed since the alarm started
  const [completedCount, setCompletedCount] = useState(0);

  // Start alarm audio on mount using unified soundSynth
  useEffect(() => {
    playAlarmSound(soundPreset || 'chime', customSoundData, fadeInDuration);

    // Initialize Missions
    if (missionType === 'none') {
      setMissionComplete(true);
    } else if (missionType === 'math') {
      generateNewEquation();
    } else if (missionType === 'theme' && !focusTheme) {
      // Fallback if no focus theme is set
      setMissionComplete(true);
    }

    return () => {
      stopAlarmSound();
    };
  }, [missionType, focusTheme, soundPreset, customSoundData, fadeInDuration]);

  // Math equation generator
  const generateNewEquation = () => {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let num1 = 0;
    let num2 = 0;

    if (op === '+') {
      num1 = Math.floor(Math.random() * 70) + 10;
      num2 = Math.floor(Math.random() * 70) + 10;
    } else if (op === '-') {
      num1 = Math.floor(Math.random() * 80) + 20;
      num2 = Math.floor(Math.random() * (num1 - 5)) + 5;
    } else {
      num1 = Math.floor(Math.random() * 9) + 3;
      num2 = Math.floor(Math.random() * 9) + 3;
    }

    setCurrentEqu({
      text: `${num1} ${op} ${num2}`,
      answer: op === '+' ? num1 + num2 : op === '-' ? num1 - num2 : num1 * num2
    });
    setMathInput('');
    setMathError(false);
  };

  // Math submission handler
  const handleMathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ans = parseInt(mathInput.trim(), 10);
    if (ans === currentEqu.answer) {
      if (mathStage >= 3) {
        setMissionComplete(true);
      } else {
        setMathStage(prev => prev + 1);
        generateNewEquation();
      }
    } else {
      setMathError(true);
    }
  };

  // Focus theme submission
  const handleThemeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = themeInput.trim().toLowerCase();
    const cleanTheme = focusTheme.trim().toLowerCase();
    
    if (cleanInput === cleanTheme) {
      setMissionComplete(true);
    } else {
      setThemeError(true);
    }
  };

  // Checklist check-off toggle
  const handleTodoCheck = (todoId: string) => {
    const todo = activeTodos.find(t => t.id === todoId);
    const wasCompleted = todo?.done;
    onToggleTodo(todayDateKey, todoId);
    
    // If we just marked it as done, increment our completed session counter
    if (!wasCompleted) {
      const newCount = completedCount + 1;
      setCompletedCount(newCount);
      // Mission succeeds if you complete 2 items, OR complete all remaining items
      const remainingUnfinished = activeTodos.filter(t => !t.done).length;
      if (newCount >= 2 || remainingUnfinished <= 1) {
        setMissionComplete(true);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[9999] flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header indicator */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center shadow-lg shadow-orange-100 animate-bounce">
            <Bell size={32} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
            <p className="text-sm font-bold text-slate-400 mt-1">{body}</p>
          </div>
        </div>

        {/* Dynamic Mission Content Area */}
        <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-5 text-left">
          {missionType === 'math' && !missionComplete && (
            <form onSubmit={handleMathSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Brain Mission</span>
                <span className="text-xs font-black text-slate-400">Stage {mathStage} of 3</span>
              </div>
              <div className="text-3xl font-black text-slate-900 text-center tracking-tight my-2">
                {currentEqu.text} = ?
              </div>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="number"
                  placeholder="Your answer"
                  value={mathInput}
                  onChange={(e) => setMathInput(e.target.value)}
                  className={`flex-1 bg-white border rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-blue-500 transition-colors ${
                    mathError ? 'border-red-500 bg-red-50' : 'border-slate-200'
                  }`}
                />
                <button
                  type="submit"
                  className="bg-slate-900 text-white font-black text-xs uppercase tracking-widest px-6 rounded-2xl hover:bg-slate-800 transition-colors"
                >
                  Verify
                </button>
              </div>
              {mathError && (
                <div className="text-[10px] font-bold text-red-500 text-center">Incorrect answer. Engage your brain!</div>
              )}
            </form>
          )}

          {missionType === 'theme' && !missionComplete && (
            <form onSubmit={handleThemeSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Theme Mission</span>
                <span className="text-[10px] font-bold text-slate-400">Type today's Focus Theme</span>
              </div>
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-600 text-center leading-relaxed">
                "{focusTheme}"
              </div>
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Type focus theme here..."
                  value={themeInput}
                  onChange={(e) => setThemeInput(e.target.value)}
                  className={`w-full bg-white border rounded-2xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-blue-500 transition-colors ${
                    themeError ? 'border-red-500 bg-red-50' : 'border-slate-200'
                  }`}
                />
                <button
                  type="submit"
                  className="bg-slate-900 text-white font-black text-xs uppercase tracking-widest py-3 rounded-2xl hover:bg-slate-800 transition-colors"
                >
                  Verify Theme
                </button>
              </div>
              {themeError && (
                <div className="text-[10px] font-bold text-red-500 text-center">Must match exactly. Stay focused!</div>
              )}
            </form>
          )}

          {missionType === 'checklist' && !missionComplete && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Checklist Mission</span>
                <span className="text-xs font-black text-slate-400">Complete {2 - completedCount} more tasks</span>
              </div>
              
              {activeTodos.length === 0 ? (
                <div className="text-center py-4 text-xs font-bold text-slate-400 leading-relaxed">
                  No daily tasks found to check off! Click "Dismiss" below.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {activeTodos.map(todo => (
                    <div
                      key={todo.id}
                      onClick={() => !todo.done && handleTodoCheck(todo.id)}
                      className={`border rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${
                        todo.done
                          ? 'border-emerald-100 bg-emerald-50 text-emerald-800 opacity-60'
                          : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                        todo.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {todo.done && <Check size={10} />}
                      </div>
                      <span className="text-xs font-bold truncate flex-1">{todo.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {missionComplete && (
            <div className="flex flex-col items-center justify-center text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check size={24} className="text-emerald-600" />
              </div>
              <div>
                <div className="text-sm font-black text-slate-800">Mission Cleared!</div>
                <div className="text-[10px] font-bold text-slate-400 mt-0.5">Brain is awake and focus achieved.</div>
              </div>
            </div>
          )}
        </div>

        {/* Buttons / Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => onSnooze(snoozeDuration)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest py-4 rounded-2xl transition-colors active:scale-95"
          >
            Snooze ({snoozeDuration}m)
          </button>
          
          <button
            onClick={onDismiss}
            disabled={!missionComplete && activeTodos.length > 0}
            className={`flex-1 font-black text-xs uppercase tracking-widest py-4 rounded-2xl transition-all active:scale-95 shadow-lg ${
              missionComplete || activeTodos.length === 0
                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-100'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            Dismiss
          </button>
        </div>
        
      </div>
    </div>
  );
};
