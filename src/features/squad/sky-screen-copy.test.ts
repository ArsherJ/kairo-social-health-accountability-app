import { describe, expect, it } from 'vitest';
import { RACE_FINISH_LINE } from '@kairo/core';
import { SKY_SCREEN_COPY } from './sky-screen-copy.ts';

it('describes the shared finish line in real units', () => {
  expect(SKY_SCREEN_COPY.explanation).toContain(RACE_FINISH_LINE.toLocaleString('en-US'));
});

describe('the flock rail', () => {
  // A player with no squad races ghosts — their own recent days — and the
  // rail over the flight said "your flock" regardless, so the faded birds
  // read as strangers, or as a bug. The title names whose birds they are and
  // one line says what a faded one is.
  it('has a title for a flock and a title for your own past days', () => {
    expect(SKY_SCREEN_COPY.railFlock).toBe('YOUR FLOCK TODAY');
    expect(SKY_SCREEN_COPY.railGhosts).toBe('YOUR RECENT DAYS');
  });

  it('says a faded bird is one of your own past days', () => {
    expect(SKY_SCREEN_COPY.railGhostsNote).toMatch(/faded bird/);
    expect(SKY_SCREEN_COPY.railGhostsNote).toMatch(/past days/);
  });
});

it('speaks only the current surface vocabulary', () => {
  expect(Object.values(SKY_SCREEN_COPY).join(' ')).not.toMatch(/\b(AGI|STR|MND|boss|battle)\b/i);
});
