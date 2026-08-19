# Kairo — Core Attribute System Design (STR / AGI / INT)

**Status:** Draft v0.2 — supersedes earlier Strength/Endurance/Agility model
**Source:** Distilled from design brainstorm, with anti-cheat and feasibility review added below

---

## 1. Summary of the decision

Kairo moves from a **Strength / Endurance / Agility** triangle to **Strength / Agility / Intelligence**:

| Attribute | Real-world input | Game meaning |
|---|---|---|
| 💪 Strength | Workouts (active exercise) | Power / attack |
| ⚡ Agility | Steps + walking/running distance | Speed / movement |
| 🧠 Intelligence | Sleep (primary), exploration parked as future/secondary | Mental readiness / strategy |

The open problem — "how do you get passive, unfakeable XP for a mind-stat" — is resolved by using **sleep** as the primary Intelligence source instead of exploration or reading, since sleep is the only one of the three candidates (reading, exploration, sleep) that's both continuously and automatically measurable via platform health APIs with no manual check-in.

Exploration (new-location detection) and reading/learning content are kept as **possible future secondary sources**, not MVP scope.

---

## 2. Data source mapping (what actually backs each stat)

| Attribute | iOS (HealthKit) | Android (Health Connect) |
|---|---|---|
| Strength | `HKWorkoutType`, active energy burned | `ExerciseSessionRecord` |
| Agility | `HKQuantityTypeIdentifierStepCount`, `DistanceWalkingRunning` | `StepsRecord`, `DistanceRecord` |
| Intelligence | `HKCategoryTypeIdentifierSleepAnalysis` | `SleepSessionRecord` |

This part of the design is sound — all three map to real platform APIs. The risk isn't *whether the data exists*, it's *whether the data can be trusted*, which is where this needs more scrutiny than the original brainstorm gave it.

---

## 3. Anti-cheat review (per attribute)

### Strength (workouts) — moderate risk
Both HealthKit and Health Connect allow **fully manual workout entry** — a user can hand-type "HIIT, 60 min, 800 kcal" into the Health app with zero sensor data behind it.
- **Mitigation:** filter workout records by source. Require the entry to come from a wearable or a recognized fitness app *and* carry correlated sensor evidence (heart-rate samples during the session, GPS route, or motion-derived calorie estimate) — not just the existence of a workout object. A source **allowlist**, not a blocklist, since any third-party app can also expose manual logging.

### Agility (steps) — lower risk
Step/distance counts come from the phone's motion coprocessor, which is hard to fake without GPS-spoofing tools or a jailbroken device. This is the most trustworthy of the three by default.
- **Mitigation:** basic jailbreak/root detection is probably sufficient here; don't over-invest in this one.

### Intelligence (sleep) — **highest risk, needs to be flagged explicitly**
This is the part of the brainstormed design that most needs pushback before it's locked in:

