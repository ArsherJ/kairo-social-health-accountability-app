import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE } from '@kairo/core';
import { flockWalk, type FlockWalkMember } from './flock-walk.ts';

const member = (name: string, steps: number | null): FlockWalkMember => ({
  characterName: name,
  steps,
});

const CLEARED = DAILY_STEP_BASELINE;
const SHORT = DAILY_STEP_BASELINE - 1;

describe('flockWalk', () => {
  it('fills one mark per member who cleared the Daily Walk', () => {
    const walk = flockWalk({
      members: [member('Ana', CLEARED), member('Ben', SHORT), member('Cy', CLEARED + 4_000)],
      mode: 'current',
    });

    expect(walk?.marks.map((m) => m.state)).toEqual(['cleared', 'unmet', 'cleared']);
    expect(walk?.label).toContain('2 of 3');
  });

  it('clears exactly at the baseline, not one step past it', () => {
    const walk = flockWalk({
      members: [member('Ana', CLEARED), member('Ben', SHORT)],
      mode: 'current',
    });

    expect(walk?.marks.map((m) => m.state)).toEqual(['cleared', 'unmet']);
  });

  it('carries each member initial, uppercased', () => {
    const walk = flockWalk({
      members: [member('ana', CLEARED), member('  ben', SHORT)],
      mode: 'current',
    });

    expect(walk?.marks.map((m) => m.letter)).toEqual(['A', 'B']);
  });

  // A withheld row has no visible total, so it can be counted neither as
  // cleared nor as missed. It must not deflate the denominator either.
  it('leaves a withheld member out of both halves of the count', () => {
    const walk = flockWalk({
      members: [member('Ana', CLEARED), member('Ben', null), member('Cy', CLEARED)],
      mode: 'current',
    });

    expect(walk?.marks.map((m) => m.state)).toEqual(['cleared', 'withheld', 'cleared']);
    expect(walk?.label).toContain('2 of 2');
    expect(walk?.label).not.toContain('2 of 3');
  });

  it('says a withheld member is not sharing rather than letting the mark speak', () => {
    const one = flockWalk({
      members: [member('Ana', CLEARED), member('Ben', null), member('Cy', SHORT)],
      mode: 'current',
    });
    const two = flockWalk({
      members: [
        member('Ana', CLEARED),
        member('Ben', null),
        member('Cy', null),
        member('Dee', SHORT),
      ],
      mode: 'current',
    });

    expect(one?.label).toContain('1 member is not sharing');
    expect(two?.label).toContain('2 members are not sharing');
  });

  // §5's rule in a second place: a false positive costs more than a miss, and
  // this market runs cheap bands and private accounts. The clause states a fact
  // about sharing and must never become a verdict about walking.
  it('never accuses anybody of missing the day', () => {
    const walk = flockWalk({
      members: [member('Ana', CLEARED), member('Ben', null), member('Cy', SHORT)],
      mode: 'current',
    });

    expect(walk?.label).not.toMatch(/\b(missed|miss|failed|fail|skipped|lazy|cheat\w*|behind)\b/i);
  });

  it('says nothing about sharing when everybody is visible', () => {
    const walk = flockWalk({
      members: [member('Ana', CLEARED), member('Ben', SHORT)],
      mode: 'current',
    });

    expect(walk?.label).not.toMatch(/sharing/);
  });

  // "You are ahead" in a squad of one is the app congratulating somebody for
  // being alone; "1 of 1 walked" is the same sentence wearing a circle.
  it('says nothing at all for a squad of one', () => {
    expect(flockWalk({ members: [member('Ana', CLEARED)], mode: 'current' })).toBeNull();
    expect(flockWalk({ members: [], mode: 'current' })).toBeNull();
  });

  // The gate is reciprocal: a viewer who never consented sees NULL totals on
  // every row including their own, so there is no cooperative reading to make.
  it('says nothing when fewer than two members are visible', () => {
    expect(
      flockWalk({
        members: [member('Ana', null), member('Ben', null), member('Cy', null)],
        mode: 'current',
      }),
    ).toBeNull();
    expect(
      flockWalk({
        members: [member('Ana', CLEARED), member('Ben', null)],
        mode: 'current',
      }),
    ).toBeNull();
  });

  it('follows the board it is drawn under rather than always claiming today', () => {
    const members = [member('Ana', CLEARED), member('Ben', SHORT)];

    expect(flockWalk({ members, mode: 'current' })?.label).toContain('today');
    expect(flockWalk({ members, mode: 'completed' })?.label).toContain('yesterday');
    expect(flockWalk({ members, mode: 'completed' })?.label).not.toContain('today');
  });

  // The count is spoken once, by this label. Nothing here may name a rank or
  // print a score total (deviations #23, #30).
  it('names no rank and no score total', () => {
    const walk = flockWalk({
      members: [member('Ana', CLEARED), member('Ben', SHORT)],
      mode: 'current',
    });

    expect(walk?.label).not.toMatch(/\b(1st|2nd|3rd|first|ahead|behind|points?|total)\b/i);
  });

  it('treats a negative or absent step figure as unmet rather than throwing', () => {
    const walk = flockWalk({
      members: [member('Ana', -5), member('Ben', 0), member('Cy', CLEARED)],
      mode: 'current',
    });

    expect(walk?.marks.map((m) => m.state)).toEqual(['unmet', 'unmet', 'cleared']);
  });
});

/**
 * The strip is a component file, which root Vitest cannot load — React Native's
 * Flow syntax defeats the transform. So the grouping is asserted against the
 * source, exactly as `bleed-inset.test.ts` and `type-faces.test.ts` do: the
 * failure this guards is invisible at every text size and costs a build to
 * find, and it is one careless edit away.
 */
describe('FlockStrip', () => {
  const source = readFileSync('src/features/squad/FlockStrip.tsx', 'utf8');

  it('is one accessible element carrying the composed label', () => {
    expect(source).toMatch(/accessible\b/);
    expect(source).toMatch(/accessibilityLabel=\{label\}/);
  });

  // Both halves, and neither is redundant: `accessible` on a parent is
  // documented to collapse its descendants on iOS and did not on the 2026-08-14
  // build, so each mark is hidden explicitly as well.
  it('hides every mark, so the count is spoken once and not once per circle', () => {
    expect(source).toMatch(/accessibilityElementsHidden\s*$/m);
    expect(source).toMatch(/importantForAccessibility="no-hide-descendants"/);
    // No per-mark name may creep back in beside the hiding.
    expect(source).not.toMatch(/accessibilityLabel=\{`/);
  });

  it('draws the withheld mark as a ring rather than a fill', () => {
    // A grey filled disc is what "did not walk" looks like. Accusing somebody
    // of missing a day for keeping their totals private is the one thing this
    // strip must never do.
    const withheld = /withheld:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';
    expect(withheld).toContain("backgroundColor: 'transparent'");
    expect(withheld).toContain('borderWidth');
  });
});
