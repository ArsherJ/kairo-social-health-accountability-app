# Kairo — Master Summary Document
**App Name:** Kairo  
**Type:** Consumer Social Health App  
**Platform:** iOS first → Android V1.5  
**Market:** Philippines (primary), OFW abroad (secondary)  
**Last Updated:** July 2026

---

## 1. What This App Is

Kairo is a **social health accountability app** where you and your barkada compete daily using real, verified health data — steps, workouts, active calories, and movement consistency. Your performance shapes an RPG character inspired by Solo Leveling aesthetics that levels up, evolves visually, and is visible to your entire squad.

It is not a fitness tracker. It is not a journaling app. It is a **daily competitive game that happens to make you healthier.**

### The One-Line Pitch
*"Level up your real life. Compete with your barkada. Sabotage each other along the way."*

### Why It Exists
Three problems with existing apps:
- **Stompers** — squad competition but steps only, iOS-only, US market, no character depth
- **Charlie** — great character care mechanic but solo Tamagotchi feel, passive social (bell ring), steps only, Korean pricing applied to PH with no localization
- **Generic accountability apps** — no competition, no stakes, churn is massive

Kairo combines the competitive tension of Stompers, the character investment of Charlie, adds multi-stat health tracking, sabotage mechanics, and is built specifically for the Philippine market.

---

## 2. Core Game Loop

```
12:00 AM local →  Day resets. All scores back to zero.
Throughout day →  HealthKit / Health Connect background delivery syncs
                  automatically — for ALL users, free and paid.
Anytime        →  Open app to check squad leaderboard.
Anytime        →  Deploy sabotage items against squad members.
11:00 PM local →  Push notification: "1 hour left. You're in [rank] place."
11:59 PM local →  Day ends. Provisional results shown.
~2:00 AM local →  Day finalizes (grace window for late phone syncs).
                  Coins + XP distributed at finalization.
Sunday 10 PM   →  AI-generated weekly recap card pushed to all squads.
```

**Per-user local days (v1.3 decision):** Each player's day runs midnight-to-midnight in their own timezone; the squad leaderboard compares most-recently-completed days. This gives every player — including OFWs in Dubai or New York — a fair 24-hour window and correct VIT hourly windows. The cost (mixed-timezone squads don't share one dramatic midnight) is accepted; PH-local squads still experience a shared reset in practice.

### Three Daily Engagement Hooks
1. **Morning FOMO** — Who's already ahead while you were sleeping?
2. **Sabotage alert** — Push notification the moment someone hits you
3. **Night urgency** — Real-time rank notification with countdown

---

## 3. What Makes It Different (Your Edges)

| Edge | What it solves | Who doesn't have it |

|---|---|---|
| Multi-stat tracking (not just steps) | Captures gym, runners, sleepers — not just walkers | Stompers + Charlie |
| Rive dynamic character animation | Characters feel alive and reactive — users asked Charlie for this | Both competitors |
| Real sabotage with score impact | Creates drama, stories, group chat moments | Charlie (bell ring only) |
| Personal character identity | Your character is yours — name, class, stat build | Charlie (everyone is "Charlie") |
| Weekly AI recap card | Shareable Stories content — users asked Charlie for this | Both competitors |
| PH-calibrated pricing | ₱49–₱499 vs Charlie's ₱799–₱5,990 | Both competitors |
| Barkada war referral system | Referral is a challenge, not an invite | Both competitors |
| Android support (V1.5) | 75–80% of PH is Android | Both competitors (iOS only) |
| OFW angle | Filipinos abroad + family at home in one squad | Both competitors |

---

## 4. Target Users

**Primary:** Filipino, 18–35, health-curious but not obsessive  
**Secondary:** OFWs abroad staying connected with family/friends in PH  
**Device split:** iPhone (MVP), Android added in V1.5  
**Squad context:** Barkada, work colleagues, family groups, dance crews

### Why OFWs Are a Hidden Revenue Layer
OFW users generate US/Middle East CPM rates on ads — approximately 10–20x higher than PH local rates. An OFW in Dubai watching a rewarded ad earns more ad revenue than 10 Manila users. The cultural hook is strong: an OFW competing on steps with siblings back in Cebu is an emotionally resonant use case that no existing app serves.

---

## 5. Health Metrics & Anti-Cheat

### What a Phone Can Actually Track (No Wearable Required)

A critical design constraint: **sleep cannot be reliably tracked with a phone alone.** HealthKit can receive sleep data but only from third-party apps like Sleep Cycle that require deliberate setup — not a passive, automatic experience. Requiring sleep tracking would permanently zero out most users on VIT through no fault of their own.

All four core competitive stats are phone-only, passive, and automatic.

| Stat | Label | Data Source | Phone Only? | Cheat Resistance |
|---|---|---|---|---|
| Steps + Distance | AGI | Accelerometer + GPS | ✅ Yes | 🟡 Medium — social accountability fills gap |
| Active Calories | STR | Accelerometer (estimated) | ✅ Yes | 🟢 Hard |
| Active Minutes | END | Motion detection | ✅ Yes | 🟢 Hard |
| Hourly Movement Consistency | VIT | Step pattern across day | ✅ Yes | 🟢 Hard |
| Sleep Duration | REC | Wearable only (bonus) | ❌ Wearable needed | 🟢 Hard |

### Why VIT Became Hourly Movement (Not Sleep)

VIT measures how consistently you moved throughout your waking hours — specifically how many hours in the day had at least 250 steps recorded. This is actually a stronger health signal than sleep duration: sedentary behavior across the day is one of the most significant predictors of long-term health decline, regardless of how much you exercise in one session.

A person who did a 2-hour gym session then sat for 10 hours scores lower VIT than someone who moved every hour consistently. This creates genuine behavioral change, not just workout logging.

### REC — Recovery (Wearable Bonus, Not Competitive Requirement)

