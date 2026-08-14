# What is in the MVP, and what is not

**Cite this file in any QA brief, test plan, or store-facing copy.** It exists
because the August 2026 end-to-end QA pass graded Kairo against a v1.3-era brief
and scored four sections 1/10 for features that had been deliberately removed or
deliberately deferred. That is not a product failure, it is a documentation
failure, and its cost was real: it buried the findings that mattered under
findings about a product that no longer exists.

The rule this file encodes: **a feature is in scope only if it is listed below.**
If a brief describes something that is not here, the brief is stale.

Authorities, in order: `Kairo_Master_Summary.md` (spec v1.4) for intent,
`docs/roadmap.md`'s approved-deviations table for where implementation
deliberately diverges, and this file for what that adds up to today.

---

## In scope — the current build

### Solo, and first-class
Kairo is **solo-first**. Everything below works with zero friends, and the
squad is a layer on top.

- **Character** — one body chosen at onboarding (deviation #27), named by you.
  It has **no in-app noun**: it is "your character", never a Hunter
  (deviation #26).
- **Four stats from HealthKit** — AGI (steps, distance), STR (active calories),
  END (active minutes), VIT (hourly movement). **REC** (sleep) is a
  wearable-only bonus that simply does not appear without one.
- **Ability ratings** — a numeric rating per stat from lifetime points
  (deviation #23). **Bronze/Silver/Gold still decide every day inside the
  scoring engine and are shown nowhere.**
- **Level and XP**, **streaks** with a shield, and a **strain** figure for
  wearable users that is display-only and never scored (deviation #24).
- **Three visual responses on the figure**: ground shadow by level band, build
  proportions by dominant stat, presence ring by ability rating.

### Squads
- Create or join by six-character code, up to 6 members on the free tier.
- **Daily leaderboard**, Today and Yesterday, weighted at read time by the
  squad's fixed **program** (deviation #11/#12).
- Share the invite via the system share sheet; empty seats are the affordance.
- Leave, with succession — the squad outlives its leader.

### Goals — what replaced sabotage
- Cumulative or consistency, personal or squad-wide, over a fixed window,
  a date you pick, or open-ended (deviation #21).
- Squad goals are **per-member N-of-M**: each member must hit the target
  individually. Not a pooled total.

### Account
- **Sign in with Apple** — the only provider a Release build offers. Moved in
  scope on 2026-08-12, when Developer Program enrolment came through; the app
  side is built and the portal configuration is a checklist in
  `docs/sign-in-with-apple.md`.
- Anonymous sign-in **in development builds only**.
- In-app **account deletion** with cascade (`20260811140000`).
- Notification permission asked in context, with a status row in Profile.

### Privacy, which is a design constraint rather than a feature
Squadmates see scores, ability ratings and streaks. They can never reach raw
steps, hourly movement, heart rate or timestamps — `squad_leaderboard()` has no
argument that returns them, and `profiles` is owner-readable only.

---

## Out of scope — and why

Each of these has been **decided**, not forgotten. Do not treat their absence as
a regression.

| Not built | Why | Where it is recorded |
|---|---|---|
| **Sabotage** — items, targeting, deployment, feed, protection | **Removed 2026-08-09.** It was the original premise and §20 called it non-negotiable, which is why it took a spec version bump to v1.4 rather than a quiet deletion. Goals replaced it. | Deviation #17 |
| **Character morphing, gear slots, Rive animation** | V1. The art is not commissioned; §15 scopes the MVP to *static* placeholder art, and pulling in an animation runtime for a placeholder is the wrong trade. The three responses listed above are what exists. | §15, `CharacterFigure.tsx` |
| **Referrals, "war declarations", reward tiers** | Spec'd, never built. The squad invite code is membership plumbing, not a referral system — it has no attribution and no reward delivery. | §9, roadmap |
| **Universal links / deep linking** | Needs a domain, a hosted `apple-app-site-association`, the associated-domains entitlement and route handling. Sharing works without it today. | QA finding Q8 |
| **Coin packs, the shop, Legendary subscription, AdMob rewarded ads, purchase restoration** | **This beta is explicitly non-monetized.** There is no IAP, no paywall, no ad, and therefore no predatory gating — and also nothing proven about purchase, refund, restore or entitlement recovery. Remove all pricing from any release criteria. | §10, deferred to V1+ |
| **Android** | iOS first. | §15 |

---

## Vocabulary

Getting these wrong in a brief produces findings about things that do not exist.

| Say | Not |
|---|---|
| your character | Hunter, avatar |
| squad | barkada, party, clan |
| ability rating | tier, Bronze/Silver/Gold *(internal to scoring; no surface renders them)* |
| daily score | points, today's XP |
| program | focus *(`profiles.focus` was dropped; `squads.program` is the only focus concept)* |

One deliberate exception: the **art-direction prompts** in
`scripts/generate_swap_assets*.py` and §20's "dark fantasy hunter aesthetic"
brief still say Hunter. That is a genuinely open decision for the art
regeneration to settle, not a missed find-and-replace.

---

## Before calling anything "MVP ready"

Readiness is not a score out of ten; it is this list. Open items as of
2026-08-14:

- [x] **Sign in with Apple in a Release/TestFlight build** — done 2026-08-14,
      exercised on real hardware from a TestFlight install. Both halves that
      live outside git (the App ID capability and the ES256 client secret) are
      in place; the secret's expiry is the thing to diary. See
      `docs/sign-in-with-apple.md`.
- [ ] **Push delivery proven end to end**: registration → dispatch → receipt → tap routing.
      The client half was **missing entirely until 2026-08-14** — the server
      had been sending `screen`/`goalId` in every push since the notification
      engine shipped and nothing read it, so there was no tap routing, and a
      push arriving in the foreground was not displayed at all. Both are built
      now (`src/features/notifications/routing.ts`), along with an on-device
      delivery readout in Profile. What remains is genuinely verification, plus
      the one credential nothing in git can see: the **APNs key uploaded to
      Expo** (`eas credentials`), without which every send returns a ticket
      error.
- [ ] **Invite redemption with two real accounts**, including live reordering and rejoin.
- [ ] **A physical-device pass**: offline, background overnight, reinstall, Dynamic Type, VoiceOver, battery.
- [x] Health ingest reconciles, and says how fresh it is.
- [x] Every requested HealthKit type disclosed, test-locked against the request list.
- [x] In-app account deletion, verified against the live project.
- [x] Reproducible Xcode builds.
