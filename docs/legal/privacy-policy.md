# Kairo — Privacy Policy

**SUPERSEDED 2026-09-02 — historical draft.** The policy that ships is
`web/privacy.html` (live at `https://kairo-teal-nine.vercel.app/privacy`).
This file is the 2026-08-08 draft it replaced and describes a product that no
longer exists: Bronze/Silver/Gold shown to squadmates, engine keys, a species
picker, anonymous beta accounts, a score total. Do not edit it; edit the page.

Last updated: 2026-08-08
Applies to: Kairo for iOS, including the TestFlight beta.

---

## In one paragraph

Kairo reads your movement data from Apple Health, turns it into a daily score,
and shows that score to the people in your squad. Your squad sees your score and
your tiers. It sees your **daily totals** — steps, distance, calories, minutes
slept — only if you and they have each agreed to share them, and it sees the
**squad's pooled calorie total** during a battle whether or not you have. It
**never** sees your hour-by-hour movement, your heart rate, your workouts or
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
| Apple Exercise Time | Shown to you in your own daily breakdown. Not scored. |
| Hourly step distribution | How spread out your movement is across the day. Not scored on its own — it makes your AGI targets easier to reach. |
| Sleep analysis | Your MND score. Only read if your device supplies it (typically an Apple Watch). |
| Whether a sleep record was entered by hand | Apple marks a night you typed in yourself. We keep those out of scoring, so a typed-in figure cannot earn points. |
| Heart rate — hourly average and resting rate | Your **Strain** figure. It is shown only to you, is never scored, and is never shown to a squadmate. |
| Workouts | Your **Challenge** targets, and to confirm a hard session was real before it lowers the thresholds your Strength score is judged against. |

This is **sensitive personal information** under the Data Privacy Act, and we
treat it as such.

Three of these were added after this policy was first written, and each is
named above rather than folded into a general description: the hand-entered
sleep flag (August 2026), heart rate (August 2026) and workouts (August 2026).

We store movement as **hourly totals for your own local day** — for example,
"412 steps between 09:00 and 10:00 on 8 August". Heart rate is stored the same
way: an hourly average, plus a single resting rate for the day. A workout is
stored as one record per session — when it began and ended, how long it lasted,
the distance and the calories, and Apple's **numeric code** for the kind of
activity.

We do not store GPS locations, routes, workout names, or anything else in
Apple Health. Kairo never writes anything back to Apple Health.

**Heart rate and workouts are readable only by you.** They are not part of any
screen a squadmate can reach, and no function that serves squad data can return
them. They exist for a figure and a target that are yours alone.

### 2.2 What you tell us

- A **character name** you choose. It does not have to be your real name, and we
  suggest it isn't — it is the name your squad sees.
- Optionally, **height, weight, year of birth and sex**. These are optional by
  design; Kairo never blocks you on them. They exist because Apple Health's
  active-energy estimate is meaningfully more accurate with them. **Only you can
  read them** — no squadmate, at any time, through any screen.
- Your **time zone**, taken from your device, because your competitive day runs
  from midnight to midnight where *you* are.
- Optionally, **which animal your character is** — one of four Philippine
  endemic species. It is cosmetic, changes nothing about scoring, and your
  squadmates see it beside your name.

### 2.3 What the app generates

- **Daily scores** — per-stat points, tiers, and a total.
- **Squad membership**, invite codes, and squad names.
- **Battles** — a name and a description you write, a target in calories, and
  the dates it runs between; plus which battles you are on and which your squad
  finished. Deleted when an account or squad is deleted.
- **Streaks**, level and XP.
- **A push notification token** for your device, if you turn notifications on.
- **A small number of app events** — that you opened the app, that you chose a
  squad program, and when two specific operations fail (a time-zone update and
  an Apple Health permission request). The failure events exist so that a bug which is
  invisible to you is at least visible to us. They contain no health data.

### 2.4 What we do not collect

No advertising identifiers. No location. No contacts. No analytics SDK, no
advertising SDK, no third-party tracker of any kind is present in the app.

## 3. Who can see what

This is the part most worth reading.

**Your squadmates always see:** your character name, your level, your total
score for the day, and a Bronze/Silver/Gold tier per stat.

**Your squadmates see your daily totals only if you and they have both agreed
to share them.** Since 2026-08-26 the squad screen can show each member's
**steps, distance, calories and minutes slept for the day** — but only for a
member who has turned that sharing on, and only to a viewer who has turned it
on themselves. If you have not agreed, your squadmates see your lane on the
race with no position and the words "not sharing", and you see the same of
everyone else. You are asked when you create or join a squad, and existing
members are asked again. There is no way to see other people's totals without
sharing your own.

**One figure is shared without that agreement, and it is worth understanding.**
When your squad is fighting a Battle, everyone on it sees the **squad's pooled
total** — one number, the sum of everybody's calories for the day. Your own
share of it stays behind the agreement above. We do this because a shared fight
you cannot see the state of is not a shared fight, and because joining one is
itself a decision to take part.

**In a two-person squad, that pooled number can be worked backwards.** If there
are only two of you, subtracting your own contribution leaves your partner's.
There is no version of a shared total that avoids this, so we are naming it
rather than implying otherwise: in a squad of two, your daily calorie total is
effectively visible to the other person while a Battle is running.

**Your squadmates never see:** your hour-by-hour movement, any timestamp of
when you moved, your heart rate, your workouts, your pace, your height, your
weight, your age, or your sex. None of these is behind an agreement — they are
not shared at all, and no setting turns them on.

Sleep became one of the three scored stats on 2026-08-20, so the per-stat tier
above includes one for sleep — a Bronze/Silver/Gold band in the same vocabulary
as the others. The **number** of minutes is one of the daily totals covered by
the sharing agreement.

That separation is enforced by the database, not by the app. Squad data is
served by a small number of read-only functions, each of which decides for
itself what it may return and to whom — the sharing agreement is applied inside
them, per row. A modified or malicious copy of the app cannot obtain anything
those functions will not hand over, and the things listed as never shared have
no code path that returns them to anyone but you.

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
scores, your streaks, your squad memberships, your device tokens and your
battles and battle completions. If you were the leader of a squad,
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
- **Correction** — your character name, your body metrics and your character's
  species are editable in the app.
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
Clients hold **no write permission at all** on health data, scores or battle
completions — every write goes through a server function that checks who you are
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
