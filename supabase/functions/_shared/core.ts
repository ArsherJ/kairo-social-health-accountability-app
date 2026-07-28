/**
 * The one copy of the scoring logic.
 *
 * Deno resolves this relative path directly, and the Expo client reaches the
 * same files through the `@kairo/core` alias. Neither side has its own
 * implementation, so the server stays authoritative (spec §12) without paying
 * a duplicated-logic tax.
 */
export * from '../../../packages/kairo-core/src/index.ts';
