import type { SabotageItem } from '@kairo/core';

/**
 * The feed's words, kept pure so §14's voice is testable — the same reason
 * `program-copy.ts` exists.
 */

const ITEM_PHRASE: Record<SabotageItem, string> = {
  banana: 'a banana 🍌',
};

export function feedLine(e: {
  actorName: string;
  targetName: string;
  actorIsSelf: boolean;
  targetIsSelf: boolean;
  item: SabotageItem;
}): string {
  if (e.actorIsSelf && e.targetIsSelf) {
    // validateDeploy rejects self_target, so this event cannot exist. Rendering
    // a fourth case would be the feed inventing history.
    throw new Error('a sabotage event cannot have the same actor and target');
  }

  // Capitalised in the actor position, lowercase in the target position: the
  // line has to read as a sentence either way.
  const actor = e.actorIsSelf ? 'You' : e.actorName;
  const target = e.targetIsSelf ? 'you' : e.targetName;
  return `${actor} hit ${target} with ${ITEM_PHRASE[e.item]}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * How long ago a hit landed.
 *
 * `now` is a parameter rather than a clock read, which is what makes this
 * testable — the same contract `kairo-core` holds. The device's clock and the
 * server's `created_at` can disagree by a few seconds, so a negative age is
 * floored rather than rendered.
 */
export function feedTime(createdAt: string, now: Date): string {
  const age = now.getTime() - Date.parse(createdAt);

  if (age < MINUTE_MS) return 'just now';
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h`;

  const d = new Date(createdAt);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
