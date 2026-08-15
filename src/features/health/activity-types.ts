import type { WorkoutActivityType } from '@kingstinct/react-native-healthkit';
import { RUN_ACTIVITY_TYPE, STRENGTH_ACTIVITY_TYPES } from '@kairo/core';

/**
 * A compile-time guard that Kairo's activity-type constants still match
 * Apple's raw values.
 *
 * **Why this is not a test.** `@kairo/core` is zero-dependency and cannot
 * import the HealthKit library to check itself. Nor can a test: anything
 * importing `@kingstinct/react-native-healthkit` drags in React Native's Flow
 * syntax that root Vitest cannot parse — the same constraint that made
 * `read-types.ts` and `sync-state.ts` separate files in the first place. A
 * runtime guard is simply not available here, and reaching for one is the
 * obvious mistake.
 *
 * `import type` is fully erased, so nothing Flow-flavoured reaches a bundler or
 * a test runner — but `tsc` still checks these assignments, and
 * `npm run typecheck` runs `tsc`. If Apple's raw values ever moved, typecheck
 * fails loudly rather than the Strength challenge quietly matching nothing.
 *
 * This file is imported nowhere on purpose. It exists to be type-checked.
 */

// Each assignment is checked against the library's own enum *member* type, so
// a value that drifted by one would not compile. This only works because the
// constants are declared `as const` — widened to `number`, every line below
// would still typecheck and would check nothing.
const _run: WorkoutActivityType.running = RUN_ACTIVITY_TYPE;

const _strength: readonly [
  WorkoutActivityType.functionalStrengthTraining,
  WorkoutActivityType.traditionalStrengthTraining,
  WorkoutActivityType.coreTraining,
] = STRENGTH_ACTIVITY_TYPES;

// Referenced so `noUnusedLocals` cannot delete the guard by complaining about
// it. The export is the reference; nothing imports this module.
export const ACTIVITY_TYPES_CHECKED = [_run, _strength] as const;
