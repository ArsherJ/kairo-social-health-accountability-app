import { expect, it } from 'vitest';
import { profileHeaderLabel } from './profile-header-copy.ts';

it('speaks identity once and does not invent a join date', () => {
  const label = profileHeaderLabel({
    name: 'Dagit',
    species: 'A Philippine eagle',
    level: 12,
    toNext: 380,
    joined: null,
  });

  expect(label).toBe('Dagit. A Philippine eagle. Level 12. 380 XP to the next.');
  expect(label).not.toMatch(/undefined|null|Joined/);
});

it('includes available joined metadata in the one identity reading', () => {
  expect(profileHeaderLabel({
    name: 'Dagit',
    species: 'A Philippine eagle',
    level: 12,
    toNext: 1380,
    joined: 'Joined September 2026',
  })).toBe(
    'Dagit. A Philippine eagle. Joined September 2026. Level 12. 1,380 XP to the next.',
  );
});
