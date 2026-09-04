import type { QuestCalibration, QuestTier } from '@kairo/core';
import { questTierName } from '../quests/quest-copy.ts';

/**
 * What the difficulty beat says about the reading it was given (deviation #63).
 *
 * The beat used to open cold with four choices and no basis for picking one.
 * It opens with the measurement now — *"Your typical day is 6,240 steps. We'd
 * start you on Steady."* — because a proposal a player can check against their
 * own week is a proposal they can disagree with, and disagreeing is the whole
 * reason the choices are still there.
 *
 * **Three states and they are genuinely different sentences.** A proposal says
 * what was measured. `no-history` says the fortnight was too thin to read and
 * hands the job to the automatic rule — and it must never imply the player
 * declined or that the data *could not be read*, because HealthKit does not
 * report a read-permission denial and neither is knowable from here. And a run
 * where calibration never happened at all — the ask was skipped, or the
 * platform has no health source — says **nothing**, because there is nothing to
 * report and a screen that volunteers "we couldn't measure you" to somebody who
 * never let it try is an accusation.
 *
 * **The privacy line is a claim and has to stay exactly true.** Nothing about
 * those fourteen days leaves the phone: the median crosses from `/connect` to
 * this beat in the in-memory answers store, is never written to the profile,
 * and never enters a telemetry payload. `calibration-copy.test.ts` holds the
 * sentence and the scan that keeps it honest.
 *
 * Zero runtime imports beyond the sibling copy table, so root Vitest can load
 * it — the `@kairo/core` import is types only, and `quest-copy.ts` is reached
 * by relative path because the `@/` alias does not resolve there.
 */
export interface CalibrationNote {
  /** The sentence above the choices. */
  line: string;
  /** Where the reading happened and what is kept. Standing, on both states. */
  privacy: string;
}

/**
 * The one privacy claim, written once.
 *
 * "Read on your phone" is literally true — `readDailySteps` is a HealthKit
 * query and its result never crosses the network. "Only the size you pick is
 * saved" is the other half: `quest_tier_override` is the single column this
 * whole reading produces.
 */
export const CALIBRATION_PRIVACY_NOTE =
  'Read on your phone. Only the size you pick is saved.';

/** Grouped in thousands, and rounded — an even window medians to a half step. */
function stepsWords(steps: number): string {
  return Math.round(steps).toLocaleString('en-US');
}

export function calibrationNote(calibration: QuestCalibration | null): CalibrationNote | null {
  if (calibration === null) return null;

  if (calibration.outcome === 'no-history') {
    return {
      // States the shortfall and nothing else. Not "we couldn't read your
      // steps", which asserts a failure, and not "you didn't give us access",
      // which asserts a decision — neither is knowable here.
      //
      // And **not "Automatic will grow with you"**, which was the first
      // wording: the automatic rule keys off how many days have *scored*, so
      // it grows with tenure, and selling it as something that follows the
      // player is the exact conflation `questTier`'s own comment calls wrong
      // by construction. It says what the rule actually does instead.
      line: "Not enough days on this phone to size your quests yet, so we'll start you on Automatic — it follows how long you have been here.",
      privacy: CALIBRATION_PRIVACY_NOTE,
    };
  }

  return {
    line: `Your typical day is ${stepsWords(calibration.medianSteps)} steps. We'd start you on ${questTierName(calibration.tier)}.`,
    privacy: CALIBRATION_PRIVACY_NOTE,
  };
}

/**
 * Settings' quest-difficulty help line.
 *
 * **Conditional, because one sentence cannot be true of both accounts.** A
 * calibrated account was sized once from a reading; an account on Automatic —
 * one that predates calibration, hit `no-history`, skipped the beat, or cleared
 * its override — is on the trailing-scored-days rule and has never been read at
 * all. The unconditional line shipped in this feature's own first pass and told
 * the second group their recent days had been measured, on the screen sitting
 * directly beside a value that says "Auto".
 *
 * Both halves name what actually decides, for the reason the Settings copy has
 * always given: somebody whose quests feel wrong needs to know why, rather than
 * assume the app measured them and got it wrong.
 */
export function questDifficultyHelp(override: QuestTier | null): string {
  if (override === null) {
    return 'Automatic follows how long you have been here, not how far you walk. If the quests feel wrong, pick a size — your choice always wins.';
  }
  return 'Your size was set once, from your days around the time you joined, and stays there. Automatic instead follows how long you have been here. Change it whenever — your choice always wins.';
}
