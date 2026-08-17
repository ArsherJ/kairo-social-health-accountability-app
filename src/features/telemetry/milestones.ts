/**
 * Events that may fire exactly once in an account's life.
 *
 * Kept apart from the MMKV store beside it so the type can be imported
 * without pulling in `react-native-mmkv`, which root Vitest cannot load. This
 * file used to also hold `shouldFire`, a pure predicate over an already-read
 * list of reached milestones — added for the same testability reason, but
 * both call sites (`useHealthSync.ts`, `app/(tabs)/index.tsx`) ended up
 * calling `hasReached()` against the store directly instead, so it had zero
 * production callers and was removed in the final whole-branch review.
 */

export type Milestone = 'first_sync_seen' | 'first_score_seen';
