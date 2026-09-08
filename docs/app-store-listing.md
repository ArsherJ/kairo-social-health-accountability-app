# The App Store listing

The copy that goes into **App Store Connect → your app → *(Platform) App*
→ Description / Subtitle / Promotional Text / Keywords**. Entered by hand, like
the privacy answers in `docs/app-store-privacy.md` and the
`NSHealthShareUsageDescription` string in `app.config.ts` — App Store Connect is
outside the repo, so this file is the source of truth a person copies from, not
a surface that ships. **Pasting it into App Store Connect is a manual step and
is still owed**, exactly like the privacy answers.

**It makes no privacy claim of its own, and that is deliberate.** The claim is
one sentence across six registered surfaces, held honest by
`src/features/privacy/claim-surfaces.test.ts`, and this file is not one of them:
a guard over a doc would imply a guard over the App Store Connect field, which
nothing in this repo can reach. So the description says what Kairo *reads* — the
disclosure Apple's own rules want — and points at the policy for what a flockmate
sees. If a future draft wants to say "daily totals only", it belongs on the
policy page and this copy links to it.

---

## Name

    Kairo

## Subtitle (30 characters)

    Walk. Level up. Race friends.

## Promotional text (170 characters)

    Your steps level a Philippine eagle. Clear 10,000 a day, keep the streak,
    and race your flock to the ridge — the same finish line for everyone.

## Description

> Names the bird once, in the second line. The phrase is `speciesLine('eagle')`
> in `src/features/character/species.ts` and a test asserts the two agree, so
> the store and the app cannot end up describing different animals (issue #32).
> The same test pins the two figures this copy quotes — the Daily Walk's 10,000
> and the free flock's six — against `DAILY_STEP_BASELINE` and
> `FREE_SQUAD_MAX_MEMBERS`. Markdown cannot import a constant, so the guard
> asserts agreement instead; a description promising a figure the app no longer
> uses is a false claim in the one place a stranger reads before installing.
> "Full-grown by level twenty-one" is deliberately not pinned: it is the adult
> growth stage's first level, which is art direction rather than a rule, and it
> moves only with a commission.

    Kairo turns the walking you already do into a character that grows.

    Your character is a Philippine eagle. It starts small, and it changes as
    you do — a hatchling at level one, full-grown by level twenty-one, standing
    taller on the days you move.

    THE DAY
    Clear 10,000 steps and you have cleared the day. That is the Daily Walk,
    and it is the same number for everybody — a public-health figure, not a
    target that creeps up as you improve.

    THREE THINGS COUNT
    Motion is your steps and distance. Body is the calories you burn moving.
    Mind is the night you slept, when a watch or a band recorded it. No stat is
    required every day, and a quiet week costs you nothing you earned.

    YOUR FLOCK
    Up to six of you fly one sky. Everybody races the same ridge, so the leader
    cannot run away with it and the last bird is never out of it. Nobody joins
    your flock without a code from someone already in it.

    WHAT IT DOES NOT DO
    No calorie counting. No food log. No streak-shaming — once your streak is
    worth protecting, a shield covers one missed day and then recharges. A
    morning digest tells you how yesterday finished.

    Kairo reads Apple Health with your permission, and never writes to it.
    Everything it collects, and everything a flockmate can see, is written out
    in full here: https://kairo-teal-nine.vercel.app/privacy

    Questions: arsherjames25@icloud.com

## Keywords (100 characters, comma-separated, no spaces)

    steps,walking,streak,eagle,rpg,character,sleep,friends,flock,race,habit,accountability

## URLs

| Field | Value |
|---|---|
| Marketing URL | `https://kairo-teal-nine.vercel.app/` |
| Privacy Policy URL | `https://kairo-teal-nine.vercel.app/privacy` |
| Support URL | `https://kairo-teal-nine.vercel.app/` (the page carries the support address) |

---

## Rules this copy follows

- **No hard notification cap, and no promise of quiet hours.** `BUDGET_EXEMPT`
  sends bypass the daily budget without consuming it, and `finalize-days`
  reaches `sendToUser` directly, so neither claim is one the app keeps. The
  description says what the digest *is* instead.
- **No retired vocabulary.** No sabotage, no Battle, no barkada, no Hunter, no
  tier names, no engine keys. Each was true copy once and is not now.
- **Sleep is described as wearable-recorded**, because a hand-typed night scores
  no Mind at all. Most of the Philippine market is phone-only; a description
  that implies otherwise sells a stat the reader cannot earn.
- **No claim about what a flockmate sees beyond the pointer.** The flock
  paragraph says who can *join* — a rule about invite codes, which does not move
  — and leaves who can *see* to the policy. See the note at the top.
