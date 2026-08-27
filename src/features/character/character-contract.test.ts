import { describe, expect, it } from 'vitest';
import animations from '../../../data/animations.json';
import character from '../../../data/character.json';
import cosmetics from '../../../data/cosmetics.json';
import {
  COSMETIC_SLOTS,
  KAIRO_POSES,
  KAIRO_REACTIONS,
  SLEEP_STATES,
  STRENGTH_TIERS,
  validateCharacterManifests,
} from './character-contract.ts';

describe('KAIRO character contract', () => {
  it('has the approved semantic surface', () => {
    expect(SLEEP_STATES).toEqual(['sleepy', 'normal', 'well_rested']);
    expect(STRENGTH_TIERS).toEqual(['slim', 'fit', 'strong']);
    expect(KAIRO_POSES).toEqual([
      'idle',
      'sleep',
      'walk',
      'run',
      'workout',
      'race_victory',
    ]);
    expect(KAIRO_REACTIONS).toEqual([
      'happy',
      'excited',
      'tired',
      'victory',
      'level_up',
    ]);
    expect(COSMETIC_SLOTS).toEqual([
      'body',
      'feet',
      'back',
      'neck',
      'face',
      'head',
      'effect',
    ]);
    expect(KAIRO_POSES).not.toContain('level_up');
  });

  it('validates every checked-in manifest as one contract', () => {
    expect(validateCharacterManifests({ character, cosmetics, animations })).toEqual([]);
  });

  it('rejects an unapproved runtime property with a path-specific diagnostic', () => {
    expect(
      validateCharacterManifests({
        character: {
          ...character,
          properties: {
            ...character.properties,
            mood: { path: 'appearance/mood', type: 'enum' },
          },
        },
        cosmetics,
        animations,
      }),
    ).toEqual(['character.properties.mood must not be declared']);
  });

  it('rejects an unapproved cosmetic property with a path-specific diagnostic', () => {
    expect(
      validateCharacterManifests({
        character: {
          ...character,
          cosmeticProperties: {
            ...character.cosmeticProperties,
            aura: { path: 'cosmetics/aura', type: 'enum', order: 110 },
          },
        },
        cosmetics,
        animations,
      }),
    ).toEqual(['character.cosmeticProperties.aura must not be declared']);
  });

  it('registers all 12 cosmetics for all six poses', () => {
    expect(cosmetics.items).toHaveLength(12);
    for (const item of cosmetics.items) {
      expect(item.compatiblePoses).toEqual(KAIRO_POSES);
    }
  });

  it('keeps level-up and victory semantics distinct', () => {
    expect(animations.poses.map((entry) => entry.id)).toContain('race_victory');
    expect(animations.poses.map((entry) => entry.id)).not.toContain('level_up');
    expect(animations.reactions.map((entry) => entry.id)).toContain('level_up');
    expect(animations.reactions.map((entry) => entry.id)).toContain('victory');
  });
});
