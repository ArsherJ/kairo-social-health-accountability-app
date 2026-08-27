STATIC SLICE COMPLETE — RIVE WORK PARKED

# KAIRO static asset handoff

**Tested feature-branch commit:** `f143222` (`fix(character): clarify catalog cosmetic anchors`)  
**Verification date:** 2026-08-27

This handoff covers only the non-Rive static KAIRO slice. It does **not** claim that the original compositional Rive MVP, native integration, or device acceptance work is complete.

## Verification evidence

All commands below were run from the isolated feature worktree at the tested commit, before this document was added.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS — root TypeScript check, `@kairo/core` TypeScript check, and Deno checks for 5 Edge Function entrypoints completed with exit 0. |
| `npm test` | PASS — `@kairo/core`: 21 files / 437 tests; root schema suite: 76 files / 1,189 tests; **97 files / 1,626 tests total**, 0 failures. |
| `npx vitest run --config vitest.config.ts src/features/character/character-contract.test.ts src/features/character/character-resolver.test.ts src/features/character/character-assets.test.ts` | PASS — 3 files / 36 tests, 0 failures. |
| `npm run doctor` | CONCERN — with network access, 20/21 Expo Doctor checks passed. The SDK package-version check reports 14 pre-existing patch-version mismatches; see concerns below. The initial restricted-network run had 19/21 checks pass and could not reach `exp.host` / React Native Directory. |
| `npx expo export --platform web --output-dir=/tmp/kairo-static-web-export` | PASS — Metro bundled the web app (1,154 modules) and exported `/tmp/kairo-static-web-export`; it contains all 22 versioned KAIRO PNGs and the bundle registers `./kairo-lab.tsx`. No native project was generated or edited. |
| `git diff --check` | PASS — no whitespace errors before this document was added. |

The export invocation uses the CLI's equivalent `--output-dir=/tmp/kairo-static-web-export` spelling after two harness-level process-launch failures with the space-separated form; Expo itself then completed successfully. The temporary export is outside the repository and is not committed.

## Static inventory

Method: from the repository checkout, enumerate `*.png` below `assets/character/base`, `poses`, `states`, and `cosmetics`; calculate each full digest with `shasum -a 256`; inspect pixels/format with `sips -g pixelWidth -g pixelHeight -g format`; and confirm alpha with `sips -g hasAlpha`. The enumeration found 22 files; every file is `570×636 RGBA` and all 22 reported `hasAlpha: yes`.

| Repository path | Semantic ID / type | Dimensions / format | SHA-256 |
| --- | --- | --- | --- |
| `assets/character/base/kairo_base_front_v1.png` | `base` / base-front | 570×636 RGBA | `0cc60cbe09dc0ec387e7df87ba50b9825ab2f011be8fd25055a25f7be05700b6` |
| `assets/character/poses/kairo_pose_idle_v1.png` | `idle` / pose | 570×636 RGBA | `a71e675e01699b0a304e47655cafe1728f3fac618929d350a94bf2c7050a383a` |
| `assets/character/poses/kairo_pose_sleep_v1.png` | `sleep` / pose | 570×636 RGBA | `9f270d7da7780adb80d8508a43e3b642f12180ed6331f6cd968922ef410b9bc3` |
| `assets/character/poses/kairo_pose_walk_v1.png` | `walk` / pose | 570×636 RGBA | `4fbe17119e0bb59d653f58437af7e856e6ca122adba5910bc93e2883596d982f` |
| `assets/character/poses/kairo_pose_run_v1.png` | `run` / pose | 570×636 RGBA | `de9080da04d2e68df7d5bc259723d99515086d8a7b78b7f2b51f2ae847fa9a88` |
| `assets/character/poses/kairo_pose_workout_v1.png` | `workout` / pose | 570×636 RGBA | `75330d523c48e42a6946d85da272023df72a5384e20a4e1d78a77c277ae9be5e` |
| `assets/character/poses/kairo_pose_race_victory_v1.png` | `race_victory` / pose | 570×636 RGBA | `dadad03b63ec593b7fcceb950b3e23222e7e096e29ed7e5bcea71703a31b7686` |
| `assets/character/states/kairo_state_sleepy_v1.png` | `sleepy` / sleep-state | 570×636 RGBA | `420e0d885f8a72c50fcfb8c58c11c9ce50398d54a70a54fe6d451cbe16c46e95` |
| `assets/character/states/kairo_state_normal_v1.png` | `normal` / sleep-state | 570×636 RGBA | `a71e675e01699b0a304e47655cafe1728f3fac618929d350a94bf2c7050a383a` |
| `assets/character/states/kairo_state_well_rested_v1.png` | `well_rested` / sleep-state | 570×636 RGBA | `c2a6dcac92535666ef0b5e2594412dd0c69542710aef3757b0da5bd3d0100bf4` |
| `assets/character/cosmetics/cosmetic_head_runner_cap_v1.png` | `runner_cap` / cosmetic-head | 570×636 RGBA | `3e9654326d11c6188a2c41d18129b5481925e72dbaa7b68cdb1ccc81626ff051` |
| `assets/character/cosmetics/cosmetic_head_woven_salakot_v1.png` | `woven_salakot` / cosmetic-head | 570×636 RGBA | `43f66ca222b1b3298c5c07f6b95e545e0e215a31757886d388093d870c401b98` |
| `assets/character/cosmetics/cosmetic_head_leaf_crown_v1.png` | `leaf_crown` / cosmetic-head | 570×636 RGBA | `cf49a7fb9ecacd7bc354dfa96784c813c8f649394186c9d8a80392f38caa5106` |
| `assets/character/cosmetics/cosmetic_face_round_glasses_v1.png` | `round_glasses` / cosmetic-face | 570×636 RGBA | `2097e794987266fdbe0c4d07c10fb2fb34c5b60c7a7502d8f40a5420f5772967` |
| `assets/character/cosmetics/cosmetic_face_flight_goggles_v1.png` | `flight_goggles` / cosmetic-face | 570×636 RGBA | `7be7175c27120901033f04afd276654de48a51081a5363378da3ad5b65c0b3ab` |
| `assets/character/cosmetics/cosmetic_neck_sunlit_bandana_v1.png` | `sunlit_bandana` / cosmetic-neck | 570×636 RGBA | `d5a9af25e52a2c73f4d59ff4369242949404230f57ef9aba9f94996371972c90` |
| `assets/character/cosmetics/cosmetic_neck_sampaguita_garland_v1.png` | `sampaguita_garland` / cosmetic-neck | 570×636 RGBA | `8d93425c27b529e2ac7c3cf51a7480ea2b2779b57c61df989f5bc8a1354a9b53` |
| `assets/character/cosmetics/cosmetic_body_trail_vest_v1.png` | `trail_vest` / cosmetic-body | 570×636 RGBA | `2199c74c41683572299b5cde7512e8d964fa7aee2965cf148078380baf816c5c` |
| `assets/character/cosmetics/cosmetic_back_woven_cape_v1.png` | `woven_cape` / cosmetic-back | 570×636 RGBA | `6b55d7548cbd6cdc4dba02c001f7c84b7ce673483083b8c6f4832d238085c62d` |
| `assets/character/cosmetics/cosmetic_feet_trail_sneakers_v1.png` | `trail_sneakers` / cosmetic-feet | 570×636 RGBA | `0e8a9c6727b6c7815198a921537f1336184894cff62433aeab57009062b22e31` |
| `assets/character/cosmetics/cosmetic_feet_rain_boots_v1.png` | `rain_boots` / cosmetic-feet | 570×636 RGBA | `3ab5668b9a46660c5f6f564caa026f1f4d0dfbdc849fbc96356f23b0c922afa1` |
| `assets/character/cosmetics/cosmetic_effect_firefly_aura_v1.png` | `firefly_aura` / cosmetic-effect | 570×636 RGBA | `03851c8e994a9326a1941f28e573c26db27e5afbef14d9962136ff25b268e79e` |

