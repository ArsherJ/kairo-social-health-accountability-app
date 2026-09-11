import type { StatRecord } from '../profile/records.ts';
import { DEMO_LEADERBOARD, DEMO_LEADERBOARD_COMPLETED, DEMO_STREAK } from '../demo/fixtures.ts';
import type { LeaderboardMode } from '../squad/queries.ts';
import type { PreviewState } from './preview-copy.ts';
import {
  ghostRivals,
  MAX_DAILY_SCORE_PHONE_ONLY,
  pickQuests,
  rankRacers,
  type QuestDay,
  questProgress,
} from '@kairo/core';
import { bodyReading, mindReading, motionReading } from '../character/today-board.ts';
import {
  livingCharacterLabel,
  locationName,
  motionLocationForSteps,
  resolveLivingMirror,
} from '../character/living-mirror.ts';
import { reactionCandidates, selectLivingReaction } from '../character/living-reaction.ts';
import { dailyWalkState } from '../train/daily-walk.ts';
import { selectNextStep } from '../quests/next-step.ts';
import { STAT_NAMES } from '../../ui/stat-names.ts';
import { ghostDayLabel } from '../squad/ghost-day-label.ts';
import type { Streak } from '../profile/queries.ts';

export const PREVIEW_FIXTURES = [
  { id: 'standard', label: 'Everyday' },
  { id: 'long-name', label: 'Long names' },
  { id: 'ridge', label: 'Ridge' },
  { id: 'ceiling', label: 'Ceiling + reaction' },
  { id: 'no-sleep', label: 'No sleep' },
  { id: 'ghosts', label: 'Ghost days' },
  { id: 'sky-wide-rival', label: 'Wide sky label' },
] as const;

export type PreviewFixture = (typeof PREVIEW_FIXTURES)[number]['id'];

const LONG_NAMES = [
  'Munting Tala sa Gabi',
  'Hiraya ng Kalangitan',
  'Mayumi sa Kalangitan',
] as const;

const LONG_NAME_BY_USER_ID = new Map(
  DEMO_LEADERBOARD.map((member) => [
    member.user_id,
    member.is_self
      ? LONG_NAMES[0]
      : member.character_name === 'Ramon'
        ? LONG_NAMES[1]
        : LONG_NAMES[2],
  ]),
);

export function previewIdentity(fixture: PreviewFixture) {
  const name = fixture === 'long-name' ? LONG_NAMES[0] : 'Dagit';
  return {
    name,
    handle: fixture === 'long-name' ? '@munting-tala' : '@dagit',
  };
}

export const PREVIEW_TODAY = '2026-09-09';
export const PREVIEW_RECORDS: readonly StatRecord[] = [
  { stat: 'AGI', value: 12540, localDate: '2026-09-08' },
  { stat: 'STR', value: 684, localDate: '2026-09-06' },
  { stat: 'MND', value: 480, localDate: '2026-09-07' },
];
export const PREVIEW_STREAK = DEMO_STREAK;
export const PREVIEW_POINTS = { AGI: 8000, STR: 6500, MND: 4000 };

function previewTodaySteps(state: PreviewState, fixture: PreviewFixture): number {
  if (state === 'empty') return 0;
  return fixture === 'ridge' || fixture === 'ceiling' ? 10_000 : 6840;
}