Sleep is not removed from the app — it becomes an **optional bonus stat** for wearable users. Apple Watch, Xiaomi Smart Band (₱1,500–₱2,500 on Shopee/Lazada), Fitbit, and Samsung Galaxy Watch all sync sleep data to HealthKit/Health Connect.

| Rule | Detail |
|---|---|
| Data source | Wearable → Apple Health / Health Connect |
| If no wearable | REC row simply doesn't appear — zero penalty |
| Scoring | Bonus points on top of 4 core stats |
| Leaderboard display | Shown with 🔗 wearable icon |

REC Sleep Bonus:
- Under 5 hrs → 0 pts
- 5–6 hrs → +100 pts
- 6–7 hrs → +250 pts
- 7–9 hrs → +500 pts (optimal)
- Over 9 hrs → +200 pts (mild penalty for oversleeping)

**The wearable incentive effect:** When a phone-only user sees a competitor with a 🔗 REC bonus on the leaderboard, they want it. This passively advertises the Xiaomi Band without you saying a word about accessories.

### Metrics Deliberately Excluded
- Water intake — manual log, trivially fakeable
- Nutrition / calories — too complex, too easy to lie
- Meditation / mindfulness — no sensor verification
- Screen time — privacy pushback, too personal

### Anti-Cheat Approach
Full ban systems are expensive and imperfect. The real anti-cheat is **social embarrassment:**
- Velocity check: steps increase >1,500 in 10 minutes → candidate 🚩 flag
- **Workout cross-check (v1.3):** flag is suppressed when HealthKit shows an active workout session, wearable heart-rate elevation, or GPS distance consistent with the steps — a normal jog (~1,600–1,800 steps/10 min) must never flag. Only step spikes with no supporting signals (no distance, no workout, implausible cadence) surface the 🚩.
- Flag visible to squad only — not a ban, not a score reduction
- Barkada polices itself naturally
- Hourly health buckets stored in Supabase (canonical scoring data + audit trail)
- Flag clears after 3 clean days

### Onboarding Data Collection
HealthKit's active calorie estimation (STR) requires height, weight, and age for accuracy. Collect these in onboarding. Users who skip get a persistent soft prompt: *"Add your height and weight in Settings for more accurate STR tracking."*

### Onboarding Flow Philosophy (v1.3): Character First, Permissions in Context
iOS gives one clean shot at the HealthKit and notification prompts, and the naive flow stacks six friction gates before any fun. The chosen order: **name + character on screen within the first 60 seconds** (emotional investment), THEN the HealthKit permission framed as *"power your character with real life,"* notifications requested only after the first squad/sabotage event gives them a reason to exist, and body metrics deferred to the soft prompt. Every ask has a visible why.

### Daily Score Formula
```
Daily Score = AGI score
            + STR score
            + END score
            + VIT score
            + Consistency Bonus (2+ stats contributed today)
            + REC bonus (wearable users only)

Maximum possible:
  Phone only:    900 + 900 + 900 + 900 + 800 = 4,400 pts
  With wearable: 4,400 + 500               = 4,900 pts

Daily reset: 11:59 PM in the user's local timezone
(not 9 PM like Stompers — that was their #1 reviewed complaint)
```

### Squad Data Visibility (v1.3 decision)
Squadmates see **tiers and scores only** — Bronze/Silver/Gold per stat and total score — never raw step counts, hourly movement patterns, or timestamps. VIT's hour-by-hour data reveals when someone sleeps, works, or is sedentary; that stays private to the owner. Competitive information is fully preserved; surveillance vibes and Data Privacy Act exposure are removed.

---

## 6. Character System

### The Solo Leveling Angle
Your character is a personal RPG avatar whose **visual appearance changes based on your actual health behavior.** Two people in the same squad look different because they grind different stats. This is the core emotional differentiator from Charlie (where everyone is the same character) and Stompers (generic avatars).

### Character Classes (Cosmetic / Flavor Only — No Stat Advantage)
| Class | Aesthetic |
|---|---|
| Hunter | Solo Leveling protagonist dark aesthetic |
| Athlete | Sports / gym aesthetic |
| Scholar | Intelligence / focus aesthetic |
| Guardian | Defense / endurance aesthetic |

Classes affect art only. No stat bonuses. Keeps the game fair.

**MVP scope (v1.3):** MVP ships **one class only (Hunter)** with AI-generated placeholder art — class choice answers none of the beta's risk questions and quartering the art surface is the biggest solo-dev scope win. All 4 classes + commissioned art + Rive arrive in V1.

### Stat System (Phone-Only, All Passive)
| Stat | Label | Driven By |
|---|---|---|
| AGI | Agility | Steps + walking/running distance |
| STR | Strength | Active calories burned |
| END | Endurance | Active minutes throughout day |
| VIT | Vitality | Hourly movement consistency (active hours) |
| REC | Recovery | Sleep duration — **wearable users only, bonus** |

### Contribution Tiers Per Stat (Daily)
No activity is required. Every stat contributes independently.

**AGI — Steps**
| Tier | Steps | Score |
|---|---|---|
| None | 0–999 | 0 pts |
| Bronze | 1,000–4,999 | 200 pts |
| Silver | 5,000–9,999 | 500 pts |
| Gold | 10,000+ | 900 pts |

**STR — Active Calories**
| Tier | Calories | Score |
|---|---|---|
| None | 0–49 kcal | 0 pts |
| Bronze | 50–199 kcal | 200 pts |
| Silver | 200–399 kcal | 500 pts |
| Gold | 400+ kcal | 900 pts |

**END — Active Minutes**
| Tier | Minutes | Score |
|---|---|---|
| None | 0–9 mins | 0 pts |
| Bronze | 10–29 mins | 200 pts |
| Silver | 30–59 mins | 500 pts |
| Gold | 60+ mins | 900 pts |

