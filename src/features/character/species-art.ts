import type { ImageSourcePropType } from 'react-native';
import type { SpeciesId } from './species.ts';

/**
 * Character art, keyed by species id.
 *
 * **Written out literally rather than built from the id**, for the same reason
 * `CHARACTER_ART` and `ANCHORS` were: Metro resolves `require` statically, so a
 * computed path is not a path it can follow — a template string here is a
 * runtime miss, not a bundling error, and fails silently on device.
 *
 * Separate from `species.ts` because that module imports nothing at runtime so
 * root Vitest can test it; a `require` of a PNG would end that.
 *
 * **Interim state (2026-08-28):** every species points at the single static
 * base render `assets/character/base/kairo_base_front_v1.png` while the Rive
 * character is authored (see the 2026-08-27 character asset system plan). The
 * per-species habitat backdrops were retired at the same time — the diorama
 * falls back to its sage sky. When Rive lands, this map is where the real
 * per-species art (or the one shared `.riv`) reconnects, file-for-file.
 */
const KAIRO_BASE = require('../../../assets/character/base/kairo_base_front_v1.png') as ImageSourcePropType;

export const SPECIES_FIGURES: Record<SpeciesId, ImageSourcePropType> = {
  pilandok: KAIRO_BASE,
  tamaraw: KAIRO_BASE,
  carabao: KAIRO_BASE,
  eagle: KAIRO_BASE,
};
