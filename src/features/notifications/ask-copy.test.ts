import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_NOTIFICATIONS_PER_DAY,
  QUIET_HOURS,
  type NotificationTrigger,
} from '@kairo/core';

/**
 * The notification ask promises only what the product still sends.
 *
 * **A file-reading guard, because the subject cannot be loaded.**
 * `NotificationPermissionSheet.tsx` reaches React Native, which root Vitest
 * cannot parse, and the include pattern is `src/**\/*.test.ts` for that reason.
 * Reading the source and asserting on its text is the established fallback here
 * — the same shape as the retired-stat-vocabulary scan, the typeface-literal
 * scan and the living-mirror telemetry bans.
 *
 * **Why it exists.** Deviation #52 retired three of the four triggers this
 * sheet described — `day_starts`, `day_ending_soon` and `day_ends` — and left
 * the copy promising pushes at 11 PM and midnight that nothing has emitted
 * since 2026-08-25. It survived a week because the ask only fired for a user
 * with a squad or a live Battle. Deviation #60 then opened it to every solo
 * player on their first scored day, which would have put a false promise in
 * front of the entire new-user cohort.
 *
 * That is the same failure as the invite message's privacy clause, one week
 * apart, from the same cause: copy asserting a fact about the system, with
 * nothing watching it. This is the cheap structural answer.
 *
 * **What it deliberately does not do.** It does not pin the wording. The claim
 * is what must stay true; pinning the sentence makes every future edit a test
 * failure that says nothing about whether the promise is still honest.
 */

const sheet = readFileSync(
  'src/features/notifications/NotificationPermissionSheet.tsx',
  'utf8',
);

/** The copy, not the doc comment — which discusses the retired promises by name. */
const copy = sheet.slice(sheet.indexOf('<Text style={styles.label}>'));

describe('what the notification ask promises', () => {
  it('names the schedule the product actually keeps', () => {
    // One scheduled push, in the morning. `DIGEST_HOUR` is 8 and lives in the
    // Edge Function's planner, which this module may not import — so the guard
    // is that a morning hour is named at all, not which one.
    expect(copy).toMatch(/morning|At eight/i);
    expect(copy).toMatch(/only push Kairo schedules|one push a day/i);
  });

  it('states the quiet window, which is the one exact promise it makes', () => {
    // §14's window, and the only live triggers are all non-exempt, so this is
    // true rather than nearly true. Both bounds, in 12-hour form as the copy
    // sets them.
    expect(copy).toContain(`${QUIET_HOURS.from - 12} PM`);
    expect(copy).toContain(`${QUIET_HOURS.to} AM`);
  });

  it('promises none of the three retired evening triggers', () => {
    // `day_ending_soon` (23:00), `day_ends` (00:00) and `day_starts`. Retired
    // by deviation #52; nothing emits them. They remain in
    // `NotificationTrigger` on purpose — a push sent before the deploy can be
    // tapped after it — so their *absence from this copy* is the thing to
    // guard, not their absence from the union.
    const retired: NotificationTrigger[] = ['day_starts', 'day_ending_soon', 'day_ends'];
    expect(retired.length).toBe(3);

    expect(copy).not.toMatch(/11 PM/i);
    expect(copy).not.toMatch(/midnight/i);
    expect(copy).not.toMatch(/about to close|closes|close out/i);
  });

  it('claims no hard daily cap, because there is not one', () => {
    // The old copy said "Three a day at most". `MAX_NOTIFICATIONS_PER_DAY`
    // bounds the *budgeted* triggers only: `event_completed` is in
    // `BUDGET_EXEMPT`, so it is admitted without spending the budget and can
    // land on top of a full one. A cap that the code can exceed is a promise
    // the product cannot keep.
    expect(MAX_NOTIFICATIONS_PER_DAY).toBe(3);
    expect(copy).not.toMatch(/\bthree a day\b/i);
    expect(copy).not.toMatch(/\b3 a day\b/i);
  });

  it('names no rank, because most readers of this sheet are alone', () => {
    // Deviation #60 made the first scored day a reason to ask, so a solo player
    // is now the typical reader. `digestCopy()`'s solo branch says nothing
    // about rank on purpose — "1st of 4" against three ghosts is a claim about
    // people who do not exist — and the ask must not promise what the push
    // then declines to say.
    expect(copy).not.toMatch(/\b(rank|ranked|standing|leaderboard|1st|first place)\b/i);
  });

  it('uses no retired product vocabulary', () => {
    // "Hunter" and "barkada" went with deviation #26; sabotage went on
    // 2026-08-09 and this component's own doc comment said "has been hit"
    // until 2026-09-02. Word-bounded and case-insensitive over ordinary
    // English — a loose /hit/ matches "white".
    for (const word of [/\bhunter\b/i, /\bbarkada\b/i, /\bsabotage\b/i]) {
      expect(sheet).not.toMatch(word);
    }
  });
});
