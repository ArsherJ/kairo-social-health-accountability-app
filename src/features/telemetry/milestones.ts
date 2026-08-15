/**
 * Events that may fire exactly once in an account's life.
 *
 * Split from the MMKV store beside it so the rule is testable in Node: root
 * Vitest cannot load `react-native-mmkv`. The same split `sync-state.ts` and
 * `storage.ts` already use.
 */

export type Milestone = 'first_sync_seen' | 'first_score_seen';

export function shouldFire(
  reached: readonly Milestone[],
  milestone: Milestone,
): boolean {
  return !reached.includes(milestone);
}
