/**
 * What the notification ask says.
 *
 * Pure and zero-import, on `status-copy.ts`'s precedent and for the same
 * reason: a claim the app makes about itself is worth a test, and root Vitest
 * cannot load the sheet that renders it.
 *
 * **This copy was false and is the reason the module exists.** The sheet
 * offered to tell the player when a new day starts and when this one was about
 * to close, and printed a cap of three a day "except the two that close out
 * your day, which arrive at 11 PM and midnight". Deviation #52 retired all
 * three of those pushes on 2026-08-25 and the sheet went on advertising them
 * — on the one screen where somebody decides whether to spend the single
 * dialog iOS grants per install.
 *
 * The truth is a stronger prime than the pitch was: one scheduled message,
 * at 08:00, carrying yesterday's result and today's standing.
 */

/**
 * The local hour the digest arrives, as the copy states it.
 *
 * A second copy of `DIGEST_HOUR`, which lives in `notification-plan.ts` — an
 * Edge Function's module, which the app does not import at runtime. The
 * keystone would be a real home for it (`QUIET_HOURS` and
 * `MAX_NOTIFICATIONS_PER_DAY` already live there), and that move is worth
 * making the next time a notification change is already redeploying all five
 * functions; it is not worth spending that deploy on a copy fix alone. Until
 * then the duplicate is pinned rather than trusted: `ask-copy.test.ts` imports
 * both and asserts they agree.
 *
 * Written into the sentences as `${hour}am`, which is honest only before noon.
 * The same test holds that too.
 */
export const DIGEST_LOCAL_HOUR = 8;

/**
 * Phrases no surface describing Kairo's pushes may use again.
 *
 * One list rather than one per test file, on the payload-ban scan's precedent:
 * two guards enforcing one rule is how they drift apart. Two surfaces describe
 * this schedule — this sheet and the Settings status row — and they went stale
 * together, so they are guarded together.
 *
 * Enumerated call sites rather than a repo-wide scan, unlike `stat-names.ts`'s
 * guard: the doc comments in this very file quote the retired copy in order to
 * explain it, so a scan over `src` would fail on the file that documents the
 * history. Two surfaces, one list, both tested.
 *
 * **A hard daily cap is on the list, and that is not an oversight.** Both
 * surfaces used to print "three a day at most". `MAX_NOTIFICATIONS_PER_DAY` is
 * 3, but `BUDGET_EXEMPT` sends bypass the budget without consuming it, so a
 * digest, a cleared challenge and a beaten Event are four — the number was a
 * ceiling the engine does not enforce.
 */
export const RETIRED_PUSH_PHRASES: readonly RegExp[] = [
  /day starts/i,
  /about to close/i,
  /day-end/i,
  /day ending/i,
  /three a day/i,
  // The old copy's "arrive at 11 PM and midnight", not the word. "Midnight" is
  // ordinary prose for the day boundary — `sync-window.ts` and `daily-walk.ts`
  // both use it, and the fine print above now says "after midnight" truthfully.
  // A guard that fails on honest copy is one somebody deletes.
  /arrive.{0,20}midnight/i,
];

const arrivesAt = `${DIGEST_LOCAL_HOUR}am`;

export const NOTIFICATION_ASK_COPY = {
  label: 'ONE A DAY',
  title: `One message a day, at ${arrivesAt}`,
  body: 'How yesterday went, and what today needs. That is the whole schedule — no streak nagging, and nothing at 11pm.',
  /**
   * Named rather than waved away, because "that is it" would be the same class
   * of lie this copy replaces: `event_completed` and `challenge_cleared` still
   * push.
   *
   * **It said "Never overnight" and that was false** — caught in review, and it
   * is worth recording because the reasoning looked airtight. `QUIET_HOURS`
   * covers 22:00–07:00 and neither trigger is in `QUIET_HOURS_EXEMPT`, so the
   * engine appears to forbid an overnight send. But quiet hours are enforced in
   * `planNotifications`, and **`finalize-days` does not call it** — it reaches
   * `sendToUser` directly, and finalization runs `FINALIZATION_GRACE_MS` (2h)
   * after local midnight. The two pushes this sentence names are the only two
   * that *do* arrive overnight. `notifications.ts` even argues they should not
   * ("a push at 02:00 to say 'well done' is worth waiting for morning"), which
   * is an intent the send path does not implement — a real defect, and not one
   * a copy change may paper over.
   *
   * So the sentence states the timing instead of promising its absence.
   */
  fine: 'The only others are things you did — a boss goes down, a challenge clears. Those land when your day closes, a couple of hours after midnight.',
  /**
   * The ask, said as the thing being asked for. "Turn on notifications" names
   * the mechanism; this names the one message it buys, which is the whole
   * argument the sheet just made.
   */
  primary: `Wake me at ${arrivesAt}`,
  /**
   * A soft decline, and it must stay one: it dismisses the sheet without
   * calling `requestNotificationPermission`, so the player can be asked again
   * later. Once iOS records a denial there is no route back inside the app.
   */
  dismiss: 'Not now',
} as const;
