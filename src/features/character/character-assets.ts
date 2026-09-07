import type { EvolutionStage } from '@kairo/core';
import type { ImageSourcePropType } from 'react-native';

import type { CosmeticId, KairoPose, SleepState, StagePose } from './character-contract';

export const KAIRO_BASE_ASSET: ImageSourcePropType =
  require('../../../assets/character/base/kairo_base_front_v1.png');

export const KAIRO_POSE_ASSETS: Record<KairoPose, ImageSourcePropType> = {
  idle: require('../../../assets/character/poses/kairo_pose_idle_v1.png'),
  sleep: require('../../../assets/character/poses/kairo_pose_sleep_v1.png'),
  walk: require('../../../assets/character/poses/kairo_pose_walk_v1.png'),
  run: require('../../../assets/character/poses/kairo_pose_run_v1.png'),
  workout: require('../../../assets/character/poses/kairo_pose_workout_v1.png'),
  race_victory: require('../../../assets/character/poses/kairo_pose_race_victory_v1.png'),
};

/**
 * The body at each **growth stage**, for the three poses that actually draw.
 *
 * **Written out as twelve literal `require`s, and it has to stay that way.**
 * Metro resolves `require` statically, so `require(`...${stage}...`)` is not a
 * path it can follow — a computed path is a runtime miss on device, not a
 * bundling error, which is the same trap `species-art.ts` records. The
 * `Record<EvolutionStage, Record<StagePose, …>>` type is the other half: a
 * missing cell fails `tsc`, and a cell naming a file that is not there fails
 * the bundle. Neither can render blank.
 *
 * **Interim state (2026-09-07):** stages 1–3 point at the adult art, so this
 * pass is invisible to a player and verifiable only in the asset lab. Issue #31
 * commissions the nine images; dropping them in is repointing nine of these
 * lines at
 * `assets/character/stages/kairo_stage_<hatchling|fledgling|juvenile>_<idle|walk|run>_v1.png`
 * — the names are `GROWTH_STAGE_NAMES` — and nothing else. Stage 4 keeps the
 * pose art it already had, which is why nothing moves today.
 */
export const KAIRO_STAGE_ASSETS: Record<EvolutionStage, Record<StagePose, ImageSourcePropType>> = {
  1: {
    idle: require('../../../assets/character/poses/kairo_pose_idle_v1.png'),
    walk: require('../../../assets/character/poses/kairo_pose_walk_v1.png'),
    run: require('../../../assets/character/poses/kairo_pose_run_v1.png'),
  },
  2: {
    idle: require('../../../assets/character/poses/kairo_pose_idle_v1.png'),
    walk: require('../../../assets/character/poses/kairo_pose_walk_v1.png'),
    run: require('../../../assets/character/poses/kairo_pose_run_v1.png'),
  },
  3: {
    idle: require('../../../assets/character/poses/kairo_pose_idle_v1.png'),
    walk: require('../../../assets/character/poses/kairo_pose_walk_v1.png'),
    run: require('../../../assets/character/poses/kairo_pose_run_v1.png'),
  },
  4: {
    idle: require('../../../assets/character/poses/kairo_pose_idle_v1.png'),
    walk: require('../../../assets/character/poses/kairo_pose_walk_v1.png'),
    run: require('../../../assets/character/poses/kairo_pose_run_v1.png'),
  },
};

export const KAIRO_STATE_ASSETS: Record<SleepState, ImageSourcePropType> = {
  sleepy: require('../../../assets/character/states/kairo_state_sleepy_v1.png'),
  normal: require('../../../assets/character/states/kairo_state_normal_v1.png'),
  well_rested: require('../../../assets/character/states/kairo_state_well_rested_v1.png'),
};

// Cosmetic entries are flattened full-character QA previews, not composable layers.
export const KAIRO_COSMETIC_ASSETS: Record<CosmeticId, ImageSourcePropType> = {
  runner_cap: require('../../../assets/character/cosmetics/cosmetic_head_runner_cap_v1.png'),
  woven_salakot: require('../../../assets/character/cosmetics/cosmetic_head_woven_salakot_v1.png'),
  leaf_crown: require('../../../assets/character/cosmetics/cosmetic_head_leaf_crown_v1.png'),
  round_glasses: require('../../../assets/character/cosmetics/cosmetic_face_round_glasses_v1.png'),
  flight_goggles: require('../../../assets/character/cosmetics/cosmetic_face_flight_goggles_v1.png'),
  sunlit_bandana: require('../../../assets/character/cosmetics/cosmetic_neck_sunlit_bandana_v1.png'),
  sampaguita_garland: require('../../../assets/character/cosmetics/cosmetic_neck_sampaguita_garland_v1.png'),
  trail_vest: require('../../../assets/character/cosmetics/cosmetic_body_trail_vest_v1.png'),
  woven_cape: require('../../../assets/character/cosmetics/cosmetic_back_woven_cape_v1.png'),
  trail_sneakers: require('../../../assets/character/cosmetics/cosmetic_feet_trail_sneakers_v1.png'),
  rain_boots: require('../../../assets/character/cosmetics/cosmetic_feet_rain_boots_v1.png'),
  firefly_aura: require('../../../assets/character/cosmetics/cosmetic_effect_firefly_aura_v1.png'),
};
