# 04: Calibration — a measured starting quest tier

**What to build:** Replace self-assessment with a measurement. Today every new
account starts on the automatic tier rule, which keys off how many days have
scored — so quest size measures how long someone has been here rather than what
they can do. A brand-new athlete is dealt bars they clear before breakfast; a
genuinely gentle walker is promoted for reasons that have nothing to do with
them.

After the Health grant, Kairo reads the player's daily step totals from the
phone and proposes a starting tier. The difficulty beat then opens with the
measurement stated above the choices it already renders — *"Your typical day is
6,240 steps. We'd start you on Steady."* — with Steady pre-selected. The player
can change it there, or later in Settings, and their choice still wins outright.

**The window is the fourteen complete local days ending yesterday.** Today is
excluded: calibration runs seconds after the grant, typically mid-morning, and a
partial day sitting in the set drags the median down by roughly half a band. The
device timezone stands in, because no profile row and therefore no stored
timezone exists yet.

**The rules, all held in one pure function in the keystone**, beside the
existing tier rule and the quest catalogue — it needs both, so a separate module
would be an import cycle or a table threaded through as an argument, and the
argument version has already broken an out-of-package caller at runtime once.
The function is pure, reads no clock, and takes the window's dates from its
caller:

- Days with a zero step total are **dropped, not counted**. A zero-sum day is
  indistinguishable from a day the phone was in a drawer, so counting them would
  median a new-phone player to the floor while the screen claims to have
  measured them.
- **At least four qualifying days** are required; below that the outcome is
  no-history and the tier falls back to Automatic.
- The statistic is the **median, never the mean** — one long hike must not
  promote somebody for a fortnight. This reuses the judgment the Challenge
  resolver already makes.
- Bands are **each tier's minimum steps target, derived from the quest
  catalogue** — the proposal is the highest tier whose entry bar the median
  already clears. The minimum rather than the maximum: a tier's bars should be
  met on a good day, not already beaten on a median one.

**A new, narrow HealthKit read.** It runs the same daily-interval step
statistics collection the connect beat's existing single-day read already uses,
just over fourteen days: one query, one metric. It is deliberately **not** the
sync-path window read, which runs six hourly collections plus every workout
sample plus sleep and returns a bucket payload — thousands of objects to extract
one number, including heart rate, which is owner-readable only and absent from
every projection. Reading that much to propose a quest size would leave the
screen's privacy claim technically accurate and morally misleading.

**Nothing about those fourteen days leaves the phone.** The proposal and the
median cross from the connect beat to the difficulty beat in the in-memory
onboarding answers store, which is already cleared on commit. The median is
never written to the profile and never enters a telemetry payload. The screen
says so: we read this on your phone, only the size setting is saved — and that
claim must stay exactly true.

**An onboarded account is no longer on Automatic by default**, and that is the
intended change. The automatic rule survives as the fallback for accounts that
predate calibration, hit the no-history outcome, skip the beat, or clear their
override in Settings. Its comment in the keystone must be amended to record that
a trailing median was rejected **as a standing rule** — because it makes the bar
rise as the player improves — and adopted **as a one-shot seed**, which cannot
rise because nothing re-reads it. Without that, the code says the median was
rejected while the app ships it.

Settings' difficulty help text goes stale on this change and is corrected in the
same commit.

A dedicated calibration screen is **not** built. With the proposal
pre-selected, a separate screen saying "we'd start you on Steady" followed by a
screen asking "how big?" with Steady already chosen is two screens for one
decision.

**Blocked by:** 01 (Beat registry and CTA labels).

**Status:** ready-for-agent

- [ ] The difficulty beat opens with the measured typical day and the proposed
      tier pre-selected
- [ ] Thin history falls back to Automatic and says so gently, never implying
      the player declined or that data could not be read
- [ ] The player's own choice on the difficulty beat and in Settings still wins
      outright over the proposal
- [ ] The window excludes today and covers fourteen complete local days
- [ ] Zero-step days are excluded from the median; a set of all zeroes yields
      no-history rather than the lowest tier
- [ ] Fewer than four qualifying days yields no-history regardless of how high
      the qualifying days are
- [ ] Bands are derived from the quest catalogue **and** pinned as literals by
      the same test, so a catalogue edit that moves a band fails and a human
      decides
- [ ] The calibration read touches step counts only — no heart rate, no
      workouts, no sleep
- [ ] The median is never persisted and never appears in any telemetry payload
- [ ] The calibration outcome is recorded once ever as proposed or no-history,
      and does **not** record which tier was proposed
- [ ] The keystone's tier rule comment records the standing-rule rejection and
      the one-shot-seed adoption
- [ ] Settings' difficulty help text describes the rule that now applies
- [ ] Automatic remains selectable in Settings
- [ ] The profile row still commits exactly once, on the name beat
- [ ] The deviations table records the calibration seed, with the reason
- [ ] Verified by hand on the simulator, including at the largest accessibility
      content size with the app relaunched after changing it
