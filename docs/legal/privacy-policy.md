# Kairo — Privacy Policy

**DRAFT — not reviewed by counsel. See `README.md` in this directory.**

Last updated: 2026-08-08
Applies to: Kairo for iOS, including the TestFlight beta.

---

## In one paragraph

Kairo reads your movement data from Apple Health, turns it into a daily score,
and shows that score to the people in your squad. Your squad sees **tiers and
totals only** — never your step counts, never your hour-by-hour movement, never
when you were active. We do not sell your data, we do not use it for
advertising, and we do not use it to train anything. You can delete your account
and everything in it from inside the app.

---

## 1. Who is responsible for your data

`[[TODO: Personal Information Controller — your name or registered entity]]`
("we", "us") is the Personal Information Controller for the purposes of the
**Data Privacy Act of 2012 (Republic Act No. 10173)**.

Privacy questions, access requests and complaints:
`[[TODO: monitored contact address]]`

`[[TODO: Data Protection Officer, if designated]]`

## 2. What we collect

### 2.1 Health and fitness data — from Apple Health, with your permission

We read the following, and only the following:

| What | Why |
|---|---|
| Step count | Your AGI score |
| Walking + running distance | Anti-cheat only (a stride-length cross-check). Not scored. |
| Active energy burned | Your STR score |
| Apple Exercise Time | Your END score |
| Hourly step distribution | Your VIT score — how spread out your movement is across the day |
| Sleep analysis | Your REC score. Only read if your device supplies it (typically an Apple Watch). |

This is **sensitive personal information** under the Data Privacy Act, and we
treat it as such.

We store it as **hourly totals for your own local day** — for example, "412
steps between 09:00 and 10:00 on 8 August". We do not store GPS locations,
routes, workout names, heart rate, or anything else in Apple Health. Kairo never
writes anything back to Apple Health.

### 2.2 What you tell us

- A **character name** you choose. It does not have to be your real name, and we
  suggest it isn't — it is the name your squad sees.
- Optionally, **height, weight, year of birth and sex**. These are optional by
  design; Kairo never blocks you on them. They exist because Apple Health's
  active-energy estimate is meaningfully more accurate with them. **Only you can
  read them** — no squadmate, at any time, through any screen.
- Your **time zone**, taken from your device, because your competitive day runs
  from midnight to midnight where *you* are.
- Optionally, a **training focus**, which changes nothing about scoring and only
  personalises the app's copy.

### 2.3 What the app generates

- **Daily scores** — per-stat points, tiers, and a total.
- **Squad membership**, invite codes, and squad names.
- **Sabotage events** — who used an item on whom, and when. This log is
  append-only: it cannot be edited, by us or by anyone. It is deleted when an
  account or squad is deleted.
- **Streaks**, level and XP.
- **A push notification token** for your device, if you turn notifications on.
- **A small number of app events** — that you opened the app, that you chose a
  focus, and when two specific operations fail (a time-zone update and an Apple
  Health permission request). The failure events exist so that a bug which is
  invisible to you is at least visible to us. They contain no health data.

### 2.4 What we do not collect

No advertising identifiers. No location. No contacts. No analytics SDK, no
advertising SDK, no third-party tracker of any kind is present in the app.

## 3. Who can see what

This is the part most worth reading.

**Your squadmates see:** your character name, your level, your total score for
the day, and a Bronze/Silver/Gold tier per stat. They also see sabotage events
in your squad — that a named person used an item on another named person.

**Your squadmates never see:** your step count, your distance, your calories,
your active minutes, your sleep, your hour-by-hour movement, any timestamp of
when you moved, your height, your weight, your age, or your sex.

That separation is enforced by the database, not by the app. Squad data is
served by a small number of read-only functions that have no ability to return
raw measurements — so a modified or malicious copy of the app cannot obtain them
either.

Hourly movement is treated as the most sensitive thing here on purpose: it
reveals when you sleep, when you work and when you are away, which is a great
deal more than a step total does.

## 4. Why we process it, and on what basis

| Purpose | Basis under the Data Privacy Act |
|---|---|
| Calculating your score and showing it to your squad — the service itself | Your **consent**, given when you connect Apple Health, and necessary to perform the service you asked for |
| Anti-cheat checks | Our legitimate interest in a leaderboard that means something |
| Sending you notifications | Your **consent**, given at the iOS permission prompt, revocable in Settings at any time |
| Failure diagnostics | Our legitimate interest in the app working |

Consent to health data is asked for **in context**, on a screen that explains
what is read and what your squad will see, and never during sign-up. If you
decline, Kairo still runs; your scores are zero.

## 5. Where it goes

Kairo runs on **Supabase**, which hosts our database and server functions. They
process data on our instruction as a Personal Information Processor.
`[[TODO: confirm and state the hosting region]]`

Push notifications are delivered through **Expo's push service** and then
Apple's APNs. A notification's text can contain a character name, a rank, or a
score total — never a step count or any other measurement. We hold no other push
credential and send nothing else through them.

**We do not sell your data. We do not share it with advertisers or data brokers.
We do not use health data for advertising, and we do not use it to train machine
learning models.** Apple's HealthKit terms prohibit the first three
independently of this policy, and we have no interest in any of them.

## 6. How long we keep it

For as long as your account exists. `[[TODO: confirm — see README decision #3]]`

When you delete your account, we erase your profile, your health buckets, your
scores, your streaks, your squad memberships, your device tokens and the
sabotage events you were involved in. If you were the leader of a squad,
leadership passes to another member first, so we do not delete other people's
squad along with your account. If you were its last member, the squad goes too.

Deletion is a real deletion, not a flag. The one exception is ordinary
infrastructure backups, which expire on their own schedule.

## 7. Your rights

Under the Data Privacy Act you have the right to be informed, to object, to
access your data, to correct it, to have it erased or blocked, to damages, and
to data portability. In practice:

- **Access and portability** — write to us at the address in §1 and we will send
  you your data in a machine-readable form.
- **Correction** — your character name, body metrics and focus are editable in
  the app.
- **Erasure** — delete your account in the app; it takes effect immediately.
- **Withdrawing consent to health data** — revoke Kairo's access in iOS Settings
  → Privacy & Security → Health. New data stops arriving at once. Data already
  scored stays until you delete your account.
- **Complaints** — you may complain to us first, and to the **National Privacy
  Commission** regardless.

## 8. Children

Kairo is not for anyone under 13. `[[TODO: confirm against the App Store age
rating you file — a 13+ rating and a 17+ rating carry different obligations]]`
We do not knowingly collect data from children. If you believe a child has an
account, contact us and we will delete it.

## 9. Security

Access is enforced at the database row level: your rows are readable by you.
Clients hold **no write permission at all** on health data, scores or sabotage
events — every write goes through a server function that checks who you are
first. Data is encrypted in transit, and encrypted at rest by our host.

No system is perfectly secure. In the event of a personal data breach, we will
notify the National Privacy Commission and affected users within the period the
Data Privacy Act requires.

## 10. Beta

`[[TODO: README decision #6.]]` During the TestFlight beta, accounts are
anonymous device-bound accounts rather than Apple sign-ins. **An anonymous
account cannot be recovered if you delete the app or change device, and beta
data will not carry over to the public release.** Treat beta scores as
disposable.

## 11. Changes

We will post changes here and, for anything material, tell you in the app before
it takes effect.
