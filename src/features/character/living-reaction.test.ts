import { describe, expect, it } from 'vitest';
import { KAIRO_REACTIONS } from './character-contract.ts';
import { reactionCandidates, selectLivingReaction } from './living-reaction.ts';

// At the Ridge the Daily Walk is met by construction — they are the same
// comparison against the same constant — so `base` pairs them, and the location
// candidate is deliberately absent.
const base = {
  localDate: '2026-09-01',
  characterName: 'Dagit',
  previousLevel: 2,
  currentLevel: 3,
  motionLocation: 'ridge' as const,
  dailyWalkMet: true,
  recordStatsToday: ['AGI'] as const,
  verifiedWorkoutOccurrence: 'workout:abc',
  statNames: { AGI: 'Motion', STR: 'Body', MND: 'Mind' },
};

const quiet = {
  ...base, currentLevel: 2, previousLevel: 2, dailyWalkMet: false,
  recordStatsToday: [] as const, verifiedWorkoutOccurrence: null,
};

describe('Living Mirror reactions', () => {
  it('prioritizes level, record, Daily Walk, then workout', () => {
    const candidates = reactionCandidates(base);
    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      'level', 'record', 'daily_walk', 'workout',
    ]);
    expect(selectLivingReaction(candidates, {}).reaction?.kind).toBe('level');
  });

  it('gives the Ridge to the Daily Walk and builds no location candidate for it', () => {
    expect(reactionCandidates(base).some((item) => item.kind === 'motion_location')).toBe(false);
    expect(reactionCandidates({ ...quiet, motionLocation: 'climb' })
      .some((item) => item.kind === 'motion_location')).toBe(true);
    expect(reactionCandidates(base).find((item) => item.kind === 'daily_walk')?.sentence)
      .toBe('Dagit cleared the ridge. The Daily Walk is done.');
  });

  it('consumes only the presented occurrence so the rest survive the day', () => {
    const candidates = reactionCandidates(base);
    const first = selectLivingReaction(candidates, {});
    expect(first.reaction?.kind).toBe('level');
    expect(first.consumed).toEqual([first.reaction]);

    // The next opening the same day offers the next-highest, rather than having
    // silently destroyed it alongside the level-up.
    const seen = { level: first.reaction!.occurrence };
    expect(selectLivingReaction(candidates, seen).reaction?.kind).toBe('record');
  });

  it('maps every trigger onto an existing KairoReactionId', () => {
    for (const candidate of reactionCandidates(base)) {
      expect(KAIRO_REACTIONS).toContain(candidate.animation);
    }
    expect(reactionCandidates(base).find((c) => c.kind === 'level')?.animation).toBe('level_up');
    expect(reactionCandidates(base).find((c) => c.kind === 'workout')?.animation).toBe('excited');
    expect(reactionCandidates({ ...quiet, motionLocation: 'valley' })
      .find((c) => c.kind === 'motion_location')?.animation).toBe('happy');
  });

  it('never builds a tired reaction', () => {
    expect(reactionCandidates(base).some((item) => item.animation === 'tired')).toBe(false);
  });

  it('does not replay stored occurrences', () => {
    const candidates = reactionCandidates(base);
    const seen = Object.fromEntries(candidates.map((candidate) => [candidate.kind, candidate.occurrence]));
    expect(selectLivingReaction(candidates, seen).reaction).toBeNull();
  });

  it('does not turn an initial observed level into a level-up', () => {
    expect(reactionCandidates({ ...base, previousLevel: null }).some((item) => item.kind === 'level')).toBe(false);
  });

  it('ignores historical records and only builds same-day occurrences', () => {
    expect(reactionCandidates({ ...base, recordStatsToday: [], verifiedWorkoutOccurrence: null })
      .some((item) => item.kind === 'record')).toBe(false);
  });

  it('uses date plus location so midnight creates a new location occurrence', () => {
    const first = reactionCandidates({ ...quiet, motionLocation: 'climb' });
    const next = reactionCandidates({ ...quiet, motionLocation: 'climb', localDate: '2026-09-02' });
    expect(first.at(-1)?.occurrence).toBe('motion:2026-09-01:climb');
    expect(next.at(-1)?.occurrence).toBe('motion:2026-09-02:climb');
  });

  // Moved here from `kairo-voice.test.ts` with `heroSentence`'s retirement. The
  // ladder's vocabulary survives the function that produced it: "ridge" names
  // the finish and nothing else, and the arrival is said once.
  it('keeps the ridge sentence for the finish and never for a lower band', () => {
    for (const location of ['treeline', 'valley', 'climb'] as const) {
      const sentence = reactionCandidates({ ...quiet, motionLocation: location })
        .find((item) => item.kind === 'motion_location')?.sentence;
      expect(sentence).not.toMatch(/ridge/i);
      expect(sentence).not.toMatch(/cleared|clearing/i);
    }
  });
});
