/**
 * Platform service factory.
 *
 * Detects the current runtime environment and exports a `platform` singleton
 * with the appropriate adapter implementations for each service interface.
 *
 * Components and service modules import `platform` from here:
 *
 *   import { platform } from '../services/platform';
 *   platform.credentials.set('key', value);
 *   platform.email.fetchEmails(account);
 *   platform.shell.openExternal(url);
 *
 * Direct access to window.electronAPI elsewhere in the codebase is a bug:
 * all Electron API calls must go through this module.
 */

import { electronCredentials, electronEmail, electronNetwork, electronShell } from './electron';
import { webCredentials, webEmail, webNetwork, webShell } from './web';
import type { PlatformServices } from './types';

// Re-export types for consumers that need them
export type {
  CredentialService,
  EmailService,
  EmailAccountRef,
  EmailTestCredentials,
  NetworkService,
  ShellService,
  PlatformServices,
} from './types';

/**
 * True when the app is running inside Electron (preload bridge is present).
 *
 * Single canonical platform check — replaces ad-hoc `window.electronAPI`
 * checks scattered across the codebase.
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * Platform service singleton.
 *
 * Selected once at module initialisation based on runtime environment.
 * Electron adapter when window.electronAPI is present; web adapter otherwise.
 */
export const platform: PlatformServices = isElectron()
  ? {
      credentials: electronCredentials,
      email: electronEmail,
      network: electronNetwork,
      shell: electronShell,
    }
  : {
      credentials: webCredentials,
      email: webEmail,
      network: webNetwork,
      shell: webShell,
    };
