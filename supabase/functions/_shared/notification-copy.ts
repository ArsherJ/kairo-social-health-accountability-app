/**
 * What a push actually says (§14).
 *
 * Separate from `notification-plan.ts` on the `program-copy.ts` precedent:
 * deciding *whether* to send and deciding *what to say* fail in different ways
 * and are worth testing apart. Pure — it formats strings and nothing else.
 *
 * §14's messages are reproduced verbatim, split at the sentence boundary into
 * a title and a body. iOS renders the title bold above the body, so the split
 * buys hierarchy without rewriting a word of the spec.
 */

import { distanceLabel, paceLabel, type Challenge } from './core.ts';
import type { ScheduledTrigger } from './notification-plan.ts';

export interface PushMessage {
  title: string;
  body: string;
}

/** English ordinal. The teens are the whole reason this is a function. */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function points(total: number): string {
  // Thousands separators, without pulling Intl into a hot path on the server.
  return total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * §14 (v1.4): "You hit it. [title] — done. 🎯"
 *
 * Its own function rather than a case in `notificationCopy`, because it needs the
 * goal's title and that signature does not carry one. The old `sabotaged` case
 * solved the same problem by throwing for an unreachable branch; `ScheduledTrigger`
 * makes it unrepresentable instead.
 */
export function goalCompletedCopy(input: {
  title: string;
  xpAwarded: number;
}): PushMessage {
  return {
    title: 'You hit it. 🎯',
    body: `${input.title} — done. +${points(input.xpAwarded)} XP.`,
  };
}

/**
 * A cleared Challenge.
 *
 * Named in the units the user just produced — a pace, a distance, calories —
 * never in points. That is not only the points rule (deviation #30): a
 * challenge target *is* a pace or a calorie count, so points would be a
 * translation away from the thing that was actually achieved.
 *
 * The establish variants say a baseline was set rather than a bar was beaten,
 * because that is what happened: the first challenge cannot be failed on
 * fitness, and congratulating someone for beating a target that did not exist
 * would be the app's first lie.
 */
export function challengeClearedCopy(challenge: Challenge): PushMessage {
  if (challenge.area === 'run') {
    if (challenge.kind === 'establish') {
      return {
        title: 'Baseline set. 🏃',
        body: 'Your first run is in. From here, Kairo paces you against yourself.',
      };
    }
    return {
      title: 'Run challenge cleared. 🏃',
      body: `${distanceLabel(challenge.minDistanceM)} under ${paceLabel(
        challenge.paceSecPerKm,
      )}/km. The next one moves with you.`,
    };
  }

  if (challenge.kind === 'establish') {
    return {
      title: 'Baseline set. 💪',
      body: 'Your first strength session is in. From here, Kairo paces you against yourself.',
    };
  }
  return {
    title: 'Strength challenge cleared. 💪',
    body: `${points(challenge.activeKcal)} kcal in one session. The next one moves with you.`,
  };
}

/**
 * Copy for the three scheduled triggers.
 *
 * `rank` is null for a solo user, and that is a copy variant rather than a
 * suppression: solo players are the population §7's churn argument is about,
 * and the day-boundary loop is what brings them back.
 */
export function notificationCopy(
  trigger: ScheduledTrigger,
  context: { rank: number | null; total: number; inSquad: boolean },
): PushMessage {
  const { rank, total, inSquad } = context;

  switch (trigger) {
    case 'day_starts':
      // Branches on squad membership rather than on rank: the morning message
      // carries no standing, so the dispatcher has no reason to have looked one
      // up by the time it is built.
      return {
        title: 'A new day begins.',
        body: inSquad
          ? 'Your squad is already moving. 👊'
          : 'Your character is waiting. 👊',
      };

    case 'day_ending_soon':
      return {
        title: '1 hour left.',
        body: rank === null
          ? `${points(total)} points today. Push.`
          : `You're in ${ordinal(rank)} place. Push.`,
      };

    case 'day_ends':
      return {
        title: rank === null
          ? `Provisional: ${points(total)} points today.`
          : `Provisional: you finished ${ordinal(rank)}.`,
        body: 'Finalizes in ~2h.',
      };
  }
}
