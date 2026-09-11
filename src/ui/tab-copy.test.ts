import { expect, it } from 'vitest';
import { TAB_ITEMS } from './tab-copy.ts';

it('keeps the four routes and player-facing names', () => {
  expect(TAB_ITEMS.map(({ id, label }) => [id, label])).toEqual([
    ['index', 'Today'],
    ['sky', 'Sky'],
    ['flock', 'Flock'],
    ['profile', 'You'],
  ]);
});
