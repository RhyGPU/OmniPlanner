import { WeekData, LifeGoals, Email, GoalItem } from '../types';
import { storage, LOCAL_STORAGE_KEYS } from '../services/storage';
import { validateBackup } from './backupValidator';

export interface OmniPlanBackup {
  version: string;
  exportDate: string;
  data: OmniPlanBackupData;
}

export interface OmniPlanBackupData {
  allWeeks: Record<string, WeekData>;
  emails: Email[];
  /** Retained for old-backup import compatibility. GoalItem is the live model. */
  lifeGoals: LifeGoals;
  /** Phase 2+: structured GoalItem records. Absent in pre-v3.0 backups. */
  goalItems?: GoalItem[];
}

const BACKUP_VERSION = '3.0';

/**
 * Export all data to a single consolidated backup object.
 */
export const exportAllData = (): OmniPlanBackup => {
  const allWeeks = storage.get<Record<string, WeekData>>(LOCAL_STORAGE_KEYS.ALL_WEEKS) ?? {};
  const emails = storage.get<Email[]>(LOCAL_STORAGE_KEYS.EMAILS) ?? [];
  const lifeGoals = storage.get<LifeGoals>(LOCAL_STORAGE_KEYS.LIFE_GOALS) ?? {} as LifeGoals;

  const goalItems = storage.get<GoalItem[]>(LOCAL_STORAGE_KEYS.GOAL_ITEMS) ?? [];

  return {
    version: BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    data: { allWeeks, emails, lifeGoals, goalItems },
  };
};

type LegacyBackup = {
  version?: string;
  timestamp?: string;
  allWeeks?: Record<string, WeekData>;
  emails?: Email[];
  lifeGoals?: LifeGoals;
};

/**
 * Migrate WeeklyGoals from old string[] format to Todo[] format in-place.
 * This is kept here as a safety net for backup files imported from before
 * migration v1 ran. The canonical version lives in services/storage/migrations.ts.
 */
const migrateWeeklyGoalsInBackup = (allWeeks: Record<string, WeekData>): Record<string, WeekData> => {
  for (const key of Object.keys(allWeeks)) {
    const week = allWeeks[key];
    if (!week.goals) continue;
    for (const field of ['business', 'personal'] as const) {
      const arr = week.goals[field];
      if (arr && arr.length > 0 && typeof (arr as unknown[])[0] === 'string') {
        (week.goals as Record<string, unknown>)[field] = (arr as unknown as string[]).map(
          (text, i) => ({ id: `${field[0]}g-migrated-${i}`, text, done: false }),
        );
      }
    }
  }
  return allWeeks;
};

const normalizeBackup = (raw: unknown): OmniPlanBackupData => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid backup file');
  }

  const maybe = raw as Partial<OmniPlanBackup>;
  if (maybe.data && typeof maybe.data === 'object') {
    const data = maybe.data as Partial<OmniPlanBackupData>;
    return {
      allWeeks: migrateWeeklyGoalsInBackup((data.allWeeks ?? {}) as Record<string, WeekData>),
      emails: (data.emails ?? []) as Email[],
      lifeGoals: (data.lifeGoals ?? {}) as LifeGoals,
      goalItems: (data.goalItems ?? []) as GoalItem[],
    };
  }

  const legacy = raw as LegacyBackup;
  return {
    allWeeks: migrateWeeklyGoalsInBackup((legacy.allWeeks ?? {}) as Record<string, WeekData>),
    emails: (legacy.emails ?? []) as Email[],
    lifeGoals: (legacy.lifeGoals ?? {}) as LifeGoals,
    goalItems: [],
  };
};

/**
 * Import all data from a consolidated backup object.
 *
 * Always restores lifeGoals (used as migration v2 source).
 * If the backup contains goalItems, writes them directly and resets schema
 * version to 2 (already migrated). If not, deletes the goalItems key and
 * resets schema version to 1 so migration v2 re-runs from the restored
 * lifeGoals on next startup.
 */
