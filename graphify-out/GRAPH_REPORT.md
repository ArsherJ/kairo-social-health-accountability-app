# Graph Report - .  (2026-08-01)

## Corpus Check
- 150 files · ~109,090 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 837 nodes · 1574 edges · 61 communities (37 shown, 24 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.62)
- Token cost: 225,772 input · 0 output

## Community Hubs (Navigation)
- Auth & Onboarding Screens
- App Navigation & Profile Tab
- Daily Score Computation
- Sabotage Deploy Function
- Roadmap & Approved Deviations
- Hourly Health Bucket Math
- Local-Day Boundary Math
- Expo App Dependencies
- Root Package Config
- Realtime Update Policy
- TypeScript Path Config
- HealthKit Background Sync Policy
- Seed-Health Admin Function
- App TSConfig Compiler Options
- Core Schema Migration
- Deno Workspace Config
- XP & Level Progression
- kairo-core Package Manifest
- Anti-Cheat Step Burst Detection
- Infra Tables Migration
- Squad & Leaderboard RPCs
- Sabotage Schema Migration
- Social Mechanics Concepts
- XP Rollup Trigger
- Account Deletion Cascade
- Health Data Schema Migration
- Realtime Broadcast Migration
- Metro Bundler Config
- Squad RLS Helpers
- Finalizable Days Migration
- RPG Character Concepts
- iOS HealthKit Config Plugin
- iOS Build Warning Fixes
- Remote SQL Script
- App Config Entry
- Scoring Formula Concepts
- REC/VIT Stat Concepts
- Profiles/Squads Link
- Anti-Cheat Rationale
- Kairo Brand Naming
- Non-Negotiable Principles
- Solo Mode Concept
- app_events Table
- daily_item_ledger Table
- daily_sleep Table
- device_tokens Table
- notification_log Table
- sabotage_events Table
- daily_scores Table
- health_buckets Table
- profiles Table
- squads Table
- streaks Table
- health_buckets Reference

