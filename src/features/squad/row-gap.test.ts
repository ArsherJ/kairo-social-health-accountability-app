import { describe, expect, it } from 'vitest';
import { leaderboardGaps } from './row-gap.ts';

describe('leaderboardGaps', () => {
  it('gives the leader no gap', () => {
    const gaps = leaderboardGaps([
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 2, total: 2400 },
    ]);
    expect(gaps.get('a')).toBeNull();
  });

  it('measures each row against the row above it', () => {
    const gaps = leaderboardGaps([
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 2, total: 2400 },
      { user_id: 'c', rank: 3, total: 2000 },
    ]);
    expect(gaps.get('b')).toBe(600);
    expect(gaps.get('c')).toBe(400);
  });

  it('gives tied rows a zero gap, not a negative one', () => {
    // squad_leaderboard shares a rank between tied members.
    const gaps = leaderboardGaps([
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 1, total: 3000 },
      { user_id: 'c', rank: 3, total: 2500 },
    ]);
    expect(gaps.get('b')).toBe(0);
    // Measured against the best total above it, not the row literally before.
    expect(gaps.get('c')).toBe(500);
  });

  it('handles an unsorted input', () => {
    const gaps = leaderboardGaps([
      { user_id: 'c', rank: 3, total: 2000 },
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 2, total: 2400 },
    ]);
    expect(gaps.get('c')).toBe(400);
  });

  it('returns an empty map for an empty board', () => {
    expect(leaderboardGaps([]).size).toBe(0);
  });
});