**VIT — Active Hours (250+ steps in that hour)**
| Tier | Active Hours | Score |
|---|---|---|
| None | 0–2 hrs | 0 pts |
| Bronze | 3–5 hrs | 200 pts |
| Silver | 6–8 hrs | 500 pts |
| Gold | 9–12 hrs | 900 pts |

**Consistency Bonus (rewards doing multiple stats)**
| Stats contributed today | Bonus |
|---|---|
| 1 stat | 0 pts |
| 2 stats | +150 pts |
| 3 stats | +400 pts |
| All 4 stats | +800 pts |

### Real Scenarios
**Gym day, low steps:**
AGI Bronze (200) + STR Gold (900) + END Silver (500) + VIT Silver (500) + 4-stat bonus (800) = **2,900 pts**

**Lazy Sunday, walked to the mall:**
AGI Silver (500) + STR None (0) + END Bronze (200) + VIT Bronze (200) + 3-stat bonus (400) = **1,300 pts**

**Complete rest day:**
AGI None (0) + STR None (0) + END None (0) + VIT None (0) = **0 pts** — last place, but the leaderboard and sabotage still visible. Still opens the app.

### Character Progression
- XP earned daily from any health contribution (Bronze = +10, Silver = +25, Gold = +50 per stat)
- Level = permanent, never resets — reflects your total lifetime effort
- Two people at the same overall level look different based on which stats they grinded
- Visual evolution at Level 1–5, 6–10, 11–20, 21+
- Cosmetic purchases override default evolution visuals
- Character name chosen by user on onboarding

### Visual Evolution Tied to Dominant Stat
| Dominant Stat | Character Visual |
|---|---|
| AGI dominant | Leaner frame, faster Rive idle animation |
| STR dominant | Broader silhouette, power aura intensifies |
| END dominant | Endurance stance, stamina particle effect |
| VIT dominant | Recovery glow, healthier skin tone in Rive |
| Balanced (all within 20% of each other) | Rare "All-Rounder" visual — cannot be bought, must be earned |

The All-Rounder visual is a permanent status flex that rewards consistency over specialization. Visible to entire squad. Creates a long-term goal visible on others' characters.

### Weekly Specialization Layer
Each Monday, Kairo announces a **featured stat** earning 1.5× score for the full week:
- Week 1: AGI Week — steps and distance worth more
- Week 2: STR Week — calories worth more
- Week 3: END Week — active minutes worth more
- Week 4: VIT Week — hourly movement worth more

Rotates the meta weekly. No single build dominates long-term. Gives a Monday push notification reason to re-engage lapsed users.

### Animation: Rive
Rive powers dynamic character animation — directly addressing Charlie's top user complaint (users asked for more character animations). Characters react in real-time to health data, tier achievements, and sabotage events. Different idle animations based on dominant stat. Sabotage impact triggers unique hit animations.

---

## 7. Squad System

### How Squads Work
- Create squad → get shareable link + 6-digit invite code
- Members join → compete daily on same leaderboard
- Daily reset at 11:59 PM PHT affects all squad members simultaneously
- Squad Leader can rename, remove members, transfer leadership

### Squad Size Limits
| Tier | Max Members | Max Squads |
|---|---|---|
| Free | 6 | 1 |
| Legendary | 15 | 3 |

### Solo Mode (Critical Design Decision)
Unlike Stompers and Charlie, requiring a squad creates a cold start problem — one person downloads, friends don't join, zero value, immediate churn.

**Solution: Solo Mode**
- App is fully usable alone — character progresses, coins earned, shop accessible
- Leaderboard shows "You vs. ???" with locked squad slots
- Locked slots are visible every day — constant pull to invite barkada
- When first squad member joins: animated "squad slot unlocked" reveal
- Solo mode is the long-form ad for the squad experience

---

## 8. Sabotage System

### How It Works
Sabotage items debuff a target's score or buff your own. Applied in real-time. Target receives push notification immediately. Visible in squad feed.

### MVP Item (1) — v1.3 scope cut
| Item | Effect | Duration |
|---|---|---|
| 🍌 Banana | -500 score points from target | Instant |

The Banana alone is enough to test the beta's key question: does sabotage create fun or resentment? The Bat's banked-freeze mechanic is the most complex server logic in the spec and moves to V1.

### V1 Items (5 added)
| Item | Effect | Duration |
|---|---|---|
| 🦇 Bat | Freezes target's score accumulation (banked — see below) | 1 hour |
| 🛡️ Shield | Blocks next sabotage against you | Until hit |
| ⚡ Boost | Your score ×1.5 | 1 hour |
| 👁️ Spy | See target's current score momentum (NOT raw steps — privacy) | 30 mins |
| 💣 Bomb | Halves target's score | 30 mins |

### The Bat Mechanic — Banked Freeze (v1.3 decision)
The Bat **delays** scoring, it never destroys it. Steps/calories earned during the frozen hour are banked and credited the moment the freeze ends — the victim's real exercise is never erased (protects trust in the app). The exception is the day boundary: **banked points that would land after 11:59 PM are lost for that day.** A Bat deployed at 11:15 PM banks an hour of scoring past the day lock — this makes late-night Bats the highest-stakes skill play in the game, while daytime Bats are pure tempo pressure.

### Item Acquisition
| Source | Free | Legendary |
|---|---|---|
| Daily free items | 1/day | 3/day |
| Watch rewarded ad | +1 (max 3/day) | +1 (max 5/day) |
| Buy with coins | ✅ | ✅ |
| Win daily challenge | +1 bonus | +2 bonus |
| Referral activated | +2 one-time | +2 one-time |

