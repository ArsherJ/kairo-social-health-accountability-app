/**
 * Every sentence inside the app that answers "what does Kairo claim about your
 * data?".
 *
 * **The claim has gone stale four times, in four places at once.** It was
 * written once when it was true — squadmates see your progress, "never the raw
 * numbers" — and then copied to the HealthKit permission sheet, the sign-in
 * pitch, the invite message and the landing page. Deviation #47's reciprocal
 * consent gate made every copy false in one move, and only the surface that
 * happened to have a test was corrected.
 *
 * So the copy lives here rather than in the screens, and
 * `claim-surfaces.test.ts` reads this module beside the two web pages and the
 * HealthKit disclosure as one list. A sentence added here and registered
 * nowhere fails the suite; a screen hand-writing one instead of importing it
 * fails too.
 *
 * Zero-runtime-import on purpose, so root Vitest can load it — the same split
 * `ask-copy.ts` uses for the notification sheet, and for the same reason:
 * anything reaching React Native drags in Flow syntax the runner cannot parse,
 * and copy that cannot be tested is copy that goes stale.
 *
 * **A shorter true sentence is not the fix if one of these goes wrong.** The
 * compression is what caused the invite message's version to fail — "Steps,
 * never Health data" was self-contradictory *and* subject-less — and the next
 * compression fails the same way. Say the whole claim, and let the scan hold
 * it.
 */
export const PRIVACY_CLAIM = {
  /**
   * The privacy beat's locked row. Health data is named first because it is
   * the one thing that leaves the phone at all.
   */
  healthRequired: 'Steps, active calories, sleep. Required — it is the whole game.',

  /**
   * The privacy beat's sharing row, and the corrected wording every other
   * in-app surface follows: **daily totals only, never a route, never an
   * hour-by-hour trail** — which is what `squad_leaderboard()` actually
   * projects. "Both ways" is the reciprocal half of deviation #47, and saying
   * it here is the difference between a setting and a surprise.
   */
  sharingTotals:
    'Daily totals only — never your route, never an hour-by-hour trail. ' +
    'Off means the sky is empty both ways.',

  /**
   * The help line under the Health ask on `/connect`, which is the screen an
   * App Store reviewer reads for the health-data disclosure rule and the one
   * a person reads before the single permission dialog iOS grants per install.
   *
   * It said "Your squad sees your progress — never the raw numbers", and named
   * "active minutes" among the things Kairo scores. Both went stale in one
   * pass each: deviation #47's reciprocal consent gate made a consenting
   * squadmate's four daily totals visible, and deviation #41 stopped active
   * minutes being a stat two weeks after that. The privacy beat two screens
   * later has worded the same claim correctly the whole time.
   *
   * **Three sentences rather than one, deliberately.** The retired line was
   * shorter and that is what was wrong with it — the same compression that
   * made the invite message's "Steps, never Health data" both
   * self-contradictory and subject-less. Each clause here has one job: what is
   * read, what a flockmate sees of it, and what they never see. It does not
   * enumerate the read list, because eight identifiers do not belong in a
   * sentence and Apple's own sheet is the authority on that list — naming four
   * of them here as though they were all of them would understate the ask on
   * the one screen where understating it is a trust problem.
   */
  connectHealth:
    "Kairo reads your activity from Apple Health — Apple's own sheet lists " +
    'exactly what. Your flock sees daily totals only: steps, distance, active ' +
    'calories and sleep. Never your route, never an hour-by-hour trail, and ' +
    'only where you have both agreed.',
} as const;
