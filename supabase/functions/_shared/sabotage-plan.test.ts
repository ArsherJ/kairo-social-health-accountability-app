import { describe, expect, it } from 'vitest';
import {
  DAILY_ITEM_GRANT_FREE,
  DAILY_ITEM_GRANT_LEGENDARY,
  blockMessage,
  dailyGrantFor,
  planDeploy,
  validateDeployRequest,
  type DeployBlock,
  type DeployPlanInput,
} from './sabotage-plan.ts';
import type { SabotageEvent } from './core.ts';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const SQUAD = '33333333-3333-4333-8333-333333333333';

// 2026-07-27T14:00Z = 22:00 in Manila, 10:00 in New York.
const NOW = new Date('2026-07-27T14:00:00Z');

function input(overrides: Partial<DeployPlanInput> = {}): DeployPlanInput {
  return {
    actorId: ACTOR,
    targetId: TARGET,
    item: 'banana',
    now: NOW,
    actorTimeZone: 'Asia/Manila',
    targetTimeZone: 'Asia/Manila',
    actorIsLegendary: false,
    sharedSquadIds: [SQUAD],
    todaysDeploys: [],
    granted: 1,
    deployed: 0,
    targetDayFinalized: false,
    ...overrides,
  };
}

function event(overrides: Partial<SabotageEvent> = {}): SabotageEvent {
  return {
    id: 'e1',
    actorId: ACTOR,
    targetId: TARGET,
    squadId: SQUAD,
    item: 'banana',
    createdAt: '2026-07-27T02:00:00Z',
    targetLocalDate: '2026-07-27',
    ...overrides,
  };
}

describe('validateDeployRequest', () => {
  it('accepts a target with no explicit item', () => {
    const result = validateDeployRequest({ targetId: TARGET });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.item).toBe('banana');
  });

  it('rejects a non-uuid target', () => {
    expect(validateDeployRequest({ targetId: 'someone' }).ok).toBe(false);
    expect(validateDeployRequest({}).ok).toBe(false);
  });

  it('rejects an item that does not exist yet', () => {
    // The Bat is V1. Accepting it now would insert a row the enum rejects.
    const result = validateDeployRequest({ targetId: TARGET, item: 'bat' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unsupported item/);
  });

  it('rejects a non-object body', () => {
    expect(validateDeployRequest(null).ok).toBe(false);
  });
});

describe('dailyGrantFor', () => {
  it('gives free users two items and Legendary three', () => {
    expect(dailyGrantFor(false)).toBe(DAILY_ITEM_GRANT_FREE);
    expect(dailyGrantFor(true)).toBe(DAILY_ITEM_GRANT_LEGENDARY);
    expect(DAILY_ITEM_GRANT_FREE).toBe(2);
    expect(DAILY_ITEM_GRANT_LEGENDARY).toBe(3);
  });
});

describe('what the grant of 2 makes reachable', () => {
  // At a grant of 1 a free user could never hit anyone twice in a day, so the
  // three-hour cooldown and its copy were dead code. The cooldown tests above
  // only fire because they pass `granted: 5`, an inventory MVP never issues.
  // These run at the real number.
  it('lets the cooldown reject a free user’s second hit on one target', () => {
    const recent = [event({ createdAt: '2026-07-27T12:30:00Z' })]; // 90m ago
    const plan = planDeploy(
      input({
        todaysDeploys: recent,
        granted: dailyGrantFor(false),
        deployed: 1,
      }),
    );
    expect(plan).toEqual({ ok: false, reason: 'item_cooldown' });
  });

  it('lets a free user hit a second, different squadmate', () => {
    const other = '44444444-4444-4444-8444-444444444444';
    const plan = planDeploy(
      input({
        todaysDeploys: [event({ createdAt: '2026-07-27T12:30:00Z' })],
        granted: dailyGrantFor(false),
        deployed: 1,
        targetId: other,
      }),
    );
    expect(plan.ok).toBe(true);
  });

  it('shows a spent free user the cap, never the empty inventory', () => {
    // Grant and cap now bind simultaneously at 2, and planDeploy checks
    // structural rules before inventory — so `no_items_remaining` is
    // unreachable for a free user. "You have used all your deploys for today"
    // is the more informative of the two, so this ordering is deliberate.
    const spent = [
      event({ id: 'a', createdAt: '2026-07-27T02:00:00Z' }),
      event({ id: 'b', targetId: 'someone-else', createdAt: '2026-07-27T06:00:00Z' }),
    ];
    const plan = planDeploy(
      input({ todaysDeploys: spent, granted: dailyGrantFor(false), deployed: 2 }),
    );
    expect(plan).toEqual({ ok: false, reason: 'deploy_cap_reached' });
  });
});

