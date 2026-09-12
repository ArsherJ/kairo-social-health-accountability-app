# The race — one shared sky — the rules in full

Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**The race is one shared sky as of 2026-08-27** (deviation #56, superseding
#46's six lanes). **Nothing about the scoring engine changed, and nothing about
the race's mechanics changed** — same payload, same client-side re-rank, same
derived finish line, same reciprocal consent gate. Five things break easily:

- **`RACE_FINISH_LINE` is `DAILY_STEP_BASELINE`, derived and never a literal.**
  `10_000` must not appear in `race.ts`, `sky-path.ts` or any `Sky*.tsx`.
  Crossing the line *is* clearing the Daily Walk: one number, two readings. The
  race stays clear of the `AGI`/`AGI_base` trap **only because it never reads a
  tier** — it takes raw steps from the widened projection. Anything that later
  decides "did they cross" from `daily_scores.tiers` must read
  `tiers->>'AGI_base'`, or the flag moves with the user's active hours.
- **`squad_leaderboard()` orders by the weighted total; the corridor re-ranks on
  the client.** Two orderings, one payload. Ranking once in SQL is the obvious
  improvement and it silently deletes the program feature (deviation #11).
- **`placeRacers` in `@kairo/core` owns the de-overlap, and ties are the common
  case.** `cappedSteps` stops at the line, so two active people are tied on the
  primary key *by construction* — invisible on six lanes, two birds on one pixel
  on a shared corridor. Offsets alternate around the line and the function is
  deterministic: the board refetches on realtime broadcasts, and anything
  non-deterministic makes the picture twitch, which is the same failure the
  `user_id` tie-break in `rankRacers` prevents.
- **`sky-path.ts` is arc-length parameterised, and that is not a nicety.** A
  naive per-segment `t` makes the second curve visibly faster than the first, so
  two racers a thousand steps apart look a different distance apart depending on
  where they are. It lives in the keystone because two renderings read it and
  because a component reaching React Native cannot be loaded by root Vitest.
- **The corridor is plain React Native and must stay so.** `react-native-svg`
  would draw it in one element; it is a native module, so it moves the
  fingerprint, costs one of the month's fifteen builds and withholds OTA until
  that build lands. Twenty-four rotated segments is the price of keeping this
  whole redesign shippable over the air.
- **`SoloBoard` has no race on it any more, and that is the same rule.** It drew
  a six-lane track against the player's own past days; the corridor races those
  same ghosts through `ghostRivals`, and the squadless Flock tab kept the one
  thing it was for — an invite affordance beside a real day. Two pictures of one
  race on two tabs is how they start disagreeing. The freshness line went with
  the picture, to the Sky screen, and still claims only *your own* sync time:
  squadmates' is not knowable from there, because the RPC projects totals and
  not sync times.
