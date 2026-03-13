export interface HabitMilestone {
  days: number;
  message: string;
  color: string;
  bgColor: string;
  animate: boolean;
}

// ── Master Habit Streak Chart (Year 0 → Year 5) ──
const MILESTONES: HabitMilestone[] = [
  { days: 1, message: 'Ah shit here we go again', color: 'text-slate-500', bgColor: 'bg-slate-50', animate: false },
  { days: 2, message: 'And so it begins', color: 'text-slate-500', bgColor: 'bg-slate-50', animate: false },
  { days: 3, message: 'The Holy Trinity', color: 'text-slate-600', bgColor: 'bg-slate-100', animate: false },
  { days: 4, message: 'A resolution good for only three days', color: 'text-slate-600', bgColor: 'bg-slate-100', animate: false },
  { days: 5, message: 'Well played', color: 'text-slate-600', bgColor: 'bg-slate-100', animate: false },
  { days: 6, message: 'Momentum', color: 'text-slate-600', bgColor: 'bg-slate-100', animate: false },
  { days: 7, message: 'Seven days straight', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 8, message: 'Now we\'re cooking', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 9, message: 'Getting somewhere', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 10, message: 'Double digits', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 11, message: 'These go to eleven', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 12, message: 'A disciplined dozen', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 13, message: 'Unlucky for quitting', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 14, message: 'Two weeks deep', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 15, message: 'Still building', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 16, message: 'Showing up works', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 17, message: 'Consistency', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 18, message: 'Rhythm', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 19, message: 'Locked in', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 20, message: 'Rolling', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 21, message: 'Habit unlocked', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: true },
  { days: 22, message: 'Still intentional', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 23, message: 'Forward', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 24, message: 'Keep it moving', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 25, message: 'Quarter century', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 26, message: 'No breaks', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 27, message: 'Stacking days', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 28, message: 'Four weeks strong', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 29, message: 'Nearly there', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: false },
  { days: 30, message: 'One month down', color: 'text-green-700', bgColor: 'bg-green-50', animate: true },
  { days: 32, message: 'No slowing', color: 'text-green-700', bgColor: 'bg-green-50', animate: false },
  { days: 35, message: 'Five week streak', color: 'text-green-700', bgColor: 'bg-green-50', animate: false },
  { days: 40, message: 'Routine forming', color: 'text-green-700', bgColor: 'bg-green-50', animate: false },
  { days: 45, message: 'Commitment', color: 'text-emerald-700', bgColor: 'bg-emerald-50', animate: false },
  { days: 50, message: 'Halfway to triple digits', color: 'text-emerald-700', bgColor: 'bg-emerald-50', animate: false },
  { days: 55, message: 'Stable', color: 'text-emerald-700', bgColor: 'bg-emerald-50', animate: false },
  { days: 60, message: 'Two months rolling', color: 'text-emerald-700', bgColor: 'bg-emerald-50', animate: false },
  { days: 66, message: 'Second nature', color: 'text-indigo-700', bgColor: 'bg-indigo-50', animate: true },
  { days: 70, message: 'As you sow so shall you reap', color: 'text-indigo-700', bgColor: 'bg-indigo-50', animate: false },
  { days: 75, message: 'Well begun is half done', color: 'text-indigo-700', bgColor: 'bg-indigo-50', animate: false },
  { days: 80, message: 'Little strokes fell great oaks', color: 'text-indigo-700', bgColor: 'bg-indigo-50', animate: false },
  { days: 85, message: 'This runs itself now', color: 'text-indigo-700', bgColor: 'bg-indigo-50', animate: false },
  { days: 90, message: 'A young tree stands', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: true },
  { days: 95, message: 'No negotiation anymore', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: false },
  { days: 100, message: 'Roots established', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: true },
  { days: 110, message: 'Settling in', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: false },
  { days: 120, message: 'Patience bears fruit', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: false },
  { days: 130, message: 'Quiet strength', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: false },
  { days: 140, message: 'Firm ground', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: false },
  { days: 150, message: 'A tree does not hurry', color: 'text-purple-700', bgColor: 'bg-purple-50', animate: false },
  { days: 160, message: 'Momentum built', color: 'text-purple-700', bgColor: 'bg-purple-50', animate: false },
  { days: 170, message: 'Consistency speaks', color: 'text-purple-700', bgColor: 'bg-purple-50', animate: false },
  { days: 180, message: 'Half a year solid', color: 'text-purple-700', bgColor: 'bg-purple-50', animate: true },
  { days: 200, message: 'You can do this without me', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 210, message: 'The routine remembers', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 225, message: 'Momentum carries itself', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 240, message: 'Instinct now', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 250, message: 'A sturdy oak', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 260, message: 'Tracking feels optional', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 270, message: 'Deep roots', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 285, message: 'Point proven', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: false },
  { days: 300, message: 'You may retire this tracker', color: 'text-pink-700', bgColor: 'bg-pink-50', animate: true },
  { days: 320, message: 'Mission accomplished honestly', color: 'text-pink-700', bgColor: 'bg-pink-50', animate: false },
  { days: 333, message: 'Time is working for you', color: 'text-pink-700', bgColor: 'bg-pink-50', animate: false },
  { days: 350, message: 'Permanent behavior', color: 'text-pink-700', bgColor: 'bg-pink-50', animate: false },
  { days: 365, message: 'One year complete you can move on', color: 'text-pink-700', bgColor: 'bg-pink-50', animate: true },
  { days: 400, message: 'Weathered and steady', color: 'text-rose-700', bgColor: 'bg-rose-50', animate: false },
  { days: 420, message: 'Growth without effort', color: 'text-rose-700', bgColor: 'bg-rose-50', animate: false },
  { days: 450, message: 'Legend behavior', color: 'text-rose-700', bgColor: 'bg-rose-50', animate: false },
  { days: 480, message: 'Still tracking this?', color: 'text-rose-700', bgColor: 'bg-rose-50', animate: false },
  { days: 500, message: 'Ancient redwood', color: 'text-rose-700', bgColor: 'bg-rose-50', animate: true },
  { days: 540, message: 'Mastery confirmed', color: 'text-rose-700', bgColor: 'bg-rose-50', animate: false },
  { days: 600, message: 'Roots in bedrock', color: 'text-amber-800', bgColor: 'bg-amber-50', animate: false },
  { days: 666, message: 'Unholy consistency', color: 'text-amber-800', bgColor: 'bg-amber-50', animate: true },
  { days: 700, message: 'No supervision required', color: 'text-amber-800', bgColor: 'bg-amber-50', animate: false },
  { days: 730, message: 'Two years this habit is yours', color: 'text-amber-800', bgColor: 'bg-amber-50', animate: true },
  { days: 760, message: 'This tracker is ceremonial now', color: 'text-orange-800', bgColor: 'bg-orange-50', animate: false },
  { days: 800, message: 'Old growth', color: 'text-orange-800', bgColor: 'bg-orange-50', animate: false },
  { days: 850, message: 'Witness to seasons', color: 'text-orange-800', bgColor: 'bg-orange-50', animate: false },
  { days: 900, message: 'Patience of stone', color: 'text-orange-800', bgColor: 'bg-orange-50', animate: false },
  { days: 950, message: 'You forgot this was difficult', color: 'text-orange-800', bgColor: 'bg-orange-50', animate: false },
  { days: 1000, message: 'Fossilized consistency', color: 'text-orange-800', bgColor: 'bg-orange-50', animate: true },
  { days: 1025, message: 'Counting is optional now', color: 'text-red-800', bgColor: 'bg-red-50', animate: false },
  { days: 1050, message: 'Try a new mountain', color: 'text-red-800', bgColor: 'bg-red-50', animate: false },
  { days: 1075, message: 'This habit no longer needs tracking', color: 'text-red-800', bgColor: 'bg-red-50', animate: false },
  { days: 1095, message: 'Three years please consider letting this go', color: 'text-red-800', bgColor: 'bg-red-50', animate: true },
  { days: 1150, message: 'You\'re checking in out of nostalgia', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1200, message: 'Muscle memory discipline', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1300, message: 'This streak outlived its purpose', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1400, message: 'Energy better spent elsewhere', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1500, message: 'Foundation complete', color: 'text-red-800', bgColor: 'bg-red-100', animate: true },
  { days: 1600, message: 'Nothing left to prove', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1650, message: 'Tracker experiencing existential doubt', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1700, message: 'This goal has long been conquered', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1725, message: 'Tracker fatigue detected', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1750, message: 'DELETE THE APP YOU ARE THE HABIT', color: 'text-red-800', bgColor: 'bg-red-100', animate: true },
  { days: 1775, message: 'System reconsidering purpose', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1800, message: 'Signal weakening', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1810, message: 'Tracker entering standby', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1820, message: 'Final log approaching', color: 'text-red-800', bgColor: 'bg-red-100', animate: false },
  { days: 1825, message: 'Tracker out of commission', color: 'text-red-800', bgColor: 'bg-red-100', animate: true },
];

