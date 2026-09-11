import type { ImageSourcePropType } from 'react-native';

import type { KairoPose, SleepState } from './character-contract';

/**
 * Every checked-in KAIRO render, and the crest mask that belongs to it.
 *
 * **Written out as literal `require`s, and it has to stay that way.** Metro
 * resolves `require` statically, so `require(`...${pose}...`)` is not a path it
 * can follow — a computed path is a runtime miss on device, not a bundling
 * error, which is the same trap `species-art.ts` records. The `Record<…>` types
 * are the other half: a missing cell fails `tsc`, and a cell naming a file that
 * is not there fails the bundle. Neither can render blank.
 *
 * **The filenames carry no version suffix** (deviation #73). A version in a
 * filename only earns its place while two versions coexist, and the one time
 * that was true here it produced three folders where "v1", "v2" and "v3" meant
 * different things in different documents. Git holds the history.
 *
 * **There is no growth-stage table any more**, and no cosmetics table. The
 * stage axis draws the adult art at every stage and reads `figureResponse`'s
 * `bodyScale` for size; the cosmetics were flattened previews of a feature that
 * was never built. Both went with deviation #73 — see `staticFigureSelection`
 * for what replaced the stage branch.
 */
export const KAIRO_BASE_ASSET: ImageSourcePropType =
  require('../../../assets/character/base/kairo_base_front.png');

export const KAIRO_POSE_ASSETS: Record<KairoPose, ImageSourcePropType> = {
  idle: require('../../../assets/character/poses/kairo_pose_idle.png'),
  sleep: require('../../../assets/character/poses/kairo_pose_sleep.png'),
  walk: require('../../../assets/character/poses/kairo_pose_walk.png'),
  run: require('../../../assets/character/poses/kairo_pose_run.png'),
  workout: require('../../../assets/character/poses/kairo_pose_workout.png'),
  race_victory: require('../../../assets/character/poses/kairo_pose_race_victory.png'),
  summit: require('../../../assets/character/poses/kairo_pose_summit.png'),
};

export const KAIRO_STATE_ASSETS: Record<SleepState, ImageSourcePropType> = {
  sleepy: require('../../../assets/character/states/kairo_state_sleepy.png'),
  normal: require('../../../assets/character/states/kairo_state_normal.png'),
  well_rested: require('../../../assets/character/states/kairo_state_well_rested.png'),
};

/**
 * One mask per render, mirroring the tables above cell for cell.
 *
 * A mask belongs to exactly one drawing — `generate_crest_masks.py` finds the
 * crest by geometry in the art it is generated from — so the tables move
 * together, and `character-assets.test.ts` rebuilds every path here from the
 * *art* table rather than reading this one, so the two cannot drift apart.
 */
export const KAIRO_BASE_CREST: ImageSourcePropType =
  require('../../../assets/character/crests/crest_kairo_base_front.png');

export const KAIRO_POSE_CRESTS: Record<KairoPose, ImageSourcePropType> = {
  idle: require('../../../assets/character/crests/crest_kairo_pose_idle.png'),
  sleep: require('../../../assets/character/crests/crest_kairo_pose_sleep.png'),
  walk: require('../../../assets/character/crests/crest_kairo_pose_walk.png'),
  run: require('../../../assets/character/crests/crest_kairo_pose_run.png'),
  workout: require('../../../assets/character/crests/crest_kairo_pose_workout.png'),
  race_victory: require('../../../assets/character/crests/crest_kairo_pose_race_victory.png'),
  summit: require('../../../assets/character/crests/crest_kairo_pose_summit.png'),
};

export const KAIRO_STATE_CRESTS: Record<SleepState, ImageSourcePropType> = {
  sleepy: require('../../../assets/character/crests/crest_kairo_state_sleepy.png'),
  normal: require('../../../assets/character/crests/crest_kairo_state_normal.png'),
  well_rested: require('../../../assets/character/crests/crest_kairo_state_well_rested.png'),
};