### Abuse Prevention
- **Daily deploy cap regardless of inventory (v1.3):** you can OWN unlimited items, but can only DEPLOY 2/day (free) or 3/day (Legendary). Money buys variety and convenience, never raw attack volume — this is the anti-pay-to-win line. Whale spend routes to cosmetics, where the ego money is anyway.
- Same item cannot hit same target twice within 3 hours
- Cannot target same person more than 3× per day
- Shield reflects attack back as notification: *"[Name]'s shield blocked your banana!"*

---

## 9. Referral System — "The War Declaration"

### Core Reframe
Not "Invite a friend." It is **"Challenge someone. Dare them to beat you."**

The share message is a personal callout:
> *"[Your name] is challenging you to a health battle on Kairo. Think you can beat their score? Accept the challenge: [link]"*

This works culturally in PH because the referred friend's ego drives the download — they join to prove a point, not because of the app features.

### Three-Layer Reward Structure

**Referrer Rewards (person who invites)**
| Milestone | Reward |
|---|---|
| Referral completes onboarding | 50 coins |
| Referral completes first full active day | +2 sabotage items (weapons for your new target) |
| 3 successful referrals | Exclusive "Recruiter" aura (non-purchasable) |
| 10 successful referrals | "General" title badge on leaderboard (permanent) |

**Referee Rewards (person who was challenged)**
| Reward | Details |
|---|---|
| 30 bonus coins | Immediate head start |
| Starter sabotage pack (3 items) | Can attack people on Day 1 — kills new user powerlessness |
| Character starts at Level 2 | Symbolic welcome gift |
| "Challenger" badge (7 days) | Temporary status — shows squad they arrived ready to compete |

**Squad Reward (entire group benefits)**
- Whole squad gets **2x XP for 3 days** when a new member joins via referral
- Creates group pressure to recruit: *"Uy invite mo na yung friend mo para may 2x XP tayo!"*
- Existing members become your acquisition team organically

### Highest-Converting Referral Trigger
The referral CTA appears on the **day-end results screen, specifically when the user finishes last.**
> *"Outnumbered? Invite someone to join your side. You get weapons when they arrive. 🪃"*

Emotional state right after losing = peak motivation to recruit an ally. This is the highest-converting moment for the referral CTA.

### Referral Leaderboard (Meta-Game)
- "Top Recruiters" tab inside squad screen
- Shows who referred the most **active** players (7+ day retention, not just sign-ups)
- Monthly crown icon next to top recruiter's name
- Creates two simultaneous competitions: daily health battle + monthly recruitment battle

### Anti-Abuse
- Requires unique phone number verification
- Max 3 referee bonuses per referrer per 30 days
- Same device cannot claim referral bonus twice
- Squad 2x XP only triggers once per new member

---

## 10. Monetization

### Revenue Stack (Priority Order)
1. **Coin packs (IAP)** — highest per-user conversion, low commitment
2. **Legendary subscription** — best LTV, targets power users
3. **Rewarded ads (AdMob)** — low per-user but passive, scales with volume
4. **Sponsored challenges** — highest ceiling, needs 50K+ MAU first

### Free vs Paid Features

**FREE — Everything that drives virality**
- Create / join squad (up to 6 members)
- Full daily health tracking and score
- Daily leaderboard within squad
- Basic character + 4 class options
- 1 free sabotage item per day
- Basic stat display (AGI, STR, END, VIT) — REC shown only if wearable connected
- Weekly recap card (view only)
- 7-day health history
- Earn coins (cannot spend on premium items without buying packs)

**LEGENDARY — Everything that feeds ego and power**
- Squad up to 15 members, 3 squads total
- 3 free sabotage items per day + deploy cap of 3/day (vs 2/day free)
- Custom squad challenges (set your own rules)
- Unlimited health history + full progress graphs
- Monthly exclusive cosmetic drop
- Ad-free experience
- Squad activity heatmap

**v1.3 note:** "Auto background step sync" was removed as a Legendary perk — HealthKit background delivery is a free OS capability, and paywalling it broke the real-time leaderboard for the 98% of users who make the app viral. Background sync is free for everyone; no replacement perk was added (the remaining bundle is coherent, and inventing a power perk risks pay-to-win optics).

### Coin Economy

**Tuning philosophy (v1.3):** a new player should afford their **first common cosmetic in ~7–10 days** of normal play — the first purchase teaches "coins → my character gets cooler," and that lesson is worth underpricing. Rare/legendary items stay steeply priced for pack buyers. Too-scarce coins mean free players never form the wanting-coins habit that pack sales depend on.

**Earning (Free)**
| Action | Coins |
|---|---|
| Daily 1st place | 15 |
| Daily 2nd place | 10 |
| Daily 3rd place | 7 |
| Participation (score > 0) | 3 |
| Watch rewarded ad | 5 |
| 7-day streak bonus | 25 |
| 30-day streak bonus | 100 |
| Referral activated | 50 |
| Friend joins via your link | 20 |

**Spending**
| Item | Coins |
|---|---|
| Basic sabotage item | 20 |
| Premium sabotage item | 50 |
| Common outfit | 300–500 |
| Rare outfit | 700–1,000 |
| Legendary outfit | 1,500–2,500 |
| Aura effect | 400–800 |
| Emote pack (3 emotes) | 250 |

### Coin Pack Pricing (PH)
| Pack | Coins | Price |
|---|---|---|
| Small | 100 | ₱49 |
| Medium | 250 | ₱99 |
| Large | 600 | ₱249 |
| XL | 1,400 | ₱499 |

### Legendary Subscription Pricing
| Plan | Price |
|---|---|
| Monthly | ₱129/month (baseline — to be price-tested) |
| Yearly | ₱899/year (~₱75/month) |
| Free trial | 7 days (first-time subscribers) |

**v1.3 decision:** PH willingness-to-pay can't be known from a doc — run an A/B price test (e.g. ₱129 vs ₱179) across cohorts at V1 soft launch via RevenueCat and let data set the anchor. GCash support on the PH App Store matters for a low-credit-card market.