// ── Daily Filler Title Pool ──
// Used for non-milestone days (especially after Day 66).
// Intentionally forward-moving, amused, effortless-mastery tone.
const FILLER_TITLES: string[] = [
  'Still steady', 'Another brick laid', 'Quiet progress', 'Uninterrupted',
  'Continuing', 'Forward motion', 'Still deliberate', 'Routine holds',
  'Calm persistence', 'On schedule', 'Effort stored', 'Momentum intact',
  'Discipline remains', 'Day secured', 'Unbroken chain', 'Still intentional',
  'Structure maintained', 'Flow state', 'Another layer set', 'Endurance confirmed',
  'No deviation', 'Still rooted', 'Time well used', 'Habit maintained',
  'Foundation deepens', 'Still automatic', 'Practice continues', 'Stable trajectory',
  'Energy conserved', 'Chain reinforced', 'Calm execution', 'Unshaken',
  'Still aligned', 'Nothing dramatic', 'Progress logged in reality', 'Pattern intact',
  'Still reliable', 'Order preserved', 'Forward again', 'Ground held',
  'Trajectory unchanged', 'Continuing ascent', 'Still in motion', 'Persistence speaks',
  'System running smooth', 'Effort compounded', 'Quiet dominance', 'Unmoved',
  'Still present', 'Discipline breathing', 'Time invested', 'Another ring formed',
];

