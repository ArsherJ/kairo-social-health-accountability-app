import type { StatRecord } from '../profile/records.ts';
import { DEMO_LEADERBOARD, DEMO_LEADERBOARD_COMPLETED, DEMO_STREAK } from '../demo/fixtures.ts';
import type { LeaderboardMode } from '../squad/queries.ts';
import type { PreviewState } from './preview-copy.ts';

export const PREVIEW_TODAY = '2026-09-09';
export const PREVIEW_RECORDS: readonly StatRecord[] = [
  { stat: 'AGI', value: 12540, localDate: '2026-09-08' },
  { stat: 'STR', value: 684, localDate: '2026-09-06' },
  { stat: 'MND', value: 480, localDate: '2026-09-07' },
];
export const PREVIEW_STREAK = DEMO_STREAK;
export const PREVIEW_POINTS = { AGI: 8000, STR: 6500, MND: 4000 };

export function previewMembers(state: PreviewState, mode: LeaderboardMode = 'current') {
  const members = mode === 'current' ? DEMO_LEADERBOARD : DEMO_LEADERBOARD_COMPLETED;
  const self = members.find((member) => member.is_self)!;
  if (state === 'empty') return [{ ...self, steps: 0 }];
  if (state === 'withheld') {
    return members.map((member) => ({
      ...member,
      steps: null,
      active_kcal: null,
      distance_m: null,
      sleep_minutes: null,
    }));
  }
  return members;
}
