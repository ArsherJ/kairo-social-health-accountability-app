import { RACE_FINISH_LINE } from '@kairo/core';

/**
 * What the Sky says when there is nobody else on it.
 *
 * The Flock board was explicitly rewritten to stop being a picture of
 * loneliness — a dashed seat per unfilled place read as five separate things to
 * do rather than one invitation. The Sky had the same problem at greater scale
 * and had not been looked at since the corridor replaced the lanes: a player
 * with no squad and no scored history flew four screens of empty gradient with
 * no copy and no offer on it.
 *
 * **The corridor still draws.** The ridge is a real opponent — `RACE_FINISH_LINE`
 * *is* `DAILY_STEP_BASELINE`, flat and permanent for everybody — so a day alone
 * is a complete reading rather than an absence. The observation comes first and
 * the offer second, deliberately: that makes the screen about today rather than
 * about what is missing.
 *
 * **Two things it must never do**, and both have tests. It never names a rank,
 * because there is nobody to be ahead of and the app must not congratulate
 * somebody for beating nobody. And it never produces a racer — nothing on the
 * corridor may be a person who does not exist, so this module returns copy and
 * has no racer-shaped field to fill.
 *
 * A pure module rather than a branch inside `app/(tabs)/sky.tsx`, for the
 * reason the rest of the copy modules are: root Vitest cannot load a component
 * file at all, and the screen was already computing *whether a race exists* and
 * spending the answer only on telemetry. That condition and this copy are one
 * decision, so they live together and the screen performs the result.
 *
 * Ghost racing is unchanged and deliberately counts as a race: a player with
 * scored history is racing their own past days, and there is nothing missing to
 * offer them.
 *
 * **The offer follows what the player can actually do.** Somebody already in a
 * squad has an invite code, so the control shares it — through the Flock tab's
 * own `shareInvite`, because the share call, the message and the code are one
 * behaviour and must not fork. Somebody with no squad has no code to share, so
 * the control takes them to where a squad is made. Offering "invite a friend"
 * to an account with nothing to invite them to would be the fourth surface in
 * this pass promising something that is not there.
 */

/**
 * A racer, in the only respect this decision cares about: that there is one.
 *
 * Deliberately not `Racer` from the keystone. This module needs a count and
 * nothing else, and taking the full type would let a later edit reach for a
 * rank or a step figure — the two things the solo reading may never carry.
 *
 * **A ghost counts as a racer, and needs no field of its own to say so.** A
 * player with scored history is racing their own past days, which is a real
 * race with nothing missing to offer; the corridor holds one either way, so the
 * count already answers it. An `isGhost` flag here would be a second way to ask
 * the same question, and the one that could later disagree.
 */
export interface SkyRacerFacts {
  isSelf: boolean;
}

export interface SkySolo {
  /** What today is, said before anything is offered. */
  observation: string;
  /** What the screen can do about it. */
  invitation: string;
  /** The control's label. */
  action: string;
  /**
   * What the control does. `'share'` hands the squad's existing invite to the
   * share sheet; `'flock'` sends an account with no squad to where one is made.
   * The screen performs it — this only says which, so the choice is testable.
   */
  intent: 'share' | 'flock';
}

export interface SkyReading {
  /**
   * Whether the corridor holds a race. Also what gates `race_seen` — the marker
   * measures looking at a race, and a lone bird is not one.
   */
  raceExists: boolean;
  /** Non-null exactly when `raceExists` is false. */
  solo: SkySolo | null;
}

export function skyReading(
  racers: readonly SkyRacerFacts[],
  /**
   * Whether the account is in a squad, and therefore has a code to share.
   *
   * **Not defaulted**, though it has one obvious value. The screen is the only
   * caller and always knows the answer, so a default here would only ever be
   * taken by a test — and a default taken by nobody real is how `planDay` was
   * nearly given one, where it would have made every stored row wrong with
   * nothing anywhere to notice.
   */
  hasSquad: boolean,
): SkyReading {
  if (racers.length > 1) return { raceExists: true, solo: null };

  return {
    raceExists: false,
    solo: {
      // No literal here and none may appear: the figure is derived from
      // `RACE_FINISH_LINE`, which is the Daily Walk's baseline, so the ridge on
      // this screen and the floor on Today are one number with two readings.
      observation: `You have the sky to yourself. The ridge is the opponent — ${RACE_FINISH_LINE.toLocaleString()} steps, the same every day.`,
      invitation: hasSquad
        ? 'Bring someone up here with you and the climb has company.'
        : 'A flock flies the same corridor. Start one and the sky fills up.',
      action: hasSquad ? 'Invite a friend' : 'Start a flock',
      intent: hasSquad ? 'share' : 'flock',
    },
  };
}
