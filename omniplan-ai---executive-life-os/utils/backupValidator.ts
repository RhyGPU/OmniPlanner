/**
 * Backup file validator for OmniPlanner.
 *
 * Validates the structural integrity of a backup JSON object before any data
 * is written to storage. Returns a typed result with explicit error and warning
 * lists so callers can surface meaningful feedback.
 *
 * DESIGN:
 *   - Errors are fatal: the restore must be rejected.
 *   - Warnings are advisory: the restore can proceed but the user should be informed.
 *   - Validation is structural, not exhaustive. We check that required fields have
 *     the right types and rough shape — not that every field value is semantically
 *     valid. The goal is to prevent obviously corrupted data from reaching storage.
 *   - Spot-check limits (first N entries of large arrays/objects) prevent extremely
 *     large backups from causing long validation delays.
 *
 * WHAT IS NOT VALIDATED:
 *   - Semantic correctness of date strings (beyond YYYY-MM-DD format)
 *   - Business logic (e.g., parent goal IDs must reference existing goals)
 *   - Credential or notification settings (not in backup by design)
 *
 * BACKUP FORMAT VERSIONS:
 *   v3.0 (current): { version: '3.0', exportDate: string, data: { allWeeks, emails, lifeGoals, goalItems } }
 *   Legacy (pre-v3.0): { allWeeks, emails, lifeGoals } at root level, no version field
 *   Both are accepted.
 */

export interface BackupValidationResult {
  /** False if any fatal errors were found — restore must be rejected. */
  valid: boolean;
  /**
   * Fatal structural problems. Each string is a human-readable description.
   * Non-empty implies valid === false.
   */
  errors: string[];
  /**
   * Non-fatal issues. Restore can proceed but data may be incomplete or
   * partially migrated. Each string is a human-readable description.
   */
  warnings: string[];
}

// How many entries to spot-check in large collections
const WEEK_SPOT_CHECK_LIMIT = 10;
const GOAL_SPOT_CHECK_LIMIT = 20;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a raw parsed JSON object as an OmniPlanner backup.
 *
 * @param raw  The result of JSON.parse() on the file contents.
 * @returns    BackupValidationResult with errors, warnings, and validity flag.
 */
