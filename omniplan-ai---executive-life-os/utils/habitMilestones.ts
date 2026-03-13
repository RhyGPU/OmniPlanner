export interface HabitMilestone {
  days: number;
  message: string;
  color: string;
  bgColor: string;
  animate: boolean;
}

const MILESTONES: HabitMilestone[] = [
  { days: 3, message: 'Here we go again', color: 'text-slate-600', bgColor: 'bg-slate-100', animate: false },
  { days: 7, message: 'A resolution good for only three days?', color: 'text-blue-600', bgColor: 'bg-blue-50', animate: false },
  { days: 14, message: 'Damn 2 Weeks!', color: 'text-cyan-600', bgColor: 'bg-cyan-50', animate: false },
  { days: 21, message: 'Habit created!', color: 'text-teal-700', bgColor: 'bg-teal-50', animate: true },
  { days: 30, message: 'Dedication!', color: 'text-green-700', bgColor: 'bg-green-50', animate: true },
  { days: 45, message: 'The Committed', color: 'text-emerald-700', bgColor: 'bg-emerald-50', animate: true },
  { days: 66, message: '66 days. Automated!', color: 'text-indigo-700', bgColor: 'bg-indigo-50', animate: true },
  { days: 90, message: 'A tree', color: 'text-violet-700', bgColor: 'bg-violet-50', animate: true },
  { days: 180, message: 'HALF A YEAR???', color: 'text-purple-700', bgColor: 'bg-purple-50', animate: true },
  { days: 270, message: 'An old Tree', color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-50', animate: true },
  { days: 365, message: 'Wanna move on?', color: 'text-pink-700', bgColor: 'bg-pink-50', animate: true },
  { days: 500, message: 'You made it. DELETE IT FOR GODS SAKE.', color: 'text-rose-700', bgColor: 'bg-rose-50', animate: true },
  { days: 730, message: 'Dinosaur', color: 'text-amber-800', bgColor: 'bg-amber-50', animate: true },
  { days: 1000, message: 'FOSSIL', color: 'text-orange-800', bgColor: 'bg-orange-50', animate: true },
  { days: 1500, message: 'Fossil Fuel', color: 'text-red-800', bgColor: 'bg-red-100', animate: true },
];

/**
 * Returns the highest milestone achieved for a given streak count,
 * or null if streak is below the minimum threshold.
 */
export const getMilestoneForStreak = (days: number): HabitMilestone | null => {
  let result: HabitMilestone | null = null;
  for (const m of MILESTONES) {
    if (days >= m.days) result = m;
    else break;
  }
  return result;
};

/**
 * Returns a Tailwind color class for the flame icon based on streak length.
 */
export const getFlameColorClass = (days: number): string => {
  if (days >= 90) return 'text-red-500';
  if (days >= 30) return 'text-orange-500';
  if (days >= 14) return 'text-amber-500';
  if (days >= 7) return 'text-yellow-500';
  if (days >= 3) return 'text-yellow-400';
  return 'text-slate-400';
};
