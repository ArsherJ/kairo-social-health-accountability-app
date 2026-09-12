# The race pivot, the one push a day, and what survived it — the rules in full


> **2026-09-12 note.** Several files this text calls "still on disk", "unmounted with their tests" or "kept under `@deprecated`" were deleted by the ponytail audit (roadmap deviation #74): `TodayPanel.tsx`, `strain.ts`, `event.ts`, `Avatar.tsx`/`avatar-tint.ts`, `KairoLab.tsx`, `kairo-lab-contract.ts`, `data/*.json`, `validateCharacterManifests`, `species-art.ts`, `species-label.ts`, the `demo/` feature and `scripts/replay-dry-run.mjs`. The schema they served is untouched. Read those sentences as history.
Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**Kairo is a race as of 2026-08-25** (roadmap deviation #44) — the pivot, now
complete across all five sub-projects. Your real life powers your character;
your character races your friends. **The scoring engine is untouched** and still
decides every day exactly as §5/§6 specify — `tierFor`, `TIER_POINTS`,
`THRESHOLDS`, `computeDailyScore`, `planDay`, `finalizable_days()` and the
streak all behave as before, and the race reads **raw units alongside them**,
never instead of them. No user data was destroyed: scores, XP, ratings,
streaks, species, invites and completions all survive, and banked Goal XP is
kept by #45's `closed_at` mechanism. If a doc outside `docs/archive/` describes
the app as a leaderboard with goals, it is stale — fix it.

- **One push a day** (deviation #52): `daily_digest` at `DIGEST_HOUR` (08:00
  local), and **08:00 rather than finalization** because days finalize about
  two hours after local midnight, so a digest carrying the result would fire at
  2am. The cap is `users_needing_digest()`'s exclusion **and**
  `notification_log_one_digest_per_day` — both halves, because the first is the
  behaviour and the second is the guarantee, and a client-side cap is a race
  between the same account's devices. `MAX_NOTIFICATIONS_PER_DAY` **stays 3**:
  it bounds the event-driven pushes, which #52 did not touch. The three retired
  triggers stay in `NotificationTrigger` (free-text `kind`, and a push sent
  before the deploy can be tapped after it), and `users_at_local_hour()` was
  deliberately not dropped. **What the app *says* about this lives in
  `src/features/notifications/ask-copy.ts`**, pure and zero-import so root
  Vitest can hold it: the permission sheet advertised the three retired pushes
  for ten days after they stopped existing, on the screen that spends the one
  dialog iOS grants per install. Its `DIGEST_LOCAL_HOUR` is a second copy of
  `DIGEST_HOUR` — the app cannot import an Edge Function's module, and moving
  the constant into the keystone would put a five-function redeploy behind a
  copy fix — so a test imports both and asserts they agree.
  `RETIRED_PUSH_PHRASES` lives in the same module and both copy surfaces are
  tested against it, rather than each keeping its own list. **No surface may
  state a hard daily cap**, though `MAX_NOTIFICATIONS_PER_DAY` is 3: `BUDGET_EXEMPT`
  sends bypass the budget *without consuming it*, so a digest, a cleared
  challenge and a beaten Event are four, and both surfaces printed "three a day
  at most" until 2026-09-04. **Nor may any surface promise quiet hours.**
  `QUIET_HOURS` is enforced in `planNotifications`, and `dispatch-notifications`
  is its only caller — `finalize-days` reaches `sendToUser` directly, and
  finalization runs `FINALIZATION_GRACE_MS` (2h) after local midnight, so
  `challenge_cleared` is the push that *does* arrive
  overnight. `notifications.ts` argues they should not ("a push at 02:00 to say
  'well done' is worth waiting for morning"); that is an intent the send path
  does not implement, and a "never overnight" claim shipped on it for one
  review round before being caught.
- **`shouldAskForNotifications` earns the ask on a squad or a first scored
  day, as of 2026-09-04.** A running Battle was a third reason until deviation
  #66 dropped it on 2026-09-06; nobody could hold it without also holding
  `hasSquad`, since `events_need_squad` made every Event a squad's, so no
  account lost the ask. The social reasons were right while the pushes they
  enabled were; #52 left one scheduled
  push and Kairo is solo-first, so gating on them alone excluded the whole
  solo cohort from the app's only re-engagement. `hasScoredDay` reads the Today
  tab's own `useScoredDayCount` key — lifetime, `total > 0`, for that query's
  reasons — so it costs no request, and a count in flight reads false and
  withholds the ask for a frame rather than presenting it on a guess. **The
  widening adds a reason, never a surface**: the primer sheet, the Health-first
  ordering in `permissions/ask-order.ts`, the one-ask-per-session latch and the
  single modal host are all untouched, because two `<Modal>`s presenting on one
  root view controller is the defect that ordering function exists to prevent.
  `notification_ask_answered` fires **per answer** — `granted`, `declined` or
  `deferred`, with no other payload, and a test pins that — because "Not now"
  never reaches the system dialog and so can genuinely recur. The Settings row's
  undetermined help line is part of the policy: it told solo players they needed
  a squad to be asked, and `status-copy.test.ts` now holds it honest.
- **`race_results` has no client grant at all.** Read it through
  `race_result()`, which returns rank and species to anyone in the squad and
  gates capped steps reciprocally (#47). Written **once**, by the **last**
  member of a squad to finalize that date — `squadDayIsComplete()` returns
  false for an empty roster on purpose, because `every` over an empty list is
  true and would occupy a write-once key forever. The one exception to reading
  through the RPC is `dispatch-notifications`, which has no JWT and reads the
  table with the service role — which is exactly why the table has no grant
  rather than an RLS policy.
- **`figureResponse()` owns how loudly the character answers to progress**
  (`src/features/character/level-response.ts`). It is tested, and the test pins
  a 1.7× span across the level range **and** a visible change at every single
  level — the old inline arithmetic moved only at levels 6, 11 and 21, which is
  why the QA pass said the character did not morph. Tune the constants there,
  never inline in `CharacterFigure.tsx`.
- **`kairo_retention()` is deliberately unchanged across the pivot.** The
  definition of an active day did not move; only the funnel vocabulary did —
  `squad_data_consent_granted`, `race_seen`, `quest_cleared`, `event_created`,
  with `goal_created` kept as a historical value. `race_seen` and
  `quest_cleared` fire once per **local day** via
  `src/features/telemetry/daily-marker.ts`, which is neither the once-ever
  milestone store nor the per-session `app_open` marker; confusing the three is
  how a count becomes a launch counter or a scroll counter.
