import { describe, expect, it } from 'vitest';
import { MIN_VISIBLE_MS, hatchingWindow, msUntilNextChange } from './hatching-window.ts';

const T = 1_000_000;
const at = (openedAt: number | null, finishedAt: number | null, now: number) =>
  hatchingWindow({ openedAt, finishedAt, now });

describe('hatchingWindow', () => {
  it('shows nothing before the beat opens', () => {
    // The caller is still on the ask, or the permission sheet is up. Neither
    // is a moment to advance from.
    expect(at(null, null, T)).toEqual({ visible: false, mayAdvance: false });
  });

  it('holds the card open while the read is still running', () => {
    // Even long past the minimum — the beat may not hand over to a reveal that
    // has no number in it yet.
    expect(at(T, null, T)).toEqual({ visible: true, mayAdvance: false });
    expect(at(T, null, T + MIN_VISIBLE_MS * 10)).toEqual({ visible: true, mayAdvance: false });
  });

  it('holds the card for the minimum even when the read is instant', () => {
    // The case this module exists for: on a fast phone the read lands in under
    // 200ms, and without a floor the sentence flashes and is never read.
    const finished = T + 80;
    expect(at(T, finished, T + 100).visible).toBe(true);
    expect(at(T, finished, T + MIN_VISIBLE_MS - 1).visible).toBe(true);
    expect(at(T, finished, T + MIN_VISIBLE_MS)).toEqual({ visible: false, mayAdvance: true });
  });

  it('holds the card past the minimum when the read is slow', () => {
    // A four-second read holds it for four seconds. The floor is a minimum,
    // never a maximum — cutting a slow read short would hand over to an empty
    // reveal.
    const finished = T + 4_000;
    expect(at(T, finished, T + MIN_VISIBLE_MS + 1).visible).toBe(true);
    expect(at(T, finished, finished - 1).visible).toBe(true);
    expect(at(T, finished, finished)).toEqual({ visible: false, mayAdvance: true });
  });

  it('never leaves a frame where the card is down and the run is stuck', () => {
    // `visible` and `mayAdvance` come off one comparison, so they cannot
    // disagree. A frame with both false after the beat opened would strand the
    // user on a blank screen.
    for (const finished of [T, T + 500, T + MIN_VISIBLE_MS, T + 9_000]) {
      for (let now = T; now <= T + 12_000; now += 137) {
        const s = at(T, finished, now);
        expect(s.visible).toBe(!s.mayAdvance);
      }
    }
  });

  it('is already clear if the clock has jumped past the window', () => {
    // A backgrounded app can come back with `now` far ahead. It must resolve
    // to "done", never to a card that is stuck open.
    expect(at(T, T + 100, T + 600_000)).toEqual({ visible: false, mayAdvance: true });
  });
});

describe('msUntilNextChange', () => {
  it('has nothing to wait for before the beat opens', () => {
    expect(msUntilNextChange({ openedAt: null, finishedAt: null, now: T })).toBeNull();
  });

  it('counts down the minimum while the read is still running', () => {
    expect(msUntilNextChange({ openedAt: T, finishedAt: null, now: T })).toBe(MIN_VISIBLE_MS);
    expect(msUntilNextChange({ openedAt: T, finishedAt: null, now: T + 400 })).toBe(
      MIN_VISIBLE_MS - 400,
    );
  });

  it('stops timing once the minimum is served and the read has not landed', () => {
    // Null, not 0: the next change comes from the promise resolving, and a
    // 0ms timer would spin the component against the clock for nothing.
    expect(
      msUntilNextChange({ openedAt: T, finishedAt: null, now: T + MIN_VISIBLE_MS }),
    ).toBeNull();
  });

  it('times to whichever of the two comes later', () => {
    // Fast read: the minimum governs.
    expect(msUntilNextChange({ openedAt: T, finishedAt: T + 80, now: T })).toBe(MIN_VISIBLE_MS);
    // Slow read: the read governs.
    expect(msUntilNextChange({ openedAt: T, finishedAt: T + 5_000, now: T })).toBe(5_000);
  });

  it('is 0, not negative, once the window has passed', () => {
    // A negative delay is a `setTimeout` that fires immediately anyway; saying
    // 0 makes that intent explicit rather than incidental.
    expect(msUntilNextChange({ openedAt: T, finishedAt: T + 100, now: T + 99_999 })).toBe(0);
  });
});
