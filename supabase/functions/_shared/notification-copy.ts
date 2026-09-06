/**
 * What a push actually says (§14, roadmap deviation #52).
 *
 * Separate from `notification-plan.ts` on the `program-copy.ts` precedent:
 * deciding *whether* to send and deciding *what to say* fail in different ways
 * and are worth testing apart. Pure — it formats strings and nothing else.
 *
 * A title and a body, always: iOS renders the title bold above the body, so
 * the split buys hierarchy for free.
 *
 * **`notificationCopy()` is gone.** It wrote §14's three scheduled messages
 * verbatim, all three of which are retired (deviation #52) — and it was the
 * last surface in the app that spoke a points total out loud, which deviation
 * #30 had removed everywhere else. `digestCopy()` replaces it, and speaks
 * ranks and real units.
 */

import { distanceLabel, paceLabel, type Challenge } from './core.ts';

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
 * What the digest has to say, for one recipient.
 *
 * Every field is optional-and-nullable because every one of them may
 * legitimately be absent: no squad, or a squad whose race for yesterday is not
 * final because one member is still living in it. Those are ordinary states
 * rather than errors, and each has its own sentence rather than a placeholder.
 *
 * **The Battle's clause went with the Battle** (deviation #66, 2026-09-06).
 * `digestCopy` is now the headline alone.
 */
export interface DigestFacts {
  /** Yesterday's finished race, if the squad has one. */
  result?: { rank: number; racers: number } | null;
  /** Today's live standing, if the user is in a squad. */
  standing?: { rank: number; racers: number } | null;
  inSquad: boolean;
}

/**
 * The one push a day (roadmap deviation #52).
 *
 * Four states, four sentences. A single template with holes ("You were {rank}.
 * You are {rank}.") reads as a template on the second morning, and this is the
 * only push most users will ever see — so it carries the whole relationship the
 * app has with somebody who has not opened it yet.
 *
 * **A solo user gets a digest too**, and it never mentions rank: they are
 * racing their own past days (spec §5.1), and "1st of 4" against three ghosts
 * would be a claim about other people that is not true.
 *
 * Nothing here speaks a points total (deviation #30). A rank and a count of
 * racers are both figures the screen shows.
 */
export function digestCopy(facts: DigestFacts): PushMessage {
  if (!facts.inSquad) {
    return {
      title: 'A new day. 🌤',
      body: 'Your track is clear. Beat yesterday.',
    };
  }

  if (facts.result && facts.result.rank === 1) {
    return {
      title: 'You won yesterday. 🏁',
      body: 'The flag resets this morning. Line up again.',
    };
  }

  if (facts.result) {
    return {
      title: `${ordinal(facts.result.rank)} yesterday.`,
      body: 'Everyone starts level this morning.',
    };
  }

  if (facts.standing) {
    return {
      title: 'The race is on. 🏁',
      body: `You are ${ordinal(facts.standing.rank)} of ${facts.standing.racers} so far today.`,
    };
  }

  // In a squad, but no result and no standing: the race for yesterday is not
  // final because somebody is still living in it, and nobody has moved today.
  return {
    title: 'A new day. 🌤',
    body: 'Your squad is lining up.',
  };
}
