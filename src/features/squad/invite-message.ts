import { inviteUrl } from './invite-link.ts';

/**
 * What gets sent when someone invites their squad.
 *
 * The QA pass found the social loop stopping at a six-character code rendered
 * as plain text: no Share, no Copy, and empty seats that said "Invite your
 * squad" without being tappable. For a product whose retention argument is the
 * squad, the invite was the one step with no affordance on it.
 *
 * Pure so the wording is testable, and because the message is most of what a
 * person who has never heard of Kairo will see before they decide.
 *
 * **The privacy claim is not made here** (2026-09-02). It is made on the
 * landing page the link opens, which is the surface that has room to make it
 * honestly; `invite-message.test.ts` owns the claim across both, so the two
 * cannot drift the way four surfaces already did.
 */

/**
 * Kept short enough to survive a Messenger preview without being cut.
 *
 * **The link and the code, not one or the other.** The link is the fast path —
 * it opens the app with the field already filled, and for somebody who has
 * never installed Kairo it opens a page that shows them their code, tells them
 * re-tapping the link after installing fills it in, and states what a squadmate
 * can actually see.
 * The bare code stays underneath because a link is the part a chat client can
 * mangle: some strip them, some wrap them across lines, and an SMS to a feature
 * phone has nothing to tap. Six characters always survive, and the manual field
 * in the app is still there for exactly that person.
 */
export function inviteMessage(input: {
  squadName: string;
  inviteCode: string;
}): string {
  // Names the squad, then the one thing they have to do. No app-store pitch:
  // this arrives from a friend, and the friend is the pitch. The link and the
  // code are last because they are what the reader has to act on, and either
  // one buried mid-sentence is one they have to hunt for.
  //
  // "We keep each other to a daily walk" rather than "your real activity scores
  // you on our daily leaderboard": the old line described the mechanism to
  // somebody with no reason to care about it yet, and "leaderboard" invites the
  // public-fitness-feed reading this product is not. The walk is the one thing
  // everyone in a squad actually shares.
  //
  // **The privacy clause was dropped on 2026-09-02, and it is not coming back
  // in this shape.** It read "Steps, never Health data", which is
  // self-contradictory — steps *are* Health data — and had no subject, so it
  // asserted nothing about who sees what. It went stale in the same move: since
  // the reciprocal consent gate (deviation #47) a consenting squadmate sees
  // four daily totals, not none. It survived because the clause was justified
  // on the premise that this message is the only Kairo copy a non-user reads,
  // and the landing page has since made that false.
  //
  // The claim now lives on the page the link opens, stated accurately and in
  // full, and the HealthKit permission sheet — which nobody who installs can
  // avoid — states it too. The accepted cost is that somebody who never taps
  // the link reads no privacy claim before installing. **A shorter true clause
  // is not the fix**: the compression is the cause rather than the symptom, and
  // the next one would fail the same way.
  //
  // Every word is spent against a hard budget: the link and the code line are
  // 84 characters between them, and `invite-message.test.ts` holds the whole
  // message under 200 so a chat client's preview does not cut it mid-thought.
  // The name is the variable, so the budget is measured at `SQUAD_NAME_MAX`
  // (30) and not at a comfortable fixture — the first version of this copy fit
  // a 16-character test name at 196 and ran to 210 on a real long one. Adding
  // a clause means removing one, and the test now pins the worst case. With the
  // privacy clause the worst case measured 194 against that 200 — five
  // characters of headroom, which is the arithmetic behind "no honest version
  // of the claim fits here". Dropping it leaves 169, and that room is not
  // headroom to spend: it is what a longer honest sentence would have needed
  // and still not had.
  return (
    `Join ${input.squadName.trim()} on Kairo — we keep each other to a ` +
    `daily walk.` +
    `\n\n${inviteUrl(input.inviteCode)}` +
    `\n\nOr enter this code in the app: ${input.inviteCode}`
  );
}

/**
 * The iOS share sheet's title line. Not shown on every target, so it must never
 * carry anything the message body does not already say.
 */
export function inviteTitle(squadName: string): string {
  return `Join ${squadName.trim()} on Kairo`;
}
