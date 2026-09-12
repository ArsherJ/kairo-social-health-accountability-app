# The privacy claim and the squad-data consent gate — the rules in full

Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**One test owns the privacy claim, across a declared list of surfaces, as of
2026-09-07** (issues #19 and #27). `src/features/privacy/claim-surfaces.test.ts`
is that test and there is no second one; `src/features/privacy/claim-copy.ts` is
where every in-app sentence making the claim lives, zero-runtime-import so root
Vitest can hold it — the `ask-copy.ts` split, for the same reason. The list is
`web/privacy.html`, `web/index.html`, `HealthPermissionSheet.tsx` (the sheet's
derived type list *and* its fine print), `app/(onboard)/privacy.tsx`,
`app/(onboard)/connect.tsx`, and the invite message, which is registered as a
surface that makes **no** claim and points at one that does. Each declares the rules it makes — the contact address, the four
totals, reciprocity, what a squadmate never sees, the pooled-Battle and deletion
clauses — and the **bans apply to all of them**, because a retired promise is
wrong wherever it appears: engine keys, retired stats, tier names, the retired
promises themselves, `[[TODO`. Seven things break easily:

- **There were six surfaces, not five, and the sweep is what found the sixth.**
  `HealthPermissionSheet.tsx` had been making the claim in its own words the
  whole time — in the component that renders the disclosure, guarded by
  nothing. Its wording was already true, which is the luck this arrangement
  removes the need for. It moved to `claim-copy.ts` unchanged. Nothing but a
  sweep finds a surface nobody remembered, which is why `CLAIM_MARKERS`
  includes "daily totals": a marker list written only from the sentences
  somebody already knew about finds only those.
- **The screens are asserted to *render* the sentence, not just to have one.**
  `claim()` reads the module, so without `rendersFrom` deleting the `<Text>`
  from `/connect` leaves every rule passing on copy nobody can see. The web
  surfaces are read off disk and have the link by construction; the three
  screens state it.
- **`NO_TRAIL_CLAUSE` is one string used by both beats**, not two strings a
  regex holds close together. `/connect` and `/privacy` are two beats apart and
  worded the same claim themselves for months, one of them falsely; a rule
  loose enough to accept both honest wordings is loose enough to let them drift
  again inside it.
- **A denial is required in the sentence that names what it denies.** Two
  unanchored matches let a page say "we collect your heart rate" and, four
  paragraphs later, "your route is never shared" — and pass a rule named "says
  heart rate is not shared". `sentencesWith` is the fix, and the shape was
  already named in this file for the disclosure sheet before it was fixed for
  the pages.
- **`namesNoRetiredStat` is declared per surface and is not a universal ban.**
  "Active minutes" is what `/connect` wrongly listed among what Kairo scores —
  and also the name of a HealthKit type the permission sheet legitimately
  discloses reading. The rule belongs to the surfaces whose sentence is about
  what is *scored or shared*; banning the label everywhere would fail honest
  copy, and a guard that fails on real input gets loosened until it guards
  nothing.
- **This replaced three scans and they were removed, not left alongside.** One
  was named after the invite message, one after the support links, one after the
  HealthKit disclosure — so a fourth surface making the claim had nowhere
  obvious to be registered, which is exactly how the claim went stale in four
  places at once. Two scans of one rule always drift, and one always ends up
  quietly narrower. Do not start a second one beside this; that is the whole
  defect.
- **Bans read the claim *and* the wider document, never one instead of the
  other**, and each covers the other's blind spot. Reading only the claim misses
  a retired sentence that merely moved into a caption one element over; reading
  only the document misses the claim itself, now that the copy lives in
  `claim-copy.ts` and the screen only imports it. Restoring "never the raw
  numbers" to `/connect` passed this file once, on the document-only reading,
  before being caught.
- **A registered surface is not exempt from the hand-written-claim sweep.**
  Being on the list means the claim is guarded, not that the screen may write
  one — `/privacy` and `/connect` are both registered and both read the module.
  `claim-copy.ts` is the only file under `app/` or `src/` allowed the words, and
  a screen writing "hour-by-hour" itself fails. That exemption was briefly
  wrong and let a screen hand-write the claim.
- **The list is held whole by three sweeps**, because "removing a surface" must
  fail rather than quietly narrow the guard: every `web/*.html` page is
  registered, every sentence exported from `claim-copy.ts` is registered, and
  every line of `HEALTH_DISCLOSURE` is covered by the sheet's entry.
- **`/connect`'s help line was the stale one, corrected on 2026-09-07** (issue
  #27). It promised the squad sees your progress "never the raw numbers" —
  false since deviation #47's per-row consent gate — and named "active
  minutes", not a stat since deviation #41, on the screen a 5.1.3 reviewer
  reads and two beats before the privacy beat wording the same claim correctly.
  It carries the beat's claim now: **daily totals only, never your route, never
  an hour-by-hour trail, and only where you have both agreed.**
- **The `/connect` line does not enumerate the read list, deliberately.** Eight
  identifiers do not belong in a sentence and Apple's own sheet is the
  authority; naming four of them as though they were all of them understates the
  ask on the one screen where understating it is a trust problem. So it names
  what is read in the general, and the four totals as *what a flockmate sees*.
- **A shorter true sentence is never the fix.** The compression is the cause —
  it is what made the invite message's "Steps, never Health data" both
  self-contradictory (steps *are* Health data) and subject-less — and the next
  compression fails the same way. Say the whole claim and let the scan hold it.
  What no test reaches: `NSHealthShareUsageDescription`, App Store Connect's
  fields, and TestFlight's test information all carry the claim outside the
  repo. Three more things:

- **The landing page shows the recipient their own code**, revealed by an
  inline script that validates six characters *before* filling the box. Hidden
  in the markup, so a bare address, a mangled one, a crawler and a browser with
  scripting off all render the page unchanged rather than an empty box. It had
  promised the code would be waiting in the app; it never was, and that was the
  only path in the product where somebody who wanted to join could silently
  fail to.
- **The page's six-character check is a necessary second copy** of
  `isValidInviteCode`, since standalone HTML cannot import it. The guard catches
  deletion, not divergence. No build step and no external request — both are
  properties of that page worth keeping for one rule.
- **The Sky says something true when a player is alone on it.** `sky-empty.ts`
  is a pure module tested in Node (the screen is a component file the runner
  cannot load) and owns both halves of what was one condition on the screen:
  whether a race exists — which also gates `race_seen` — and what to say when
  it does not. The corridor still draws, because the ridge is a real opponent;
  the observation comes first and the offer second; it **names no rank and
  invents no rival**, and ghost racing counts as a race so it never fires for a
  player with scored history. The offer shares the squad's own invite through
  `shareInvite`, so the message and the code cannot fork, and sends a squadless
  account to the Flock tab instead of offering an invite it has no code for.

**The reciprocal per-row squad-data consent gate** (deviation #47). It shipped
with the six-lane squad race (deviation #46, 2026-08-26 to 08-27), which the sky
corridor superseded (#56 above) — the lane layout and its flow-based mechanics
are in `docs/archive/design-history.md`. The `RACE_FINISH_LINE`,
`squad_leaderboard()` ordering and `cappedSteps` rules moved intact into the #56
block; what is #47's own, and still live:

- **The cap is the anti-cheat.** `cappedSteps` stops at the finish line, so past
  it extra steps buy nothing — restoring the resistance the tier ladder had and
  a raw-step race would have given away. (The tie-on-the-primary-key consequence
  and the `user_id` tie-break are in the #56 `placeRacers` bullet.)
- **The consent gate is reciprocal and per row**, refining the parent spec's
  whole-squad rule: whole-squad gating leaks the holdout's decision to the five
  people who agreed. `useSquadDataConsent` exposes **`isSuccess`** and callers
  must use it — a query in flight reads `false`, indistinguishable from a
  refusal (deviation #37's lesson again). Gate on `isSuccess && !consented`,
  and put the early return **below every hook**: above one it is a conditional
  hook and the count changes the frame consent lands. A row whose `steps` is
  null keeps its place with no position; dropping it looks like the member left,
  and drawing it at zero invents a bad day. **The privacy policy and the App
  Store privacy answers exist as of 2026-09-02** (`web/privacy.html`,
  `docs/app-store-privacy.md`); entering them in App Store Connect is what is
  left of the 5.1.3 blocker. **Consent has no in-app withdrawal** — nothing
  clears `squad_data_consent_at`, so the policy says "email us"; a Settings
  switch is JS-only and the obvious follow-up.
