/**
 * @kairo/core — the single source of scoring truth.
 *
 * Pure, zero-dependency TypeScript imported verbatim by both the Expo client
 * and the Supabase Edge Functions. No I/O, no clock reads, no randomness:
 * every function takes what it needs as an argument. That is what lets the
 * server stay authoritative (spec §12) without paying a duplicated-logic tax,
 * and what lets the whole engine be tested in plain node.
 */

export * from './types.ts';
export * from './scoring.ts';
export * from './day.ts';
export * from './profile.ts';
export * from './squad.ts';
export * from './program.ts';
export * from './anticheat.ts';
export * from './progression.ts';
export * from './dominance.ts';
export * from './compute.ts';
export * from './event.ts';
export * from './challenge.ts';
export * from './quest.ts';
export * from './race.ts';
export * from './sky-path.ts';
export * from './disclosure.ts';
export * from './strain.ts';
export * from './mind.ts';
export * from './shifts.ts';
export * from './capability.ts';
export * from './trust.ts';
export * from './streak.ts';
export * from './notifications.ts';
