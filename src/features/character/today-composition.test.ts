import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('Today Living Mirror composition', () => {
  it('renders the scene, one next step, and optional details', () => {
    expect(source).toContain('<Diorama');
    expect(source).toContain('<TodayNextStep');
    expect(source).toContain('<TodayDetailsSheet');
  });

  it('does not reintroduce dashboard or race surfaces', () => {
    expect(source).not.toMatch(/QuestRings|TodayStatCoins|TodayTiles|DailyWalkCard|TrainEntry|RaceLine|FirstSyncCallout/);
    expect(source).not.toMatch(/useSquadLeaderboard|useOwnRecentDays|rankRacers|ghostRivals/);
  });

  it('keeps the presence-ring inputs Task 7 still needs', () => {
    expect(source).toContain('dominance');
    expect(source).toContain('lifetimePoints');
  });

  it('never writes the Daily Walk baseline as a literal', () => {
    expect(source).not.toMatch(/10[,_]?000/);
  });
});
