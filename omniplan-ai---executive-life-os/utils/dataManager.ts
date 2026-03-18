import { WeekData, LifeGoals, Email } from '../types';
import { storage, LOCAL_STORAGE_KEYS } from '../services/storage';

export interface OmniPlanBackup {
  version: string;
  exportDate: string;
  data: OmniPlanBackupData;
}

export interface OmniPlanBackupData {
  allWeeks: Record<string, WeekData>;
  emails: Email[];
  lifeGoals: LifeGoals;
}

const BACKUP_VERSION = '2.0';

/**
 * Export all data to a single consolidated backup object.
 */
export const exportAllData = (): OmniPlanBackup => {
  const allWeeks = storage.get<Record<string, WeekData>>(LOCAL_STORAGE_KEYS.ALL_WEEKS) ?? {};
  const emails = storage.get<Email[]>(LOCAL_STORAGE_KEYS.EMAILS) ?? [];
  const lifeGoals = storage.get<LifeGoals>(LOCAL_STORAGE_KEYS.LIFE_GOALS) ?? {} as LifeGoals;

  return {
    version: BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    data: { allWeeks, emails, lifeGoals },
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
    };
  }

  const legacy = raw as LegacyBackup;
  return {
    allWeeks: migrateWeeklyGoalsInBackup((legacy.allWeeks ?? {}) as Record<string, WeekData>),
    emails: (legacy.emails ?? []) as Email[],
    lifeGoals: (legacy.lifeGoals ?? {}) as LifeGoals,
  };
};

/**
 * Import all data from a consolidated backup object.
 */
export const importAllData = (backup: OmniPlanBackupData): void => {
  storage.set(LOCAL_STORAGE_KEYS.ALL_WEEKS, backup.allWeeks);
  storage.set(LOCAL_STORAGE_KEYS.EMAILS, backup.emails);
  storage.set(LOCAL_STORAGE_KEYS.LIFE_GOALS, backup.lifeGoals);
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

/**
 * Upload and parse backup from file.
 * Returns the normalized data — caller is responsible for updating app state.
 * App state update will trigger the useEffect that persists to storage.
 */
export const uploadBackup = (file: File): Promise<OmniPlanBackupData> => {
  return new Promise((resolve, reject) => {
    if (!file.name.endsWith('.json')) {
      reject(new Error('Please select a .json backup file'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string' || text.trim().length === 0) {
          reject(new Error('The file is empty'));
          return;
        }
        const raw = JSON.parse(text);
        const normalized = normalizeBackup(raw);
        // Persist to storage so the data is available immediately
        importAllData(normalized);
        resolve(normalized);
      } catch (error) {
        if (error instanceof SyntaxError) {
          reject(new Error('The file is not valid JSON. Please select an OmniPlan backup file.'));
        } else if (error instanceof Error) {
          reject(error);
        } else {
          reject(new Error('Failed to process backup file'));
        }
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file. Please try again.'));
    reader.readAsText(file);
  });
};