## Completed static behavior

- Canonical contract validation for the versioned character, cosmetic, and animation manifests.
- A pure product-state resolver.
- A provisional transparent static PNG pack.
- A compile-time literal Metro registry: exactly 1 base, 6 pose, 3 state, and 12 cosmetic PNG `require()` calls.
- Policy-driven compact thumbnails: `skyMarker: run`, `leaderboard: idle`, and `eventMember: idle`.
- A development-only static catalog at `/kairo-lab`.

Source-boundary inspection confirmed that `KairoThumbnail`, its three compact consumers (`SkyMarker`, `LeaderboardRow`, and `app/event/[id].tsx`), `KairoLab`, and `app/kairo-lab.tsx` have no Rive package import, `.riv` path, renderer, binding, or view-model usage. `package.json`, `package-lock.json`, and `metro.config.js` contain no Rive package or Metro configuration. The catalog route returns a redirect when `!__DEV__`, and production navigation does not link to it. `SPECIES_FIGURES` remains because the parked Today/onboarding callers still consume it. The canonical JSON/spec `rive` metadata is retained only as a future semantic contract, not runtime integration.

## Static limitations

- Generated assets are provisional.
- Cosmetic images are flattened full-character QA previews, not isolated or equipable layers.
- State previews are static.
- Strength tiers and reactions have no rendered static variants.
- No state × strength × pose × cosmetic compositor exists.

## Parked Rive-dependent work

- [ ] Author and export one genuine `assets/character/rive/kairo_v1.riv`.
- [ ] Install and configure the selected Rive React Native runtime and Metro asset handling.
- [ ] Implement the binding plan, shared file provider, independent renderer instances, fallback/error behavior, and Reduced Motion behavior.
- [ ] Migrate Today and onboarding to live rendering.
- [ ] Implement strength tiers, reactions, live state/pose transitions, cosmetic layers, and full composition.
- [ ] Replace provisional cosmetic QA previews with faithful isolated/exported production assets.
- [ ] Run CNG, iOS/Android builds, device-level accessibility/visual QA, and the complete compatibility matrix.

## Resumption path

Put the user's finished file at `assets/character/rive/kairo_v1.riv`, then resume the parked portions of plan Tasks 3, 5, 6, 7, 8, 10, and 11. The earlier browser authoring draft at `https://editor.rive.app/file/untitled/2537585` is only a possible draft reference; no `.riv` was exported or committed from it.

## Safety boundary

This branch adds no Rive runtime dependency, Metro `.riv` rule, `.riv` binary, native project regeneration, Supabase/economy/inventory work, or production catalog-route link. `KAIRO_V1_COMPATIBILITY.md` is deliberately not created: that name is reserved for the future fully exercised Rive compatibility report.

## Concern for controller follow-up

Expo Doctor's network-enabled run found 14 package patch-version mismatches against the installed Expo SDK: `@expo/metro-runtime`, `expo`, `expo-asset`, `expo-constants`, `expo-crypto`, `expo-dev-client`, `expo-file-system`, `expo-linking`, `expo-notifications`, `expo-router`, `expo-secure-store`, `expo-system-ui`, `expo-updates`, and `react-native`. This handoff-only task does not modify dependencies; the mismatch should be assessed and resolved separately.
