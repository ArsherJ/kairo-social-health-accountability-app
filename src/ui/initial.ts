/**
 * The first character of a name, uppercased, for the Flock strip's marks.
 *
 * Zero-import on purpose, like `stat-names.ts`: `flock-walk.ts` is tested by
 * root Vitest, which cannot load a component file at all.
 *
 * `Array.from` rather than `[0]`: a name can begin with an emoji or an astral
 * character, and indexing a string would hand back half a surrogate pair.
 * A name with nothing in it yields `'?'` rather than an empty disc.
 */
export function initialFor(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
