# App Store privacy — the answers and the policy

The two launch blockers named in `CLAUDE.md` (deviation #47) and left open by
issue #11: **a privacy policy that exists**, and **the App Privacy answers in
App Store Connect**. Guideline **5.1.3** is the one that bites, because Kairo
reads HealthKit.

Everything below is derived from the code on 2026-09-02, with the file that
decides each fact named. When the code moves, this moves with it — the same
rule the HealthKit disclosure already follows.

**Status, end of 2026-09-02:** the policy exists — `web/privacy.html`, served
at `https://kairo-teal-nine.vercel.app/privacy`, linked from Settings and from
the landing page's footer, and guarded by `src/features/support/links.test.ts`.
The first version of this file said the body-metric columns were never written;
that was wrong (§1, §6) and the answers in §2 now declare them.

> **Not legal advice.** This is an accurate inventory of what the app does and a
> mapping onto Apple's questionnaire. The policy wording, and whether Philippine
> law needs more of you (see the last section), is your call and possibly a
> lawyer's.

---

## 1. What Kairo actually collects

### From Apple Health — read only, never written

`src/features/health/read-types.ts` is the single authoritative list, and
`permission.ts` requests `{ toRead: KAIRO_READ_TYPES }` with **no `toShare`**,
so the app cannot write to Health at all.

| Type | Used for |
| --- | --- |
| `StepCount` | Motion scoring, the Daily Walk, the race |
| `DistanceWalkingRunning` | Shown in the day; anti-cheat cross-check |
| `ActiveEnergyBurned` | Body scoring |
| `AppleExerciseTime` | Threshold shift, shown in the day |
| `SleepAnalysis` | Mind scoring |
| `HeartRate` | Strain only — **never scored, never projected** |
| `RestingHeartRate` | Strain's reserve denominator |
| `HKWorkoutTypeIdentifier` | Challenges, verified strength minutes, anti-cheat |

### Stored on the server (Supabase, developer-controlled)

`profiles`, `health_buckets`, `daily_scores`, `daily_sleep`, `daily_heart`,
`workout_sessions`, `streaks`, `squads`, `squad_members`, `challenge_events`,
`event_participants`, `event_completions`, `challenge_completions`,
`quest_completions`, `race_results`, `notification_log`, `device_tokens`,
`app_events`.

Identity is an `auth.users` row from **Sign in with Apple** — one email today,
and it may be an Apple private-relay address. Character name and squad name are
user-supplied. `device_tokens` holds an Expo push token per device.

**Optional, and collected when entered:** `height_cm`, `weight_kg` and
`birth_year` on `profiles` are written by `BodyMetricsCard` (mounted in
Settings, through `update-profile.ts`), and `birth_year` feeds `strain.ts`.
They are null on every live account today only because nobody has typed one.
**Declare them.** The first draft of this file said nothing writes them; it
had grepped for the columns in the wrong place. `sex` genuinely has no writer
and no reader and stays "not collected".

**Not collected at all:** location, contacts, photos, browsing or search
history, financial data, purchases.

### Shared with other users

Squadmates see **daily totals only** — steps, distance, calories, sleep —
through `squad_leaderboard()`, and only where **both sides have consented**
(`profiles.squad_data_consent_at`, deviation #47, reciprocal and per row).
Heart rate, workouts and hourly movement reach **no projection**; a schema test
asserts no `public` function body even names `workout_sessions`.

### Third parties

**There are none for analytics or tracking.** No Sentry, no Firebase, no
Amplitude/Segment/Mixpanel/PostHog, no ad SDK, no attribution SDK — checked
against `package.json`. Telemetry is first-party: `app_events` rows in the
project's own database.

Three processors handle data on the developer's behalf:

| Processor | What it sees |
| --- | --- |
| **Supabase** | Everything stored above (the database and Edge Functions) |
| **Expo push + Apple APNs** | The device token and the **text of each notification**, which can name a rank and an XP figure |
| **Vercel** | The invite landing page only — ordinary web logs, no app data |

---

## 2. App Store Connect → App Privacy: the answers

App Store Connect → your app → **App Privacy** → *Get Started*.

**"Do you or your third-party partners collect data from this app?" → Yes.**

For every type below the answers to the last two questions are the same:
**Linked to the user: Yes.** **Used for tracking: No.**

| Apple data type | Collect? | Purpose | Why |
| --- | --- | --- | --- |
| Health & Fitness → **Health** | Yes | App Functionality | Sleep, heart rate, resting heart rate, workouts |
| Health & Fitness → **Fitness** | Yes | App Functionality | Steps, distance, active energy, exercise time |
| Identifiers → **User ID** | Yes | App Functionality | The account id every row hangs off |
| Identifiers → **Device ID** | Yes | App Functionality | The Expo push token in `device_tokens` |
| Contact Info → **Email Address** | Yes | App Functionality | From Sign in with Apple; may be private relay |
| Health & Fitness → **Health** (again) | Yes | App Functionality | Height and weight, optional, entered in Settings |
| Other Data → **Other Data Types** | Yes | App Functionality | Birth year, optional, entered in Settings; backs the max-heart-rate estimate behind Strain |
| User Content → **Other User Content** | Yes | App Functionality | Character name, squad name, Battle name and description |
| Usage Data → **Product Interaction** | Yes | Analytics, App Functionality | `app_events` |
| Diagnostics → **Other Diagnostic Data** | Yes | Analytics, App Functionality | Failure events (`timezone_sync_failed`, `health_permission_failed`) carry an error string |

**Everything else: Not Collected.** Contact Info other than email, Financial
Info, Location, Sensitive Info, Contacts, other User Content categories,
Browsing History, Search History, Purchases, Advertising Data, Crash Data,
Performance Data, Other Data.

Three notes on the choices:

- **Tracking is No, everywhere**, so **no ATT prompt is required**. Apple's
  "tracking" means linking to third-party data for ads or sharing with a data
  broker. Kairo does neither, and has no SDK that could.
- **Crash Data is No** because nothing collects crashes today. Adding Sentry
  later changes this answer *and* the policy.
- **Other User Content vs Gameplay Content** for the character and squad names
  is a judgement call; Gameplay Content is defensible if you list the app under
  Games. Pick one and keep it — the label is public and shifting it looks like
  the collection changed.

---

## 3. Guideline 5.1.3 — the HealthKit clause

| Requirement | Status |
| --- | --- |
| Privacy policy exists and is linked | ✅ `web/privacy.html`, Settings row, landing footer. **Still to enter in App Store Connect** (§4) |
| No HealthKit data for advertising or use-based data mining | ✅ No ad SDK, no data broker, no such use |
| No writing false data to HealthKit | ✅ Read-only — no `toShare` list at all |
| HealthKit data not shared with third parties without consent | ✅ Shared only with squadmates, behind the reciprocal consent gate |
| Health data not used for anything but health/fitness/research | ✅ Scoring and the race |
| In-app account deletion | ✅ `delete_account()` + `app/delete-account.tsx` (5.1.1(v)) |

Also worth knowing before review: **background delivery is declared and used**,
so expect the reviewer to exercise the Health flow. The permission sheet's copy
is accurate as of 2026-09-02 — until then it printed "Score your AGI", an
engine key on the one screen a 5.1.3 reviewer reads, and `disclosure.test.ts`
now bans the keys there. The `Info.plist` string is corrected in the same pass
(§6) and ships with the next build.

---

## 4. The privacy policy — what to do

**Where:** `web/privacy.html`, reachable at
`https://kairo-teal-nine.vercel.app/privacy` through `cleanUrls: true` — no new
infrastructure, no build step, no script, no external request. It keeps the one
privacy surface a stranger can already reach on the same origin as the invite
page. `PRIVACY_POLICY_URL` in `src/features/support/links.ts` derives it from
`INVITE_HOST`, and `links.test.ts` reads the page off disk to assert the
contact address, the four daily totals, the pooled-Battle clause, the
deletion clause, no engine key, no retired tier name, no retired promise and no
`[[TODO` placeholder — the same structural guard `invite-message.test.ts` puts
on the landing page.

**The decisions the legal drafts left blank were all taken on 2026-09-02**
(founder): controller is Arsher James Basilio personally; contact is
`arsherjames25@icloud.com`; the founder is DPO; retention is the life of the
account; Supabase moves to Pro so "backups up to seven days" is true; minimum
age 13 with no in-app gate; beta data may be reset at public release; the ToS
draft is deferred and the beta ships under Apple's standard EULA, with the
"not medical advice" term folded into the policy's §11.

**Where it must be entered:**

1. App Store Connect → **App Information** → *Privacy Policy URL*.
2. App Store Connect → **App Privacy** → the answers in §2.
3. A link **inside the app** — done: a "Privacy policy" row in Settings, beside
   a "Send feedback" row that opens mail to the contact address.
4. TestFlight → **Test Information**: the same URL and the same feedback email,
   both required before external testers can be added.

**What it must say**, given the inventory above:

- What is read from Apple Health, by name, and that Kairo never writes to it
- That squadmates see **daily totals only** — steps, distance, calories, sleep
  — and only where **both** people have agreed, and that this is revocable
- That heart rate, workouts and time-of-day movement are **never** shown to
  anyone else
- Who processes data (Supabase, Expo/APNs, Vercel) and that there are no
  advertisers, data brokers or analytics third parties
- That data is used to run the app and is not sold
- How to delete everything, and that deletion is immediate and complete
- Retention, a contact address, and the effective date

**The wording must match three other surfaces**, all of which now agree and one
of which does not:
`web/index.html`'s privacy section, the in-app HealthKit sheet
(`src/features/health/disclosure.ts`), the sign-in pitch — and
`NSHealthShareUsageDescription`, which is **still wrong** (§6).

---

## 5. Order of operations

1. ✅ `web/privacy.html` written and deployed (`vercel deploy --prod`,
   2026-09-02). `links.test.ts` fails on any `[[TODO` left in the page, which
   is how the controller's name was kept from shipping blank.
2. ✅ The Settings rows — **JS only, ships over the air.** Publish the OTA
   *before* step 3, while the tree's fingerprint still matches build 22.
3. Fix `NSHealthShareUsageDescription` (§6) — **native, costs a build.** Cut it
   now; it is the string a reviewer reads beside the policy.
4. Fill in App Privacy in App Store Connect (§2), set the Privacy Policy URL,
   and fill TestFlight's Test Information.
5. Re-read §3 against the built binary before submitting.

---

## 6. Two things that will bite

**`NSHealthShareUsageDescription` still carries the retired claim.** In
`app.config.ts` it ends *"your squad sees scores only — never your raw data"*,
which stopped being true at deviation #47 — a consenting squadmate sees four
daily totals. This is the **fifth** surface that claim reached, and the last one
still stale: the in-app sheet, the landing page and the invite message were all
corrected, and this one was missed because it is native config rather than copy.

It is also the expensive one. `expoConfig` is a **fingerprint input** (verified),
so changing that string moves `runtimeVersion` and therefore:

- costs one of the month's fifteen EAS builds, and
- **withholds every OTA update** from installed builds until that build lands.

So do not fix it in isolation. It is the string a 5.1.3 reviewer is most likely
to read alongside the policy, so it should be corrected before submission —
batched with any other native work.

**The body-metric columns are written, and this file said they were not.**
`height_cm`, `weight_kg` and `birth_year` are optional inputs behind Settings,
declared in §2 and in the policy's §2.2 since 2026-09-02. `sex` has no writer
and no reader. The lesson is the one that matters: a "not collected" answer has
to be checked against the *screens*, not the row counts — the live counts were
zero, and the card was one tap away.

**Consent to share daily totals has no in-app withdrawal.** `useSquadDataConsent`
sets `squad_data_consent_at` and nothing clears it; the policy therefore says
"email us and we switch it off from our side", which is true and is a manual
step. A Settings switch is JS-only (the column is in the UPDATE grant) and is
the obvious follow-up.
