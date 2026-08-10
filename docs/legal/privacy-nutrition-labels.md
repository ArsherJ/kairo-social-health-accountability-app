# App Store privacy nutrition labels — the answers

**DRAFT — see `README.md` in this directory.** These follow from
`privacy-policy.md`; if you change one, change the other in the same sitting. A
label that disagrees with the policy is the kind of inconsistency App Review
notices and the NPC would notice later.

Filed in App Store Connect under **App Privacy**. Every answer below is
traceable to a table or a code path, cited so it can be re-checked rather than
re-remembered.

---

## The three global answers

| Question | Answer |
|---|---|
| Do you or your third-party partners collect data from this app? | **Yes** |
| Is any data used to **track** you across apps and websites owned by other companies? | **No.** There is no advertising SDK, no analytics SDK, no advertising identifier, and no third-party tracker in the build. **No ATT prompt is required.** |
| Is any collected data **not linked** to the user's identity? | **No** — everything is keyed to a user id. There is no anonymous-aggregate collection to declare. |

Everything below is therefore filed as **Data Linked to You**.

---

## Data Linked to You

| App Store data type | What it actually is | Purpose to declare | Source of truth |
|---|---|---|---|
| **Health & Fitness → Fitness** | Steps, walking/running distance, active energy, Apple Exercise Time, hourly step distribution | App Functionality | `health_buckets` (`20260727120100_health_data.sql`) |
| **Health & Fitness → Health** | Sleep analysis; and optionally height, weight, year of birth, sex | App Functionality | `daily_sleep`; `profiles.height_cm / weight_kg / birth_year / sex` |
| **Contact Info → Name** | The character name | App Functionality | `profiles.character_name` |
| **Identifiers → User ID** | The account id | App Functionality | `profiles.id` → `auth.users` |
| **Identifiers → Device ID** | The push notification token, only if notifications are enabled | App Functionality | `device_tokens` (`20260807110200_notifications.sql`) |
| **Usage Data → Product Interaction** | That the app was opened, and which training focus / squad program was chosen | App Functionality, Analytics | `app_events` types `app_open`, `focus_selected`, `focus_skipped`, `squad_program_selected` |
| **Diagnostics → Other Diagnostic Data** | Two failure events: a time-zone update that failed, and an Apple Health permission request that threw | App Functionality | `app_events` types `timezone_sync_failed`, `health_permission_failed` |
| **User Content → Other User Content** | Squad names | App Functionality | `squads.name` |

### Notes on the judgement calls

- **`app_open` is declared under App Functionality as well as Analytics**, and
  that is not padding. It is read by `dispatch-notifications` to decide whether
  to send §14's "Day starts" notification — the app genuinely does not work the
  same without it, so declaring it as Analytics alone would understate it.
- **Character name is filed under Contact Info → Name.** It is a pseudonym by
  design and the app suggests treating it as one, but users can and will type
  their real name into it. The conservative declaration is the correct one.
- **Body metrics are filed under Health**, not as separate demographic types.
  They are collected only to improve Apple Health's active-energy estimate, they
  are optional, and they are owner-readable only.
- **Daily scores, goals and goal completions are not separately declarable.**
  They are derived from the health data already declared, and no App Store type
  corresponds to them. A goal's title is free text the user writes; it is filed
  under the same Contact Info → Name conservatism as the character name, since
  nothing stops someone typing a real name into it.

---

## Not collected — do not tick these

Location (of any precision) · Contacts · Search History · Browsing History ·
Purchases · Financial Info · Email Address · Phone Number · Physical Address ·
Photos or Videos · Audio Data · Gameplay Content¹ · Customer Support ·
Advertising Data · Crash Data² · Performance Data² · Sensitive Info³

1. Squad names are declared under Other User Content; there is no user-generated
   gameplay content beyond that. No chat exists in MVP.
2. No crash reporter or performance SDK is integrated. **Re-check this if one is
   ever added** — it is the single most likely future change to these answers.
3. Apple's "Sensitive Info" type means racial or ethnic data, sexual
   orientation, disability, religious belief, biometric identifiers and the
   like. Health data is not filed here; it has its own category. Note that
   Philippine law *does* classify health data as sensitive personal information
   — the two definitions differ, and the privacy policy uses the Philippine one.

---

## The HealthKit commitments that go with this

App Review checks these against the build, and they are also promises in
`privacy-policy.md` §5:

- HealthKit data is **not used for advertising or any use-based data mining**
  other than improving health, fitness or health research.
- HealthKit data is **not disclosed to third parties** for advertising or data
  brokerage. Our only processors are the hosting provider and the push service,
  and the push service never receives a measurement.
- The app has a privacy policy, linked from App Store Connect and reachable
  before download.
- Kairo **writes nothing back** to HealthKit; every entitlement is read-only.

## Before filing

- [ ] Resolve the `[[TODO]]`s in `privacy-policy.md` — the labels quote it.
- [ ] Host the privacy policy at a stable public URL and put it in App Store
      Connect (the field is required for any app requesting HealthKit access).
- [ ] Confirm the age rating matches the policy's §8 and the ToS's §3.
- [ ] Re-read this file if a crash reporter, an analytics SDK, or Phase 7
      follow-up #1 (making the All-Rounder squad-visible) ever lands.
