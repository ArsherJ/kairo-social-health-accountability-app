import { focusStat, type CoreStat, type UserFocus } from '@kairo/core';

/**
 * "Your lane" — the character screen's response to the focus question.
 *
 * **Presentation only.** It reads `profiles.focus` and touches no scoring: the
 * lane stat is highlighted and its empty bar speaks the focus's language, and
 * that is the whole of it. What actually changes points is the squad's program,
 * which is a different thing consented to at a different moment.
 */
export function laneStat(focus: UserFocus | null): CoreStat | null {
  return focusStat(focus);
}

/**
 * What an empty lane bar says. Null when there is no lane — "a bit of
 * everything" and a skipped focus both mean no single stat speaks for the user,
 * and inventing one would be putting words in their mouth.
 */
const LANE_EMPTY_COPY: Record<UserFocus, string | null> = {
  running: 'Your next run fills this bar.',
  gym: 'Your next session fills this bar.',
  walking: 'Your next walk fills this bar.',
  general: null,
};

export function laneEmptyCopy(focus: UserFocus | null): string | null {
  return focus === null ? null : LANE_EMPTY_COPY[focus];
}