### Ad Revenue (AdMob — Rewarded Video Only)
- **No banner ads. No forced interstitials.**
- Rewarded video only — user opts in to watch for a reward

**Designed ad moments (v1.3)** — rewarded video is only offered at moments where watching feels worth it:
1. **11 PM emergency item** — "You're 400 pts behind. Watch an ad for one last Banana?" Peak desperation, near-100% completion, and genuinely fun. Highest-value inventory.
2. **Day-end results screen** — "Watch an ad → +1 item for tomorrow." Natural pause, sets up the next session.
3. **Streak shield rescue** — streak about to break, no shield banked: "Watch 2 ads to earn an emergency shield." Converts the biggest churn moment into revenue AND retention.
4. **Coin top-up in shop** — "23 coins short? Watch an ad for +5." In-context only; placed carefully so it doesn't train ad-grinding over pack-buying.

### Revenue Rollout Sequence (v1.3)
Ship monetization across point releases, not all at once: **V1.0 rewarded ads → V1.1 coin packs + shop → V1.2 Legendary subscription.** Ads are the simplest integration, monetize 100% of users at any scale, and double as a retention feature; the subscription ships last because it needs the most built-out value to justify itself.
- PH CPM: ₱40–₱120 per 1,000 completions
- Meaningful revenue starts at 10,000+ DAU
- OFW users generate 10–20x higher CPM (US/Middle East rates)
- Legendary subscribers still see "watch ad" option — never forced

---

## 11. AI Integration Roadmap

### Rule: Never integrate AI before you have a retention problem to solve with it.

| Phase | AI Feature | Cost | Trigger |
|---|---|---|---|
| MVP | None | ₱0 | Focus on core loop only |
| V1 | Weekly recap narrative | ~₱1–2/week for 1,000 squads | Ship when core loop is validated |
| V1.5 | Personalized weekly challenge suggestions | ~₱5–10/week at 10K users | Ship when week-3 churn identified |
| V2 | Squad AI coach + dynamic difficulty scaling | Scale with revenue | Ship when squads go stale long-term |

### V1 AI Feature: Weekly Recap Narrative
- Runs every Sunday night as Supabase Edge Function cron job
- Pulls 7-day squad stats → sends to Claude API → stores generated text
- Output: 3–4 sentence Taglish narrative, competitive tone, mentions specific names and numbers
- Auto-generates shareable recap card image
- Users share to Instagram Stories → organic acquisition engine
- One API call per squad per week = almost free at early scale

**Recap privacy rules (v1.3): celebrate up, tease gently, opt out.** Cards name winners and hype moments with real numbers, but losers are framed by rank only ("4th place had a rough week") — never raw inactivity data ("Miguel logged only 2 active days" broadcast to Instagram is a consent violation of the tiers-only privacy stance). Any member can set "exclude me from shared cards" once in settings.

### Data Architecture Decision (Make Now, Not Later) — revised v1.3
The canonical health data layer is **hourly bucket upserts**: the client aggregates HealthKit samples into `(user, date, hour, metric)` rows and upserts. Re-syncs and Apple's retroactive step-count revisions simply overwrite the bucket — idempotent by construction — and VIT (hours with 250+ steps) falls out of the schema for free. Sub-hour granularity is deliberately not kept; nothing in the product needs it. Separately, **store every app event with a timestamp** (opens, deploys, notification taps) — that behavioral dataset is the fuel for AI personalization in V1.5.

---

## 12. Technical Stack

### Frontend
| Layer | Tech |
|---|---|
| Framework | React Native via **Expo (prebuild/CNG + dev clients + EAS)** — revised v1.3; the old "bare workflow, NOT Expo" guidance was outdated. Modern Expo supports react-native-health, IAP, and Firebase via config plugins, and gives a solo dev cloud iOS builds, managed signing, and OTA JS updates to TestFlight testers. Prebuild escape hatch remains if a module ever truly doesn't fit. |
| Navigation | React Navigation v6 |
| State | Zustand |
| Animation | Rive + Reanimated 3 + Lottie |
| Health (iOS) | react-native-health (HealthKit) |
| Health (Android) | react-native-health-connect (V1.5) |
| Notifications | Firebase Cloud Messaging |
| IAP | react-native-iap (StoreKit + Play Billing) |
| Ads | react-native-google-mobile-ads |

### Backend
| Layer | Tech |
|---|---|
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Realtime leaderboard | Supabase Realtime |
| Storage | Supabase Storage |
| Cron jobs | Supabase Edge Functions (Deno) |
| Push notifications | Firebase Admin SDK |
| Subscription management | RevenueCat (middleware) |
| AI (V1) | Anthropic Claude API |

### Core Architecture Decisions (v1.3)
| Decision | Choice |
|---|---|
| Score authority | **Server-authoritative.** Client uploads hourly health buckets; Supabase Edge Functions compute tiers, bonuses, and sabotage effects. The client only displays. Cheating requires forging raw data, not just posting a number; sabotage timing is enforced in one place. |
| Health data ingestion | Hourly bucket upserts `(user, date, hour, metric)` — idempotent against duplicates and Apple's retroactive revisions. |
| Sabotage model | **Immutable event log** (actor, target, item, timestamp, resolved state); scoring replays active effects at computation time. Nothing ever mutates a score directly — full auditability, freeze windows fall out of timestamps. |
| Day finalization | Day-end push at local midnight shows **provisional** ranks; an hourly Edge Function cron finalizes each user's day **~2h after their local midnight**, accepting data stamped before midnight. Coins/XP award at finalization. |
| Late/backfilled data | Counts for personal streaks and XP, never for finalized rankings or coins (see §19). |
| Background sync | HealthKit background delivery (HKObserverQuery + enableBackgroundDelivery) for **all** users, free and paid. |

