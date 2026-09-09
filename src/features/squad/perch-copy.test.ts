import { describe, expect, it } from 'vitest';
import { FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { birdLabel, PERCH_COPY, perchDayLine, perchLead, perchStatsLabel } from './perch-copy.ts';

describe('perch copy', () => {
  it('never gives a private reading a zero or a solo player a standing', () => {
    expect(perchDayLine(null, 'current')).toBe('Not sharing');
    expect(perchDayLine(0, 'current')).toBe('0 steps today');
    expect(perchLead('current', 1, 1)).toBeNull();
    expect(perchLead('completed', 2, 4)).toBe('2 of 4 walked yesterday.');
  });
  it('names the action and derives the flock capacity', () => {
    expect(birdLabel('Dagit', 6, true)).toContain('send a whack');
    expect(birdLabel('Rty', 2)).not.toContain('whack');
    expect(PERCH_COPY.capacity).toContain(String(FREE_SQUAD_MAX_MEMBERS));
    expect(Object.values(PERCH_COPY).join(' ')).not.toMatch(
      /\b(AGI|STR|MND|Mastery|record|battle|boss)\b/i,
    );
  });
  it('speaks visual social states and human stat names', () => {
    expect(birdLabel('Dagit', 6, false, { leader: true, whacked: true })).toContain(
      'Leading this board. Feathers ruffled today.',
    );
    const ratings = perchStatsLabel({ AGI: 1000, STR: 2000, MND: 3000 });
    expect(ratings).toContain('Motion');
    expect(ratings).toContain('Body');
    expect(ratings).toContain('Mind');
    expect(ratings).not.toMatch(/\b(AGI|STR|MND)\b/);
  });
});
