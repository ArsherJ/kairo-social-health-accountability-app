import { describe, expect, it } from 'vitest';
import {
  PREVIEW_FIXTURES,
  previewDashboard,
  previewIdentity,
  previewMembers,
  previewSkyRacers,
  previewStreak,
} from './preview-data.ts';
import { PREVIEW_COPY, previewReadings } from './preview-copy.ts';

describe('isolated screen fixtures', () => {
  it('gives the dashboard real sample readings and the same three quest rules', () => {
    const board = previewDashboard('ready');
    expect(board.motion.figure).toBe('6,840');
    expect(board.motion.caption).toBe('3,160 to the ridge');
    expect(board.body.figure).toBe('342');
    expect(board.quests).toHaveLength(3);
  });
  it('keeps an empty night unknown and empty progress uncleared', () => {
    const board = previewDashboard('empty');
    expect(board.motion.figure).toBe('0');
    expect(board.motion.fraction).toBe(0);
    expect(board.mind.caption).toBe('No reading yet');
    expect(board.quests.every((entry) => !entry.state.met)).toBe(true);
  });
  it('keeps private members present without inventing zero readings', () => {
    const ready = previewMembers('ready');
    const privateRows = previewMembers('withheld');
    expect(privateRows.map((row) => row.user_id)).toEqual(ready.map((row) => row.user_id));
    expect(privateRows.every((row) => row.steps === null && row.active_kcal === null)).toBe(true);
    expect(ready.some((row) => row.steps !== null)).toBe(true);
  });
  it('keeps the current self reading consistent across Today, Sky, and Flock fixtures', () => {
    for (const fixture of ['standard', 'ridge', 'ceiling'] as const) {
      const todaySteps = previewDashboard('ready', fixture).day.steps;
      const flockSelf = previewMembers('ready', 'current', fixture).find((member) => member.is_self);
      const skySelf = previewSkyRacers('ready', fixture).racers.find((racer) => racer.isSelf);
      expect(flockSelf?.steps).toBe(todaySteps);
      expect(skySelf?.steps).toBe(todaySteps);
    }
    expect(previewMembers('ready', 'completed', 'ridge').find((member) => member.is_self)?.steps)
      .toBe(8421);
  });
  it('shows one unranked self in the empty flock', () => {
    const rows = previewMembers('empty');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ is_self: true, steps: 0 });
    expect(previewReadings(0, 0)).toBe('0 steps · 0 active kcal');
  });
  it('labels sample data explicitly without keeping a second tab registry', () => {
    expect(PREVIEW_COPY.sample).toContain('Sample data');
    expect(Object.values(PREVIEW_COPY).join(' ')).not.toMatch(
      /\b(AGI|STR|MND|Mastery|battle|boss)\b/,
    );
  });
  it('reaches the ridge and summit through the real living-mirror resolver', () => {
    const board = previewDashboard('ready', 'ridge');
    expect(board.mirror.motion.location).toBe('ridge');
    expect(board.mirror.figure).toEqual({ kind: 'pose', pose: 'summit' });
    expect(board.motion.fraction).toBe(1);
  });
  it('keeps the ceiling, reaction, and growth-cap sample internally consistent', () => {
    const board = previewDashboard('ready', 'ceiling');
    const empty = previewDashboard('empty', 'ceiling');
    expect(board.ceilingReached).toBe(true);
    expect(board.reaction?.kind).toBe('level');
    expect(board.mirror.figure).toEqual({ kind: 'pose', pose: 'race_victory' });
    expect(board.level).toBeGreaterThan(40);
    expect(empty).toMatchObject({ ceilingReached: false, level: 1, reaction: null });
  });
  it('keeps an absent sleep reading unknown and out of the character state', () => {
    const board = previewDashboard('ready', 'no-sleep');
    expect(board.mind.caption).toBe('No reading yet');
    expect(board.mirror.mind).toMatchObject({ visible: false, minutes: null });
  });
  it('puts a maximum-length name through every shared preview adapter', () => {
    const identity = previewIdentity('long-name');
    const members = previewMembers('ready', 'current', 'long-name');
    expect(identity.name).toHaveLength(20);
    expect(members.every((member) => member.character_name.length === 20)).toBe(true);
    expect(members.find((member) => member.is_self)?.character_name).toBe(identity.name);
    expect(Object.fromEntries(previewMembers('ready', 'completed', 'long-name')
      .map((member) => [member.user_id, member.character_name])))
      .toEqual(Object.fromEntries(members.map((member) => [member.user_id, member.character_name])));
    expect(PREVIEW_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'standard', 'long-name', 'ridge', 'ceiling', 'no-sleep', 'ghosts',
    ]);
  });
  it('builds solo ghost days through the real race resolver', () => {
    const { racers, ghostIndexes } = previewSkyRacers('ready', 'ghosts');
    expect(racers.filter((racer) => racer.isSelf)).toHaveLength(1);
    expect(racers.filter((racer) => racer.isGhost)).toHaveLength(3);
    expect(ghostIndexes).toEqual(racers.flatMap((racer, index) => racer.isGhost ? [index] : []));
  });
  it('exposes locked, banked, and recharging shield samples', () => {
    expect(previewStreak('standard')?.current_streak).toBe(4);
    expect(previewStreak('ridge')?.current_streak).toBe(5);
    expect(previewStreak('ceiling')?.shield_available_on).not.toBeNull();
  });
});
