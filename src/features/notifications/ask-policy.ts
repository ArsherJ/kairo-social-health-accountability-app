/**
 * When Kairo may ask for notification permission.
 *
 * A plain function for the same reason the health permission decision is one:
 * this is the ask you get exactly one chance at. iOS shows its dialog once per
 * install, and a "Don't Allow" there is effectively permanent — nothing in the
 * app can re-prompt, only Settings can.
 *
 * §5: every ask has a visible why. So the ask waits for the user to have
 * something worth being notified about — a squad, a battle running, or a day
 * that has actually scored. Never during onboarding, where the why does not
 * exist yet.
 *
 * A running battle counts on its own, with no squad flag set — though today it
 * cannot occur without one, since `events_need_squad` makes every Event a
 * squad's. The condition stays as its own reason rather than being folded into
 * `hasSquad`, so the ask does not silently re-couple to squad membership if an
 * Event ever stops needing a squad. `event_completed` is the budget-exempt
 * trigger it is anticipating.
 *
 * **A first scored day was added on 2026-09-04, and it fixed a structural
 * exclusion rather than widening a net.** The two original reasons are both
 * social, which was right when the pushes they enabled were social. Deviation
 * #52 left one scheduled push — the 08:00 digest — and Kairo is solo-first, so
 * gating on `hasSquad || hasEvent` meant the entire solo cohort could never be
 * offered the only re-engagement the app has. A scored day is the moment there
 * is genuinely something to say at 8am tomorrow, which is the same test the
 * other two reasons pass, applied to the solo loop.
 *
 * Everything else about the ask is untouched: the primer sheet, the
 * Health-first ordering in `permissions/ask-order.ts`, the one-ask-per-session
 * latch and the single modal host. The widening adds a reason; it does not add
 * a surface, and it must not — two sheets presenting on one root view
 * controller is the defect that ordering function exists to prevent.
 */

export type NotificationPermission = 'undetermined' | 'granted' | 'denied';

/**
 * How the ask was answered, as `notification_ask_answered` records it.
 *
 * A separate vocabulary from `NotificationPermission` on purpose, and not one
 * word longer than it needs to be. **`deferred` has no permission to name**:
 * "Not now" dismisses the sheet without reaching the system dialog, so iOS
 * still holds `undetermined` and the player stays askable. And there is no
 * answer called `undetermined` — a value nobody can produce would be a bucket
 * in the analysis that never fills.
 */
export type NotificationAskAnswer = 'granted' | 'declined' | 'deferred';

/**
 * The answer the system dialog just gave, in the event's vocabulary.
 *
 * Here rather than inline at the call site because the mapping was being made
 * twice in two vocabularies — `permission.ts` narrows iOS's status to
 * granted/denied, and the emitting component was re-deriving the same fact and
 * renaming `denied` to `declined` on the way past. One fact, one place, and
 * typechecked rather than pinned by a source scan.
 *
 * `undetermined` cannot arrive here — `requestNotificationPermission` returns
 * only the other two — but the callback's type is the wider read-side one, so
 * it is mapped rather than left to a default. It reads as a decline because
 * that is what a dialog that came back without a grant is.
 */
export function askAnswerFor(result: NotificationPermission): NotificationAskAnswer {
  return result === 'granted' ? 'granted' : 'declined';
}

export function shouldAskForNotifications(input: {
  permission: NotificationPermission;
  hasSquad: boolean;
  hasEvent: boolean;
  /**
   * Whether this account has ever scored a day above zero — the same lifetime
   * figure `disclosureStage` reads, from `useScoredDayCount`.
   *
   * Lifetime rather than recent, and above zero rather than "a row exists",
   * for that query's own reasons: `sync-health` writes a `daily_scores` row per
   * date in the payload whether or not it scored, so a bare row count reads 2
   * on install and would put this ask back in onboarding — the one place §5
   * forbids it.
   *
   * A count still in flight reads `false` here, so the ask is withheld for a
   * frame rather than presented on a guess. That is the safe direction: the
   * sheet arrives a moment later, where the alternative is a sheet presented
   * over an unresolved screen.
   */
  hasScoredDay: boolean;
  /** Dismissal is per-session, matching HealthPermissionSheet: there is no
   * "never ask again" until there is a settings screen to re-enable from. */
  dismissedThisSession: boolean;
}): boolean {
  if (input.permission !== 'undetermined') return false;
  if (input.dismissedThisSession) return false;
  return input.hasSquad || input.hasEvent || input.hasScoredDay;
}
