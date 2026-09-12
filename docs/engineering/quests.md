# Quests and `recalculate_user_xp` — the rules in full

Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**Quests are derived, and `recalculate_user_xp` is a full recompute** — the
mechanics shipped with the four-tab Character · Today · Squad · You layout
(deviation #50, 2026-08-25 to 08-27; that layout and its `TabPill` raised-disc
geometry are in `docs/archive/design-history.md`). Four things break easily:

- **A quest is derived, never stored.** `pickQuests()` is a pure hash of
  `(userId, localDate, tier)` — no table, no midnight job, no cron, and nothing
  stateful for a retroactive Apple revision to invalidate, exactly as a
  Challenge. Only `quest_completions` is stored, because it pays XP and must
  fire once. **A `quest_id` is permanent**: it is opaque `text` so a new quest
  costs no migration, and renaming one orphans every completion banked against
  it. Retire a quest by deleting the row and leaving the id unused.
  `pickQuests`'s rotation is **bounded and followed by a linear sweep** — the
  stride only visits every slot while it is co-prime with the tier's pool size,
  and one hand-edited quest makes a seven-entry tier composite; an unbounded
  loop would spin on a render thread rather than fail.
- **The client and `finalize-days` must resolve the same quest tier.** Both
  call `questTier()` with the same lifetime scored-day count — `total > 0` on
  both sides — and the same `profiles.quest_tier_override`, and the override
  wins outright with the precedence inside that function rather than at either
  call site. A disagreement pays XP for a quest that was never on screen, and
  the completion latches. **Sleep is the same rule in miniature**:
  `finalize-days` reads through `scoringSleepMinutes` and the client through
  `scoredSleepMinutes`, so a hand-typed night — which scores no MND at all —
  reads "No reading yet" and clears nothing. A raw `daily_sleep.minutes` read
  on either side pays XP for a bar the card never showed met.
- **`recalculate_user_xp` is a full recompute written out whole** and now sums
  four sources. Read the deployed body before editing it — a migration that
  omits a source drops it silently and every affected account's level falls on
  the next write. **And number the migration after any sibling that rewrites
  the same function**: migrations apply in filename order, so an earlier
  timestamp has its whole change overwritten on every fresh apply while the
  deployed database stays correct, which no test in this repo would catch.
  Quest XP never touches `daily_scores.xp_awarded` (a rescore replays it) or
  the three stat rollups (a cleared quest is not activity in a stat).
- **Quests are built outside the disclosure gate**, and the gate's own surface
  list is in `useDisclosure`'s doc comment. The constant, the `total > 0`
  filter, the `resolved && stage` navigation rule and the retention measurement
  are unchanged — see "The disclosure gate did not move" above for the current
  Today-tab list.
