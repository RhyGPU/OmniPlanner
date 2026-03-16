
import React, { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';

interface AlertDialogProps {
  message: string;
  onClose: () => void;
}

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({ message, onClose }) => {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    btnRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-200">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <AlertCircle size={20} className="text-amber-600" />
          </div>
          <p className="text-sm font-bold text-slate-700 leading-relaxed pt-2 whitespace-pre-wrap">{message}</p>
        </div>
        <button
          ref={btnRef}
          onClick={onClose}
          className="w-full bg-slate-900 text-white font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-700 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onKeyDown={e => e.key === 'Escape' && onCancel()}
    >
      <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-200">
        <div className="flex items-start gap-4 mb-5">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle size={20} className={danger ? 'text-red-600' : 'text-amber-600'} />
          </div>
          <p className="text-sm font-bold text-slate-700 leading-relaxed pt-2 whitespace-pre-wrap">{message}</p>
        </div>
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 bg-slate-100 text-slate-700 font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-white font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest transition-colors ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
