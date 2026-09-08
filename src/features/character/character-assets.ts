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
 * **Stage 4 keeps the pose art it already had**, and the other three are issue
 * #31's nine renders under `assets/character/stages/`. Nine and not three
 * because `staticFigureSelection` applies the stage to `{ kind: 'pose' }` only
 * and `motionPose()` always answers, so one image per stage would be the one
 * that hardly ever draws. The file names are `GROWTH_STAGE_NAMES` crossed with
 * `STAGE_POSES`, and `scripts/generate_stage_art.py` is what produced them:
 * each is an identity-preserving edit of the adult render for that same pose,
 * re-laid out against the adult's own bounding box, so the canvas, the centre
 * line, the ground line and the figure height are the adult's and no screen
 * moved for them.
 */
export const KAIRO_STAGE_ASSETS: Record<EvolutionStage, Record<StagePose, ImageSourcePropType>> = {
  1: {
    idle: require('../../../assets/character/stages/kairo_stage_hatchling_idle_v1.png'),
    walk: require('../../../assets/character/stages/kairo_stage_hatchling_walk_v1.png'),
    run: require('../../../assets/character/stages/kairo_stage_hatchling_run_v1.png'),
  },
  2: {
    idle: require('../../../assets/character/stages/kairo_stage_fledgling_idle_v1.png'),
    walk: require('../../../assets/character/stages/kairo_stage_fledgling_walk_v1.png'),
    run: require('../../../assets/character/stages/kairo_stage_fledgling_run_v1.png'),
  },
  3: {
    idle: require('../../../assets/character/stages/kairo_stage_juvenile_idle_v1.png'),
    walk: require('../../../assets/character/stages/kairo_stage_juvenile_walk_v1.png'),
    run: require('../../../assets/character/stages/kairo_stage_juvenile_run_v1.png'),
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

/**
 * The **crest mask** beside every render above.
 *
 * A mask is the same 570×636 canvas with the fan of head feathers in its alpha
 * and white everywhere it is opaque, so `<Image tintColor>` paints the crest
 * the hue of the player's dominant stat and nothing else (issue #33). Two
 * eagles in a flock stop looking identical without a second set of artwork.
 *
 * **Generated, not drawn.** `scripts/generate_crest_masks.py` reads the art and
 * writes `assets/character/crests/crest_<the art's own filename>`; the name is
 * the mapping, and `character-assets.test.ts` builds each expected path from
 * the art registry rather than restating it, so a render with no mask beside it
 * is a red test rather than a tint that sits next to somebody's head. Rerun the
 * script after any change to the art it reads — the nine growth-stage images of
 * issue #31 included.
 *
 * The same literal-`require` rule applies for the same reason: Metro resolves
 * `require` statically, so a computed path is a blank image on a device and
 * nothing at build time.
 */
export const KAIRO_BASE_CREST: ImageSourcePropType =
  require('../../../assets/character/crests/crest_kairo_base_front_v1.png');

export const KAIRO_POSE_CRESTS: Record<KairoPose, ImageSourcePropType> = {
  idle: require('../../../assets/character/crests/crest_kairo_pose_idle_v1.png'),
  sleep: require('../../../assets/character/crests/crest_kairo_pose_sleep_v1.png'),
  walk: require('../../../assets/character/crests/crest_kairo_pose_walk_v1.png'),
  run: require('../../../assets/character/crests/crest_kairo_pose_run_v1.png'),
  workout: require('../../../assets/character/crests/crest_kairo_pose_workout_v1.png'),
  race_victory: require('../../../assets/character/crests/crest_kairo_pose_race_victory_v1.png'),
};

/**
 * Stage × pose, mirroring `KAIRO_STAGE_ASSETS` cell for cell — a crest belongs
 * to one drawing, so the two tables move together, and the test rebuilds every
 * path here from the *art* table rather than reading this one, so they cannot
 * drift apart. Stage 4 shares the adult pose masks because it shares the adult
 * pose art.
 */
export const KAIRO_STAGE_CRESTS: Record<EvolutionStage, Record<StagePose, ImageSourcePropType>> = {
  1: {
    idle: require('../../../assets/character/crests/crest_kairo_stage_hatchling_idle_v1.png'),
    walk: require('../../../assets/character/crests/crest_kairo_stage_hatchling_walk_v1.png'),
    run: require('../../../assets/character/crests/crest_kairo_stage_hatchling_run_v1.png'),
  },
  2: {
    idle: require('../../../assets/character/crests/crest_kairo_stage_fledgling_idle_v1.png'),
    walk: require('../../../assets/character/crests/crest_kairo_stage_fledgling_walk_v1.png'),
    run: require('../../../assets/character/crests/crest_kairo_stage_fledgling_run_v1.png'),
  },
  3: {
    idle: require('../../../assets/character/crests/crest_kairo_stage_juvenile_idle_v1.png'),
    walk: require('../../../assets/character/crests/crest_kairo_stage_juvenile_walk_v1.png'),
    run: require('../../../assets/character/crests/crest_kairo_stage_juvenile_run_v1.png'),
  },
  4: {
    idle: require('../../../assets/character/crests/crest_kairo_pose_idle_v1.png'),
    walk: require('../../../assets/character/crests/crest_kairo_pose_walk_v1.png'),
    run: require('../../../assets/character/crests/crest_kairo_pose_run_v1.png'),
  },
};

export const KAIRO_STATE_CRESTS: Record<SleepState, ImageSourcePropType> = {
  sleepy: require('../../../assets/character/crests/crest_kairo_state_sleepy_v1.png'),
  normal: require('../../../assets/character/crests/crest_kairo_state_normal_v1.png'),
  well_rested: require('../../../assets/character/crests/crest_kairo_state_well_rested_v1.png'),
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