- Both the Health app and Health Connect let a user **manually add a sleep session** — open Health, add "Sleep, 9h," done. No wearable, no sensor, no effort. Unlike faking a workout (which at least requires typing plausible numbers into a fitness-adjacent flow), faking sleep is a single trivial form fill, and my read is that a naive `HKCategoryTypeIdentifierSleepAnalysis` query would treat it identically to a real sensor-detected session.
- **Mitigation:** filter strictly by `sourceRevision` / origin bundle identifier, and **only** accept sleep sessions attributed to a recognized sensor-based source. Never accept sessions sourced from Apple's own manual-entry bundle, or the equivalent on Health Connect.
- **Correction to my earlier claim:** I previously said a plain phone can't auto-detect sleep at all — that's wrong, and worth being precise about. Apple's own *first-party* stage-tracking ("Sleep" in the Health/Watch app) genuinely is Watch-only — its App Store listing is explicit that stage detection uses the Watch's accelerometer + heart-rate sensor. But third-party apps (Sleep Cycle, Pillow, SleepScore) do real automatic sleep detection on a bare iPhone using its own accelerometer (phone placed on the mattress) and/or microphone, and they write genuine sensor-backed sessions into HealthKit — this isn't manual entry. Android has a narrower version of this: Pixel's Digital Wellbeing does phone-only cough/snore audio analysis, but Google's own docs describe full asleep/awake staging as tied to a worn device (Fitbit or Pixel Watch); bare-phone staging on Android leans more on manual bedtime/wake entry.
- **What that changes, and what it doesn't:** it means Intelligence *can* work without a wearable — but only if either (a) Kairo builds its own on-device actigraphy detection (phone-on-mattress motion + audio, running overnight), which is a real product build, not a HealthKit read, or (b) Kairo trusts sessions written by specific third-party apps, which means expanding the source-allowlist beyond wearables to cover apps like Sleep Cycle/Pillow — and at least on Android, some of those sessions are user-editable after the fact ("Edit sleep" is a documented Google Health feature), so allowlisting an app isn't automatically the same as trusting every session from it.
- **A separate, generic vector this introduces:** any motion-based passive detection — phone-on-mattress or wrist-worn — can be gamed the same way: leave the device still and undisturbed for 8 hours without actually being asleep in it. This isn't unique to the phone-based approach; it applies to Apple Watch and other wearables too, and is probably not worth over-engineering against for a fitness-gamification app (the effort to fake stillness for 8 hours nightly is closer to "just sleep" for most users) — but it should be a known, accepted limitation rather than an unexamined one.

---

## 4. Pushback on the streak/target mechanics

The brainstorm proposes a **sleep streak** (5 nights → +10% INT XP, 7 nights → +15%, 14 nights → +20%) and a fixed **7–9h target zone**. Both are worth reconsidering:

- **Hard streaks are the trope your own product principles want to avoid.** A streak mechanic optimizes for "don't break the counter," not "sleep well." One bad night — travel, a sick kid, a late shift — zeroes out two weeks of progress and creates exactly the anxiety/burnout loop that undermines the "genuinely healthy behavior" goal. **Recommend:** replace the hard streak multiplier with a **rolling 7-day average / momentum score** that dips gracefully on a bad night instead of resetting to zero.
- **A fixed 7–9h target zone ignores individual variation.** Sleep need isn't uniform; rewarding a fixed population range risks over- or under-rewarding people outside it. **Recommend:** anchor the target to the user's own rolling personal average rather than a fixed number, at least once you have baseline data.
- **Cap the curve.** The brainstorm itself flags this: don't reward oversleeping indefinitely (no "slept 14h → 140 INT XP"). XP should scale up to the healthy zone and then flatten — don't let the incentive push toward unhealthy oversleeping.

---

## 5. Platform implications (RN vs. Flutter — flagging per your rule)

The anti-cheat filter for sleep depends on reading **source/origin metadata** (bundle ID, device) off each HealthKit/Health Connect sample — not just the sample value. This is a meaningfully deeper API surface than "give me step count."

- Both React Native (`react-native-health`, `react-native-health-connect`) and Flutter (`health` package) wrap these platforms, but how much raw source metadata each wrapper actually exposes varies by library and version — some community wrappers flatten this away.
- **Before locking in sleep as Intelligence's source, spike this specifically:** pull raw sleep samples through the actual candidate library on both platforms and confirm `sourceRevision`/origin app is accessible. If it isn't, the anti-cheat mitigation in §3 isn't implementable as designed, and Intelligence needs a different approach.
- Separately: Apple Watch's automatic sleep detection (watchOS 9+) is mature. Android's equivalent is more fragmented — Health Connect aggregates sleep data from many different wearables and apps with inconsistent staging quality — so expect Intelligence to feel less reliable on Android at launch regardless of the anti-cheat filtering.
- **New consideration:** if Kairo wants no-wearable sleep detection (§3), that's a materially different build than reading HealthKit/Health Connect passively. It means either shipping an in-app overnight accelerometer/microphone actigraphy engine — its own scoped feature, with the same battery cost profile as Sleep Cycle/Pillow (roughly 15–25%/night when mic-based) and its own App Store/Play Store privacy review scrutiny for nighttime audio access — or accepting a curated allowlist of trusted third-party sleep apps as valid sources. Both are bigger platform decisions than "which library wraps HealthKit," and both are largely equally buildable on RN or Flutter, so this doesn't change the RN-vs-Flutter call — it just adds real scope to whichever one gets picked.