/**
 * Deterministic filler title based on day count.
 * Uses modulo to cycle through the pool consistently for the same streak value.
 */
const getFillerTitle = (days: number): string => {
  return FILLER_TITLES[days % FILLER_TITLES.length];
};

/**
 * Returns the milestone or filler title for a given streak count.
 * - If the streak exactly matches a milestone day, returns that milestone.
 * - Otherwise (for days between milestones, especially after day 66),
 *   returns a filler title with appropriate styling.
 * - Returns null for day 0 (no streak).
 */
export const getMilestoneForStreak = (days: number): HabitMilestone | null => {
  if (days <= 0) return null;

  // Check for exact milestone match
  const exactMatch = MILESTONES.find(m => m.days === days);
  if (exactMatch) return exactMatch;

  // For days <= 30, find the highest milestone at or below current day
  // (these are dense enough that fillers aren't needed)
  if (days <= 30) {
    let result: HabitMilestone | null = null;
    for (const m of MILESTONES) {
      if (m.days <= days) result = m;
      else break;
    }
    return result;
  }

  // For days > 30 between milestones, use a filler title
  // Find the color tier from the nearest lower milestone
  let tierColor = 'text-green-700';
  let tierBg = 'bg-green-50';
  for (const m of MILESTONES) {
    if (m.days <= days) {
      tierColor = m.color;
      tierBg = m.bgColor;
    } else break;
  }

  return {
    days,
    message: getFillerTitle(days),
    color: tierColor,
    bgColor: tierBg,
    animate: false,
  };
};

/**
 * Returns a Tailwind color class for the flame icon based on streak length.
 */
export const getFlameColorClass = (days: number): string => {
  if (days >= 365) return 'text-red-600';
  if (days >= 90) return 'text-red-500';
  if (days >= 30) return 'text-orange-500';
  if (days >= 14) return 'text-amber-500';
  if (days >= 7) return 'text-yellow-500';
  if (days >= 3) return 'text-yellow-400';
  if (days >= 1) return 'text-yellow-300';
  return 'text-slate-400';
};
