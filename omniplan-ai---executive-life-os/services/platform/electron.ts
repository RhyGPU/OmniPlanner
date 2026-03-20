/**
 * Electron platform adapter.
 *
 * Wraps window.electronAPI (the contextBridge IPC surface exposed by preload.cjs)
 * behind the platform service interfaces. All direct window.electronAPI calls in
 * application code should go through this module — nowhere else.
 *
 * This file must ONLY be imported via services/platform/index.ts, which selects
 * the correct adapter at runtime based on platform detection.
 */

import { electronFetch } from '../../utils/electronFetch';
import type {
  CredentialService,
  EmailService,
  EmailAccountRef,
  EmailTestCredentials,
  NetworkService,
  ShellService,
} from './types';

// ---------------------------------------------------------------------------
// Credential service
// ---------------------------------------------------------------------------

export const electronCredentials: CredentialService = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.credentialSet;
  },

  async set(key: string, value: string): Promise<boolean> {
    return window.electronAPI!.credentialSet(key, value);
  },

  async get(key: string): Promise<string | null> {
    return window.electronAPI!.credentialGet(key);
  },

  async delete(key: string): Promise<void> {
    return window.electronAPI!.credentialDelete(key);
  },
};

// ---------------------------------------------------------------------------
// Email service
// ---------------------------------------------------------------------------

export const electronEmail: EmailService = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.fetchEmails;
  },

  async fetchEmails(account: EmailAccountRef) {
    return window.electronAPI!.fetchEmails(account);
  },

  async fetchEmailBody(account: EmailAccountRef, uid: string) {
    return window.electronAPI!.fetchEmailBody(account, uid);
  },

  async testConnection(creds: EmailTestCredentials) {
    return window.electronAPI!.testEmailConnection(creds);
  },
};

// ---------------------------------------------------------------------------
// Network service
// ---------------------------------------------------------------------------

export const electronNetwork: NetworkService = {
  fetch(url: string, init?: RequestInit): Promise<Response> {
    // electronFetch already handles the Electron/web branching internally;
    // exposing it here makes the dependency explicit and swappable.
    return electronFetch(url, init);
  },
};

// ---------------------------------------------------------------------------
// Shell service
// ---------------------------------------------------------------------------

export const electronShell: ShellService = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI;
  },

  openExternal(url: string): void {
    window.electronAPI!.openExternal(url);
  },

  quit(): void {
    window.electronAPI!.quitApp();
  },
};
