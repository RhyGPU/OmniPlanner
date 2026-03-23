/**
 * Onboarding state — Phase 14.
 *
 * Stores and reads whether the first-run welcome card has been dismissed.
 * Deliberately kept separate from planner-domain data (weeks, goals) so that
 * a backup restore or data import never clears the dismissed flag, and a new
 * device (fresh install) correctly shows the welcome card again.
 *
 * Detection logic:
 *   - "new user" = dismissed flag not set AND no meaningful planner data found.
 *   - "meaningful data" = at least one non-empty goal, task, event, focus text,
 *     or active habit. An all-blank week scaffold does not count.
 *   - After dismiss, the flag is set and the card never shows again on this device.
 */

import { storage, LOCAL_STORAGE_KEYS } from './index';
import type { WeekData, GoalItem } from '../../types';

// ---------------------------------------------------------------------------
// Dismissed flag
// ---------------------------------------------------------------------------

/** Returns true if the user has already dismissed the welcome card. */
export function getOnboardingDismissed(): boolean {
  return storage.get<boolean>(LOCAL_STORAGE_KEYS.ONBOARDING_DISMISSED) === true;
}

/** Persist the dismissed flag. Called once when the user clicks dismiss. */
export function setOnboardingDismissed(): void {
  storage.set(LOCAL_STORAGE_KEYS.ONBOARDING_DISMISSED, true);
}

// ---------------------------------------------------------------------------
// Meaningful-data detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the user already has substantive planner data.
 * Used to skip the first-run card for existing users who restore or
 * upgrade — they have goals and weeks with content already.
 *
 * Intentionally conservative: a single non-empty goal text or todo text is
 * enough. We do NOT want to accidentally show onboarding to power users.
 */
export function hasPlannerData(
  allWeeks: Record<string, WeekData>,
  goalItems: GoalItem[],
): boolean {
  // Active goals are the strongest signal
  if (goalItems.some(g => g.status === 'active' && g.text.trim() !== '')) {
    return true;
  }

  for (const week of Object.values(allWeeks)) {
    // Active habits
    if ((week.habits ?? []).some(h => !h.archived && !h.deletedAt)) {
      return true;
    }
    // Weekly goal text
    if (
      (week.goals?.business ?? []).some(t => t.text.trim() !== '') ||
      (week.goals?.personal ?? []).some(t => t.text.trim() !== '')
    ) {
      return true;
    }
    // Meetings
    if ((week.meetings ?? []).some(m => m.text.trim() !== '')) {
      return true;
    }
    // Daily plan content
    for (const plan of Object.values(week.dailyPlans ?? {})) {
      if (plan.focus?.trim() !== '') return true;
      if (plan.todos.some(t => t.text.trim() !== '')) return true;
      if ((plan.events ?? []).length > 0) return true;
    }
  }

  return false;
}
