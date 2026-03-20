
import React, { useRef, useState, useCallback } from 'react';
import { Download, Upload, Database, ShieldCheck, FileJson, Calendar as CalendarIcon, FileUp, CheckCircle, AlertCircle } from 'lucide-react';
import { clearAllData } from '../utils/dataManager';
import { parseIcsFile } from '../utils/icsParser';
import { CalendarEvent } from '../types';
import { AISettings } from './AISettings';
import { EmailSettings } from './EmailSettings';
import { ConfirmDialog } from './Dialog';
import { platform } from '../services/platform';

interface DataViewProps {
  handleSaveData: () => void;
  handleLoadData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportIcsEvents: (events: { date: Date; event: CalendarEvent }[]) => void;
}

export const DataView: React.FC<DataViewProps> = ({
    handleSaveData,
    handleLoadData,
    onImportIcsEvents,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const icsInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [icsStatus, setIcsStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [icsCount, setIcsCount] = useState(0);
    const [showNukeConfirm, setShowNukeConfirm] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleLoadData(e);
        setUploadStatus('success');
        setTimeout(() => setUploadStatus('idle'), 3000);
        // Reset the file input so the same file can be re-uploaded
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.json')) {
            // Create a synthetic event-like object for the handler
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            if (fileInputRef.current) {
                fileInputRef.current.files = dataTransfer.files;
                fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOver(false);
    }, []);

    const handleIcsImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const text = ev.target?.result;
                if (typeof text !== 'string') return;
                const parsed = parseIcsFile(text);
                if (parsed.length === 0) {
                    setIcsStatus('error');
                    setTimeout(() => setIcsStatus('idle'), 3000);
                    return;
                }
                const mapped = parsed.map(p => ({
                    date: new Date(p.date + 'T00:00:00'),
                    event: p.event,
                }));
                onImportIcsEvents(mapped);
                setIcsCount(parsed.length);
                setIcsStatus('success');
                setTimeout(() => setIcsStatus('idle'), 4000);
            } catch {
                setIcsStatus('error');
                setTimeout(() => setIcsStatus('idle'), 3000);
            }
        };
        reader.readAsText(file);
        if (icsInputRef.current) icsInputRef.current.value = '';
    }, [onImportIcsEvents]);

    const isElectron = platform.shell.isAvailable();

    return (
      <div className="flex flex-col h-full bg-white p-12 overflow-y-auto custom-scrollbar">
        {showNukeConfirm && (
          <ConfirmDialog
            message={"CRITICAL WARNING: This will permanently purge your local Life OS data.\nThis action is irreversible. Continue?"}
            confirmLabel="Nuke"
            danger
            onConfirm={() => {
              setShowNukeConfirm(false);
              clearAllData();
              window.location.reload();
            }}
            onCancel={() => setShowNukeConfirm(false)}
          />
        )}
        <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shadow-lg shadow-blue-100/50">
                    <Database size={24} strokeWidth={2.5}/>
                </div>
                <span className="text-sm font-black text-blue-600 uppercase tracking-[0.3em]">Infrastructure</span>
            </div>
            <h2 className="text-6xl font-black text-slate-900 tracking-tighter mb-16 leading-tight">Settings & Data</h2>

            {/* AI Provider Settings */}
            <div className="mb-12">
                <AISettings />
            </div>

            {/* Email Account Settings */}
            <div className="mb-12">
                <EmailSettings />
            </div>

            <div className="grid md:grid-cols-2 gap-10 mb-10">
                <div
                    onClick={handleSaveData}
                    className="group bg-slate-50 border-2 border-slate-50 p-10 rounded-[2.5rem] cursor-pointer hover:border-blue-600 hover:bg-white hover:shadow-2xl transition-all duration-500"
                >
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-8 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xl shadow-blue-100/50">
                        <Download size={32}/>
                    </div>
                    <h3 className="font-black text-2xl text-slate-900 mb-3 tracking-tight">Export Global State</h3>
                    <p className="text-slate-500 font-bold leading-relaxed text-sm">Download a high-fidelity JSON archive of all habits, events, emails, and life goals.</p>
                </div>

                <div
                    className={`group bg-slate-50 border-2 p-10 rounded-[2.5rem] relative transition-all duration-500 ${
                        dragOver
                            ? 'border-emerald-500 bg-emerald-50 shadow-2xl scale-[1.02]'
                            : uploadStatus === 'success'
                            ? 'border-emerald-500 bg-emerald-50/50'
                            : 'border-slate-50 hover:border-emerald-600 hover:bg-white hover:shadow-2xl'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileChange}
                        accept=".json"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-all shadow-xl ${
                        uploadStatus === 'success'
                            ? 'bg-emerald-600 text-white shadow-emerald-100/50'
                            : 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white shadow-emerald-100/50'
                    }`}>
                        {uploadStatus === 'success' ? <CheckCircle size={32}/> : <Upload size={32}/>}
                    </div>
                    <h3 className="font-black text-2xl text-slate-900 mb-3 tracking-tight">
                        {uploadStatus === 'success' ? 'Restored!' : 'Restore Local State'}
                    </h3>
                    <p className="text-slate-500 font-bold leading-relaxed text-sm">
                        {dragOver
                            ? 'Drop your backup file here...'
                            : uploadStatus === 'success'
                            ? 'Your workspace has been restored from the backup file.'
                            : 'Click or drag a .json backup file to restore your workspace.'
                        }
                    </p>
                </div>
            </div>
            <div className="grid md:grid-cols-1 gap-10 mb-20">
                <div
                    className={`group bg-slate-50 border-2 p-12 rounded-[2.5rem] flex items-center gap-10 relative cursor-pointer transition-all duration-500 ${
                        icsStatus === 'success'
                            ? 'border-indigo-500 bg-indigo-50/50'
                            : icsStatus === 'error'
                            ? 'border-red-300 bg-red-50/50'
                            : 'border-slate-50 hover:border-indigo-600 hover:bg-white hover:shadow-2xl'
                    }`}
                >
                    <input
                        ref={icsInputRef}
                        type="file"
                        onChange={handleIcsImport}
                        accept=".ics,.ical"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl flex-shrink-0 transition-all ${
                        icsStatus === 'success'
                            ? 'bg-indigo-600 text-white shadow-indigo-100/50'
                            : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white shadow-indigo-100/50'
                    }`}>
                        {icsStatus === 'success' ? <CheckCircle size={40}/> : <FileUp size={40}/>}
                    </div>
                    <div>
                        <h3 className="font-black text-2xl text-slate-900 mb-3 tracking-tight uppercase">
                            {icsStatus === 'success' ? `${icsCount} Events Imported!` : icsStatus === 'error' ? 'Import Failed' : 'Integrate iCal (.ics)'}
                        </h3>
                        <p className="text-slate-500 font-bold leading-relaxed text-sm">
                            {icsStatus === 'success'
                                ? 'Calendar events have been merged into your weekly timeline.'
                                : icsStatus === 'error'
                                ? 'Could not parse the file. Make sure it is a valid .ics calendar file.'
                                : 'Click to import a .ics file from Google Calendar, Outlook, or Apple Calendar into your weekly planner.'
                            }
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 text-white rounded-[3rem] p-12 flex flex-col md:flex-row items-center gap-10 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center border-2 border-blue-500/30 flex-shrink-0">
                    <ShieldCheck size={48} className="text-blue-400"/>
                </div>
                <div className="flex-1 relative z-10 text-center md:text-left">
                    <h3 className="text-3xl font-black mb-3 tracking-tighter">Zero-Knowledge Storage</h3>
                    <p className="text-slate-400 font-bold leading-relaxed">OmniPlan operates on a 100% client-side logic. Your high-performance dashboard, habits, and secrets never touch our infrastructure.</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => setShowNukeConfirm(true)}
                        className="bg-red-500 hover:bg-red-600 text-white px-12 py-5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-red-200 active:scale-95 whitespace-nowrap"
                    >
                        Nuke Workspace
                    </button>
                    {isElectron && (
                        <button
                            onClick={() => platform.shell.quit()}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-slate-900/50 active:scale-95 whitespace-nowrap flex items-center gap-2"
                        >
                            Exit Program
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-20 pt-16 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="flex flex-col items-center text-center p-8 bg-slate-50 rounded-[2.5rem]">
                    <FileJson className="text-slate-300 mb-5" size={40}/>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest">v2.0.0 Protocol</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Week-Isolated Persistence</div>
                </div>
                <div className="flex flex-col items-center text-center p-8 bg-slate-50 rounded-[2.5rem]">
                    <CalendarIcon className="text-slate-300 mb-5" size={40}/>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest">Real-Time Sync</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Month & Week Unified</div>
                </div>
                <div className="flex flex-col items-center text-center p-8 bg-slate-50 rounded-[2.5rem]">
                    <ShieldCheck className="text-slate-300 mb-5" size={40}/>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest">Privacy First</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Local Sandbox</div>
                </div>
            </div>
        </div>
      </div>
    );
};
