/**
 * What gets sent when someone invites their squad.
 *
 * The QA pass found the social loop stopping at a six-character code rendered
 * as plain text: no Share, no Copy, and empty seats that said "Invite your
 * squad" without being tappable. For a product whose retention argument is the
 * squad, the invite was the one step with no affordance on it.
 *
 * Pure so the wording is testable, and because the message is the product here
 * — it is the only thing a person who has never heard of Kairo will see.
 */

/** Kept short enough to survive a Messenger preview without being cut. */
export function inviteMessage(input: {
  squadName: string;
  inviteCode: string;
}): string {
  // Names the squad, then the one thing they have to do. No app-store pitch:
  // this arrives from a friend, and the friend is the pitch. The code is last
  // because it is what the reader has to act on, and a code buried mid-sentence
  // is a code they have to hunt for.
  return (
    `Join ${input.squadName.trim()} on Kairo — your real activity scores you ` +
    `on our daily leaderboard.\n\nEnter this code in the app: ${input.inviteCode}`
  );
}

/**
 * The iOS share sheet's title line. Not shown on every target, so it must never
 * carry anything the message body does not already say.
 */
export function inviteTitle(squadName: string): string {
  return `Join ${squadName.trim()} on Kairo`;
}
