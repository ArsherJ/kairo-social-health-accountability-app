import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FREE_SQUAD_MAX_MEMBERS, RACE_FINISH_LINE } from '@kairo/core';
import { FLOCK_ANSWERS, WELCOME_CARDS, flockActions } from './welcome-cards.ts';

const component = readFileSync('src/features/onboarding/WelcomePopups.tsx', 'utf8');
const source = readFileSync('src/features/onboarding/welcome-cards.ts', 'utf8');
const events = readFileSync('src/features/telemetry/events.ts', 'utf8');

describe('the welcome run', () => {
  it('ends on the flock ask', () => {
    const last = WELCOME_CARDS[WELCOME_CARDS.length - 1];
    expect(last?.actions).toBeDefined();
  });

  it('gives only the last card an actions slot', () => {
    // The other three are linear reads with a next button. An actions slot on
    // any of them is the run growing a second decision point, which is the
    // arrangement the fourth card exists to avoid.
    const withActions = WELCOME_CARDS.filter((card) => card.actions !== undefined);
    expect(withActions).toHaveLength(1);
  });

  it('teaches the finish line and the squad size from the constants', () => {
    const copy = WELCOME_CARDS.map((c) => `${c.title('Dagit')} ${c.body()}`).join(' ');
    expect(copy).toContain(RACE_FINISH_LINE.toLocaleString());
    expect(copy).toContain(String(FREE_SQUAD_MAX_MEMBERS));
    // Read from the constants, never restated. The finish line *is*
    // `DAILY_STEP_BASELINE`, which *is* the Daily Walk, and a second literal
    // describing it is how the three readings start disagreeing.
    expect(source).toContain('RACE_FINISH_LINE');
    expect(source).toContain('FREE_SQUAD_MAX_MEMBERS');
  });

  it('says nothing about a flock before the card that explains one', () => {
    expect(WELCOME_CARDS[0]?.title('Dagit')).toContain('Dagit');
    expect(`${WELCOME_CARDS[0]?.body()} ${WELCOME_CARDS[1]?.body()}`).not.toMatch(/flock/i);
  });
});

describe('the flock ask', () => {
  it('offers paste-a-code, invite-a-friend and not-now to somebody with no squad', () => {
    expect(flockActions(null).map((a) => a.answer)).toEqual(['joined', 'invited', 'skipped']);
  });

  it('withholds the join door from somebody already in a squad', () => {
    // Their own code is proof of a squad, and the free tier holds one — so a
    // join door here is a path that can only fail.
    expect(flockActions('AB12CD').map((a) => a.answer)).toEqual(['invited', 'skipped']);
  });

  it('always leaves not-now last and quiet', () => {
    for (const code of [null, 'AB12CD']) {
      const actions = flockActions(code);
      const last = actions[actions.length - 1];
      expect(last?.answer).toBe('skipped');
      expect(last?.tone).toBe('quiet');
    }
  });

  it('gives every action a real label and exactly one bright primary', () => {
    for (const code of [null, 'AB12CD']) {
      const actions = flockActions(code);
      for (const action of actions) expect(action.label.length).toBeGreaterThan(0);
      expect(actions.filter((a) => a.tone === 'bright')).toHaveLength(1);
    }
  });

  it('lets its buttons wrap rather than truncate', () => {
    // This pill sits in a sheet inside a scrim, so it has lost four lots of
    // `space.lg` against the beat screens the component was built for. At the
    // `chrome` scale's 1.4× cap a three-word label no longer fits on a 320pt
    // screen, and `numberOfLines={1}` ellipsises it — the permission sheet's
    // 2026-08-17 failure in a new place, where a control's words are cut and
    // it stops being actionable. Invisible at every normal text size, which is
    // why it is pinned here rather than left to a device pass.
    expect(component).toMatch(/<OnboardingCta[^>]*lines=\{2\}/s);
  });

  it('keeps the sheet bounded, scrolling and width-bounded', () => {
    // All three halves of the permission sheet's 2026-08-17 lesson, and the
    // fourth card is what made them load-bearing here: it stacks two pills and
    // a decline under a 240pt art panel, so an unbounded card pushes "Not now"
    // — the one control that lets somebody decline — off the bottom at the
    // largest content sizes. `Panel`-style `overflow: 'hidden'` means it is
    // clipped silently rather than spilling visibly, so nothing looks wrong.
    expect(component).toMatch(/maxHeight: '\d+%'/);
    expect(component).toContain('<ScrollView');
    // A point width, never a percentage: `'100%'` resolves against a
    // ScrollView whose own size depends on measuring this content, and RN
    // breaks that circularity by measuring text against an unbounded width.
    // The card and the content it wraps both read the same computed value.
    expect(component.match(/width: sheetWidth/g) ?? []).toHaveLength(2);
  });

  it('records joined, invited or skipped and nothing else', () => {
    expect([...FLOCK_ANSWERS]).toEqual(['joined', 'invited', 'skipped']);
    expect(events).toContain("'flock_prompt_answered'");
    // One emitter, and the payload is the answer alone — the same arrangement
    // `calibration_completed` uses so no call site can widen it.
    const calls = component.match(/track\([^;]*?flock_prompt_answered[^;]*?\)/gs) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('{ answer }');
  });
});