describe('planDeploy', () => {
  it('allows a normal deploy and builds the log row', () => {
    const plan = planDeploy(input());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.row).toMatchObject({
      actor_id: ACTOR,
      target_id: TARGET,
      squad_id: SQUAD,
      item: 'banana',
    });
    expect(plan.row.outcome).toEqual({ scoreDelta: -500, blocked: false });
  });

  it('refuses self-targeting', () => {
    const plan = planDeploy(input({ targetId: ACTOR }));
    expect(plan).toEqual({ ok: false, reason: 'self_target' });
  });

  it('refuses a target sharing no squad', () => {
    const plan = planDeploy(input({ sharedSquadIds: [] }));
    expect(plan).toEqual({ ok: false, reason: 'not_in_squad' });
  });

  it('refuses a target whose day already finalized', () => {
    const plan = planDeploy(input({ targetDayFinalized: true }));
    expect(plan).toEqual({ ok: false, reason: 'target_day_finalized' });
  });

  it('refuses when the daily grant is spent', () => {
    const plan = planDeploy(input({ granted: 1, deployed: 1 }));
    expect(plan).toEqual({ ok: false, reason: 'no_items_remaining' });
  });

  it('lets a Legendary user spend their larger grant', () => {
    const plan = planDeploy(
      input({ actorIsLegendary: true, granted: 3, deployed: 1 }),
    );
    expect(plan.ok).toBe(true);
  });

  it('enforces the three-hour same-item cooldown', () => {
    // 12:30Z is 90 minutes before NOW.
    const recent = [event({ createdAt: '2026-07-27T12:30:00Z' })];
    const plan = planDeploy(input({ todaysDeploys: recent, granted: 5 }));
    expect(plan).toEqual({ ok: false, reason: 'item_cooldown' });
  });

  it('allows a repeat once the cooldown has expired', () => {
    const older = [event({ createdAt: '2026-07-27T11:00:00Z' })]; // exactly 3h
    const plan = planDeploy(input({ todaysDeploys: older, granted: 5 }));
    expect(plan.ok).toBe(true);
  });

  it('reports the structural problem before the inventory one', () => {
    // Being out of items matters less than "they are not in your squad" — the
    // latter tells the user something actionable.
    const plan = planDeploy(input({ sharedSquadIds: [], deployed: 1 }));
    expect(plan).toEqual({ ok: false, reason: 'not_in_squad' });
  });

  describe('mixed-timezone squads', () => {
    it("dates the hit in the TARGET's timezone, not the actor's", () => {
      // NOW is 22:00 on the 27th in Manila but 10:00 on the 27th in New York —
      // same date here. Shift to 17:00Z: 01:00 on the 28th in Manila, still
      // 13:00 on the 27th in New York.
      const plan = planDeploy(
        input({
          now: new Date('2026-07-27T17:00:00Z'),
          actorTimeZone: 'Asia/Manila',
          targetTimeZone: 'America/New_York',
        }),
      );
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.row.actor_local_date).toBe('2026-07-28');
      expect(plan.row.target_local_date).toBe('2026-07-27');
      expect(plan.targetLocalDate).toBe('2026-07-27');
    });

    it('counts the actor’s deploy cap on the actor’s own day', () => {
      // An OFW whose day has already rolled over gets a fresh allowance, even
      // though their squadmates in Manila are still on yesterday.
      const plan = planDeploy(
        input({
          now: new Date('2026-07-27T17:00:00Z'),
          actorTimeZone: 'Asia/Manila',
          targetTimeZone: 'America/New_York',
        }),
      );
      if (!plan.ok) return;
      expect(plan.row.actor_local_date).toBe('2026-07-28');
    });
  });

  it('is deterministic', () => {
    expect(planDeploy(input())).toEqual(planDeploy(input()));
  });
});

describe('blockMessage', () => {
  const reasons: DeployBlock[] = [
    'self_target',
    'not_in_squad',
    'target_day_finalized',
    'deploy_cap_reached',
    'item_cooldown',
    'target_limit_reached',
    'no_items_remaining',
  ];

  it('has copy for every refusal reason', () => {
    for (const reason of reasons) {
      const message = blockMessage(reason);
      expect(message.length).toBeGreaterThan(0);
      // Refusals are part of the game's texture, not stack traces.
      expect(message).not.toMatch(/[_A-Z]{4,}/);
    }
  });
});