### Infrastructure Cost
- MVP infrastructure: **₱0/month** (all free tiers)
- Paid infrastructure kicks in at ~500–1,000 DAU
- Supabase Pro: $25/month when needed
- RevenueCat: Free up to $2,500 MRR

---

## 13. Platform Strategy

### Why iOS First
- Your barkada test group is on iPhone
- HealthKit is more reliable and less fragmented than Health Connect
- React Native (Expo prebuild) = one shared codebase for both platforms
- TestFlight enables closed beta without App Store approval delays; EAS Update pushes JS fixes to testers without rebuilds

### iOS MVP Distribution: TestFlight
- Up to 100 internal testers (no Apple review required)
- Up to 10,000 external testers (1–3 day TestFlight review)
- Push updates instantly without resubmission
- Free

### Android: V1.5
- Core codebase identical to iOS
- Three module swaps: HealthKit → Health Connect, StoreKit → Play Billing, iOS build → Android Studio
- Extra QA required across Samsung, Xiaomi, OPPO (PH dominant devices)
- Health Connect fragmentation across OEM skins (MIUI, ColorOS) = highest technical risk

### Mac Requirement
- Xcode only runs on macOS — no Mac = no iOS build
- ✅ **Resolved (v1.3): Mac access confirmed.** EAS cloud builds further reduce local-Xcode dependency for routine builds.

---

## 14. Notification System

| Trigger | Message | Timing |
|---|---|---|
| Day starts | "A new day begins. Your squad is already moving. 👊" | Mid-morning local, **only if the app hasn't been opened yet** |
| Sabotaged | "[Name] hit you with a banana! You're down 500 points 🍌" | Real-time — always sends, this is the emotional core |
| Podium drop | "[Name] just knocked you out of [1st/2nd/3rd]." | Real-time, podium changes only |
| Overtake digest | "3 people passed you today. You're in [rank] place." | One evening digest for non-podium overtakes |
| Day ending soon | "1 hour left. You're in [rank] place. Push." | 11:00 PM local |
| Day ends | "Provisional: You finished [rank]. Finalizes in ~2h." | 12:00 AM local |
| Weekly recap ready | "Your squad's weekly recap is here 🏆" | Sunday 9:00 PM PHT |
| Streak at risk | "No activity logged today. Don't break your streak." | 8:00 PM local |

**Rules (v1.3 — overtakes bundled + rank-aware):**
- With background sync free for all, raw overtake events could fire 15+/day in an active squad; notification fatigue → user disables notifications → the FOMO loop dies. Individual overtake pushes fire **only** on podium changes (max 2–3/day); everything else collapses into the evening digest.
- Max 3 push notifications/day (configurable) — sabotage always sends regardless
- No notifications between 10 PM and 7 AM local except sabotage (opt-in)
- All notifications deep-link to relevant screen

---

## 15. Build Roadmap

### MVP — TestFlight Closed Beta (scope revised v1.3)
**Goal:** Does the core loop bring people back daily — and does it survive week 3?

**The four risk questions the beta must answer** (D7-with-friends was a weak bar — friends retain out of loyalty):
1. **Week 3+ competitive stamina** — does daily score-checking survive after novelty fades and a perpetual winner/loser emerges? (Measure D21, not D7.)
2. **Sabotage → fun, not resentment** — does getting bananaed at 11 PM produce group-chat laughter or quiet churn? Qualitative: watch the group chat, interview the losers.
3. **Stranger-squad validity** — at least 2–3 squads of people with zero loyalty to the founder.
4. **Score fairness perception** — do gym-goers, walkers, and desk workers all feel the scoring is winnable for their lifestyle?

**Beta design:** 5–6 squads (2–3 friend + 2–3 stranger) × **6 weeks minimum** (covers the week-3 cliff). Weekly 15-min voice chats with the BOTTOM half of each leaderboard; founder embedded in at least one squad's group chat. Stranger recruitment channels: PH Facebook fitness groups (recruit intact barkadas, not individuals), PH Reddit communities, TikTok build-in-public with beta access as CTA.

**Includes:**
- Apple Sign In + Google Sign In
- HealthKit integration with **background delivery for all users** (steps, distance, active calories, active minutes, hourly movement)
- **Server-authoritative scoring** — hourly bucket ingestion + Edge Function score computation (see §12)
- **Per-user local days** with grace-window finalization
- Onboarding: character-first flow; height + weight + age via soft prompt
- REC/sleep tracking shown only for wearable-connected users (bonus, no penalty if absent)
- Character creation (name only — **single Hunter class, AI-placeholder static art**)
- Squad creation + invite (up to 6 members)
- Daily leaderboard (composite score, **tiers + score visibility only**)
- **1 sabotage item (Banana only)** — enough to test the sabotage-sentiment question
- Push notifications (sabotage + day end + conditional day start)
- Solo mode (basic — character progresses without squad)
- Basic profile screen

**Does NOT include (v1.3 cuts in bold):** Shop, IAP, subscription, ads, AI recap, Android, **coin economy (no currency at all in beta — sabotage items via daily grant only)**, **Bat item**, **class selection**

### V1 — Public App Store Launch
Everything in MVP plus:
- All 4 character classes + commissioned art + Rive animation
- Coin economy (earning + spending)
- Full cosmetics shop
- Monetization in sequence: **V1.0 AdMob rewarded ads → V1.1 coin packs (StoreKit) → V1.2 Legendary subscription (RevenueCat, with price A/B test)**
- AI weekly recap card (Claude API) with celebrate-up/tease-gently privacy rules
- Shareable recap card to Stories
- V1 sabotage items (bat, shield, boost, spy, bomb) + deploy caps
- Full referral system with war declaration framing
- Referral leaderboard
- Complete notification system
- Streak system + milestones (incl. N-of-M squad streak)
- Privacy policy + Terms of Service (required by Apple)

