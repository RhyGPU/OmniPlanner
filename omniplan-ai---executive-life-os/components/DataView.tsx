
import React, { useRef, useState, useCallback } from 'react';
import {
  Download, Upload, Database, ShieldCheck, FileJson, Calendar as CalendarIcon,
  FileUp, CheckCircle, AlertCircle, Eye, X, HardDrive, Lock,
} from 'lucide-react';
import { clearAllData, previewBackupFile, BackupPreview } from '../utils/dataManager';
import { parseIcsFile } from '../utils/icsParser';
import { CalendarEvent, NotificationSettings } from '../types';
import { AISettings } from './AISettings';
import { EmailSettings } from './EmailSettings';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { ConfirmDialog } from './Dialog';
import { platform } from '../services/platform';

interface DataViewProps {
  handleSaveData: () => void;
  /** Async — validates backup and writes to storage; the caller shows an alert then reloads. */
  handleLoadData: (file: File) => Promise<void>;
  onImportIcsEvents: (events: { date: Date; event: CalendarEvent }[]) => void;
  notificationSettings: NotificationSettings;
  onNotificationSettingsChange: (settings: NotificationSettings) => void;
}

export const DataView: React.FC<DataViewProps> = ({
    handleSaveData,
    handleLoadData,
    onImportIcsEvents,
    notificationSettings,
    onNotificationSettingsChange,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const icsInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    // Two-step restore state
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<BackupPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [restoreStatus, setRestoreStatus] = useState<'idle' | 'restoring' | 'success' | 'error'>('idle');
    const [restoreError, setRestoreError] = useState<string | null>(null);

    const [icsStatus, setIcsStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [icsCount, setIcsCount] = useState(0);
    const [showNukeConfirm, setShowNukeConfirm] = useState(false);

    const handleFilePick = useCallback(async (file: File) => {
        setPreviewError(null);
        setPreview(null);
        setPendingFile(null);
        setPreviewLoading(true);
        try {
            const result = await previewBackupFile(file);
            setPendingFile(file);
            setPreview(result);
        } catch (err) {
            setPreviewError(err instanceof Error ? err.message : 'Could not read the backup file.');
        } finally {
            setPreviewLoading(false);
            // Reset input so the same file can be re-selected
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFilePick(file);
    }, [handleFilePick]);

    const handleConfirmRestore = useCallback(async () => {
        if (!pendingFile) return;
        setRestoreStatus('restoring');
        setRestoreError(null);
        try {
            await handleLoadData(pendingFile);
            setRestoreStatus('success');
            // App.tsx will show alert and schedule reload; keep 'success' state
        } catch (err) {
            setRestoreStatus('error');
            setRestoreError(err instanceof Error ? err.message : 'Unknown error');
            setTimeout(() => {
                setRestoreStatus('idle');
                setRestoreError(null);
            }, 5000);
        }
    }, [pendingFile, handleLoadData]);

    const handleCancelPreview = useCallback(() => {
        setPendingFile(null);
        setPreview(null);
        setPreviewError(null);
        setRestoreStatus('idle');
        setRestoreError(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.json')) {
            handleFilePick(file);
        }
    }, [handleFilePick]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => setDragOver(false), []);

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

    // Format the backup export date for the preview panel
    const formatPreviewDate = (iso: string) => {
        if (!iso) return 'Unknown';
        try {
            return new Date(iso).toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch {
            return iso;
        }
    };

    const isRestoreBusy = restoreStatus === 'restoring' || restoreStatus === 'success';

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

            {/* Notification Reminder Settings */}
            <div className="mb-12">
                <NotificationSettingsPanel
                    settings={notificationSettings}
                    onChange={onNotificationSettingsChange}
                />
            </div>

            {/* Export / Restore */}
            <div className="grid md:grid-cols-2 gap-10 mb-10">

                {/* Export card */}
                <div
                    onClick={handleSaveData}
                    className="group bg-slate-50 border-2 border-slate-50 p-10 rounded-[2.5rem] cursor-pointer hover:border-blue-600 hover:bg-white hover:shadow-2xl transition-all duration-500"
                >
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-8 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xl shadow-blue-100/50">
                        <Download size={32}/>
                    </div>
                    <h3 className="font-black text-2xl text-slate-900 mb-3 tracking-tight">Export Backup</h3>
                    <p className="text-slate-500 font-bold leading-relaxed text-sm mb-5">
                        Download a complete JSON backup of your planner data.
                    </p>
                    {/* Included / excluded detail */}
                    <div className="space-y-3 text-[11px] font-bold">
                        <div>
                            <div className="text-emerald-600 uppercase tracking-widest mb-1">Included</div>
                            <ul className="text-slate-500 space-y-0.5">
                                <li>✓ Weekly planner (tasks, habits, events)</li>
                                <li>✓ Monthly calendar data</li>
                                <li>✓ Life goals &amp; structured goal items</li>
                                <li>✓ Email inbox</li>
                            </ul>
                        </div>
                        <div>
                            <div className="text-slate-400 uppercase tracking-widest mb-1">Not included</div>
                            <ul className="text-slate-400 space-y-0.5">
                                <li>✗ API keys &amp; email passwords (device-local)</li>
                                <li>✗ Notification preferences (device-local)</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Restore card — two-step flow */}
                <div
                    className={`group bg-slate-50 border-2 p-10 rounded-[2.5rem] relative transition-all duration-500 ${
                        dragOver
                            ? 'border-emerald-500 bg-emerald-50 shadow-2xl scale-[1.02]'
                            : preview
                            ? 'border-indigo-300 bg-indigo-50/30'
                            : restoreStatus === 'success' || restoreStatus === 'restoring'
                            ? 'border-emerald-500 bg-emerald-50/50'
                            : restoreStatus === 'error' || previewError
                            ? 'border-red-300 bg-red-50/50'
                            : 'border-slate-50 hover:border-emerald-600 hover:bg-white hover:shadow-2xl'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    {/* Hidden file input — only active when no preview */}
                    {!preview && !isRestoreBusy && (
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileChange}
                            accept=".json"
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            disabled={previewLoading}
                        />
                    )}

                    {/* Step 1: idle / loading / parse error */}
                    {!preview && (
                        <>
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-all shadow-xl ${
                                previewLoading
                                    ? 'bg-indigo-100 text-indigo-600 shadow-indigo-100/50'
                                    : restoreStatus === 'success' || restoreStatus === 'restoring'
                                    ? 'bg-emerald-600 text-white shadow-emerald-100/50'
                                    : restoreStatus === 'error' || previewError
                                    ? 'bg-red-100 text-red-600 shadow-red-100/50'
                                    : 'bg-emerald-100 text-emerald-600 group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white shadow-emerald-100/50'
                            }`}>
                                {restoreStatus === 'success' || restoreStatus === 'restoring'
                                    ? <CheckCircle size={32}/>
                                    : restoreStatus === 'error' || previewError
                                    ? <AlertCircle size={32}/>
                                    : previewLoading
                                    ? <Eye size={32}/>
                                    : <Upload size={32}/>}
                            </div>
                            <h3 className="font-black text-2xl text-slate-900 mb-3 tracking-tight">
                                {restoreStatus === 'restoring'
                                    ? 'Restoring…'
                                    : restoreStatus === 'success'
                                    ? 'Restored! Reloading…'
                                    : restoreStatus === 'error'
                                    ? 'Restore Failed'
                                    : previewLoading
                                    ? 'Reading backup…'
                                    : 'Restore Backup'}
                            </h3>
                            <p className="text-slate-500 font-bold leading-relaxed text-sm">
                                {dragOver
                                    ? 'Drop your backup file here…'
                                    : restoreStatus === 'restoring'
                                    ? 'Writing backup data to local storage…'
                                    : restoreStatus === 'success'
                                    ? 'Backup written. The app will reload momentarily.'
                                    : restoreStatus === 'error'
                                    ? (restoreError ?? 'The backup could not be restored.')
                                    : previewError
                                    ? previewError
                                    : previewLoading
                                    ? 'Validating file…'
                                    : 'Click or drag a .json backup file. You\'ll see a preview before anything is overwritten.'}
                            </p>
                        </>
                    )}

                    {/* Step 2: Preview panel */}
                    {preview && (
                        <div className="relative z-20">
                            <div className="flex items-start justify-between mb-5">
                                <div>
                                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Preview — nothing written yet</div>
                                    <h3 className="font-black text-xl text-slate-900 tracking-tight">Confirm Restore</h3>
                                </div>
                                <button
                                    onClick={handleCancelPreview}
                                    className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                                    title="Cancel"
                                >
                                    <X size={18}/>
                                </button>
                            </div>

                            {/* Backup metadata */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 space-y-2 text-xs font-bold">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Exported</span>
                                    <span className="text-slate-700">{formatPreviewDate(preview.exportDate)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Format version</span>
                                    <span className="text-slate-700">{preview.version}</span>
                                </div>
                            </div>

                            {/* Counts */}
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                {[
                                    { label: 'Weeks', value: preview.weekCount },
                                    { label: 'Goals', value: preview.goalCount },
                                    { label: 'Emails', value: preview.emailCount },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                                        <div className="text-lg font-black text-slate-800">{value}</div>
                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Format note */}
                            {!preview.hasGoalItems && (
                                <p className="text-[10px] font-bold text-amber-600 mb-3 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                                    Older backup format — life goals will be migrated on next app start.
                                </p>
                            )}

                            {/* Warnings */}
                            {preview.warnings.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                                    {preview.warnings.map((w, i) => (
                                        <p key={i} className="text-[10px] font-bold text-amber-700">• {w}</p>
                                    ))}
                                </div>
                            )}

                            {/* What will be restored */}
                            <p className="text-[10px] font-bold text-slate-400 mb-4 leading-relaxed">
                                Restoring will overwrite your current planner data. API keys, email passwords, and notification preferences are not affected — they live outside the backup.
                            </p>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleCancelPreview}
                                    className="flex-1 py-3 rounded-2xl border-2 border-slate-200 font-black text-xs text-slate-600 hover:bg-slate-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmRestore}
                                    disabled={isRestoreBusy}
                                    className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-default"
                                >
                                    {restoreStatus === 'restoring' ? 'Restoring…' : 'Confirm Restore'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ICS Import */}
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

            {/* Zero-knowledge / nuke footer */}
            <div className="bg-slate-900 text-white rounded-[3rem] p-12 flex flex-col md:flex-row items-center gap-10 border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center border-2 border-blue-500/30 flex-shrink-0">
                    <ShieldCheck size={48} className="text-blue-400"/>
                </div>
                <div className="flex-1 relative z-10 text-center md:text-left">
                    <h3 className="text-3xl font-black mb-3 tracking-tighter">Zero-Knowledge Storage</h3>
                    <p className="text-slate-400 font-bold leading-relaxed">OmniPlanner runs entirely on your device. Your planner data, habits, and credentials never leave your machine — there is no server, no account, and no sync.</p>
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

            {/* Footer stats */}
            <div className="mt-20 pt-16 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="flex flex-col items-center text-center p-8 bg-slate-50 rounded-[2.5rem]">
                    <FileJson className="text-slate-300 mb-5" size={40}/>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest">v3.0 Backup</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Goals + planner unified</div>
                </div>
                <div className="flex flex-col items-center text-center p-8 bg-slate-50 rounded-[2.5rem]">
                    <HardDrive className="text-slate-300 mb-5" size={40}/>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest">Local-Only Storage</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">No server, no account</div>
                </div>
                <div className="flex flex-col items-center text-center p-8 bg-slate-50 rounded-[2.5rem]">
                    <Lock className="text-slate-300 mb-5" size={40}/>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest">Privacy First</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Credentials excluded from backups</div>
                </div>
            </div>
        </div>
      </div>
    );
};
