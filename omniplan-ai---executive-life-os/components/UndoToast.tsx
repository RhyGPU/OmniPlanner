import React, { useEffect, useRef } from 'react';
import { Undo2, X } from 'lucide-react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number; // ms, default 5000
}

export const UndoToast: React.FC<UndoToastProps> = ({ message, onUndo, onDismiss, duration = 5000 }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [duration, onDismiss]);

  const handleUndo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndo();
  };

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onDismiss();
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700 max-w-md">
        <span className="text-sm font-semibold flex-1">{message}</span>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs uppercase tracking-wider transition-colors shrink-0"
        >
          <Undo2 size={14} />
          Undo
        </button>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white transition-colors shrink-0 p-1"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
