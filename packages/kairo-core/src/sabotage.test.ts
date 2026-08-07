import { describe, expect, it } from 'vitest';
import {
  BANANA_SCORE_DELTA,
  DAILY_ITEM_GRANT_FREE,
  DAILY_ITEM_GRANT_LEGENDARY,
  DEPLOY_CAP_FREE,
  DEPLOY_CAP_LEGENDARY,
  MAX_HITS_PER_TARGET_PER_DAY,
  SAME_ITEM_COOLDOWN_MS,
  applySabotage,
  dailyGrantFor,
  replaySabotageDelta,
  validateDeploy,
} from './sabotage.ts';
import type { DeployContext, SabotageEvent } from './sabotage.ts';

const DAY = '2026-07-27';
const NOW = new Date('2026-07-27T14:00:00Z');

function event(overrides: Partial<SabotageEvent> = {}): SabotageEvent {
  return {
    id: 'evt-1',
    actorId: 'actor',
    targetId: 'target',
    squadId: 'squad',
    item: 'banana',
    createdAt: '2026-07-27T10:00:00Z',
    targetLocalDate: DAY,
    ...overrides,
  };
}

function context(overrides: Partial<DeployContext> = {}): DeployContext {
  return {
    actorId: 'actor',
    targetId: 'target',
    item: 'banana',
    now: NOW,
    actorLocalDate: DAY,
    isLegendary: false,
    squadMemberIds: ['actor', 'target', 'bystander'],
    todaysDeploys: [],
    targetDayFinalized: false,
    ...overrides,
  };
}

describe('daily item grant', () => {
  it('gives a free user two and a Legendary user three', () => {
    expect(dailyGrantFor(false)).toBe(DAILY_ITEM_GRANT_FREE);
    expect(dailyGrantFor(true)).toBe(DAILY_ITEM_GRANT_LEGENDARY);
    expect(DAILY_ITEM_GRANT_FREE).toBe(2);
    expect(DAILY_ITEM_GRANT_LEGENDARY).toBe(3);
  });

  it('never grants more than the deploy cap allows to be used', () => {
    // The grant binding *before* the §8 cap is what made sabotage too quiet to
    // beta-test at one hit per person per day; the grant exceeding the cap
    // would be the opposite mistake — items that cannot be thrown.
    expect(DAILY_ITEM_GRANT_FREE).toBe(DEPLOY_CAP_FREE);
    expect(DAILY_ITEM_GRANT_LEGENDARY).toBe(DEPLOY_CAP_LEGENDARY);
  });
});

describe('replaySabotageDelta', () => {
  it('is zero with no events', () => {
    expect(replaySabotageDelta([], 'target', DAY)).toBe(0);
  });

  it('applies a banana as -500', () => {
    expect(replaySabotageDelta([event()], 'target', DAY)).toBe(BANANA_SCORE_DELTA);
    expect(BANANA_SCORE_DELTA).toBe(-500);
  });

  it('stacks multiple hits', () => {
    const events = [event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })];
    expect(replaySabotageDelta(events, 'target', DAY)).toBe(-1_500);
  });

  it('ignores events aimed at someone else', () => {
    const events = [event({ targetId: 'bystander' })];
    expect(replaySabotageDelta(events, 'target', DAY)).toBe(0);
  });

  it('ignores events belonging to another day', () => {
    const events = [event({ targetLocalDate: '2026-07-26' })];
    expect(replaySabotageDelta(events, 'target', DAY)).toBe(0);
  });

  it('is order-independent', () => {
    const a = event({ id: 'a', createdAt: '2026-07-27T09:00:00Z' });
    const b = event({ id: 'b', createdAt: '2026-07-27T18:00:00Z' });
    expect(replaySabotageDelta([a, b], 'target', DAY)).toBe(
      replaySabotageDelta([b, a], 'target', DAY),
    );
  });

  it('is idempotent when the same event appears twice', () => {
    // The log is append-only and keyed by id; a retry must not double-count.
    const duplicated = [event({ id: 'a' }), event({ id: 'a' })];
    expect(replaySabotageDelta(duplicated, 'target', DAY)).toBe(-500);
  });
});

describe('applySabotage', () => {
  it('subtracts the delta from the health total', () => {
    expect(applySabotage(2_900, -500)).toBe(2_400);
  });

  it('never returns a negative score', () => {
    // Getting bananaed below zero would be demoralising and the spec never
    // contemplates negative totals.
    expect(applySabotage(200, -500)).toBe(0);
  });

  it('leaves a clean score untouched', () => {
    expect(applySabotage(1_300, 0)).toBe(1_300);
  });
});

