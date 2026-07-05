/**
 * TypeScript interface declaration for the Electron preload bridge.
 * Exposed via contextBridge.exposeInMainWorld('electronAPI', ...) in preload.cjs.
 *
 * SECURITY MODEL:
 *   - All IPC calls go through the contextBridge; no direct ipcRenderer access.
 *   - Credentials (API keys, email passwords) are stored in Electron safeStorage.
 *   - Passwords never transit IPC after initial save: email handlers call
 *     getCredential() directly in the main process.
 *   - credentialGet is exposed for startup migration/init of renderer-side cache only.
 */

export {};

declare global {
  interface Window {
    electronAPI?: {
      /** Quit the Electron application. */
      quitApp(): void;

      /** Fetch email headers from an IMAP account. Passwords are looked up in
       *  main-process safeStorage — never passed from renderer. */
      fetchEmails(account: {
        id: string;
        email: string;
        provider: string;
        imapHost?: string;
        imapPort?: number;
        enabled: boolean;
      }): Promise<{ success: boolean; emails?: import('./types').Email[]; error?: string }>;

      /** Fetch the full body of a single email by UID. */
      fetchEmailBody(
        account: {
          id: string;
          email: string;
          provider: string;
          imapHost?: string;
          imapPort?: number;
          enabled: boolean;
        },
        uid: string,
      ): Promise<{ success: boolean; body?: string; htmlBody?: string; error?: string }>;

      /** One-shot IMAP test before an account is saved. Credentials are passed
       *  inline and are NOT stored by this call. */
      testEmailConnection(creds: {
        email: string;
        password: string;
        provider: string;
        imapHost?: string;
        imapPort?: number;
      }): Promise<{ success: boolean; error?: string }>;

      /** Open a URL in the system default browser. */
      openExternal(url: string): void;

      /** Route an HTTP/HTTPS request through the main process (bypasses CORS /
       *  Windows Firewall). */
      netFetch(
        url: string,
        options?: {
          method?: string;
          headers?: Record<string, string | null>;
          body?: string;
        },
      ): Promise<{ status: number; ok: boolean; body: string; headers: Record<string, string> }>;

      /** Returns true if Electron safeStorage OS-level encryption is available. */
      credentialIsAvailable(): Promise<boolean>;

      /** Encrypt and persist a credential. Returns false if safeStorage is
       *  unavailable (Linux without keyring). */
      credentialSet(key: string, value: string): Promise<boolean>;

      /** Decrypt and return a stored credential, or null if absent / unavailable. */
      credentialGet(key: string): Promise<string | null>;

      /** Delete a stored credential. No-op if the key does not exist. */
      credentialDelete(key: string): Promise<void>;

      /** Return the absolute path of the auto-backup directory (Electron only). */
      getBackupDir(): Promise<string>;

      /** Trigger a manual backup now. Returns the backup file path on success. */
      triggerManualBackup(): Promise<{ success: boolean; path?: string; error?: string }>;

      /** Check if a newer version is available on GitHub. Returns null if up-to-date. */
      checkUpdateStatus(): Promise<{ current: string; latest: string; url: string } | null>;

      /** Load all files from the local storage folder. */
      fileStorageReadAll(): Promise<Record<string, any>>;

      /** Write a key-value file to local storage. */
      fileStorageSet(key: string, value: any): Promise<boolean>;

      /** Remove a key-value file from local storage. */
      fileStorageRemove(key: string): Promise<boolean>;

      /** List local llamafile models in the models directory. */
      localModelList(): Promise<string[]>;

      /** Spawn a local model server process. */
      localModelStart(modelName: string, port: number): Promise<{ success: boolean; port: number; error?: string }>;

      /** Kill the active local model server process. */
      localModelStop(): Promise<boolean>;

      /** Get status of the active local model server process. */
      localModelStatus(): Promise<{ running: boolean; modelName: string | null }>;

      /** True if the OS supports desktop notifications. */
      notificationIsSupported(): Promise<boolean>;

      /** Show a desktop notification immediately. */
      notificationShow(title: string, body: string): Promise<boolean>;

      /** Schedule a notification in the main process. Same id replaces any
       *  existing schedule (idempotent re-sync). Survives renderer reloads
       *  and fires while the window is hidden to the tray. */
      notificationSchedule(id: number, title: string, body: string, scheduledAtMs: number): Promise<boolean>;

      /** Cancel a scheduled notification by ID. */
      notificationCancel(id: number): Promise<void>;

      /** Cancel all scheduled notifications. */
      notificationCancelAll(): Promise<void>;

      /** Register a listener for alarm triggers from the main process. Returns a cleanup function. */
      notificationOnTrigger(callback: (data: { id: string; title: string; body: string; missionType?: string; snoozeDuration: number; fadeInDuration: number; soundPreset?: string }) => void): () => void;

      /** Send the list of custom alarms to the main process for scheduling. */
      updateCustomAlarms(alarms: any[]): Promise<boolean>;

      /** True when the app is registered to launch at login. */
      startupGet(): Promise<boolean>;

      /** Enable/disable launch at login. Returns the resulting state. */
      startupSet(enable: boolean): Promise<boolean>;
    };
  }
}