**App Store positioning (v1.3):** Health & Fitness primary (ranks directly against Stompers/Charlie, matches how people search: "step competition app", "fitness with friends"), Social Networking secondary. Not Games — game browsers aren't looking to walk 10k steps.

**Growth engines (v1.3):** the in-product **war-declaration referral funnel** is the primary engine to optimize; **recap-card UGC** (make the Sunday card irresistibly shareable — design > all) and **TikTok PH content** (sabotage-drama skits, barkada POVs, build-in-public) feed it. Campus ambassador squads deferred as a secondary play.

### V1.5 — Android + Scale Features
- Android build (React Native port)
- Google Health Connect integration
- Google Play Billing
- Health Connect QA across Samsung, Xiaomi, OPPO
- Personalized AI challenge suggestions

### V2 — AI Depth + Growth
- Squad AI coach
- Dynamic difficulty scaling
- Character personality driven by health behavior patterns
- Sponsored challenge partnerships (if 50K+ MAU reached)

---

## 16. Cost Estimates

### Development (Your Own Team — No Hiring Cost)

| Phase | Hours | Timeline |
|---|---|---|
| MVP | 305–430 hrs | 8–12 weeks |
| V1 additions | 405–625 hrs | 12–16 weeks |
| **Total to V1** | **710–1,055 hrs** | **5–7 months** |

### One-Time Non-Dev Costs
| Item | Cost |
|---|---|
| Apple Developer Program | ₱5,700/year |
| Google Play Developer | ₱1,450 one-time |
| Character + avatar art (Rive + base design) | ₱30,000–₱80,000 |
| UI/UX design (if separate from dev) | ₱50,000–₱120,000 |
| **Total one-time** | **₱87,150–₱207,150** |

### Infrastructure (Post-Launch Monthly)
- MVP stage: **₱0** (all free tiers)
- At 1,000+ DAU: ~$25–$50/month
- Revenue from ads + IAP offsets this well before you hit paid tier limits

---

## 17. Revenue Projections

### Conservative Scenario (Year 1)
| Metric | Month 6 | Month 12 |
|---|---|---|
| MAU | 2,000 | 10,000 |
| Legendary subscribers (2%) | 40 | 200 |
| Subscription revenue | ₱5,160/mo | ₱25,800/mo |
| Coin pack revenue (avg ₱3/MAU) | ₱6,000/mo | ₱30,000/mo |
| Ad revenue (₱0.50/MAU) | ₱1,000/mo | ₱5,000/mo |
| **Total monthly** | **~₱12,000** | **~₱60,800** |

### Breakout Scenario (OFW + viral spread)
At 50,000 MAU with 15% OFW users (higher CPM):
- Subscription revenue: ~₱129,000/month
- Coin pack revenue: ~₱150,000/month
- Ad revenue: ~₱62,500/month (blended PH + OFW CPM)
- **Total: ~₱341,500/month**

---

## 18. Open Decisions

| Decision | Status | Notes |
|---|---|---|
| App name | ✅ Confirmed | **Kairo** — finalize App Store Connect registration |
| Mac access | ✅ Confirmed (v1.3) | Solo dev with Mac; EAS cloud builds reduce local dependency |
| Character art source | ✅ Decided (v1.3) | AI-generated placeholder art for MVP beta; commission base design + Rive for V1 once retention validates |
| Apple Developer Account | 🔴 Register now | $99/year, approval takes 1–5 days |
| Supabase project | 🔴 Set up now | Enable Realtime from day one |
| Firebase project | 🔴 Set up now | FCM needed from first build |
| Solo Leveling IP | ✅ Decided (v1.3) | **Internal reference only.** "Solo Leveling" never appears in marketing, App Store copy, or in-app text. Art brief says "dark fantasy hunter aesthetic": original silhouettes, no arise/shadow-monarch terminology, no signature purple-blue gate visuals. The IP is owned by Kakao/D&C Media, who actively license games — the vibe survives, the legal surface doesn't. |

---

## 19. Streak System

### Personal Streak
Consecutive days where you contributed to at least 1 stat (any score > 0). Even a minimal movement day keeps the streak alive — the bar is intentionally low so streaks feel maintainable.

| Milestone | Reward |
|---|---|
| 3 days | +25 coins |
| 7 days | +75 coins + streak flame badge on leaderboard |
| 14 days | +150 coins + animated streak effect visible to squad |
| 30 days | +300 coins + exclusive "Grinder" title |
| 100 days | Legendary cosmetic drop — **cannot be purchased in shop, ever** |

The 100-day cosmetic is your most powerful long-term retention mechanic. Only path to get it is 100 consecutive days of any health contribution. Creates a goal people mention in their squad chat unprompted.

### Squad Streak — N-of-M Threshold (v1.3 revision)
Consecutive days where **most of the squad** contributes at least 1 stat — the threshold is N-of-M (e.g. 4 of 6 members). The original all-or-nothing design made the least active member "the one who broke it" repeatedly, which curdles into real resentment in family/work squads and pushes that member to quit. N-of-M keeps social accountability pressure while measuring squad culture, not its most fragile link.

### Late-Sync Backfill Policy (v1.3)
iOS background delivery isn't guaranteed — a dead phone or skipped wake-up can mean days of data arriving after those days finalized. Backfilled data **cannot** change finalized rankings or coin awards (the competition already happened), but it **does** retroactively preserve personal streaks and earn XP. The daily game stays fair; a user's real activity is never punished by sync luck — consistent with the Bat's delay-don't-destroy philosophy.

### The Streak Shield (Critical Retention Mechanic)
The biggest churn event in streak-based apps is a broken streak. Most apps do nothing — the user feels failure and abandons.

Kairo prevents this with the **Streak Shield:**
- One free shield automatically activates when a streak breaks, if the user had at least a 5-day streak before the miss
- Shield recharges every 30 days
- User wakes up to: *"Your streak was protected by your Streak Shield. Next shield available in 27 days."*
- Turns a churn event into a relief moment — user feels saved, not punished
- They open the app. They keep playing.