describe('validateDeploy', () => {
  it('accepts a normal deploy', () => {
    expect(validateDeploy(context())).toEqual({ ok: true });
  });

  it('rejects targeting yourself', () => {
    const result = validateDeploy(context({ targetId: 'actor' }));
    expect(result).toEqual({ ok: false, reason: 'self_target' });
  });

  it('rejects a target outside the squad', () => {
    const result = validateDeploy(context({ targetId: 'stranger' }));
    expect(result).toEqual({ ok: false, reason: 'not_in_squad' });
  });

  it("rejects hitting a day that has already finalized", () => {
    const result = validateDeploy(context({ targetDayFinalized: true }));
    expect(result).toEqual({ ok: false, reason: 'target_day_finalized' });
  });

  describe('daily deploy cap', () => {
    it('allows a free user two deploys per day', () => {
      expect(DEPLOY_CAP_FREE).toBe(2);
      const oneUsed = [event({ id: 'a', targetId: 'bystander' })];
      expect(validateDeploy(context({ todaysDeploys: oneUsed })).ok).toBe(true);
    });

    it('blocks a free user on the third', () => {
      const twoUsed = [
        event({ id: 'a', targetId: 'bystander', createdAt: '2026-07-27T01:00:00Z' }),
        event({ id: 'b', targetId: 'bystander', createdAt: '2026-07-27T02:00:00Z' }),
      ];
      expect(validateDeploy(context({ todaysDeploys: twoUsed }))).toEqual({
        ok: false,
        reason: 'deploy_cap_reached',
      });
    });

    it('allows a Legendary user a third', () => {
      expect(DEPLOY_CAP_LEGENDARY).toBe(3);
      const twoUsed = [
        event({ id: 'a', targetId: 'bystander', createdAt: '2026-07-27T01:00:00Z' }),
        event({ id: 'b', targetId: 'bystander', createdAt: '2026-07-27T02:00:00Z' }),
      ];
      expect(
        validateDeploy(context({ todaysDeploys: twoUsed, isLegendary: true })).ok,
      ).toBe(true);
    });

    it('blocks a Legendary user on the fourth', () => {
      const threeUsed = [
        event({ id: 'a', targetId: 'bystander', createdAt: '2026-07-27T01:00:00Z' }),
        event({ id: 'b', targetId: 'bystander', createdAt: '2026-07-27T02:00:00Z' }),
        event({ id: 'c', targetId: 'bystander', createdAt: '2026-07-27T03:00:00Z' }),
      ];
      expect(
        validateDeploy(context({ todaysDeploys: threeUsed, isLegendary: true })),
      ).toEqual({ ok: false, reason: 'deploy_cap_reached' });
    });
  });

  describe('same-item cooldown', () => {
    it('uses a three-hour window', () => {
      expect(SAME_ITEM_COOLDOWN_MS).toBe(3 * 60 * 60 * 1000);
    });

    it('blocks the same item on the same target inside three hours', () => {
      const recent = [event({ id: 'a', createdAt: '2026-07-27T11:30:00Z' })]; // 2.5h ago
      expect(validateDeploy(context({ todaysDeploys: recent }))).toEqual({
        ok: false,
        reason: 'item_cooldown',
      });
    });

    it('allows it again once three hours have passed', () => {
      const older = [event({ id: 'a', createdAt: '2026-07-27T11:00:00Z' })]; // exactly 3h
      expect(validateDeploy(context({ todaysDeploys: older })).ok).toBe(true);
    });

    it('does not block a different target inside the window', () => {
      const recent = [
        event({ id: 'a', targetId: 'bystander', createdAt: '2026-07-27T13:30:00Z' }),
      ];
      expect(validateDeploy(context({ todaysDeploys: recent })).ok).toBe(true);
    });
  });

  describe('per-target daily limit', () => {
    it('caps hits on one person at three per day', () => {
      expect(MAX_HITS_PER_TARGET_PER_DAY).toBe(3);
    });

    // NOTE: this limit is currently unreachable, and that is a finding about
    // the spec rather than a gap in the code. §8 caps deploys at 2/day (free)
    // and 3/day (Legendary), so a user cannot physically land a 4th hit on
    // anyone — the deploy cap always binds first. The rule is kept as
    // defence-in-depth because V1 adds rewarded-ad items that raise the cap.
    it('is shadowed by the deploy cap at MVP cap values', () => {
      const threeHits = [
        event({ id: 'a', createdAt: '2026-07-27T00:00:00Z' }),
        event({ id: 'b', createdAt: '2026-07-27T04:00:00Z' }),
        event({ id: 'c', createdAt: '2026-07-27T08:00:00Z' }),
      ];
      expect(
        validateDeploy(
          context({
            todaysDeploys: threeHits,
            isLegendary: true,
            now: new Date('2026-07-27T20:00:00Z'),
          }),
        ),
      ).toEqual({ ok: false, reason: 'deploy_cap_reached' });
    });

    it('blocks a fourth hit on one target once the cap allows a fourth deploy', () => {
      // Simulates the V1 world where rewarded ads lift the deploy cap: three
      // hits already landed on this target, spaced past the cooldown.
      const threeHits = [
        event({ id: 'a', createdAt: '2026-07-27T00:00:00Z' }),
        event({ id: 'b', createdAt: '2026-07-27T04:00:00Z' }),
        event({ id: 'c', createdAt: '2026-07-27T08:00:00Z' }),
      ];
      expect(
        validateDeploy(
          context({
            todaysDeploys: threeHits,
            deployCapOverride: 5,
            now: new Date('2026-07-27T20:00:00Z'),
          }),
        ),
      ).toEqual({ ok: false, reason: 'target_limit_reached' });
    });
  });

  it('reports the most fundamental problem first', () => {
    // Self-targeting while also over the cap is still a self-target error.
    const overCap = [
      event({ id: 'a', createdAt: '2026-07-27T01:00:00Z' }),
      event({ id: 'b', createdAt: '2026-07-27T02:00:00Z' }),
    ];
    expect(
      validateDeploy(context({ targetId: 'actor', todaysDeploys: overCap })),
    ).toEqual({ ok: false, reason: 'self_target' });
  });
});
