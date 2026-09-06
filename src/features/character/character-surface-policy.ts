import type { KairoPose } from './character-contract';

/**
 * The pose each compact surface draws KAIRO in.
 *
 * `eventMember` went with the Battle on 2026-09-06 (deviation #66): the Event
 * detail screen was its only reader and both event routes are gone. Two
 * surfaces left, and the record is keyed rather than widened so a third has to
 * be added deliberately.
 */
export const KAIRO_THUMBNAIL_POSE: Record<'skyMarker' | 'leaderboard', KairoPose> = {
  skyMarker: 'run',
  leaderboard: 'idle',
};
