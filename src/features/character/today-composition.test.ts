import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/(tabs)/index.tsx', 'utf8');
const boardSource = readFileSync('src/features/character/TodayBoard.tsx', 'utf8');

/**
 * Today's composition, as the dashboard (deviation #72, over #59).
 *
 * A source scan, because the screen is a component file root Vitest cannot
 * load. What it holds is the shape the deviation argues for and the rules the
 * Living Mirror left in place: the scene, the sentence, the tiles, the quest
 * rows and the details sheet — and nothing the Sky or You owns.
 */
describe('Today dashboard composition', () => {
  it('renders the scene, the sentence, the tiles, the quest rows and the details', () => {
    expect(source).toContain('<TodayProgressHero');
    expect(source).toContain('<Diorama');
    expect(source).toContain('<TodayNextStep');
    expect(source).toContain('<TodayTiles');
    expect(source).toContain('<QuestRows');
    expect(source).toContain('<TodayDetailsSheet');
  });

  it('keeps Motion in the progress hero rather than the supporting tiles', () => {
    expect(boardSource).not.toContain('motion: TileReading');
  });

  it('composes every tile through the tested module, never inline', () => {
    expect(source).toContain('motionReading(');
    expect(source).toContain('bodyReading(');
    expect(source).toContain('mindReading(');
  });

  it('does not reintroduce race or Mastery surfaces — the Sky and You own those', () => {
    expect(source).not.toMatch(/StatCoin|StatRail|RaceLine|SkyStanding|LeaderboardRow/);
    expect(source).not.toMatch(/useSquadLeaderboard|useOwnRecentDays|rankRacers|ghostRivals/);
  });

  it('keeps the presence-ring inputs the figure still needs', () => {
    expect(source).toContain('dominance');
    expect(source).toContain('lifetimePoints');
  });

  it('never writes the Daily Walk baseline as a literal', () => {
    expect(source).not.toMatch(/10[,_]?000/);
  });

  it('reads the ridge through the walk state rather than a second derivation', () => {
    expect(source).toMatch(/dailyWalkState\(/);
    expect(source).not.toMatch(/RACE_FINISH_LINE/);
  });
});
