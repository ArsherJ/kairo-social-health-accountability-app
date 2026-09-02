import { describe, expect, it } from 'vitest';
import { STRENGTH_ACTIVITY_TYPES } from '@kairo/core';
import { WORKOUT_SOURCE_ALLOWLIST } from '../../../supabase/functions/_shared/scoring-inputs.ts';
import {
  DISPLAY_WORKOUT_SOURCE_ALLOWLIST,
  summarizeTodayStrength,
  type TodayStrengthRow,
} from './today-strength-model.ts';

function row(overrides: Partial<TodayStrengthRow> = {}): TodayStrengthRow {
  return {
    hkUuid: 'session-a',
    startedAt: '2026-09-01T01:00:00.000Z',
    activityType: STRENGTH_ACTIVITY_TYPES[0],
    durationS: 3_600,
    sourceBundleId: DISPLAY_WORKOUT_SOURCE_ALLOWLIST[0],
    wasUserEntered: false,
    hasHeartRateEvidence: true,
    ...overrides,
  };
}

describe('summarizeTodayStrength', () => {
  it('keeps its display allowlist equal to the server scoring authority', () => {
    expect(DISPLAY_WORKOUT_SOURCE_ALLOWLIST).toEqual(WORKOUT_SOURCE_ALLOWLIST);
  });

  it('sums verified strength seconds once and converts them to minutes', () => {
    expect(summarizeTodayStrength([row(), row({ hkUuid: 'session-b', durationS: 1_800 })]))
      .toEqual({ verifiedMinutes: 90, latestOccurrence: 'workout:session-b' });
  });

  it('picks the same latest session whatever order PostgREST returns rows in', () => {
    const rows = [row(), row({ hkUuid: 'session-b', durationS: 1_800 })];
    expect(summarizeTodayStrength([...rows].reverse()).latestOccurrence)
      .toBe(summarizeTodayStrength(rows).latestOccurrence);
  });

  it.each([
    { activityType: 37 },
    { hasHeartRateEvidence: false },
    { wasUserEntered: true },
    { sourceBundleId: 'com.apple.Health' },
  ])('excludes unverified evidence %#', (override) => {
    expect(summarizeTodayStrength([row(override)])).toEqual({
      verifiedMinutes: 0, latestOccurrence: null,
    });
  });
});
