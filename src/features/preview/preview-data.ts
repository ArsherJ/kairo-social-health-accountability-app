import type { StatRecord } from '../profile/records.ts';
import { DEMO_LEADERBOARD, DEMO_LEADERBOARD_COMPLETED, DEMO_STREAK } from '../demo/fixtures.ts';
import type { LeaderboardMode } from '../squad/queries.ts';
import type { PreviewState } from './preview-copy.ts';
import { pickQuests, type QuestDay, questProgress } from '@kairo/core';
import { bodyReading, mindReading, motionReading } from '../character/today-board.ts';
import { locationName, motionLocationForSteps } from '../character/living-mirror.ts';
import { dailyWalkState } from '../train/daily-walk.ts';
import { selectNextStep } from '../quests/next-step.ts';

export const PREVIEW_TODAY = '2026-09-09';
export const PREVIEW_RECORDS: readonly StatRecord[] = [
  { stat: 'AGI', value: 12540, localDate: '2026-09-08' },
  { stat: 'STR', value: 684, localDate: '2026-09-06' },
  { stat: 'MND', value: 480, localDate: '2026-09-07' },
];
export const PREVIEW_STREAK = DEMO_STREAK;
export const PREVIEW_POINTS = { AGI: 8000, STR: 6500, MND: 4000 };

/** Fixture inputs only; the production reading and quest rules build the UI. */
export function previewDashboard(state: PreviewState) {
  const day: QuestDay = state === 'empty'
    ? { steps: 0, activeKcal: 0, activeHours: 0, distanceM: 0, sleepMinutes: null }
    : { steps: 6840, activeKcal: 342, activeHours: 5, distanceM: 4800, sleepMinutes: 450 };
  const quests = pickQuests({
    userId: 'preview',
    localDate: PREVIEW_TODAY,
    tier: 'steady',
    hasSleep: true,
  })
    .map((quest) => ({ quest, state: questProgress(quest, day) }));
  const bodyQuest = quests.find((entry) => entry.quest.metric === 'active_kcal');
  const mindQuest = quests.find((entry) => entry.quest.metric === 'sleep_minutes');
  const location = motionLocationForSteps(day.steps);
  return {
    day,
    location,
    quests,
    next: selectNextStep({ quests, strengthChallengeOptedIn: false }),
    motion: motionReading({
      steps: day.steps,
      locationName: locationName(location),
      walk: dailyWalkState({ todaySteps: day.steps, today: PREVIEW_TODAY, days: [] }),
    }),
    body: bodyReading({
      activeKcal: day.activeKcal,
      verifiedStrengthMinutes: 0,
      quest: bodyQuest ? { def: bodyQuest.quest, state: bodyQuest.state } : null,
    }),
    mind: mindReading({
      hasSleepSource: true,
      sleepMinutes: day.sleepMinutes,
      quest: mindQuest ? { def: mindQuest.quest, state: mindQuest.state } : null,
    }),
  };
}

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
