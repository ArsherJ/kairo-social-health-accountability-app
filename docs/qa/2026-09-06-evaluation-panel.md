# Kairo six-persona evaluation panel — 2026-09-06

Convened from `~/Downloads/kairo-evaluation-panel-prompt.md`. Evaluated against the
**running iOS simulator build** (iPhone 17, iOS 26.5, dev client, account "Rty"),
the codebase at `7dc39de`, the live Supabase project, and `docs/mvp-scope.md` as
the IN/OUT contract.

## Read this first — the brief describes a product that no longer exists

The prompt's "What Kairo is" block is the v1.3 spec: four stats (STR/AGI/END/INT),
four species chosen by dominant stat, best-of-three duels, squad-vs-squad races,
a feed gate, biome diversity, sabotage items, war declarations, referral rewards,
coin packs and a ₱129/mo subscription. **None of that is in the build.** Per
`docs/mvp-scope.md`, `docs/roadmap.md` (deviations #17, #40, #41, #44, #45, #55)
and CLAUDE.md, what actually exists is:

| Brief says | Build has |
|---|---|
| Four stats, END and INT | **Three**: Motion (steps), Body (active kcal + verified strength minutes), Mind (sleep) |
| Species readout over a 14–21 day window | **One species, the Philippine eagle, for everybody.** Dominance drives build proportions and the ground shadow, not the animal |
| Duels, squad-vs-squad races | **One daily race to a fixed 10,000-step ridge**, ranked by capped steps; solo players race their own past days as ghosts |
| Feed gate, biome bonus, amnesty days | **None.** A streak shield (needs a 5-day streak) is the only forgiveness mechanic |
| Sabotage, war declarations, referral rewards | **Removed / never built.** The invite code is membership plumbing with no attribution |
| Coins, subscription, AdMob | **Non-monetized beta**, explicitly |
| Rive-animated character | **Static PNGs**; Rive parked (`/kairo-lab` says so) |

The August 2026 QA pass made exactly this mistake and buried its real findings
under 1/10 scores for absent features. Every persona below grades **the built
product**, and notes where the brief's question cannot be answered because the
mechanic does not exist. Where the brief asks about something that was
*deliberately* cut, the persona says whether the cut was right, which is the
useful version of the question.

## What was actually examined, and what could not be

**Seen on the simulator** (deep-linked via `kairo://`, because synthetic taps do
not work on this Mac): Today, Sky, Flock, You, Settings, `/progress`,
`/event/new`, `/join/DZ48NR`, `/train` (bounced to Today — disclosure gate
working on a 2-scored-day account), `/kairo-lab` (dev only). Each of the four tabs
was also captured at the largest accessibility text size.

**Not walkable**: the seven onboarding beats (a ready account redirects to Today),
the Today details sheet, the four welcome cards, the Battle creation form with a
real squad, a populated squad of six. Those were read from source and copy
modules instead, and the personas say so where it matters.

**Other evidence**: `npm test` — 102 files, 1,487 tests, all pass. Live project:
4 profiles, 14 scored days total, 0 flagged days, 2 squads of one member each.
This is a pre-cohort build; nothing below is a retention claim.

---

## Persona 1 — Product Manager

**Market wedge.** The brief's "barkada squad + un-fakeable progress" is no longer
the wedge; deviation #44 made it *"your real life powers your character; your
character races your friends,"* solo-first. That is the right call for the
cold-start problem the brief worries about — a new account has a full loop with
zero friends (Today scene, quests, Daily Walk, ghost race, digest). The Sky tab
alone reads *"You have the sky to yourself. The ridge is the opponent"* and
offers one invite, which is honest. The cost is that the differentiator against
Stompers/Charlie-style step apps is now **the character and the writing**, not the
social mechanic. On the built evidence the character is one static eagle sprite
with a ring and a shadow; the writing is genuinely distinctive. That is a thin
wedge until Rive lands.

**MVP discipline.** The current scope is *more* disciplined than the brief's V1,
not less — sabotage, duels, wars, referrals, coins are all out with recorded
reasons. What remains is still wide for a beta with four accounts: three quests a
day, Daily Walk, Challenges behind a gate, a Battle, personal records, Mastery
ratings, a strength-minute credit, spread shifts, calibrated difficulty, and a
seven-beat onboarding. **If forced to launch in four weeks I would cut**: (1) the
Battle — the only squad mechanic with a real bug surface (see below) and the only
one that needs a squad to test; (2) Challenges and `/train` — already hidden for
three days, nobody will miss them for a month; (3) Mastery on the You tab — a
monotone lifetime number on a brand-new account is a number that says "1". Keep
the race, quests, the Daily Walk, the streak and the digest.

**Retention architecture.** There is no feed gate and no weekly cadence; the loop
is one daily race to a flat line, one push at 08:00, and a streak with a shield.
That is a streak/points system — say it by name — but three things keep it from
being fragile: the finish line never scales, the shield exists, and lapsed players
are *silenced* rather than nagged (`users_needing_digest()` stops after seven
quiet days). **A quiet squad member costs the group nothing**: the race shows
them at the start of the corridor, the Battle is pooled so the strong carry, and
nothing is N-of-M any more. Degrades gracefully. The weakness is the opposite:
nothing *pulls* the quiet member back except a squadmate's message.

**Monetization sanity.** Moot for this beta — `docs/mvp-scope.md` says remove all
pricing from release criteria, and that is correct. When it returns, the spec's
₱129/mo for an app with no coach and no content library is selling nothing a
free user lacks; the honest subscription is cosmetics for the bird and a bigger
flock, and the price should be tested at the spec's own ₱49 floor first.

**Three numbers for week one**, all already queryable per `docs/beta-measurement.md`:

1. **Health-grant rate at `/connect`** (`onboarding_beat_seen` connect → difficulty). Under ~70% and the mirror beat is not doing its job; the whole product is downstream of that dialog.
2. **D1 return, split by `race_seen`.** If the race cohort does not return more often than the solo cohort, the Sky tab is decoration and the squad layer is not earning its complexity.
3. **Squad formation** (`flock_prompt_answered` → `squad_created`/`squad_joined` within 72h). Under 20% of accounts in a squad by day 3 and the Flock/Sky tabs are two of four tabs serving one in five users.

The documented kill signal — under 25% retained at D21 — stands.

**Strengths**: solo-first loop that works with zero friends; an unusually
well-argued decision record (every cut has a why); silence-on-lapse instead of
nag-on-lapse.
**Risks**: differentiator is currently copy plus a static sprite; iOS-only in an
Android-majority market; the Battle is the one mechanic with an open defect.
**Recommendations**: cut the Battle from the first cohort; ship Rive or do not
promise "morphs"; put the health-grant rate on a wall.

**Verdict: Iterate — 6/10.**

---

## Persona 2 — Tech & App Reviewer

**First impressions.** The Today tab is the best single screen I have seen in a
step app this year, and it is not close: one bird, one number, one sentence —
*"You have done what can be changed today. Rty can rest with you."* — and a
single link to details. It refuses to be a dashboard. The Sky tab is the same
idea drawn as a climbing corridor with a flat *"10k · ridge"* pill, which tells
you the rules without a tutorial. Then you hit Flock and the register drops: a
purple gradient hero reading **"1st of 1 · leading"** over a squad of one, a
week strip of empty circles, a dead Battle card at the bottom stamped
*"ended 29 Aug · 1,100 · time up"* eight days after it ended. The app that
would not congratulate you for being alone on the Sky tab does exactly that one
tab over.

The brief asks where a new user gets bored between onboarding and the first
duel. There is no duel. The honest answer is *day two*: the bird does not
visibly change, the sentence changes a little, and the race against your own
ghosts is only as interesting as your own yesterday. I could not walk the
onboarding on this machine; from the copy it reads well and the calibrated
difficulty beat (a fourteen-day step median proposing a quest size, read on the
phone and never uploaded) is the smartest thing in the flow.

**"You can't fake your progress."** I do not believe it, and the code agrees with
me more than the marketing does. The HealthKit reads for steps, distance and
calories carry a date filter and nothing else; a value typed into the Health app
counts. The sync endpoint accepts whatever hourly numbers the signed-in client
sends, with no ceiling and no device attestation. What the app *does* have is a
capped race — past 10,000 steps nothing buys anything — a flag chip on the
leaderboard row for implausible bursts, and a source allowlist for gym
sessions. That is "cheating buys little," which is a defensible design, and a
different sentence from "un-fakeable." I would trust the claim when typed-in
samples are excluded and the server bounds what an hour can contain.

**Craft.** It clears the Duolingo/Headspace bar on Today and Sky and misses it on
Flock, which is a conventional leaderboard with a gradient. Two visible defects at
default text size: the racer's bird at the top of the Sky corridor is drawn under
the flock rail card with its head clipped, and the Flock hero congratulates a
squad of one. At the largest accessibility size the four tabs hold up
remarkably well — the only break is the invite code wrapping to a second line
with a lone "R" orphaned under the tab bar. The sabotage/war/biome complexity the
brief fears is gone; the remaining complexity is *conceptual* — ridge, flock,
battle, quest, challenge, mastery, record, run, streak — nine nouns for a
one-screen app.

**Platform gap.** Android holds the large majority of the Philippine market. For a
solo app that is a funnel problem; for a *squad* app it is structural — a
barkada is mixed by default and the free tier holds six seats. The build has a
development-only Android boundary and Health Connect is not wired. This is the
single biggest reason the squad layer will under-perform in the target market,
and no amount of iOS polish changes it.

**Pull-quote:** *"Kairo's Today screen is the calmest thing in fitness apps —
which makes it strange that the first thing it lies about is whether you are
winning."*

**Verdict: ★★★☆☆** — a superb solo screen wrapped around a squad layer that is
iOS-only, congratulates you for being alone, and cannot yet back its central
claim.

---

## Persona 3 — Beta Tester

Okay so, honest. I opened it this morning because of the 8am push, not because
anyone was waiting — there's nobody in my flock, it's just me and a "+" circle.
I opened it *again* after my walk because I wanted to see if the bird would do
something at 10,000. It said RIDGE and gave me the "you can rest" line and
honestly that felt nice? Like the app let me go. Most apps want you to keep going.

Proud moment: the You tab said Motion 11,000 steps, 6 Sep — my best day. I
screenshotted it. Embarrassed moment: none, because nobody can see me. I sent
the code to two friends. One is on Android. The other said "is this the bird
thing" and hasn't installed it. So the "in front of your friends" part of your
question hasn't happened to me.

Gaming it: I didn't, but I know I could. My cousin adds steps in the Health app
for his office step challenge, everybody knows the trick. I'd assume the same
works here. The race stops at 10k anyway so I don't know what he'd gain, except
in the boss fight thing which is calories and nobody's told me there's a limit.

What would make me delete it in a week: the Flock tab telling me I'm "1st of
1 · leading" every day. It's like a participation trophy from a robot. Also the
bird. I love the bird. But it's the same bird every day and it's the same bird
for everyone — when my friend does join, we're two identical eagles named
different things.

What would make me tell people: if the bird actually changed. Even a little. The
level bar went from 3 to 4 and nothing happened on screen. And the invite link
worked first time from Messenger, which is more than most apps.

**Would I still have this installed in a month?** *Yes if one friend joins, no if
nobody does.* Alone, it's a very pretty pedometer that sends one nice push a day.
With a flock it might be the thing you check to see who's ahead. Right now it's
a coin flip and the app isn't doing much to tip it.

---

## Persona 4 — App Store Editorial / Awards Juror

| Criterion | Score | Justification |
|---|---|---|
| **Delight & Fun** | **3/5** | The Living Mirror composition and the kairo-voice sentences produce a real moment at the ridge. But the "species readout" the brief describes does not exist: every player is the same eagle PNG, and the mechanical "morph" is a ring, a shadow and build proportions I could not distinguish between level 3 and 4 on device. Cosmetic layer over a spreadsheet is unfair; *sprite over a spreadsheet* is accurate. |
| **Innovation** | **2/5** | "Character as passive readout" was novel; "one character for everyone that levels from steps" maps onto Pikmin Bloom, Walkr and a dozen pet-raisers. The genuinely new ideas are quieter: the finish line that never scales, the shield, silence on lapse, and the difficulty seed from a fourteen-day median that never leaves the phone. None of those is visible enough to be judged. |
| **Cultural specificity** | **2/5** | The four endemic species were the cultural argument; three of them are now unreachable behind `displaySpecies()`. What remains is one Philippine eagle nobody is told is a Philippine eagle on any screen I saw, an English-only voice, and no barkada vocabulary (retired on purpose). Swap the eagle for a generic owl and the product is unchanged. The *Philippines-market decisions* — pricing floors, Xiaomi-band sleep support, per-user local days — are real, but they are engineering, not identity. |
| **Interaction design / craft** | **3/5** | Today and Sky are award-adjacent: restraint, hierarchy, a tested accessibility posture (grouped VoiceOver rows, capped Dynamic Type that never refuses). Flock is a template. Two layout defects at default size and one at accessibility sizes. The Battle panel cannot recover from an expired fight. |

**Would this get featured or shortlisted?** Not this build. Editorial features
want one screenshot that explains the app; Today is that screenshot, and it is
undercut by the second one being a leaderboard. Design Award shortlists want the
*mechanic* to be visible in the interaction; here the best mechanics are
invisible by design.

**The single biggest gap** between this and an award-caliber build is that the
character does not visibly answer to the player. The whole thesis is "your real
life powers your character," and on device the character is the same picture on
a 400-step day and an 11,000-step day. Rive is the plan; until it ships, the
thesis is a sentence rather than a picture.

---

## Persona 5 — Anti-Cheat / Security Auditor (red team)

The brief's four-stat, duel, sabotage, war and referral vectors are mostly
inapplicable — those mechanics do not exist, and their absence closes whole
classes of exploit (there is nothing to trade in a duel, nothing to grief with,
no referral reward to farm). What follows is the attack surface that *does*
exist, mechanic by mechanic, verified against source. Severity assumes the
product's own promise; exploitability assumes a motivated squad member with
their own iPhone.

### What the defence actually is

- **The cap is the anti-cheat** (`race.ts`): race contribution stops at 10,000 steps; scoring interpolates to Gold and stops at 1,200 points per stat. Past the line, inflation buys nothing *in the race or the score*.
- **Velocity flag** (`anticheat.ts`, applied per hour bucket by `isDayFlagged`): more than 9,000 steps in an hour with no workout, no distance ≥ 0.4 m/step and no elevated heart rate sets `daily_scores.flagged`, rendered as a chip on the leaderboard row. Never reduces a score. Clears after three clean days.
- **Source trust** (`trust.ts`): user-entered *sleep* and *workouts* are rejected; strength minutes need an allowlisted source **and** heart-rate evidence.
- **Server authority**: clients cannot write `health_buckets` or `daily_scores`; everything replays from stored buckets.

### Vectors

| # | Vector | Severity | Exploitability | Status |
|---|---|---|---|---|
| 1 | **Typed-in Health data.** `readHealthWindow` queries steps, distance, active energy and exercise minutes with a date filter only; `HKWasUserEntered` is not excluded. Health app → Steps → Add Data. Spread 2,000 steps across five hours and the velocity flag never fires; add a matching distance and it cannot fire. | **Critical** for the promise; **medium** for outcomes (race and score are capped) — **critical and uncapped for the Battle**, which pools raw active kcal | **Trivial** | **New — close before any outside cohort.** The library supports it: `filter.metadata = { withMetadataKey: 'HKWasUserEntered', operatorType: notEqualTo, value: true }` on each quantity query, matching what sleep and workouts already do. |
| 2 | **Client-authored sync payload.** `sync-health` trusts the JWT holder's hourly numbers. Validation is shape only: non-negative, hour 0–23, ≤750 buckets. No per-hour ceiling on steps, distance or kcal; no App Attest / DeviceCheck. A user who extracts their own session token (a proxy on their own phone) can `curl` any day into existence. | **High** | **Moderate** | **New.** Mitigate in layers: (a) server-side plausibility ceilings per hour (steps, kcal, distance) that clamp and flag rather than reject; (b) App Attest on `sync-health`; (c) rate-limit syncs per user. (a) is a `sync-plan.ts` change with tests and costs nothing native. |
| 3 | **Third-party HealthKit writers.** Any app with write access (or a "step booster" app) writes samples; the statistics query sums all sources and iOS source priority is user-controlled. | **High** | **Trivial** | **Known class, not documented as accepted.** Record the source bundle on quantity reads (as workouts already do) and count only Apple sources (`com.apple.health.*`) for steps and energy, flagging the rest. Same allowlist pattern as `WORKOUT_SOURCE_ALLOWLIST`. |
| 4 | **Motion spoofing** — phone on a fan, a dog, a car on cobbles. | Medium | Moderate | **Accepted risk**, and correctly bounded by the cap. One correction: `anticheat.ts` calls the distance "GPS-derived." On iPhone `DistanceWalkingRunning` is pedometer-estimated by the motion coprocessor, so a fan that fools the step counter also produces a plausible stride and *suppresses* the flag. The comment over-states the check; treat distance as weak corroboration. |
| 5 | **Battle pooling.** One cheater's kcal pays XP to the whole roster; the boss's HP is a client-computed number stored verbatim (`p_target`, deviation #49), so a squad sets its own easy boss. | Medium | Trivial (own squad) | **Accepted for the easy boss** (documented); **not accepted for #1/#2 feeding it**. Fixing 1–3 fixes this. Add a server sanity floor on `p_target` against the squad's own trailing sum. |
| 6 | **Expired-Battle lockout** (not cheating, but a griefing shape). `finalize-days` reads only live events and nothing sets `closed_at` on expiry; `challenge_events_one_live_per_kind` holds the slot. One member starting a Battle and leaving blocks the squad from ever starting another until someone finds "abandon." | Medium | Trivial | **New — bug.** Close expired events in `finalize-days`, or let the panel treat `expired` as closed. |
| 7 | **Sleep from any app.** User-entered nights are rejected; a third-party sleep app is `flagged` but still scores and still clears sleep quests for XP. | Low | Moderate | **Accepted, documented** ("a legitimate obscure sleep app scoring zero is indistinguishable from Kairo being broken"). Fine. |
| 8 | **Invite-code guessing.** `^[A-Z0-9]{6}$` — 2.2 billion codes; `join_squad` has no rate limit beyond Supabase's. Payoff is joining a stranger's squad and, after consenting, seeing their four daily totals. | Low | Hard | Accepted for beta. Add a per-user join-attempt limit before public launch. |
| 9 | **Timezone hopping.** `profiles.timezone` is client-writable and buckets are keyed by local date the client reports. I did **not** verify whether moving the zone mid-day can land 30+ buckets on one date. | Unknown | Moderate | **Needs a test** in the schema suite: two syncs with different zones for one UTC window. |
| 10 | Species / dominance sandbagging | — | — | **Inapplicable**: one species; Mastery is monotone lifetime so sandbagging cannot lower anyone. |
| 11 | Duel collusion, cross-squad collusion, sabotage griefing, referral burners | — | — | **Inapplicable**: not built. The race is capped and squad-private, so there is nothing to trade and nobody outside the squad to harm. |

**Summary.** Two vectors (1 and 2) contradict the product's one-sentence promise
and are cheap to close; one (3) is the same fix in a second place; one (6) is a
plain bug. The cap and the flag chip are good design, but they protect the *race*,
and the Battle — the only pooled, uncapped, XP-paying mechanic — sits outside both.
**Do not admit an outside cohort until 1, 2(a) and 6 are closed.**

---

## Persona 6 — Growth / GTM Critic

**Reddit organic.** There is no lurk-then-post plan in the repo; the spec's beta
design names PH Facebook fitness groups (recruit intact barkadas), PH Reddit and
TikTok build-in-public. I cannot grade a plan that is not written, so: what I
would need is the target subreddits, the founder account's history there, and
the first three post drafts. On the *hook*: the anti-cheat angle is a
build-in-public story for r/reactnative and r/iOSProgramming — engineers love
"we cap the race so cheating buys nothing" — and it will not convert on
r/getdisciplined or r/loseit, where the audience wants a screenshot of the bird
and one sentence about what it did for someone's month. The convertible hook is
*the Today screen and the writing*: "the fitness app that tells you to rest."
Lead with that; keep the anti-cheat thread for the engineering post.

**Virality loop.** There is no war-declaration referral system; there is one
invite message — *"Join Bew on Kairo — we keep each other to a daily walk"* — a
landing page that shows the recipient their code, and a Sky tab that keeps the
invite open. That is a **membership loop, not a viral loop**: it acquires the
five people a founder already knows and then stops, because the free tier holds
six and squads are private. No public identity, no share card for a best day, no
"my flock won the day" moment that leaves the app. The single cheapest addition
is a shareable image of the You tab's *Your best days* card. The existing
telemetry (`flock_prompt_answered` → `squad_joined`) already measures the loop;
nothing measures whether anything leaves the app.

**Cultural specificity as asset or ceiling.** Right now it is neither, because it
is barely present: one eagle nobody names, English copy, "barkada" retired, no
Filipino-language surface. Leaning harder would *help* the beachhead — a
Taglish voice for the bird is a differentiator no US app can copy — and would
not cap the addressable market, because the mechanics are universal and the
voice is a locale. The ceiling is not culture; it is **iOS-only in an
Android-majority country**, which shrinks every barkada to its iPhone owners
before the first invite is sent.

**Strengths**: invite link that works from a chat client; an honest solo pitch on
the Sky tab; measurement already wired for the loop that exists.
**Risks**: nothing leaves the app; iOS-only halves every friend group; the
anti-cheat story is aimed at the wrong audience.
**Recommendations**: a shareable best-day card; write the Reddit plan around the
Today screen; put Android on the roadmap before public launch, not after.

**Score: 4/10** as a growth machine today; the parts that exist are well made.

---

## Final synthesis

### Scorecard

| Persona | Verdict | Score |
|---|---|---|
| Product Manager | Iterate | 6/10 |
| Tech & App Reviewer | Calm solo app, weak squad layer, claim unproven | ★★★☆☆ |
| Beta Tester | Installed in a month only if one friend joins | Yes/No coin flip |
| Editorial / Awards Juror | Not shortlisted this build | Delight 3 · Innovation 2 · Cultural 2 · Craft 3 |
| Anti-Cheat Auditor | Two must-close vectors, one bug | **Fail until #1, #2a, #6 close** |
| Growth / GTM | Membership loop, not a viral one | 4/10 |

### Top 5 cross-cutting risks

1. **"Un-fakeable" is not true yet** (Reviewer, Tester, Auditor): typed-in Health samples count; the sync endpoint trusts the client; the Battle pools raw, uncapped kcal.
2. **The character does not visibly change** (PM, Tester, Juror): one static eagle for everyone, and the thesis is a sentence rather than a picture until Rive ships.
3. **iOS-only in an Android-majority market** (PM, Reviewer, GTM): the squad layer is structurally halved before any invite is sent.
4. **Flock is the weak tab** (Reviewer, Tester, Juror): "1st of 1 · leading," a dead Battle that cannot be replaced, a template gradient where Today and Sky are considered.
5. **Nothing pulls a lapsed or solo player back** (PM, Tester, GTM): silence on lapse is humane, but the only re-engagement is one push and one friend.

### Top 5 quick wins

1. **Exclude `HKWasUserEntered` on every quantity read** in `read.ts` — one predicate per query, matching what sleep and workouts already do. Moves the Auditor, the Reviewer and the Tester.
2. **Close expired Battles in `finalize-days`** so the one-live-per-kind slot frees itself. Moves the Auditor and the Juror.
3. **Guard the Flock band on two or more rows**, as the "is ahead" line already is; a squad of one gets the Sky tab's sentence instead. Moves the Reviewer, the Tester and the Juror.
4. **Fix the stale privacy line on `/connect`** — *"Your squad sees your progress — never the raw numbers"* is live on the iOS branch and contradicts deviation #47 and the privacy beat two screens later. It also says "active minutes," which is no longer a stat. Add it to `invite-message.test.ts`'s claim scan. A 5.1.3 reviewer reads that screen.
5. **Make the shield sentence true**: "Shield banked — one missed day is safe" renders on a 1-day streak, but `SHIELD_MINIMUM_STREAK` is 5. Say "Shield unlocks at a 5-day streak" below five. Moves the Tester and the PM (it is the first promise a new user reads on the You tab).

Also cheap, also seen on device: the corridor's own bird is drawn under the
Sky flock rail with its head clipped; the invite code wraps at accessibility
sizes (set it `scale="fixed"` or let it shrink); `/event/new` without a
`squadId` spins forever with the nav hidden; the grey "Tools" gear floating on
every screen is a dev-client affordance and should be confirmed absent on
TestFlight.

### Overall call

**Iterate.** The single biggest reason: the product's one-sentence promise —
progress you cannot fake — is the one thing the build does not yet keep, and
the fix is a predicate and a ceiling, not a redesign. Everything that is hard
(the engine, the replay property, the privacy projection, the solo loop, the
writing) is done and tested. Close the three auditor items, guard the two false
sentences, and then the question worth a cohort is whether a bird that finally
moves can make a friend install it.
