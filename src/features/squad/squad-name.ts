/**
 * The squad-name rule, and what to say about it while someone is typing.
 *
 * The QA pass reached for a long name and found the field stop accepting
 * characters with no counter and no message, then a Create button that stayed
 * disabled without saying why. Both are the same defect: the form knew exactly
 * what was wrong and rendered none of it.
 *
 * Pure and separate from `CreateSquadForm.tsx` so it can be tested at all —
 * anything importing a component pulls in React Native's Flow syntax that root
 * Vitest cannot parse, the constraint `sync-state.ts` and `read-types.ts` both
 * record.
 */

/**
 * Mirrors the database CHECK, `char_length(btrim(name)) between 2 and 30`.
 * Validating the *trimmed* length is what keeps the client's answer and the
 * server's the same; a looser rule here would only move the rejection later.
 */
export const SQUAD_NAME_MIN = 2;
export const SQUAD_NAME_MAX = 30;

/** How close to the ceiling the counter starts showing. */
const COUNTER_FROM = SQUAD_NAME_MAX - 5;

export function isValidSquadName(raw: string): boolean {
  const length = raw.trim().length;
  return length >= SQUAD_NAME_MIN && length <= SQUAD_NAME_MAX;
}

/**
 * The line under the field, or null when the field can speak for itself.
 *
 * Silent on an untouched field: a form that opens already telling you what you
 * have done wrong is a form that nags. It only speaks once there is something
 * true to say about what is actually in the box.
 */
export function squadNameHint(raw: string): string | null {
  const trimmed = raw.trim();

  if (trimmed.length === 0) return null;

  if (trimmed.length < SQUAD_NAME_MIN) {
    return `A name needs at least ${SQUAD_NAME_MIN} characters.`;
  }

  // `maxLength` on the input means this is the ceiling, not an error — the
  // field has stopped accepting keystrokes and the counter is the only thing
  // that explains why.
  if (trimmed.length >= SQUAD_NAME_MAX) {
    return `${SQUAD_NAME_MAX} of ${SQUAD_NAME_MAX} — that is the longest a squad name can be.`;
  }

  if (trimmed.length >= COUNTER_FROM) {
    return `${trimmed.length} of ${SQUAD_NAME_MAX}`;
  }

  return null;
}
