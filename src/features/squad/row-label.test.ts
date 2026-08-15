import { describe, expect, it } from 'vitest';
import { leaderboardRowLabel, type RowLabelInput } from './row-label.ts';

const statNames = {
  AGI: 'Agility',
  STR: 'Strength',
  END: 'Endurance',
  VIT: 'Vitality',
};

const base: RowLabelInput = {
  rank: 2,
  characterName: 'Jay',
  isSelf: false,
  level: 12,
  gap: 8400,
  ratings: { AGI: 41, STR: 27, END: 18, VIT: 9 },
  statNames,
};

describe('leaderboardRowLabel', () => {
  it('leads with position, because that is what a leaderboard is', () => {
    // Names first would make every row sound identical for the first second.
    expect(leaderboardRowLabel(base)).toMatch(/^Rank 2, Jay/);
  });

  it('says the gap before the detail', () => {
    const label = leaderboardRowLabel(base);
    expect(label.indexOf('8,400 behind')).toBeLessThan(label.indexOf('Agility'));
  });

  it('marks your own row the way the YOU chip does', () => {
    expect(leaderboardRowLabel({ ...base, isSelf: true })).toContain('Jay, you');
  });

  it('says a one-day streak in words that survive being read aloud', () => {
    // The row draws "1-day streak", which is correct on screen and wrong out
    // loud. This is the whole reason the string is built rather than scraped.
    expect(leaderboardRowLabel({ ...base, streakDays: 1 })).toContain('1 day streak');
    expect(leaderboardRowLabel({ ...base, streakDays: 5 })).toContain('5 day streak');
  });

  it('omits the streak entirely where the board omits it', () => {
    // The RPC returns today's streak whatever day is ranked, so the completed
    // board hides it rather than state a number about the wrong day.
    expect(leaderboardRowLabel(base)).not.toMatch(/streak/);
    expect(leaderboardRowLabel({ ...base, streakDays: 0 })).not.toMatch(/streak/);
  });

  it('does not hide the anti-cheat flag from a screen reader', () => {
    // Sighted squadmates can see it. Omitting it here would be the app
    // deciding some members get less information than others.
    expect(leaderboardRowLabel({ ...base, flagged: true })).toContain('flagged');
  });

  it('skips a stat with no rating rather than calling it zero', () => {
    // A partial ratings map is a real RPC response. "Vitality 0" would state
    // something the screen does not show.
    const label = leaderboardRowLabel({ ...base, ratings: { AGI: 41 } });
    expect(label).toContain('Agility 41');
    expect(label).not.toMatch(/Vitality/);
  });

  it('drops the ratings clause completely when there are none', () => {
    const label = leaderboardRowLabel({ ...base, ratings: {} });
    expect(label).not.toMatch(/Agility|Strength|Endurance|Vitality/);
    expect(label).toMatch(/Rank 2, Jay, 8,400 behind, Level 12/);
  });

  it('keeps the stats in the fixed order the rail uses', () => {
    // Not alphabetical, and not whatever order the map happens to iterate:
    // AGI STR END VIT is the order every other surface shows.
    const label = leaderboardRowLabel(base);
    expect(label).toMatch(/Agility 41, Strength 27, Endurance 18, Vitality 9/);
  });

  it('never says points', () => {
    const label = leaderboardRowLabel({
      rank: 2,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: 340,
      ratings: {},
      statNames,
    });
    expect(label).not.toContain('points');
  });

  it('says the gap for a row with someone above it', () => {
    const label = leaderboardRowLabel({
      rank: 2,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: 340,
      ratings: {},
      statNames,
    });
    expect(label).toContain('340 behind');
  });

  it('says nothing about a gap for the leader', () => {
    const label = leaderboardRowLabel({
      rank: 1,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: null,
      ratings: {},
      statNames,
    });
    expect(label).not.toContain('behind');
  });

  it('says nothing about a gap for a tied row', () => {
    const label = leaderboardRowLabel({
      rank: 1,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: 0,
      ratings: {},
      statNames,
    });
    // "0 behind" is a sentence no person says, and the row draws nothing in
    // the gap column for a tie — so the label must not invent something the
    // screen does not show. The shared rank already conveys the tie.
    expect(label).not.toContain('behind');
    expect(label).not.toContain('0');
  });
});
