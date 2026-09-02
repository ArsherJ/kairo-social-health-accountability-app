# App Store privacy — the answers and the policy

The two launch blockers named in `CLAUDE.md` (deviation #47) and left open by
issue #11: **a privacy policy that exists**, and **the App Privacy answers in
App Store Connect**. Guideline **5.1.3** is the one that bites, because Kairo
reads HealthKit.

Everything below is derived from the code on 2026-09-02, with the file that
decides each fact named. When the code moves, this moves with it — the same
rule the HealthKit disclosure already follows.

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

**Not collected, despite the columns existing:** `height_cm`, `weight_kg`,
`birth_year`, `sex` on `profiles` are **all null for every account** and nothing
in `app/` or `src/` writes them. Declare them as not collected — but see
§6, because a column nothing writes is one refactor away from being collected
without anyone revisiting this file.

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
| User Content → **Other User Content** | Yes | App Functionality | Character name, squad name |
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
| Privacy policy exists and is linked | ❌ **This is the blocker.** §4 |
| No HealthKit data for advertising or use-based data mining | ✅ No ad SDK, no data broker, no such use |
| No writing false data to HealthKit | ✅ Read-only — no `toShare` list at all |
| HealthKit data not shared with third parties without consent | ✅ Shared only with squadmates, behind the reciprocal consent gate |
| Health data not used for anything but health/fitness/research | ✅ Scoring and the race |
| In-app account deletion | ✅ `delete_account()` + `app/delete-account.tsx` (5.1.1(v)) |

Also worth knowing before review: **background delivery is declared and used**,
so expect the reviewer to exercise the Health flow. The permission sheet's
copy is accurate; the `Info.plist` string is not — see §6.

---

## 4. The privacy policy — what to do

**Where:** `web/` already serves the domain root on Vercel with
`cleanUrls: true`, so a new `web/privacy.html` is reachable at
`https://kairo-teal-nine.vercel.app/privacy` with no new infrastructure and no
build step. That is the cheapest correct answer and keeps the one privacy
surface a stranger can already reach on the same origin as the invite page.

**Where it must be entered:**

1. App Store Connect → **App Information** → *Privacy Policy URL*.
2. App Store Connect → **App Privacy** → the answers in §2.
3. A link **inside the app**. Settings (`app/settings.tsx`) is the obvious home,
   beside delete-account.

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

1. Write `web/privacy.html`; deploy `web/` (`vercel deploy --prod`).
2. Add the in-app link in Settings — **JS only, ships over the air.**
3. Fix `NSHealthShareUsageDescription` (§6) — **native, costs a build.** Batch
   it with any other native change rather than spending a build on one string.
4. Fill in App Privacy in App Store Connect (§2) and set the Privacy Policy URL.
5. Re-read §3 against the built binary before submitting.

Steps 1, 2 and 4 are independent of 3 and can go first; the policy being live
is what unblocks everything else.

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

**Four columns nothing writes.** `height_cm`, `weight_kg`, `birth_year` and
`sex` are null for every account and are declared "not collected" above. If a
future feature starts writing any of them, the App Privacy answers become wrong
and the policy becomes incomplete — and nothing in the test suite would notice,
because they are legitimate columns. Treat writing one as a change that comes
back to this file.
