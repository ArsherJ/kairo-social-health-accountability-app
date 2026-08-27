import type { KairoPose } from './character-contract';

export const KAIRO_THUMBNAIL_POSE: Record<
  'skyMarker' | 'leaderboard' | 'eventMember',
  KairoPose
> = {
  skyMarker: 'run',
  leaderboard: 'idle',
  eventMember: 'idle',
};
