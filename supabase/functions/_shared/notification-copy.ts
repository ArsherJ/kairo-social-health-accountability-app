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

import type { NotificationTrigger } from './core.ts';

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
 * §14: "[Name] hit you with a banana! You're down 500 points 🍌". Always sends,
 * exempt from the budget and from quiet hours — the emotional core.
 */
export function sabotageCopy(input: {
  actorName: string;
  /** Negative, as stored. The copy states the magnitude. */
  scoreDelta: number;
}): PushMessage {
  return {
    title: `${input.actorName} hit you with a banana! 🍌`,
    body: `You're down ${points(Math.abs(input.scoreDelta))} points.`,
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
  trigger: NotificationTrigger,
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
          : 'Your Hunter is waiting. 👊',
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

    case 'sabotaged':
      // Deliberately not reachable: sabotage copy needs the actor's name, which
      // this signature does not carry, and "undefined hit you with a banana" is
      // worse than no push at all.
      throw new Error('sabotaged copy comes from sabotageCopy(), which knows the actor');
  }
}
