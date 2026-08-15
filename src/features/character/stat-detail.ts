import {
  CORE_STATS,
  nextTierFor,
  type CoreStat,
  type DayTotals,
} from '@kairo/core';

/** How each stat's raw value reads in a sentence. Copy, so it lives here. */
export const STAT_UNITS: Record<CoreStat, string> = {
  AGI: 'steps',
  STR: 'kcal',
  END: 'active minutes',
  VIT: 'active hours',
};

/**
 * Why each stat is a stat at all — the medical reasoning §5 has always carried
 * and the app has never shipped.
 *
 * One sentence each, and they live beside `STAT_UNITS` because copy belongs
 * where the other copy is. Rendered in `app/progress.tsx`, the sheet the home
 * shelf's "How progress works" link already opens: the alternative was four
 * more lines on the densest screen in the app, to explain numbers that are
 * already explained there.
 *
 * VIT's is the one that matters most and the one the app most conspicuously
 * never said. It is not "move a bit more" — it is that a single long workout
 * does not buy off a day spent sitting, which is a different claim and the
 * actual reason the stat exists.
 */
export const STAT_WHY: Record<CoreStat, string> = {
  AGI: 'Daily step count is one of the strongest single predictors of long-term health — more than almost anything else you can measure this easily.',
  STR: 'Active calories stand in for hard effort. Kairo cannot see what you lifted, but it can see that you worked.',
  END: 'Sustained effort, rather than a burst of it. This one rides Apple’s exercise minutes, so a watch reads it far better than a phone in a pocket.',
  VIT: 'How many hours you moved in at all. Moving every hour matters more than one long workout — sitting still the rest of the day carries its own risk, independent of how hard you trained.',
};

/**
 * The same units when there is exactly one left to do.
 *
 * Not a nicety: VIT's bands are 3/6/9 active hours, so a gap of 1 is the
 * *common* VIT case, and "1 more active hours tops out your Vitality today" is
 * the sentence a user is most likely to meet. `kcal` is invariant — "1 more
 * kcal" is already right — and is listed anyway so this table stays a total
 * function over `CoreStat` rather than a partial one with a fallback.
 */
const STAT_UNITS_SINGULAR: Record<CoreStat, string> = {
  AGI: 'step',
  STR: 'kcal',
  END: 'active minute',
  VIT: 'active hour',
};

/**
 * The unit as it reads beside `gap`. Singular only at exactly one.
 *
 * Private: `resolveStatDetail` already hands callers a `unit` that agrees with
 * the `gap` beside it, so a second entry point is a second chance to disagree.
 */
function unitForGap(stat: CoreStat, gap: number): string {
  return gap === 1 ? STAT_UNITS_SINGULAR[stat] : STAT_UNITS[stat];
}

export type StatDetail =
  | { kind: 'unknown' }
  | { kind: 'maxed' }
  | {
      kind: 'gap';
      stat: CoreStat;
      /** This stat is the user's lane — their dominant stat (§6). */
      lane: boolean;
      /** Raw units still needed. */
      gap: number;
      /**
       * What closing that gap is worth, in points. Replaces the tier name the
       * copy used to carry: the bands still decide this number — `nextTierFor`
       * is still what finds the threshold — but Bronze/Silver/Gold became
       * internal to scoring, so the sentence names the reward rather than the
       * rank.
       */
      points: number;
      /**
       * The next band is the top one — this is the last step available on this
       * stat today. Carried as a boolean rather than a tier name because
       * Bronze/Silver/Gold are internal to scoring (deviation #23); the copy
       * needs to know *that* it is the last step, never what it is called.
       */
      topsOut: boolean;
      /** Already agreed with `gap` — singular at exactly one. */
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
 * The user's **lane** wins when it still has room; a lane already at its top
 * band has nothing to ask for and falls through to the closest stat. This
 * preference used to belong to §6's weekly featured stat, which deviation #10
 * retired — the lane is the branch's equivalent "the stat this user cares
 * about", and unlike featured it never widens a ceiling, only chooses what to
 * mention. Its input is now observed dominance rather than a declared focus,
 * which changes where the preference comes from and nothing about this rule.
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
    points: number;
    gap: number;
    topsOut: boolean;
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
      points: next.pointsGain,
      gap: next.gap,
      topsOut: next.tier === 'gold',
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
    gap: chosen.gap,
    points: chosen.points,
    topsOut: chosen.topsOut,
    unit: unitForGap(chosen.stat, chosen.gap),
  };
}
