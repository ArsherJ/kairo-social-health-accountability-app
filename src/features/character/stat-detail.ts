import {
  CORE_STATS,
  nextTierFor,
  type CoreStat,
  type DayTotals,
  type Tier,
} from '@kairo/core';

/** How each stat's raw value reads in a sentence. Copy, so it lives here. */
export const STAT_UNITS: Record<CoreStat, string> = {
  AGI: 'steps',
  STR: 'kcal',
  END: 'active minutes',
  VIT: 'active hours',
};

export type StatDetail =
  | { kind: 'unknown' }
  | { kind: 'maxed' }
  | {
      kind: 'gap';
      stat: CoreStat;
      /** This stat is the user's declared focus (§6's lane). */
      lane: boolean;
      tier: Exclude<Tier, 'none'>;
      gap: number;
      unit: string;
    };

function rawFor(stat: CoreStat, totals: DayTotals): number {
  switch (stat) {
    case 'AGI':
      return totals.steps;
    case 'STR':
      return totals.activeKcal;
    case 'END':
      return totals.activeMinutes;
    case 'VIT':
      return totals.activeHours;
  }
}

/**
 * The one line of guidance under the stat row.
 *
 * Named in the stat's own raw unit, because points are not something a user
 * can go outside and do.
 *
 * The user's **lane** wins when it still has room; a lane already at Gold has
 * nothing to ask for and falls through to the closest stat. This preference
 * used to belong to §6's weekly featured stat, which deviation #10 retired —
 * the lane is the branch's equivalent "the stat this user cares about", and
 * unlike featured it never widens a ceiling, only chooses what to mention.
 */
export function resolveStatDetail({
  totals,
  lane,
}: {
  totals: DayTotals | undefined;
  lane: CoreStat | null;
}): StatDetail {
  if (!totals) return { kind: 'unknown' };

  interface Open {
    stat: CoreStat;
    tier: Exclude<Tier, 'none'>;
    gap: number;
    /** Share of the current band still to go, 0–1. Comparable across stats. */
    remaining: number;
  }

  const open: Open[] = [];
  for (const stat of CORE_STATS) {
    const raw = rawFor(stat, totals);
    const next = nextTierFor(stat, raw);
    // null means this stat is already at Gold, which has nothing to ask for.
    if (!next) continue;
    // The true band width is (threshold - bandLow), not (threshold - 0):
    // gap / (gap + raw) is a fraction of the target value, which only equals
    // "share of band remaining" in the first band, where bandLow is 0.
    const bandWidth = next.gap + raw - next.bandLow;
    open.push({
      stat,
      tier: next.tier,
      gap: next.gap,
      remaining: next.gap / bandWidth,
    });
  }

  if (open.length === 0) return { kind: 'maxed' };

  const preferred = lane ? open.find((c) => c.stat === lane) : undefined;

  // Gaps live in different units — one active hour is not comparable to twenty
  // kcal — so "closest" means furthest through the current band, not smallest
  // raw number. The strict `<` leaves CORE_STATS order breaking exact ties.
  const closest = open.reduce((best, c) => (c.remaining < best.remaining ? c : best));

  const chosen = preferred ?? closest;

  return {
    kind: 'gap',
    stat: chosen.stat,
    lane: chosen.stat === lane,
    tier: chosen.tier,
    gap: chosen.gap,
    unit: STAT_UNITS[chosen.stat],
  };
}
