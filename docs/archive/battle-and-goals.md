# The Battle, and Goals becoming Events — history

Extracted verbatim from `CLAUDE.md` on 2026-09-08 to keep that file inside its
size limit. Both mechanics are **retired**: read this as history. The rules that
survive them — the tables that must not be dropped, `closed_at is null`,
`event_progress()`, the historical notification and telemetry values — are still
in `CLAUDE.md` (search "The Battle is retired").

Covers deviations #45/#48/#49 (Goals became Events, 2026-08-25) and #66 (the
Battle retired, 2026-09-06).

---

**The Battle is retired as of 2026-09-06** (deviation #66), and this block is
now history rather than a live mechanic. Read it that way: everything below
describes how a Battle worked and why its remains are shaped as they are.

`src/features/events/`, both `/event` routes, `SquadEventPanel`, `BattleCard`,
`event-plan.ts`, `finalize-days`' grading block, `dispatch-notifications`' digest
branch and the `event_completed` push are **gone**. `create_event(text, text,
text, text, integer, date, date, uuid)`, `abandon_event(uuid)` and
`can_see_event(uuid, uuid)` are dropped **by exact argument list** — the
`create_goal` / `p_metric` trap. Migration `20260906130000_retire_the_battle.sql`
closes every live row, so no read can render one. Four things break easily:

- **The three tables stay and must not be dropped.** `recalculate_user_xp` sums
  `event_completions.xp_awarded`; dropping them silently drops every account's
  banked Battle XP on the next write to any other XP source, and every level
  falls with nothing to notice. `packages/kairo-core/src/event.ts` stays whole
  and tested under `@deprecated` for the same reason — a banked completion needs
  the arithmetic that produced it. `EVENT_KINDS` and `EVENT_METRICS` are
  additionally load-bearing: the column CHECKs reference exactly those values.
- **`event_progress()` stays and now holds the visibility rule itself.**
  Dropping `can_see_event()` was not free: three RLS policies read it, a policy
  expression registers a dependency, and the drop is refused unless the policies
  go first. They are recreated **narrower** — participation for
  `challenge_events`, owner-only for the two child tables — so the mutual
  recursion the definer function existed to break cannot form. The function and
  the policy deliberately disagree: `event_progress()` keeps the **whole** old
  rule (participant OR member of the event's squad), because narrowing the
  surviving read would be a behaviour change smuggled in under a deletion; the
  policy keeps only the participant half, so a squad member who was never a
  participant loses read on the historical *rows*. `events_update_own` and the
  `update (title, description)` grant are deliberately untouched.
- **Testing a migration's effect on existing rows needs a staged harness.**
  `setupHarness({ stopBefore })` + `applyMigration()` exist for exactly this: the
  suite otherwise applies every file before the first test, so a live row this
  migration was written to close can never exist in front of it. Both acceptance
  criteria — every live row closed, and `recalculate_user_xp` returning the same
  total either side — are only expressible that way.
- **`event_completed` survives as a `NotificationTrigger` and routes to
  `/flock`.** A push sent before the deploy can be tapped after it, and
  `notification_log.kind` is free text. `event_created` likewise stays in
  `AppEventType` as a historical value, exactly as `goal_created` did. The
  `eventId` such a payload carries addresses nothing and must never be
  interpolated into a path again.

---

**Goals became Events on 2026-08-25** (deviations #45, #48, #49) — *superseded by
deviation #66 above; kept because the schema it created is what survives.*
`goals` is `challenge_events`, `goal_participants` is `event_participants`,
`goal_completions` is `event_completions`. `create_goal()`, `abandon_goal()`,
`goal_window_scores()` and `can_see_goal()` were dropped; `create_event()`,
`abandon_event()`, `event_progress()` and `can_see_event()` replaced them, and
all but `event_progress()` are themselves now dropped.
`src/features/goals/` and both `/goal` routes are gone. Seven things break
easily:

- **`closed_at is null` is not optional on any read.** The table still holds
  every pre-pivot Goal row so banked XP does not vanish, so the `kind`,
  `metric`, `events_need_end` and `events_need_squad` checks are all written
  `check (closed_at is not null or …)` — validated constraints, never
  `NOT VALID`. Omitting the filter renders a points goal as a Battle.
  `challenge_events_one_live_per_kind` keys off the same column, which is why
  `abandon_event()` **closes** rather than deletes.
- **An Event's target is snapshotted at creation; a Challenge's is derived on
  every read.** `bossHp()` computes it once on the client and `create_event()`
  stores `p_target` verbatim — the one place a client decides a number the
  server keeps, accepted because reimplementing the median in plpgsql is
  deviation #18's differential-test tax again, and because the exposure is a
  squad setting an easy boss for itself. Progress stays a read-time projection,
  so revisions still replay: **the target is fixed, the progress is replayed.**
  Both modules carry a comment saying so.
- **Pooled means every roster member is paid**, contributor or not. Paying only
  contributors rebuilds the per-member N-of-M rule the pivot removed.
- **`pooledDays()` in `@kairo/core` holds three rules and all three fail
  silently.** Take each date **once** — `event_progress()` repeats the pooled
  figure on every participant's row. Read `pooled_value`, **never** `value`:
  that column is behind deviation #47's consent gate, which keys off the
  *viewer's profile* and not their role, so `finalize-days` grading from it
  pools a whole fight to zero for any candidate who never consented, completes
  nothing, and logs nothing. And a date is final **only when every
  participant's is**, since a squad spans timezones and a mixed date would let
  a still-revisable contribution pay XP. It lives in the keystone precisely so
  the client's bar and the server's grading cannot disagree.
- **`recalculate_user_xp` is a full recompute written out whole**, and the
  deployed body names `challenge_completions` as a third XP source *and* writes
  `agi_total`/`str_total`/`mnd_total`. Read it before editing — a source
  omitted is a source dropped, and every account's ratings fall on the next
  sync. The quests plan rewrites the same function.
- **An erasure function had to be recreated, not renamed.** A plpgsql body is
  text resolved at execution, so `alter table … rename` does not rewrite the
  table names inside it — `collect_orphaned_goals()` would have raised
  `relation "public.goals" does not exist` on the first account deletion and
  nowhere else. It is `collect_orphaned_events()` now and still **AFTER
  DELETE**.
- **`goal_completed` survives as a notification trigger and routes to `/`.**
  `notification_log.kind` is free text, historical rows say it, and a push sent
  before the deploy can be tapped after it. A tap that goes nowhere is
  indistinguishable from push being broken.