Shields can also be purchased with coins (50 coins per shield, max 2 banked) for power users who want extra protection on travel days or sick days.

---

## 20. Key Principles (Non-Negotiable)

1. **Free users make it viral. Paid users make it profitable.** Never paywall the core competitive loop.
2. **Zero manual input for competitive metrics.** Health data from HealthKit/Health Connect only.
3. **Social embarrassment is the anti-cheat system.** Flag anomalies to the squad, not to admins.
4. **The sabotage mechanic is the soul of the product.** Every feature should serve the emotional cocktail of competition + character investment + friend chaos.
5. **Ship MVP before adding anything.** No AI, no shop, no ads until Day 7 retention is validated.
6. **The recap card is the organic acquisition engine.** Every Sunday is a free marketing event.
7. **The referral is a challenge, not an invitation.** Ego drives downloads faster than feature lists.
8. **Daily cutoff is 11:59 PM PHT, not 9 PM.** This was Stompers' most complained-about limitation. Own that gap from day one.

---

---

## 21. Brand Name — Kairo

### Why Kairo

**Kairo** is not a random word. It carries three layers of meaning that align precisely with what this product is built to do.

**Layer 1 — Kairos (Greek Philosophy)**
In ancient Greek, *Kairos* is the concept of the critical, opportune moment — the window where action taken *now* changes the outcome. It sits opposite *Chronos* (sequential, clock time). Aristotle used Kairos specifically in the context of physical training — the body's peak readiness moment. Your app's entire mechanic is built on this: every day is a 24-hour Kairos window. The leaderboard resets at midnight. The opportunity closes at 11:59 PM. Miss it and it's gone. Kairo is the shortened, modernized form of Kairos — the app that helps you seize your moment every single day.

**Layer 2 — Al-Qāhirah (Arabic Origin)**
Cairo the city derives from Arabic *Al-Qāhirah*, which translates directly to *"The Victorious"* or *"The Conqueror."* In a competition app where someone wins every night, the name of the app literally means The Victorious in its original root language. The K spelling separates it from the Egyptian city — intentional, modern, ownable.

**Layer 3 — Asian / Anime Resonance**
Strong K-consonant names carry specific weight in Japanese and Korean cultural vocabulary — Kaizen, Kakashi, Kaido. For a Solo Leveling-inspired app targeting Filipino users aged 18–35 embedded in anime and gaming culture, Kairo fits the aesthetic universe without being derivative of it. It sounds like it belongs in that world.

---

### The Name Across Every Touchpoint

| Context | Copy |
|---|---|
| App Store listing | *"Kairo — Level Up With Your Barkada"* |
| Onboarding | *"Every day is a Kairo moment. Don't waste it."* |
| Day-end notification | *"The Kairo window closes in 1 hour. You're in 3rd place."* |
| Recap card footer | *"Powered by Kairo"* |
| Referral challenge | *"[Name] is challenging you on Kairo. Are you going to let them win?"* |
| Empty squad slot | *"Your squad is waiting. This is your Kairo."* |

---

### Brand Practicalities

| Factor | Status |
|---|---|
| Length | 5 letters — perfect for app icon |
| Syllables | 2 (KAI-ro) — instantly memorable |
| Filipino pronounceability | ✅ Natural — KAI-ro, no ambiguity |
| Group chat test | ✅ "I-download mo na, Kairo yun" — clean and fast |
| Uniqueness in App Store | ✅ No major health/fitness app named Kairo |
| Domain potential | kairo.app / getkairo.com / trykairo.com |
| Social handles | @kairoapp likely available |
| Trademark risk | Low — no obvious conflicts in mobile apps category |
| App icon | "K" monogram — strong, geometric, works at all sizes |

---

### Competitive Name Comparison

| App | Name feel | What it signals |
|---|---|---|
| Stompers | Action, casual, sound | Fun but disposable |
| Charlie | Friendly, soft, personal | Cute but not competitive |
| **Kairo** | **Strong, victorious, precise** | **Built for people who want to win** |

Kairo is the only name in that set that sounds premium. It belongs to a different tier before anyone reads a single feature description.

---

*Kairo Master Summary v1.3*  
*All decisions as of July 2026 — update after MVP validation*  

**Changelog:**  
v1.0 — Initial draft (GrindSquad working title)  
v1.1 — App name confirmed as Kairo, brand section added  
v1.2 — Health metrics revised: sleep removed from core scoring, VIT redefined as hourly movement consistency, REC added as wearable-only bonus stat, contribution-based scoring tiers added, streak system + Streak Shield added, weekly specialization layer added  
v1.3 — Design interview pass (July 2026): background sync free for all users (removed as Legendary perk); Bat redefined as banked freeze with midnight risk, moved to V1; server-authoritative scoring via hourly bucket upserts + Edge Functions; per-user local days with ~2h grace-window finalization; sabotage as immutable event log; late-sync backfill counts for streaks/XP but not rankings; anti-cheat velocity flag gains workout cross-check; squad visibility limited to tiers + score; Spy item redefined (momentum, not raw steps); daily sabotage deploy caps (2 free / 3 Legendary); MVP cut to 1 class (Hunter, AI placeholder art), Banana only, no coin economy; onboarding reordered character-first; notifications bundled + rank-aware; squad streak softened to N-of-M; recap cards celebrate up / tease gently with opt-out; coin economy tuned for first cosmetic in 7–10 days; Legendary price to be A/B tested; four designed rewarded-ad moments; revenue rollout sequenced ads → packs → subscription; stack moved from bare RN to Expo prebuild + EAS; Solo Leveling IP internal-reference-only; App Store category Health & Fitness; beta redesigned as 5–6 squads × 6 weeks with stranger squads and D21 focus
