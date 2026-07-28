/**
 * Sabotage is an immutable event log (spec §12). Nothing ever mutates a score
 * directly — effects are replayed from the log at computation time, which keeps
 * the whole system auditable and makes retries harmless.
 *
 * MVP ships the Banana alone (§8). The Bat's banked-freeze mechanic, Shield,
 * Boost, Spy and Bomb arrive at V1; this module's shape anticipates them
 * without implementing them.
 */

/** MVP has one item. V1 adds 'bat' | 'shield' | 'boost' | 'spy' | 'bomb'. */
export type SabotageItem = 'banana';

export const BANANA_SCORE_DELTA = -500;

const ITEM_SCORE_DELTA: Record<SabotageItem, number> = {
  banana: BANANA_SCORE_DELTA,
};

export const DEPLOY_CAP_FREE = 2;
export const DEPLOY_CAP_LEGENDARY = 3;
export const SAME_ITEM_COOLDOWN_MS = 3 * 60 * 60 * 1000;
export const MAX_HITS_PER_TARGET_PER_DAY = 3;

export interface SabotageEvent {
  id: string;
  actorId: string;
  targetId: string;
  squadId: string;
  item: SabotageItem;
  /** ISO 8601 instant. */
  createdAt: string;
  /** The target's local date this hit lands on. */
  targetLocalDate: string;
}

/**
 * Total score adjustment for one user on one day.
 *
 * Deduplicated by event id so a replayed or retried log cannot double-count,
 * and order-independent so events may arrive in any sequence.
 */
export function replaySabotageDelta(
  events: readonly SabotageEvent[],
  targetId: string,
  localDate: string,
): number {
  const seen = new Set<string>();
  let delta = 0;

  for (const e of events) {
    if (e.targetId !== targetId) continue;
    if (e.targetLocalDate !== localDate) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    delta += ITEM_SCORE_DELTA[e.item];
  }

  return delta;
}

/**
 * Combine health score with sabotage, clamped at zero. A negative total would
 * be demoralising and the spec never contemplates one — a rest day floors at 0.
 */
export function applySabotage(healthTotal: number, sabotageDelta: number): number {
  return Math.max(0, healthTotal + sabotageDelta);
}

export type DeployRejection =
  | 'self_target'
  | 'not_in_squad'
  | 'target_day_finalized'
  | 'deploy_cap_reached'
  | 'item_cooldown'
  | 'target_limit_reached';

export interface DeployContext {
  actorId: string;
  targetId: string;
  item: SabotageItem;
  now: Date;
  /** The actor's own local date — deploy caps are counted per actor-day. */
  actorLocalDate: string;
  isLegendary: boolean;
  squadMemberIds: readonly string[];
  /** Every event this actor has already deployed on `actorLocalDate`. */
  todaysDeploys: readonly SabotageEvent[];
  targetDayFinalized: boolean;
  /**
   * Raises the daily deploy cap above the subscription default. V1 grants
   * extra deploys through rewarded ads; MVP never sets this.
   */
  deployCapOverride?: number;
}

export type DeployVerdict = { ok: true } | { ok: false; reason: DeployRejection };

/**
 * Abuse prevention from §8. The daily deploy cap is the anti-pay-to-win line:
 * you may OWN unlimited items but can only DEPLOY 2/day free or 3/day
 * Legendary, so money buys variety and convenience, never raw attack volume.
 *
 * Checks run most-fundamental first so the rejection reason is the useful one.
 */
export function validateDeploy(ctx: DeployContext): DeployVerdict {
  if (ctx.targetId === ctx.actorId) {
    return { ok: false, reason: 'self_target' };
  }

  if (!ctx.squadMemberIds.includes(ctx.targetId)) {
    return { ok: false, reason: 'not_in_squad' };
  }

  if (ctx.targetDayFinalized) {
    return { ok: false, reason: 'target_day_finalized' };
  }

  const cap =
    ctx.deployCapOverride ??
    (ctx.isLegendary ? DEPLOY_CAP_LEGENDARY : DEPLOY_CAP_FREE);
  if (ctx.todaysDeploys.length >= cap) {
    return { ok: false, reason: 'deploy_cap_reached' };
  }

  const nowMs = ctx.now.getTime();
  const sameItemOnTarget = ctx.todaysDeploys.filter(
    (e) => e.targetId === ctx.targetId && e.item === ctx.item,
  );
  const cooledDown = sameItemOnTarget.every(
    (e) => nowMs - Date.parse(e.createdAt) >= SAME_ITEM_COOLDOWN_MS,
  );
  if (!cooledDown) {
    return { ok: false, reason: 'item_cooldown' };
  }

  // Unreachable at MVP cap values — a Legendary user only gets 3 deploys total,
  // so the cap above always trips first. Kept because V1's rewarded-ad items
  // raise the cap past this limit.
  const hitsOnTarget = ctx.todaysDeploys.filter((e) => e.targetId === ctx.targetId);
  if (hitsOnTarget.length >= MAX_HITS_PER_TARGET_PER_DAY) {
    return { ok: false, reason: 'target_limit_reached' };
  }

  return { ok: true };
}
