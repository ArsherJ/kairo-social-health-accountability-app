# Kairo Animal Character System — MVP → Scale Plan

## Why this needs its own plan

The pivot from human hunter/manhwa to animal characters isn't just an art swap — it changes onboarding (no identity declaration needed), simplifies the asset pipeline (sprite sheets vs. Rive rigs), and opens a distinct retention hook (growth/evolution) that the old direction didn't have. This plan scopes what ships at MVP vs. what gets layered in later, so the asset pipeline doesn't get overbuilt before launch.

## Working design model (stated assumption — confirm or adjust)

- **4 starter species, each tied to one core stat** for identity and flavor: Pilandok (AGI), Tamaraw (STR), Carabao (END), Philippine Eagle (VIT).
- **Species choice = identity, not a mechanical restriction.** A player who picks Tamaraw still earns AGI/END/VIT/STR normally — this preserves the existing "no stat required daily" pillar. The species affinity is narrative/visual (which animal represents you, thematic flavor text), not a scoring gate.
- If you actually want species to grant a small mechanical bonus (e.g., +5% tier progress toward its matching stat), that's a viable alt model — but it adds balancing work and squad-fairness questions, so I'd treat it as a V1.5+ consideration, not MVP.

---

## Phase 1 — MVP (launch scope)

**Goal:** Ship the identity + visual layer with the smallest asset footprint that still feels alive.

**Onboarding**
- Species selection screen: 4 choices, each with a short flavor blurb (endemic/folkloric fact) instead of a body/gender/identity prompt.
- Selection is permanent for now (no swapping) — simplest to build, defer "change species" as a later monetization or milestone unlock.

**Visual scope**
- One sprite per species, one idle animation loop (2–4 frames — breathing/blinking, not a full action set).
- No growth stages, no evolution art at MVP. A single "adult" sprite per species keeps the asset count at 4 total instead of 4×N.
- Contribution-tier feedback (Bronze/Silver/Gold, per stat) shown as **badges/overlays**, not sprite swaps — cheapest way to give tier progress a visual signal without new art per tier.

**Squad & social surfaces**
- Small sprite icons on squad roster, leaderboard, and War Declaration screens so squadmates are visually distinct at a glance.

**Explicitly OUT of MVP**
- Evolution/growth stages
- Skins/cosmetic variants
- Any battle-related animation (attack, hit, victory frames)
- Species swapping

**Asset pipeline for MVP**
- Pixel art tool selection is still open (Aseprite is the common default for sprite sheet work with built-in animation/export tooling, but worth a quick look at alternatives before committing).
- Lock a canvas/grid standard now (e.g., 32×32 or 64×64) since every future asset — evolutions, skins, battle frames — inherits whatever you pick here. Retrofitting a grid size later is expensive.

---

## Phase 2 — V1.5 (post-launch expansion)

**Goal:** Turn the character into a retention loop and lay groundwork for battle, without building the full battle system yet.

- **Growth/evolution stages**: tie 2–3 visual stages (e.g., young → adult → apex) to overall level, streaks, or Legendary status. This is the biggest single addition — it gives the character system a "reason to keep playing" beyond stats.
- **Skins/cosmetic variants**: recolors or seasonal variants sold via coin packs or gated behind Legendary — reuses the same rig/animation, just re-palettes it, so it's cheap relative to new species.
- **Roster expansion**: additional Philippine endemic species, possibly tied to achievements, referrals, or the REC (wearable) stat once that has its own audience.
- **Battle-readiness groundwork**: extend each species' sprite sheet with the frames a Dragon City-style battle needs (attack, hit/flinch, victory, faint) — do this per-species as you add evolution stages, so you're not redoing the same animal twice.
- **Rep-counting tie-in**: CoreMotion (pull-ups on watchOS) and Vision-based pose estimation (squats, sit-ups, lunges) feed into "training" actions that could visually reference the character (e.g., character performs the rep on-screen) — worth scoping alongside battle animation work since both need actual motion, not just idle loops.

---

## Phase 3 — V2 (long-term)

- **Full battle system**: species abilities/moves informed by their stat identity (Tamaraw hits harder, Pilandok dodges more, etc.) if you decide to lean into the affinity model by then.
- **Collection/trading meta**: rare species or skins tied into the sabotage and War Declaration mechanics — e.g., a successful "raid" nets a cosmetic reward.
- **Android parity**: when the React Native port happens, confirm the sprite sheet approach (format, animation driver) renders consistently cross-platform — safer to validate this early rather than after a large asset library already exists.

---

## Asset pipeline by phase

| Phase | Frames needed per species | New species | Notes |
|---|---|---|---|
| MVP | 1 idle loop (2–4 frames) | 0 (4 total) | Badges handle tier feedback, not new art |
| V1.5 | + walk/celebrate + evolution stages (×2–3) + battle frames (attack/hit/victory/faint) | + a few, gated | Skins reuse rig, just re-palette |
| V2 | + move-specific battle animations | Ongoing | Trading/rarity adds production cadence pressure |

## Open decisions to lock before build starts

1. Species-stat affinity: cosmetic-only (this plan's assumption) vs. mechanical bonus.
2. Pixel art tool (Aseprite vs. alternatives) and canvas/grid size.
3. Whether species selection is permanent at MVP or swappable later.
4. Logo visual direction — worth finalizing in parallel so character art and logo read as one consistent pixel style rather than converging by accident later.

## Risks & dependencies

- No in-house illustration skill means the pipeline leans on AI generation/scripting — worth prototyping one species end-to-end before committing to the grid size and frame counts above, since that'll surface tooling limits early.
- Evolution stages (V1.5) are the highest-leverage addition for retention but also the biggest scope jump — worth treating as its own mini-spec when you get there rather than bolting it on ad hoc.