## God Nodes (most connected - your core abstractions)
1. `colors` - 21 edges
2. `currentLocalDate()` - 20 edges
3. `radius` - 20 edges
4. `space` - 19 edges
5. `compilerOptions` - 16 edges
6. `font` - 15 edges
7. `SabotageEvent` - 14 edges
8. `addDays()` - 13 edges
9. `useSessionStore` - 13 edges
10. `HealthKit Ingest Implementation Plan` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Kairo README` --conceptually_related_to--> `Kairo Master Summary v1.3`  [INFERRED]
  README.md → Kairo_Master_Summary.md
- `Character()` --calls--> `evolutionStageForLevel()`  [EXTRACTED]
  app/(tabs)/index.tsx → packages/kairo-core/src/progression.ts
- `Character()` --calls--> `levelForXp()`  [EXTRACTED]
  app/(tabs)/index.tsx → packages/kairo-core/src/progression.ts
- `Character()` --calls--> `useDominantStat()`  [EXTRACTED]
  app/(tabs)/index.tsx → src/features/character/queries.ts
- `Character()` --calls--> `useTodayScore()`  [EXTRACTED]
  app/(tabs)/index.tsx → src/features/character/queries.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three Edge Functions that own every mutation** — supabase_functions_sync_health, supabase_functions_deploy_sabotage, supabase_functions_finalize_days, claude_md [EXTRACTED 1.00]
- **Zero-import pure decision modules tested in plain Node** — src_features_auth_route_ts, src_features_squad_realtime_policy_ts, src_features_health_sync_policy_ts, src_features_squad_invite_code_ts, src_features_squad_slots_ts, packages_kairo_core_dominance_ts [EXTRACTED 0.90]
- **Phase 4 squad-system deliverables (backend + realtime + UI)** — docs_superpowers_plans_2026_07_29_seed_data_and_completed_day_board_md, docs_superpowers_plans_2026_07_31_squad_realtime_md, docs_superpowers_plans_2026_07_31_squad_ui_md, docs_roadmap_md_phase4_squads_leaderboard [EXTRACTED 1.00]

## Communities (61 total, 24 thin omitted)

### Community 0 - "Auth & Onboarding Screens"
Cohesion: 0.06
Nodes (68): SignIn(), styles, styles, DOMINANCE_LABELS, STAT_LABELS, styles, Pane, Squad() (+60 more)

### Community 1 - "App Navigation & Profile Tab"
Cohesion: 0.06
Nodes (46): Gate(), styles, NameYourHunter(), Character(), TabsLayout(), ProfileTab(), styles, CHARACTER_NAME_MAX (+38 more)

### Community 2 - "Daily Score Computation"
Cohesion: 0.06
Nodes (50): computeDay(), ComputeDayInput, ComputeDayResult, BALANCED_TOLERANCE, dominantStat(), applySabotage(), BANANA_SCORE_DELTA, DEPLOY_CAP_FREE (+42 more)

### Community 3 - "Sabotage Deploy Function"
Cohesion: 0.07
Nodes (44): DayStatus, SabotageEvent, SabotageItem, validateDeploy(), admin, admin, Candidate, cronSecret (+36 more)

### Community 4 - "Roadmap & Approved Deviations"
Cohesion: 0.06
Nodes (56): CLAUDE.md — Kairo repo guidance, Kairo MVP Implementation Roadmap, Approved deviations table, Deviation #5 — live XP accrual, Deviation #6 — squad_leaderboard defaults to current day, Deviation #7 — anonymous sign-in stand-in for Apple, Deviation #8 — window reads, not persisted anchors, Deviation #9 — DST day / 24-bucket constraint (+48 more)

### Community 5 - "Hourly Health Bucket Math"
Cohesion: 0.07
Nodes (36): HealthMetric, HourlyReading, key(), round2(), SyncBucket, toBuckets(), hourlySampleInstants(), Interval (+28 more)

### Community 6 - "Local-Day Boundary Math"
Cohesion: 0.09
Nodes (41): addDays(), currentLocalDate(), dayEndUtc(), dayStartUtc(), featuredStatFor(), FINALIZATION_GRACE_MS, finalizesAtUtc(), formatterCache (+33 more)

### Community 7 - "Expo App Dependencies"
Cohesion: 0.04
Nodes (47): expo, expo-asset, expo-constants, expo-file-system, expo-keep-awake, expo-linking, @expo/metro-runtime, expo-router (+39 more)

### Community 8 - "Root Package Config"
Cohesion: 0.06
Nodes (33): babel-preset-expo, deno, @electric-sql/pglite, @expo/config-plugins, devDependencies, babel-preset-expo, deno, @electric-sql/pglite (+25 more)

### Community 9 - "Realtime Update Policy"
Cohesion: 0.11
Nodes (14): COALESCE_WINDOW_MS, FOREGROUND_THROTTLE_MS, initialPolicyState, RealtimePolicyCommand, RealtimePolicyInput, RealtimePolicyState, reduceRealtimePolicy(), refetchNow() (+6 more)

### Community 10 - "TypeScript Path Config"
Cohesion: 0.07
Nodes (26): app.config.ts, app/**/*.ts, app/**/*.tsx, **/*.deno.ts, expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, node_modules (+18 more)

### Community 11 - "HealthKit Background Sync Policy"
Cohesion: 0.17
Nodes (19): configureHealthBackgroundDelivery(), KAIRO_OBSERVED_TYPES, subscribeToHealthChanges(), BACKOFF_BASE_MS, BACKOFF_MAX_MS, backoffMs(), COALESCE_WINDOW_MS, FOREGROUND_THROTTLE_MS (+11 more)

### Community 12 - "Seed-Health Admin Function"
Cohesion: 0.17
Nodes (19): AddToSquadBody, admin, assertAllowlisted(), Body, CreateUsersBody, SeedDaysBody, seedSecret, expandDateRange() (+11 more)

### Community 13 - "App TSConfig Compiler Options"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit (+11 more)

### Community 14 - "Core Schema Migration"
Cohesion: 0.13
Nodes (13): auth, auth.users, public.enforce_squad_limits, public.validate_timezone, profiles_touch_updated_at, profiles_validate_timezone, public.generate_invite_code(), public.profiles (+5 more)

### Community 15 - "Deno Workspace Config"
Cohesion: 0.12
Nodes (16): deno.ns, deno.window, recommended, compilerOptions, lib, noUncheckedIndexedAccess, strict, fmt (+8 more)

### Community 16 - "XP & Level Progression"
Cohesion: 0.27
Nodes (9): EvolutionStage, evolutionStageForLevel(), LEVEL_XP_DIVISOR, levelForXp(), MAX_REALISTIC_DAILY_XP, xpForLevel(), xpProgress, styles (+1 more)

### Community 17 - "kairo-core Package Manifest"
Cohesion: 0.15
Nodes (12): description, exports, main, name, private, scripts, test, test:watch (+4 more)

### Community 18 - "Anti-Cheat Step Burst Detection"
Cohesion: 0.26
Nodes (9): BurstVerdict, evaluateStepBurst(), FLAG_CLEARS_AFTER_CLEAN_DAYS, MIN_PLAUSIBLE_STRIDE_M, shouldClearFlag(), StepBurst, SuppressionSignal, VELOCITY_STEP_THRESHOLD (+1 more)

### Community 19 - "Infra Tables Migration"
Cohesion: 0.29
Nodes (9): device_tokens_touch_updated_at, public.app_events, public.device_tokens, public.notification_log, public.streaks, public, public.profiles, public.touch_updated_at (+1 more)

### Community 20 - "Squad & Leaderboard RPCs"
Cohesion: 0.31
Nodes (8): scored, public.create_squad(), public.join_squad(), public.squad_leaderboard(), public.daily_scores, public.profiles, public.squad_members, public.streaks

### Community 21 - "Sabotage Schema Migration"
Cohesion: 0.33
Nodes (6): public.reject_mutation, public.daily_item_ledger, public.sabotage_events, sabotage_events_append_only, public.profiles, public.squads

### Community 22 - "Social Mechanics Concepts"
Cohesion: 0.33
Nodes (6): The Bat — banked freeze mechanic, Late-sync backfill policy, Referral System — The War Declaration, Sabotage system, Squad streak — N-of-M threshold, The Streak Shield

### Community 23 - "XP Rollup Trigger"
Cohesion: 0.33
Nodes (4): public.daily_scores_xp_rollup, daily_scores_xp_rollup_trigger, public.recalculate_user_xp(), public.daily_scores

### Community 25 - "Health Data Schema Migration"
Cohesion: 0.53
Nodes (5): public.daily_scores, public.daily_sleep, public.health_buckets, public, public.profiles

### Community 26 - "Realtime Broadcast Migration"
Cohesion: 0.40
Nodes (4): public.broadcast_score_change, daily_scores_broadcast, public.broadcast_score_change(), public.squad_members

### Community 27 - "Metro Bundler Config"
Cohesion: 0.50
Nodes (3): config, { getDefaultConfig }, path

### Community 28 - "Squad RLS Helpers"
Cohesion: 0.67
Nodes (3): public.is_squad_member(), public.shares_squad_with(), public.squad_members

### Community 29 - "Finalizable Days Migration"
Cohesion: 0.50
Nodes (3): public.finalizable_days(), public.daily_scores, public.profiles

### Community 30 - "RPG Character Concepts"
Cohesion: 0.67
Nodes (3): Character / RPG progression system, Solo Leveling IP — internal reference only, Weekly specialization / featured stat

## Knowledge Gaps
- **218 isolated node(s):** `config`, `styles`, `styles`, `STAT_LABELS`, `DOMINANCE_LABELS` (+213 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `currentLocalDate()` connect `Local-Day Boundary Math` to `Auth & Onboarding Screens`, `Daily Score Computation`, `Sabotage Deploy Function`, `Hourly Health Bucket Math`, `HealthKit Background Sync Policy`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `CoreStat` connect `Daily Score Computation` to `Auth & Onboarding Screens`, `Sabotage Deploy Function`, `Local-Day Boundary Math`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `supabase` connect `App Navigation & Profile Tab` to `Auth & Onboarding Screens`, `Realtime Update Policy`, `Daily Score Computation`, `Hourly Health Bucket Math`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `config`, `styles`, `styles` to the rest of the system?**
  _218 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth & Onboarding Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.05586722767648434 - nodes in this community are weakly interconnected._
- **Should `App Navigation & Profile Tab` be split into smaller, more focused modules?**
  _Cohesion score 0.05962732919254658 - nodes in this community are weakly interconnected._
- **Should `Daily Score Computation` be split into smaller, more focused modules?**
  _Cohesion score 0.06057692307692308 - nodes in this community are weakly interconnected._