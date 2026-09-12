/**
 * FNV-1a, 32-bit, unsigned.
 *
 * A hash rather than a PRNG wherever the keystone needs "the same answer all
 * day": every caller must be answerable from its arguments alone, which is what
 * makes a daily quest set, a trivia pick or a seed persona a property of the
 * function rather than of a cache.
 *
 * `Math.imul` keeps the multiply in 32 bits; a plain `*` loses precision past
 * 2^53 and the hash stops being uniform. Like `median.ts`, deliberately **not
 * re-exported from `index.ts`** — reached by relative path from inside the
 * package, from the Edge Functions' `_shared`, and from the zero-import app
 * modules root Vitest tests.
 */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
