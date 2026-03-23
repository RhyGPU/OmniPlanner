
import React, { useEffect, useRef } from 'react';
import { CheckSquare, Square, X, Plus } from 'lucide-react';
import { Todo } from '../types';

interface CheckableListProps {
  items: Todo[];
  onChange: (items: Todo[]) => void;
  onAdd: () => void;
  placeholder: string;
  colorClass?: string;
  /** Optional slot rendered after the text input for each row (e.g. goal-link badge). */
  renderSuffix?: (item: Todo, index: number) => React.ReactNode;
  /** Shown in place of the item list when items is empty. Calm, one-line hint. */
  emptyMessage?: string;
}

const AutoSizeTextarea = ({ 
  value, 
  onChange, 
  onKeyDown, 
  placeholder, 
  className, 
  disabled 
}: { 
  value: string, 
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void, 
  onKeyDown: (e: React.KeyboardEvent) => void,
  placeholder: string,
  className: string,
  disabled: boolean
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; // Reset to calculate shrink
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={{ overflow: 'hidden' }}
    />
  );
};

export const CheckableList: React.FC<CheckableListProps> = ({
  items,
  onChange,
  onAdd,
  placeholder,
  colorClass = "text-slate-700",
  renderSuffix,
  emptyMessage,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') { 
      e.preventDefault(); 
      onAdd(); 
    } else if (e.key === 'Backspace' && items[index].text === '' && items.length > 1) {
      e.preventDefault();
      onChange(items.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-3 w-full">
      {items.length === 0 && emptyMessage && (
        <p className="text-xs text-slate-400 italic leading-relaxed py-1">{emptyMessage}</p>
      )}
      {items.map((item, index) => (
        <div key={item.id} className="flex items-start gap-1.5 group animate-in slide-in-from-left-2 duration-200 w-full relative">
          <button
            onClick={() => {
              const newItems = [...items];
              newItems[index].done = !newItems[index].done;
              onChange(newItems);
            }}
            className={`mt-1 w-4 h-4 rounded flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
              item.done ? 'bg-slate-400 text-white' : 'border-2 border-slate-300 hover:border-blue-500 bg-white'
            }`}
          >
            {item.done ? <CheckSquare size={12} /> : null}
          </button>

          <div className="flex-1 min-w-0 overflow-hidden">
            <AutoSizeTextarea
                value={item.text}
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[index].text = e.target.value;
                  onChange(newItems);
                }}
                onKeyDown={(e) => handleKeyDown(e, index)}
                placeholder={placeholder}
                disabled={false}
                className={`w-full bg-transparent border-none p-0 focus:outline-none focus:ring-0 text-xs font-medium leading-relaxed resize-none block ${
                  item.done ? 'line-through text-slate-400' : colorClass
                }`}
                style={{ overflowWrap: 'break-word', wordBreak: 'break-word', maxWidth: '100%' }}
            />
          </div>

          {renderSuffix && renderSuffix(item, index)}

          <button
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="mt-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button 
        onClick={onAdd} 
        className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-blue-600 mt-3 ml-5 transition-colors uppercase tracking-wider cursor-pointer py-1"
      >
        <Plus size={14} /> Add Task
      </button>
    </div>
  );
};