export const importAllData = (backup: OmniPlanBackupData): void => {
  storage.set(LOCAL_STORAGE_KEYS.ALL_WEEKS, backup.allWeeks);
  storage.set(LOCAL_STORAGE_KEYS.EMAILS, backup.emails);
  storage.set(LOCAL_STORAGE_KEYS.LIFE_GOALS, backup.lifeGoals);

  if (backup.goalItems && backup.goalItems.length > 0) {
    storage.set(LOCAL_STORAGE_KEYS.GOAL_ITEMS, backup.goalItems);
    storage.set(LOCAL_STORAGE_KEYS.SCHEMA_VERSION, 2);
  } else {
    // Old backup: let migration v2 run on next app start
    storage.remove(LOCAL_STORAGE_KEYS.GOAL_ITEMS);
    storage.set(LOCAL_STORAGE_KEYS.SCHEMA_VERSION, 1);
  }
};

/**
 * Download backup as a timestamped JSON file.
 */
export const downloadBackup = (): void => {
  const backup = exportAllData();
  const dataStr = JSON.stringify(backup, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `omniplan-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Remove all omni_* keys from storage.
 */
export const clearAllData = (): void => {
  for (const key of storage.keys('omni_')) {
    storage.remove(key);
  }
};

/** Result returned by uploadBackup — carries warnings alongside the data. */
export interface UploadBackupResult {
  data: OmniPlanBackupData;
  /** Non-fatal issues found during validation. May be shown to the user. */
  warnings: string[];
}

/**
 * Parse, validate, and import a backup file.
 *
 * VALIDATION:
 *   The file is parsed as JSON and structurally validated before any data
 *   is written to storage. If validation fails (fatal errors), the Promise
 *   rejects with a descriptive Error and storage is left unchanged.
 *   Non-fatal warnings are returned alongside the data for the UI to surface.
 *
 * RESTORE POLICY:
 *   On success this function writes the normalized backup to storage via
 *   importAllData(). The caller (App.tsx handleLoadData) is responsible for
 *   triggering a page reload afterward so that:
 *     - React state is re-read from the freshly written storage
 *     - Schema migrations re-run if the backup is from an older version
 *     - Notification reminder sync fires with the restored planner data
 *   No React state update is needed — the reload handles everything.
 *
 * WHAT GETS RESTORED (see importAllData for details):
 *   ✓ allWeeks (all weekly planner data, habits, calendar events)
 *   ✓ emails (inbox messages)
 *   ✓ lifeGoals (retained as migration v2 source)
 *   ✓ goalItems (if present; schema version set accordingly)
 *
 * WHAT DOES NOT GET RESTORED (device-local, intentionally excluded):
 *   ✗ API keys / email passwords (always device-local secure storage)
 *   ✗ Notification settings (device preference, not planner data)
 *   ✗ Zoom levels (UI state)
 *
 * The caller should inform the user that credentials must be re-entered
 * if they are restoring to a new device.
 */
export const uploadBackup = (file: File): Promise<UploadBackupResult> => {
  return new Promise((resolve, reject) => {
    if (!file.name.endsWith('.json')) {
      reject(new Error('Please select a .json backup file.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string' || text.trim().length === 0) {
          reject(new Error('The file is empty.'));
          return;
        }

        // Parse JSON
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          reject(new Error(
            'The file is not valid JSON. Please select an OmniPlanner backup file.',
          ));
          return;
        }

        // Structural validation — reject before touching storage
        const validation = validateBackup(raw);
        if (!validation.valid) {
          const detail = validation.errors.join(' ');
          reject(new Error(`Backup validation failed: ${detail}`));
          return;
        }

        // Log warnings (non-fatal)
        if (validation.warnings.length > 0) {
          console.warn('[OmniPlanner] Backup import warnings:', validation.warnings);
        }

        // Normalize and write atomically to storage
        const normalized = normalizeBackup(raw);
        importAllData(normalized);

        resolve({ data: normalized, warnings: validation.warnings });
      } catch (error) {
        if (error instanceof Error) {
          reject(error);
        } else {
          reject(new Error('Failed to process backup file.'));
        }
      }
    };

    reader.onerror = () => reject(new Error('Failed to read the file. Please try again.'));
    reader.readAsText(file);
  });
};
