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
      ): Promise<{ success: boolean; body?: string; error?: string }>;

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
    };
  }
}
