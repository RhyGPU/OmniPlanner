import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for OmniPlanner mobile shell (iOS / Android).
 *
 * PLATFORM NOTES:
 *   - webDir points to the Vite output directory.  Run `npm run build:mobile`
 *     (vite build + cap sync) before opening the native project.
 *   - appId uses a reverse-DNS scheme distinct from the Electron appId
 *     (com.omniplan.app) so both distribution channels can coexist in
 *     enterprise MDM catalogues.
 *   - The LocalNotifications plugin is pre-configured here; permission
 *     requests are still required at runtime via
 *     `platform.notifications.requestPermission()`.
 *
 * STORAGE NOTES:
 *   - @capacitor/preferences wraps NSUserDefaults (iOS) and
 *     SharedPreferences (Android).  Data is app-sandboxed but NOT
 *     hardware-backed (not Keychain / Keystore).  See
 *     services/platform/capacitor.ts for the explicit security warning
 *     displayed to users when this adapter is active.
 *   - The IndexedDB storage adapter (Phase 9) is used for planner data;
 *     Capacitor Preferences is used only for credentials (API keys).
 *
 * SERVICE WORKER:
 *   - WKWebView (iOS) does NOT support service workers.  The native app
 *     bundle itself serves the offline shell — no SW registration is
 *     attempted when `isCapacitor()` returns true.
 */
const config: CapacitorConfig = {
  appId: 'app.omniplanner',
  appName: 'OmniPlanner',
  webDir: 'dist',

  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#2563EB',
      sound: 'beep.wav',
    },
  },
};

export default config;
