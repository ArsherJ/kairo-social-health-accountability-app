# Onboarding, the disclosure gate and the permission sheet — the rules in full

Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**A new account does not see the whole app, as of 2026-08-17** (deviations
#37–#39). `disclosureStage()` in `@kairo/core` returns `core` below
`DISCLOSURE_THRESHOLD_DAYS` and `full` at or above it; `TrainEntry`, `StatRail`
and the Strain/Sleep rows are hidden in `core`. **The Battle was deliberately
not gated**, and the rule outlived it (deviation #66 retired the mechanic on
2026-09-06): a squad's shared surface must not be gated on one member's
scored-day count, or a new member is hidden from what the rest are already
looking at. Nothing is deleted —
every gated surface stays built and reachable, which is what makes this cheap to
reverse. Four things break easily:

- **The threshold is pinned by a test and gates on *lifetime* scored days**,
  never a recent window — a recent-activity gate would demote someone returning
  from a quiet week back into the reduced app, and that user is exactly who the
  retention measurement is about. `useScoredDayCount` filters `total > 0` for a
  related reason: `sync-health` writes a `daily_scores` row per date in the
  payload whether or not it scored and `resolveSyncWindow` always sends today
  *and* yesterday, so a bare row count reads 2 on install and would open the
  gate on day 1 for someone who has done nothing.
- **Hiding an entry point is not closing a door.** `/train` checks the stage
  itself, because push routing and deep links reach it regardless of the home
  screen. **It gates on `resolved && stage === 'core'`, not on the stage
  alone** — the stage reads `core` while the count is in flight, which is
  correct for hiding a card and wrong for a redirect: a Challenge push that
  cold-launches into `/train` has no cached count, and bouncing a `full` user
  home on that frame reads exactly like the feature being removed. Hide on
  `stage`, navigate on `resolved && stage`.
- **Onboarding is the six-beat flow** (deviation #58 — see its block below for
  the ordered list), and the profile row still commits exactly once, on the
  final `/name` screen. Add steps *before* the name,
  never after — that is still deviation #22's deleted flag. `/connect` reads
  HealthKit **locally** via `readStepsToday` against the *device* zone, because
  no profile row and therefore no `profiles.timezone` exists yet; that is the
  whole reason the reveal can work that early.
- **`syncStatus`'s `'no-data'` never shadows `'failed'`** (the 9–11 Aug outage
  class) or `'stale'`, and it waits `QUIET_GRACE_MS` from `SyncState.firstSyncedAt`
  — stamped once, never overwritten. Without the window it accuses someone who
  connected at 8am with 200 steps, which is the same false accusation the state
  exists to remove. HealthKit does not report read-permission denial, so the app
  can only ever say nothing has arrived, never that the user declined. Two
  things keep it honest and both were found in review: `useHealthSync` **must
  invalidate `scoredDayCountKey`** (nothing else refetches it, and a stale count
  lets the accusation through the back door), and `everReceivedData` is **not**
  the scored-day count alone — Bronze AGI is 1,000 steps, so a 400-step day is
  real data that scored nothing, and today's buckets are OR'd in.
- **The permission sheet is bounded, scrolls, and wraps its content in a View
  with an explicit point width.** All three are load-bearing and were found the
  hard way on 2026-08-17. `Panel` sets `overflow: 'hidden'`, so an oversized
  sheet never visibly spilled — it was silently clipped *inside* the card, and
  at XXXL the Health ask lost its "Not now", the one control that lets someone
  decline. Three separate faults: no height bound (fixed with `maxHeight` plus
  a `ScrollView` that is `flexGrow: 0, flexShrink: 1`, so the card still hugs
  short content instead of always taking the cap); no width bound on **direct
  `Text` children of a scroll container**, which laid out wider than the card
  and clipped mid-word — a `View` with a computed point width fixes it and
  `width: '100%'` does not, because the percentage resolves against a
  ScrollView whose own size depends on measuring that content; and a two-column
  row that cannot fit past ~1.3x, which now stacks.
  **Two testing notes.** This class of bug is invisible at every normal text
  size — `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
  is how it was found. And **relaunch the app after changing content size**:
  RN caches text measurements, so a size change on a running app renders correct
  text inside stale boxes and looks exactly like a layout regression.
- **Connecting Apple Health is `connect-health.ts`, never inlined.** It is five
  steps — request, `configureHealthBackgroundDelivery`,
  `notifyHealthPermissionGranted`, read the state back, track — and `/connect`
  and `HealthAsk` both call it. It exists because the sequence was paraphrased
  into `/connect` and three steps vanished with no error and no log: the worst
  was background delivery, since after a grant `readHealthPermissionState()`
  returns `'asked'` and `nextPermissionAsk` never offers the sheet again, so
  nothing would ever have registered it for the whole new-user cohort.

**`src/ui/Text.tsx` is the only Text, as of 2026-08-14.** Import it from `@/ui`,
never from `react-native` — the two are otherwise identical, which is exactly
why the wrong one is easy to reach for. It exists because React Native scales
with Dynamic Type without an upper bound, so at the largest accessibility sizes
a 34pt display line became ~80pt and every fixed-height row tore apart. It
**caps, never refuses**: `allowFontScaling={false}` would make the layout safe
by making the app unreadable for the people the setting exists for, and it
appears nowhere in this codebase. Three scales, chosen by *what the type sits
inside* rather than by how important it is — `prose` (1.8) for copy in
containers that grow, `chrome` (1.4) for buttons and meta lines, `fixed` (1.2)
for type locked to drawn geometry. `prose` is the default so tightening is
deliberate, and it belongs in the component that owns the geometry.
