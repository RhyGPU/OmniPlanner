
import React from 'react';
import { X, Target } from 'lucide-react';
import { CalendarEventKind, GoalItem } from '../types';
import { formatHour, generateTimeSlots } from '../constants';

export interface EventEditorState {
  dateKey: string;
  id?: string;
  title: string;
  startHour: string | number;
  duration: string | number;
  isNew: boolean;
  repeating: boolean;
  eventKind?: CalendarEventKind;
  parentGoalId?: string;
  linkedTodoId?: string;
}

interface CalendarEventEditorProps {
  eventEditor: EventEditorState;
  onChange: (state: EventEditorState) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete: () => void;
  goalItems: GoalItem[];
}

const EVENT_KINDS: { id: CalendarEventKind; label: string; activeClass: string }[] = [
  { id: 'meeting',    label: 'Meeting',  activeClass: 'bg-blue-100 text-blue-700' },
  { id: 'focus',      label: 'Focus',    activeClass: 'bg-purple-100 text-purple-700' },
  { id: 'task_block', label: 'Task',     activeClass: 'bg-indigo-100 text-indigo-700' },
  { id: 'routine',    label: 'Routine',  activeClass: 'bg-slate-100 text-slate-600' },
];

export const CalendarEventEditor: React.FC<CalendarEventEditorProps> = ({
  eventEditor, onChange, onSave, onClose, onDelete, goalItems,
}) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-200">
        <div className="flex justify-between items-center mb-5">
           <h3 className="text-xl font-black text-slate-900">{eventEditor.isNew ? 'New Block' : 'Edit Block'}</h3>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 -mr-1"><X size={24}/></button>
        </div>
        <div className="space-y-5">
          {/* Block type */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Block Type</label>
            <div className="flex gap-1.5">
              {EVENT_KINDS.map(k => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onChange({ ...eventEditor, eventKind: k.id })}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    (eventEditor.eventKind ?? 'focus') === k.id
                      ? k.activeClass
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Description</label>
            <input autoFocus className="w-full border border-slate-200 rounded-xl p-3.5 text-sm font-bold bg-slate-50" value={eventEditor.title} onChange={e => onChange({...eventEditor, title: e.target.value})} placeholder="Title..." />
          </div>
          {/* Linked goal context — shown when pre-filled from a suggestion */}
          {eventEditor.parentGoalId && (() => {
            const g = goalItems.find(gi => gi.id === eventEditor.parentGoalId);
            return g ? (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                <Target size={12} className="text-purple-500 flex-shrink-0"/>
                <span className="text-[11px] font-bold text-purple-700 truncate">{g.text || '(untitled goal)'}</span>
                <button
                  type="button"
                  onClick={() => onChange({ ...eventEditor, parentGoalId: undefined, linkedTodoId: undefined })}
                  className="ml-auto text-purple-400 hover:text-purple-600 flex-shrink-0"
                >
                  <X size={12}/>
                </button>
              </div>
            ) : null;
          })()}
          <div className="grid grid-cols-1 gap-4">
             <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Start</label>
                <select className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 font-bold" value={eventEditor.startHour} onChange={e => onChange({...eventEditor, startHour: e.target.value})}>
                    {generateTimeSlots().map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                </select>
             </div>
             <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Duration</label>
                <input type="number" step="0.5" className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 font-bold" value={eventEditor.duration} onChange={e => onChange({...eventEditor, duration: e.target.value})} />
             </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase tracking-widest">
            <input
              type="checkbox"
              checked={!!eventEditor.repeating}
              onChange={e => onChange({ ...eventEditor, repeating: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Repeat Weekly
          </label>
          <div className="flex gap-3 pt-3">
             {!eventEditor.isNew && <button onClick={onDelete} className="flex-1 bg-red-50 text-red-600 font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest">Delete</button>}
             <button onClick={onSave} className="flex-1 bg-blue-600 text-white font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest shadow-xl">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
};
