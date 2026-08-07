/**
 * The decision-making half of `deploy-sabotage`, kept free of I/O so it can be
 * tested in plain Node.
 *
 * Sabotage is the soul of the product (spec §20), so the rules that make it
 * feel fair rather than oppressive all live in one testable place: who can be
 * hit, how often, and with what.
 */

import {
  DAILY_ITEM_GRANT_FREE,
  DAILY_ITEM_GRANT_LEGENDARY,
  currentLocalDate,
  dailyGrantFor,
  validateDeploy,
  type DeployRejection,
  type SabotageEvent,
  type SabotageItem,
} from './core.ts';

// The grant policy lives in kairo-core beside DEPLOY_CAP_FREE, because the
// client has to render the remaining count before this function has ever run.
// Re-exported so deploy-sabotage/index.ts imports it from one place.
export { DAILY_ITEM_GRANT_FREE, DAILY_ITEM_GRANT_LEGENDARY, dailyGrantFor };

const VALID_ITEMS: readonly SabotageItem[] = ['banana'];

export interface DeployRequest {
  targetId: string;
  item: SabotageItem;
}

export type RequestValidation =
  | { ok: true; value: DeployRequest }
  | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateDeployRequest(body: unknown): RequestValidation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body must be an object' };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw['targetId'] !== 'string' || !UUID_PATTERN.test(raw['targetId'])) {
    return { ok: false, error: 'targetId must be a uuid' };
  }

  // Default to the only MVP item so a client need not send it, but reject an
  // explicit unknown value rather than silently substituting.
  const item = raw['item'] ?? 'banana';
  if (typeof item !== 'string' || !VALID_ITEMS.includes(item as SabotageItem)) {
    return { ok: false, error: `unsupported item: ${String(item)}` };
  }

  return { ok: true, value: { targetId: raw['targetId'], item: item as SabotageItem } };
}

/** Everything `deploy-sabotage` reads before deciding. */
export interface DeployPlanInput {
  actorId: string;
  targetId: string;
  item: SabotageItem;
  now: Date;
  actorTimeZone: string;
  targetTimeZone: string;
  actorIsLegendary: boolean;
  /** Squads the actor and target share. Empty means they are not squadmates. */
  sharedSquadIds: readonly string[];
  /** Events the actor already deployed on their own current local date. */
  todaysDeploys: readonly SabotageEvent[];
  /** Items granted and already spent on the actor's current local date. */
  granted: number;
  deployed: number;
  /** Whether the target's current local day has already finalized. */
  targetDayFinalized: boolean;
}

export type DeployBlock = DeployRejection | 'no_items_remaining';

export interface DeployEventRow {
  actor_id: string;
  target_id: string;
  squad_id: string;
  item: SabotageItem;
  actor_local_date: string;
  target_local_date: string;
  outcome: Record<string, unknown>;
}

export type DeployPlan =
  | { ok: true; row: DeployEventRow; targetLocalDate: string }
  | { ok: false; reason: DeployBlock };

/**
 * Decide whether a deploy is allowed, and build the immutable log row if so.
 *
 * The target's day is resolved in the TARGET's timezone, not the actor's. In a
 * mixed-timezone squad an OFW in Dubai hitting a sibling in Cebu is landing the
 * hit on a different calendar date than the one they are living in, and getting
 * this wrong would silently credit the damage to the wrong day.
 */
export function planDeploy(input: DeployPlanInput): DeployPlan {
  const actorLocalDate = currentLocalDate(input.now, input.actorTimeZone);
  const targetLocalDate = currentLocalDate(input.now, input.targetTimeZone);

  const verdict = validateDeploy({
    actorId: input.actorId,
    targetId: input.targetId,
    item: input.item,
    now: input.now,
    actorLocalDate,
    isLegendary: input.actorIsLegendary,
    // validateDeploy checks membership by list inclusion; a shared squad means
    // the target is reachable.
    squadMemberIds: input.sharedSquadIds.length > 0
      ? [input.actorId, input.targetId]
      : [input.actorId],
    todaysDeploys: input.todaysDeploys,
    targetDayFinalized: input.targetDayFinalized,
  });

  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  // Inventory is checked after the structural rules so the error a user sees is
  // the most informative one: "you already hit them" beats "out of items".
  if (input.deployed >= input.granted) {
    return { ok: false, reason: 'no_items_remaining' };
  }

  return {
    ok: true,
    targetLocalDate,
    row: {
      actor_id: input.actorId,
      target_id: input.targetId,
      squad_id: input.sharedSquadIds[0] as string,
      item: input.item,
      actor_local_date: actorLocalDate,
      target_local_date: targetLocalDate,
      // Written once; the table is append-only, so this can never be revised.
      outcome: { scoreDelta: -500, blocked: false },
    },
  };
}

/** User-facing copy for a refused deploy. */
export function blockMessage(reason: DeployBlock): string {
  switch (reason) {
    case 'self_target':
      return 'You cannot sabotage yourself.';
    case 'not_in_squad':
      return 'That player is not in your squad.';
    case 'target_day_finalized':
      return 'Their day is already locked in.';
    case 'deploy_cap_reached':
      return 'You have used all your deploys for today.';
    case 'item_cooldown':
      return 'You already hit them recently. Wait a few hours.';
    case 'target_limit_reached':
      return 'You have hit that player enough times today.';
    case 'no_items_remaining':
      return 'No items left. You get another tomorrow.';
  }
}