/** Fixture inputs only; the production reading and quest rules build the UI. */
export function previewDashboard(
  state: PreviewState,
  fixture: PreviewFixture = 'standard',
) {
  const ridge = fixture === 'ridge';
  const ceiling = fixture === 'ceiling';
  const noSleep = fixture === 'no-sleep' || ridge;
  const day: QuestDay = state === 'empty'
    ? { steps: 0, activeKcal: 0, activeHours: 0, distanceM: 0, sleepMinutes: null }
    : {
      steps: previewTodaySteps(state, fixture),
      activeKcal: ceiling ? 1200 : 342,
      activeHours: ceiling ? 12 : 5,
      distanceM: ridge || ceiling ? 7600 : 4800,
      sleepMinutes: noSleep ? null : ceiling ? 540 : 450,
    };
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
  const walk = dailyWalkState({ todaySteps: day.steps, today: PREVIEW_TODAY, days: [] });
  const next = selectNextStep({ quests, strengthChallengeOptedIn: false });
  const identity = previewIdentity(fixture);
  const level = state === 'empty' ? 1 : ceiling ? 100 : 12;
  const dailyScore = state !== 'empty' && ceiling ? MAX_DAILY_SCORE_PHONE_ONLY : 0;
  const reaction = state !== 'empty' && ceiling
    ? selectLivingReaction(reactionCandidates({
      localDate: PREVIEW_TODAY,
      characterName: identity.name,
      previousLevel: level - 1,
      currentLevel: level,
      motionLocation: location,
      dailyWalkMet: walk.met,
      recordStatsToday: [],
      verifiedWorkoutOccurrence: null,
      statNames: STAT_NAMES,
    }), {}).reaction
    : null;
  const mirror = resolveLivingMirror({
    steps: day.steps,
    verifiedStrengthMinutes: 0,
    hasSleepSource: true,
    sleepMinutes: day.sleepMinutes,
    lifetimeBodyPoints: PREVIEW_POINTS.STR,
    nextStep: next,
    reaction,
  });
  return {
    day,
    identity,
    level,
    quests,
    next,
    reaction,
    mirror,
    ceilingReached: dailyScore >= MAX_DAILY_SCORE_PHONE_ONLY,
    figureLabel: livingCharacterLabel({
      characterName: identity.name,
      level,
      location: mirror.motion.location,
      mind: mirror.mind,
    }),
    motion: motionReading({
      steps: day.steps,
      locationName: locationName(location),
      walk,
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

export function previewMembers(
  state: PreviewState,
  mode: LeaderboardMode = 'current',
  fixture: PreviewFixture = 'standard',
) {
  const members = mode === 'current' ? DEMO_LEADERBOARD : DEMO_LEADERBOARD_COMPLETED;
  const namedMembers = fixture === 'long-name'
    ? members.map((member) => ({
      ...member,
      character_name: LONG_NAME_BY_USER_ID.get(member.user_id) ?? LONG_NAMES[2],
    }))
    : members;
  const currentMembers = mode === 'current'
    ? namedMembers.map((member) => member.is_self
      ? { ...member, steps: previewTodaySteps(state, fixture) }
      : member)
    : namedMembers;
  const self = currentMembers.find((member) => member.is_self)!;
  if (state === 'empty') return [{ ...self, steps: 0 }];
  if (state === 'withheld') {
    return currentMembers.map((member) => ({
      ...member,
      steps: null,
      active_kcal: null,
      distance_m: null,
      sleep_minutes: null,
    }));
  }
  return currentMembers;
}

export function previewSkyRacers(
  state: PreviewState,
  fixture: PreviewFixture = 'standard',
) {
  const allMembers = previewMembers(state, 'current', fixture);
  const members = fixture === 'ghosts'
    ? allMembers.filter((member) => member.is_self)
    : fixture === 'sky-wide-rival'
      ? allMembers
        .filter((member) => member.is_self || member.character_name === 'Ramon')
        .map((member) => member.is_self ? member : {
          ...member,
          character_name: LONG_NAMES[1],
          steps: member.steps === null ? null : 400,
        })
      : allMembers;
  const memberRacers = members.flatMap((member) => member.steps === null ? [] : [{
    userId: member.user_id,
    characterName: member.character_name,
    species: member.species,
    steps: member.steps,
    total: member.total,
    isSelf: member.is_self,
  }]);
  const ghosts = fixture === 'ghosts'
    ? ghostRivals([
      { localDate: '2026-09-08', steps: 9200 },
      { localDate: '2026-09-07', steps: 7100 },
      { localDate: '2026-09-06', steps: 4800 },
    ], 3).map((ghost) => ({
      ...ghost,
      characterName: ghostDayLabel(ghost.characterName, PREVIEW_TODAY),
    }))
    : [];
  const racers = rankRacers([...memberRacers, ...ghosts]);
  return {
    members,
    racers,
    ghostIndexes: racers.flatMap((racer, index) => racer.isGhost ? [index] : []),
  };
}

export function previewStreak(fixture: PreviewFixture): Streak {
  if (fixture === 'ridge') {
    return { ...PREVIEW_STREAK, current_streak: 5 };
  }
  if (fixture === 'ceiling') {
    return { ...PREVIEW_STREAK, current_streak: 8, shield_available_on: '2026-09-20' };
  }
  return PREVIEW_STREAK;
}