export function validateBackup(raw: unknown): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── 1. Must be a non-null, non-array object ──────────────────────────────

  if (raw === null || raw === undefined) {
    return { valid: false, errors: ['Backup file is empty or null.'], warnings: [] };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Backup file must be a JSON object, not an array or primitive.'], warnings: [] };
  }

  const root = raw as Record<string, unknown>;

  // ── 2. Extract the data section (modern vs. legacy format) ───────────────

  let dataSection: Record<string, unknown>;

  if ('data' in root && root.data !== null && root.data !== undefined) {
    // Modern format: { version, exportDate, data: { allWeeks, emails, ... } }
    if (typeof root.data !== 'object' || Array.isArray(root.data)) {
      return {
        valid: false,
        errors: ['Backup "data" field must be an object. The file may be corrupted.'],
        warnings: [],
      };
    }
    dataSection = root.data as Record<string, unknown>;

    // Version advisory (not fatal — we accept all versions)
    if ('version' in root && typeof root.version === 'string' && root.version !== '3.0') {
      warnings.push(
        `Backup version is '${root.version}' (current: 3.0). ` +
          'The file will be imported using compatibility mode.',
      );
    }
  } else if ('allWeeks' in root || 'emails' in root || 'lifeGoals' in root) {
    // Legacy format: fields at root level
    dataSection = root;
    warnings.push(
      'This is a legacy backup format (pre-v3.0). ' +
        'It will be imported and goal data will be regenerated from life goals on next launch.',
    );
  } else {
    return {
      valid: false,
      errors: [
        'Backup does not contain recognizable planner data. ' +
          'Expected "data", "allWeeks", "emails", or "lifeGoals" fields.',
      ],
      warnings: [],
    };
  }

  // ── 3. Validate allWeeks ─────────────────────────────────────────────────

  const allWeeks = dataSection.allWeeks;
  let weekCount = 0;

  if (allWeeks !== undefined && allWeeks !== null) {
    if (typeof allWeeks !== 'object' || Array.isArray(allWeeks)) {
      errors.push('"allWeeks" must be an object (map of week keys to week data).');
    } else {
      const entries = Object.entries(allWeeks as Record<string, unknown>);
      weekCount = entries.length;

      // Spot-check the first N week entries
      const toCheck = entries.slice(0, WEEK_SPOT_CHECK_LIMIT);
      for (const [weekKey, week] of toCheck) {
        const issue = _validateWeekEntry(weekKey, week);
        if (issue) errors.push(issue);
      }

      if (entries.length > WEEK_SPOT_CHECK_LIMIT) {
        warnings.push(
          `Spot-checked ${WEEK_SPOT_CHECK_LIMIT} of ${entries.length} week entries. ` +
            'Remaining entries were accepted without full validation.',
        );
      }
    }
  }
  // allWeeks absent or null is allowed (empty or email-only backup)

  // ── 4. Validate emails ───────────────────────────────────────────────────

  const emails = dataSection.emails;
  let emailCount = 0;

  if (emails !== undefined && emails !== null) {
    if (!Array.isArray(emails)) {
      errors.push('"emails" must be an array.');
    } else {
      emailCount = emails.length;
      // Spot-check first 5 email entries
      let badEmails = 0;
      for (const email of (emails as unknown[]).slice(0, 5)) {
        if (!_isShallowObject(email)) badEmails++;
      }
      if (badEmails > 0) {
        warnings.push(
          `${badEmails} email entry/entries appear malformed and may be skipped on import.`,
        );
      }
    }
  }

  // ── 5. Validate goalItems (optional — only in v3.0+ backups) ─────────────

  const goalItems = dataSection.goalItems;
  let goalCount = 0;

  if (Array.isArray(goalItems)) {
    goalCount = goalItems.length;
    const toCheck = (goalItems as unknown[]).slice(0, GOAL_SPOT_CHECK_LIMIT);
    const invalid = toCheck.filter(item => !_isValidGoalItemShape(item));
    if (invalid.length > 0) {
      warnings.push(
        `${invalid.length} goal item(s) have unexpected shape. ` +
          'They will be imported as-is and may display incorrectly.',
      );
    }
  } else if (goalItems !== undefined && goalItems !== null && goalItems !== '') {
    errors.push('"goalItems" must be an array if present.');
  }

  // ── 6. Validate lifeGoals (optional — legacy source for migration v2) ────

  const lifeGoals = dataSection.lifeGoals;
  if (lifeGoals !== undefined && lifeGoals !== null) {
    if (typeof lifeGoals !== 'object' || Array.isArray(lifeGoals)) {
      warnings.push('"lifeGoals" has unexpected shape — it will be imported as-is.');
    }
  }

  // ── 7. Content check — warn on completely empty backup ───────────────────

  if (weekCount === 0 && goalCount === 0 && emailCount === 0) {
    warnings.push(
      'The backup appears to contain no planner data. ' +
        'Restoring it will clear your current weeks, emails, and goals.',
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _validateWeekEntry(weekKey: string, week: unknown): string | null {
  if (!_isShallowObject(week)) {
    return `Week entry '${weekKey}' is not an object.`;
  }
  const w = week as Record<string, unknown>;

  // weekStartDate must be a YYYY-MM-DD string
  if (typeof w.weekStartDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.weekStartDate)) {
    return `Week '${weekKey}' has a missing or malformed weekStartDate (expected YYYY-MM-DD).`;
  }

  // goals must be an object (not array)
  if (!_isShallowObject(w.goals)) {
    return `Week '${weekKey}' has missing or invalid goals.`;
  }

  // dailyPlans must be an object (can be empty)
  if (w.dailyPlans !== undefined && (typeof w.dailyPlans !== 'object' || Array.isArray(w.dailyPlans))) {
    return `Week '${weekKey}' has an invalid dailyPlans field.`;
  }

  return null;
}

function _isValidGoalItemShape(item: unknown): boolean {
  if (!_isShallowObject(item)) return false;
  const g = item as Record<string, unknown>;
  return (
    typeof g.id === 'string' &&
    g.id.length > 0 &&
    typeof g.text === 'string' &&
    typeof g.timeframe === 'string' &&
    typeof g.status === 'string'
  );
}

function _isShallowObject(v: unknown): boolean {
  return v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);
}
