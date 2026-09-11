import { CORE_STATS, FREE_SQUAD_MAX_MEMBERS, ratingForStatPoints } from '@kairo/core';
import { STAT_NAMES } from '../../ui/stat-names.ts';

export const PERCH_COPY = {
  eyebrow: 'A little company. A little lift.',
  title: 'Your flock',
  invite: 'Invite',
  inviteLabel: 'Invite a friend to your flock',
  hint: 'Tap a bird. Say hello.',
  board: 'On the perch',
  today: 'Today',
  yesterday: 'Yesterday',
  close: 'Back to the flock',
  notSharing: 'Not sharing',
  readingsPending: 'Your readings are loading.',
  readingsError: 'Your readings couldn’t load. Try again.',
  retry: 'Try again',
  solo: 'A place for you. Room for your people.',
  capacity: `Up to ${FREE_SQUAD_MAX_MEMBERS} birds, one flock.`,
} as const;

export function birdLabel(
  name: string,
  level: number,
  whackable = false,
  state: { leader?: boolean; whacked?: boolean } = {},
): string {
  return `${name}, level ${level}.${state.leader ? ' Leading this board.' : ''}${
    state.whacked ? ' Feathers ruffled today.' : ''
  } ${whackable ? 'View bird and send a whack.' : 'View bird.'}`;
}

export function perchLead(
  mode: 'current' | 'completed',
  walked: number,
  total: number,
): string | null {
  if (total < 2) return null;
  return `${walked} of ${total} walked ${mode === 'current' ? 'today' : 'yesterday'}.`;
}

export function perchDayLine(steps: number | null, mode: 'current' | 'completed'): string {
  if (steps === null) return PERCH_COPY.notSharing;
  return `${Math.round(steps).toLocaleString('en-US')} steps ${
    mode === 'current' ? 'today' : 'yesterday'
  }`;
}

export function perchStatsLabel(ratings: Readonly<Record<string, number>>): string {
  return CORE_STATS.filter((stat) => ratings[stat] !== undefined)
    .map((stat) => `${STAT_NAMES[stat]} ${ratingForStatPoints(ratings[stat]!)}`).join(', ');
}
