# The Digest and the notification ask — the rules in full

Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**The Digest is reachable and bounded as of 2026-09-02** (deviations #61 for
the ask, #65 for the suppression — split across two roadmap rows because a
second, independent pass landed the same ask-widening under #61 before this
row's own #60 could be reconciled; the table is corrected in place). Two
halves that correct each other and must never ship apart. `shouldAskForNotifications`
gains the account's **first scored day** as a third reason beside a squad and a
live Battle (that second reason went with deviation #66 on 2026-09-06) — the
social reason is unchanged, `nextPermissionAsk`'s
ordering is unchanged, and Health still goes first. `users_needing_digest()`
gains an activity predicate: **no scored day in seven local days** and the
account gets nothing, silently, until its next scored day. Five things break
easily:

- **Opening the ask without the suppression is worse than shipping neither.**
  It gives a lapsed solo player thirty pushes a month they would never
  previously have received; deviation #52's whole argument was that volume is
  not urgency. Applying the suppression without the ask changes nothing for
  the population it was written for, because they hold no token. The two
  shipped in the same pass for exactly that reason, even though the numbering
  collision above left them recorded as two roadmap rows rather than one.
- **An account that has never scored is suppressed, and that is not a bug that
  eats a first Digest.** The ask fires on the first scored day, so such an
  account holds no push token; the two rules meet at the same boundary from
  opposite sides. The reasoning is in the function body because the next reader
  will otherwise "fix" it with a young-account exemption, and a redundant second
  rule is how two rules later disagree.
- **The window is `> today - 7`, not `>=`.** Six days ago qualifies; seven and
  eight do not. The schema suite pins both sides, because an off-by-one here
  silences an active cohort. `total > 0` is the same reading of "scored" every
  other surface uses — `sync-health` writes a row per date in the payload
  whether or not it scored.
- **The 7 is a commented literal and stays one.** SQL cannot import from the
  keystone and a mirrored TypeScript constant would have no reader: no client
  asks whether it is suppressed. Deliberately unlike `DAILY_STEP_BASELINE`,
  which is derived precisely because two places read it. Suppression is not
  recorded either — `notification_log` says who was *sent*, and the suppressed
  population is derivable from scores, which is `kairo_retention()`'s job.
- **A lapse is not a quiet week and `CONTEXT.md` now defines the two against
  each other.** A player scoring little still scores, so they pass the
  predicate every day. Lapse stops the Digest and nothing else: no demotion, no
  lost Mastery, no altered gate, nothing stored, and the player is never told.
  **No Edge Function redeploys** — the function is replaced in place and its
  signature does not move.
- **The ask sheet's copy describes the Digest and is guarded.** It promised the
  11 PM and midnight pushes deviation #52 retired, and survived a week only
  because the ask never reached a solo player. It names no rank (the solo digest
  branch declines to, and a solo player is now the typical reader) and claims no
  hard daily cap — `MAX_NOTIFICATIONS_PER_DAY` bounds the *budgeted* triggers
  and `event_completed` was `BUDGET_EXEMPT`, so "three a day at most" was never
  guaranteed. `ask-copy.test.ts` reads the `.tsx` off disk, which is the only
  way to test it: root Vitest cannot parse React Native's Flow syntax.
- **Two ordering constraints, and both windows are silent.** The migration is
  applied **before** the client ships, or solo players hold tokens against an
  unsuppressed Digest. The landing page is deployed **before** the OTA that
  drops the invite message's privacy clause, or the claim briefly exists on no
  surface a non-user can reach — the very failure this pass corrects,
  reintroduced by sequencing.
