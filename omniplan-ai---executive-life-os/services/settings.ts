/**
 * Thin backward-compatibility shim.
 *
 * Existing imports of `./services/settings` continue to work unchanged.
 * The implementation now lives in `./storage/secureSettings` so that all
 * credential access is concentrated in one auditable location.
 *
 * Do not add new logic here — use secureSettings.ts directly.
 */
export { getAISettings, saveAISettings, initAICredentials, type AISettings } from './storage/secureSettings';
