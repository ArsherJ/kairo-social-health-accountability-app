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

export type Milestone =
  | 'first_sync_seen'
  | 'first_score_seen'
  /**
   * The day the rest of the app appeared (design §5). Once-ever like its
   * siblings — the stage is derived from a day count, so without a marker this
   * would re-fire on every launch after the threshold, turning an unlock into a
   * launch counter.
   */
  | 'disclosure_unlocked'
  /**
   * The three welcome pop-ups have been seen (deviation #58).
   *
   * Once-ever, and MMKV rather than a `profiles` column for the same reason
   * `first_sync_seen` is: it is a fact about this *install* showing something,
   * not about the account, and a column would need a migration and a grant to
   * record a thing no server-side logic reads. The cost is that a reinstall
   * shows them again, which is the right side to err on — a returning user
   * seeing three cards once beats a new user on a second device never being
   * told the rule of the game.
   */
  | 'welcome_seen';
