import { describe, expect, it } from 'vitest';
import {
  DAILY_STEP_BASELINE,
  RACE_FINISH_LINE,
  cappedSteps,
  ghostRivals,
  raceProgress,
  rankRacers,
  type RacerInput,
} from './index.ts';

const racer = (over: Partial<RacerInput> & { userId: string }): RacerInput => ({
  characterName: over.userId,
  species: null,
  steps: 0,
  total: 0,
  isSelf: false,
  ...over,
});

describe('RACE_FINISH_LINE', () => {
  it('is the Daily Walk baseline, not a second number', () => {
    expect(RACE_FINISH_LINE).toBe(DAILY_STEP_BASELINE);
  });
});

describe('cappedSteps', () => {
  it('passes a normal day through', () => {
    expect(cappedSteps(6_200)).toBe(6_200);
  });

  it('caps at the finish line — this is the anti-cheat', () => {
    expect(cappedSteps(RACE_FINISH_LINE + 90_000)).toBe(RACE_FINISH_LINE);
  });

  it('floors fractional steps', () => {
    expect(cappedSteps(6_200.9)).toBe(6_200);
  });

  it('treats absent, negative and non-finite input as zero', () => {
    expect(cappedSteps(0)).toBe(0);
    expect(cappedSteps(-5)).toBe(0);
    expect(cappedSteps(Number.NaN)).toBe(0);
  });
});

describe('raceProgress', () => {
  it('is a fraction of the finish line', () => {
    expect(raceProgress(RACE_FINISH_LINE / 2)).toBeCloseTo(0.5);
  });

  it('never exceeds 1, however far past the line the user went', () => {
    expect(raceProgress(RACE_FINISH_LINE * 4)).toBe(1);
  });
});

describe('rankRacers', () => {
  it('ranks by capped steps, descending', () => {
    const ranked = rankRacers([
      racer({ userId: 'b', steps: 3_000 }),
      racer({ userId: 'a', steps: 9_000 }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['a', 'b']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('ranks two people past the line as tied on steps, broken by daily score', () => {
    const ranked = rankRacers([
      racer({ userId: 'quiet', steps: 40_000, total: 3_100 }),
      racer({ userId: 'broad', steps: 12_000, total: 4_000 }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['broad', 'quiet']);
  });

  it('breaks a total tie on user id, so ordering is stable across refetches', () => {
    const ranked = rankRacers([
      racer({ userId: 'zoe', steps: 5_000, total: 900 }),
      racer({ userId: 'abe', steps: 5_000, total: 900 }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['abe', 'zoe']);
  });

  it('marks whoever reached the line as finished', () => {
    const ranked = rankRacers([
      racer({ userId: 'done', steps: RACE_FINISH_LINE }),
      racer({ userId: 'nearly', steps: RACE_FINISH_LINE - 1 }),
    ]);
    expect(ranked[0]!.finished).toBe(true);
    expect(ranked[1]!.finished).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = [racer({ userId: 'b', steps: 1 }), racer({ userId: 'a', steps: 2 })];
    rankRacers(input);
    expect(input.map((r) => r.userId)).toEqual(['b', 'a']);
  });

  it('returns an empty board rather than throwing', () => {
    expect(rankRacers([])).toEqual([]);
  });
});

describe('ghostRivals', () => {
  it('takes the most recent days first', () => {
    const ghosts = ghostRivals(
      [
        { localDate: '2026-08-20', steps: 4_000 },
        { localDate: '2026-08-23', steps: 7_000 },
        { localDate: '2026-08-22', steps: 5_000 },
      ],
      2,
    );
    expect(ghosts.map((g) => g.characterName)).toEqual(['2026-08-23', '2026-08-22']);
  });

  it('skips days that scored nothing, so a new account does not race three zeros', () => {
    const ghosts = ghostRivals(
      [
        { localDate: '2026-08-23', steps: 0 },
        { localDate: '2026-08-22', steps: 5_000 },
      ],
      3,
    );
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.characterName).toBe('2026-08-22');
  });

  it('marks ghosts as ghosts and never as self', () => {
    const [ghost] = ghostRivals([{ localDate: '2026-08-22', steps: 5_000 }], 1);
    expect(ghost!.isGhost).toBe(true);
    expect(ghost!.isSelf).toBe(false);
    expect(ghost!.userId).toBe('ghost:2026-08-22');
  });

  it('returns nothing when there is no history', () => {
    expect(ghostRivals([], 3)).toEqual([]);
  });
});
