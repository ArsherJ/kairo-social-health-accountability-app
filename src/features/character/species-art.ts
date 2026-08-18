import type { ImageSourcePropType } from 'react-native';
import type { SpeciesId } from './species.ts';

/**
 * Species art, keyed by id.
 *
 * **Written out literally rather than built from the id**, for the same reason
 * `CHARACTER_ART` and `ANCHORS` were: Metro resolves `require` statically, so a
 * computed path is not a path it can follow — a template string here is a
 * runtime miss, not a bundling error, and fails silently on device.
 *
 * Separate from `species.ts` because that module imports nothing at runtime so
 * root Vitest can test it; a `require` of a PNG would end that.
 *
 * Placeholder art as of 2026-08-18. Real art swaps in file-for-file with no
 * code change — the contract is: transparent, up to 2:1 portrait for a figure,
 * and **no ground shadow baked in**, because `GroundShadow` draws it keyed to
 * level stage. Baking one in is what would make a single asset read wrong at
 * three of the four stages.
 */
export const SPECIES_FIGURES: Record<SpeciesId, ImageSourcePropType> = {
  pilandok: require('../../../assets/character/species/pilandok.png'),
  tamaraw: require('../../../assets/character/species/tamaraw.png'),
  carabao: require('../../../assets/character/species/carabao.png'),
  eagle: require('../../../assets/character/species/eagle.png'),
};

export const SPECIES_HABITATS: Record<SpeciesId, ImageSourcePropType> = {
  pilandok: require('../../../assets/character/species/habitat-pilandok.png'),
  tamaraw: require('../../../assets/character/species/habitat-tamaraw.png'),
  carabao: require('../../../assets/character/species/habitat-carabao.png'),
  eagle: require('../../../assets/character/species/habitat-eagle.png'),
};
