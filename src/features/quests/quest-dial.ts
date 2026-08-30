import type { QuestDef, QuestMetric, QuestState } from '@kairo/core';

/**
 * A quest as a dial: what goes inside the ring, and what goes under it.
 *
 * Playful draws the three quests as rings with no headline — the glyph says
 * which metric, the arc says how far, and two short strings say the figures.
 * That is a lot of meaning carried by very little type, so the strings are
 * settled here rather than formatted inline: "8.4k of 9k" has to stay legible
 * at 13pt inside a 60pt disc, and the rounding that makes it fit is exactly the
 * kind of thing that is wrong for one metric and right for the others.
 *
 * **Zero runtime imports** (the `@kairo/core` import is types only, and
 * vanishes at transform), so root Vitest can load it — the constraint that
 * shaped `stat-names.ts`, `quest-copy.ts` and `kairo-voice.ts`. The component
 * that draws the ring cannot be tested, because `@expo/vector-icons` reaches
 * React Native's Flow syntax.
 *
 * **This never prints a score total** (deviation #34) and never names an engine
 * key (deviation #51). It speaks raw units only, which is all a quest has ever
 * been about.
 */

/**
 * Compact, for the figure inside the disc.
 *
 * Thousands collapse to one decimal and drop a trailing `.0`, so 8,412 reads
 * "8.4k" and 9,000 reads "9k" rather than "9.0k". Below 1,000 the number is
 * printed whole — "840" is both shorter and more precise than "0.8k", and the
 * small-target quests (active hours, a starter calorie bar) live entirely down
 * there.
 *
 * No thousands separator: a comma inside a 60pt disc is a smudge, and anything
 * that needs one has already been collapsed.
 */
export function compactFigure(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  const whole = Math.floor(value);
  if (whole < 1000) return String(whole);

  const thousands = whole / 1000;
  // One decimal below 10k, none above: "12.4k" is a wide string for a disc and
  // the extra digit stops mattering once the figure is five wide.
  //
  // **Truncated, never rounded**, which is the whole reason this is not a
  // `toFixed` call. 8,999 steps against a 9,000 bar must not print "9k" beside
  // a ring that is visibly short of full — a figure that says you are there
  // next to an arc that says you are not is worse than either alone, and it is
  // the last hundred steps of a quest where somebody is actually watching.
  const text =
    thousands >= 10
      ? String(Math.floor(thousands))
      : (Math.floor(thousands * 10) / 10).toFixed(1);
  return `${text.replace(/\.0$/, '')}k`;
}

/**
 * The unit, spoken the way the caption under the ring needs it.
 *
 * Deliberately short and lowercase — this sits under "of 9" as "of 9k" or
 * "of 8 hrs", so anything longer than a couple of characters turns a caption
 * into a sentence. `steps` gets no unit at all: the glyph is a footprint and
 * the figure is in the thousands, which between them leave nothing to confuse.
 */
export function questUnit(metric: QuestMetric): string {
  switch (metric) {
    case 'steps':
      return '';
    case 'active_kcal':
      return 'kcal';
    case 'active_hours':
      return 'hrs';
    case 'distance_m':
      return 'm';
    case 'sleep_minutes':
      return 'min';
  }
}

export interface QuestDial {
  /** The figure inside the disc — the value so far, or a dash when unread. */
  figure: string;
  /** The caption under it: "of 9k", "of 8 hrs". */
  caption: string;
  /** 0–1, straight from the engine. What the arc draws. */
  fraction: number;
  cleared: boolean;
}

/**
 * One quest, ready to draw.
 *
 * A `null` value is a metric with **no reading**, not a zero — an unmeasured
 * night, most often — and it prints an em dash. That distinction is the same
 * one `kairo-voice.ts` makes when it says "No reading yet" instead of
 * congratulating somebody on a night the engine ignored; a `0` here would
 * accuse the player of having slept none.
 *
 * A cleared quest prints no figure at all. The ring is full and carries a check
 * — restating "9k of 9k" beside a tick is the readout the rings exist to
 * replace, and the caption says "cleared" instead.
 */
export function questDial(quest: QuestDef, state: QuestState): QuestDial {
  if (state.met) {
    return { figure: '', caption: 'cleared', fraction: 1, cleared: true };
  }

  const unit = questUnit(quest.metric);
  const target = compactFigure(quest.target);

  return {
    figure: state.value === null ? '—' : compactFigure(state.value),
    caption: unit ? `of ${target} ${unit}` : `of ${target}`,
    fraction: state.fraction,
    cleared: false,
  };
}
