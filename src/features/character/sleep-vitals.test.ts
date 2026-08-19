import { describe, expect, it } from 'vitest';
import { scoredSleepMinutes } from './sleep-vitals.ts';

describe('scoredSleepMinutes', () => {
  it('reports a measured night', () => {
    expect(scoredSleepMinutes({ minutes: 420, was_user_entered: false })).toBe(420);
  });

  it('reports nothing for a hand-typed night, whatever its minutes say', () => {
    // The whole fix. Without this the home screen offers "1h more sleep for
    // Gold Mind" against a day the server scored `mind_points` 0 and MND
    // `none`, and the TODAY panel prints the hours beside it.
    expect(scoredSleepMinutes({ minutes: 360, was_user_entered: true })).toBeNull();
    expect(scoredSleepMinutes({ minutes: 1_440, was_user_entered: true })).toBeNull();
  });

  it('treats a NULL flag as measured, which is the whole existing cohort', () => {
    // Every row written before the expand migration, and every row written by
    // a client that has not updated. Reading NULL as hand entry would blank
    // the sleep row for everyone using Kairo today.
    expect(scoredSleepMinutes({ minutes: 420, was_user_entered: null })).toBe(420);
  });

  it('returns null rather than zero, because they are different claims', () => {
    // `stat-detail.ts` skips a stat whose raw value is null and ranks one
    // whose raw value is 0 — a zero would let MND win the guidance line over
    // stats with real progress, every day, for a user with no sleep data.
    expect(scoredSleepMinutes(null)).toBeNull();
    expect(scoredSleepMinutes(undefined)).toBeNull();
    expect(scoredSleepMinutes({ minutes: 0, was_user_entered: false })).toBeNull();
    expect(scoredSleepMinutes({ minutes: null, was_user_entered: false })).toBeNull();
  });

  it('reads minutes PostgREST widened to a string', () => {
    expect(scoredSleepMinutes({ minutes: '420', was_user_entered: false })).toBe(420);
  });

  it('answers exactly what the server scores for the same three rows', () => {
    // Not shared code — one is an Edge Function, one is a screen — so the
    // agreement is pinned here instead. `scoringSleepMinutes` in
    // scoring-inputs.ts returns 420, null and 420 for these three.
    expect(scoredSleepMinutes({ minutes: 420, was_user_entered: false })).toBe(420);
    expect(scoredSleepMinutes({ minutes: 420, was_user_entered: true })).toBeNull();
    expect(scoredSleepMinutes({ minutes: 420, was_user_entered: null })).toBe(420);
  });
});