---

## 6. Alternative directions for Intelligence

The brainstorm converges on one answer (sleep-only). Here are three distinct directions, since a wearable-gated third stat is a real MVP risk worth weighing deliberately rather than defaulting into:

**A. Sleep-only, wearable-gated (as designed above)**
- *Pros:* fully passive, zero manual input, clean narrative (recovery → mind).
- *Cons:* excludes iPhone-only users from Intelligence entirely on day one; touches the most sensitive health data category of the three; requires the strictest anti-cheat filtering.

**B. Sleep + a phone-only secondary signal (hybrid)**
- Add a weaker but wearable-free proxy alongside sleep — e.g., consistency of first-phone-unlock time (Screen Time / Digital Wellbeing) as a rough routine-regularity signal.
- *Pros:* gives non-wearable users *something* to earn Intelligence from.
- *Cons:* the signal is inferential and hard for users to intuitively understand ("why did my Intelligence go up?") — risks muddying what the stat means. I'd treat this as a stretch idea, not a strong recommendation.

**C. Defer Intelligence past MVP; ship Strength/Agility only, add Intelligence once wearable adoption among your users is known**
- *Pros:* avoids launching a stat that most iPhone-only users can't move at all ("why is my 3rd stat stuck at zero" is a bad first impression); buys time to validate the anti-cheat filter against real device data before it's live.
- *Cons:* loses the complete RPG-triangle feel at launch; two stats reads as less "game-like."

**D. Build native phone-based sleep detection (no wearable required), in-app**
- Ship Kairo's own overnight actigraphy: phone on the mattress, accelerometer + optional microphone, same category of tech as Sleep Cycle/Pillow — not a HealthKit read, a real feature you build and own.
- *Pros:* removes the wearable-gating problem entirely; also improves anti-cheat versus trusting external HealthKit data, since Kairo controls the live sensor session directly instead of trusting whatever a third-party app or the OS's manual-entry path wrote into HealthKit after the fact.
- *Cons:* meaningfully larger build than the other stats — it's a standalone sleep-tracking product, not a passive metric read; real nightly battery cost (15–25%+ if mic-based); requires the user to remember to place the phone correctly every night, which reintroduces a sliver of manual friction; nighttime audio capture invites extra App Store/Play Store privacy review scrutiny and needs very clear on-device-only framing to users.

**Recommendation:** given that no-wearable sleep tracking is real but not free, I'd narrow the choice to **C vs. D** rather than defaulting to A. C is the safer MVP move if engineering time is tight — it avoids committing to either a wearable-gated stat or a whole second tracking subsystem before you have real usage data. D is the more ambitious but arguably more "Kairo-native" answer if you're willing to treat sleep detection as a first-class feature rather than a side read — worth prototyping the battery/accuracy tradeoff before committing either way.

---

## 7. Open questions to resolve

1. Does Kairo build its own no-wearable sleep detection (Direction D), rely only on wearable-sourced HealthKit/Health Connect data (Direction A), or defer Intelligence past MVP (Direction C)?
2. If leaning D: is an in-app overnight actigraphy engine (with its battery and privacy-review cost) worth building before you have retention data justifying it, or is it a v1.5 investment once Strength/Agility prove the core loop?
3. If leaning A: which sleep-hardware sources are trusted at launch — Apple Watch only, or the broader wearable ecosystem (Oura, Whoop, Fitbit, etc.)?
4. RN vs. Flutter — needs the source-metadata spike in §5 before Intelligence's mechanic can be finalized either way; largely orthogonal to the A/C/D choice above.
5. If Intelligence is deferred, does the MVP still market itself as a full RPG-stat system, or explicitly frame Strength/Agility as "phase one"?
