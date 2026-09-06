import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE } from '@kairo/core';
import { walkNote } from '../train/daily-walk.ts';
import { todayDetails } from './today-details.ts';

const WALK_BODY = walkNote({
  todaySteps: 4_321, baseline: DAILY_STEP_BASELINE, fraction: 0.43,
  remaining: DAILY_STEP_BASELINE - 4_321, met: false, streak: 4,
});

const base = {
  totals: { steps: 4_321, distanceM: 3_250, activeKcal: 245, activeMinutes: 30, activeHours: 3 },
  verifiedStrengthMinutes: 45,
  hasSleepSource: true,
  sleepMinutes: 450,
  dailyWalkRun: 4,
  dailyWalkNote: WALK_BODY,
  motionNote: null,
  quests: [],
  selectedQuestIndex: null,
  droppedStepSources: [] as string[],
  flagged: false,
};

describe('todayDetails — a flagged day', () => {
  const motionRows = (flagged: boolean) =>
    todayDetails({ ...base, flagged }).find((section) => section.id === 'motion')!.rows;

  it('says nothing on an ordinary day', () => {
    expect(motionRows(false).some((row) => row.id === 'flagged')).toBe(false);
  });

  // The accused hears it first: on their own day's details, before the chip
  // every squadmate sees.
  it('tells the flagged player, in plain language, on their own screen', () => {
    const note = motionRows(true).find((row) => row.id === 'flagged');
    expect(note?.value).toBe(
      "Some of today's hours don't look like walking, so today can't set a personal best — and your flock sees a flag on your row.",
    );
  });

  it('claims only what a flag actually does', () => {
    // A flag is a social signal, never a score reduction (§20, `trust.ts`): a
    // flagged day still ranks on the board, still flies the corridor and still
    // pays XP, Mastery and the streak. The design's own draft said the hours
    // "won't count towards the flock", which is the one thing that is not true
    // — so the sentence may name the record and the chip, and nothing else.
    const value = motionRows(true).find((row) => row.id === 'flagged')!.value;
    expect(value).toContain('personal best');
    expect(value.toLowerCase()).not.toMatch(/won't count|not count|doesn't count/);
  });

  // Deliberately **not** held to the dropped-sources row's ban on accusing
  // words two describes below. That line reports an inert exclusion and must
  // never read as suspicion; this one is the flag, which §20 makes a social
  // signal — an accusation, stated plainly, to the person accused. Widening
  // that ban across the file would break this row.
  it('names no rule, no threshold and no figure', () => {
    // One sentence, two rules behind it. The player is told the consequence,
    // not which ceiling an hour crossed — the flag column is a boolean for the
    // same reason.
    const value = motionRows(true).find((row) => row.id === 'flagged')!.value;
    expect(value).not.toMatch(/\d/);
    expect(value.toLowerCase()).not.toMatch(/ceiling|threshold|limit|implausible/);
  });
});

describe('todayDetails — uncounted step sources', () => {
  const motionRows = (dropped: string[]) =>
    todayDetails({ ...base, droppedStepSources: dropped })
      .find((section) => section.id === 'motion')!.rows;

  it('says nothing when every source counted', () => {
    expect(motionRows([]).some((row) => row.id === 'dropped-sources')).toBe(false);
  });

  it('names one dropped app', () => {
    const note = motionRows(['Mi Fitness']).find((row) => row.id === 'dropped-sources');
    expect(note?.value).toBe("Steps from Mi Fitness aren't counted yet.");
  });

  it('joins two with "and", and three with commas', () => {
    expect(motionRows(['Mi Fitness', 'Zepp']).at(-1)?.value)
      .toBe("Steps from Mi Fitness and Zepp aren't counted yet.");
    expect(motionRows(['Mi Fitness', 'Zepp', 'Amazfit']).at(-1)?.value)
      .toBe("Steps from Mi Fitness, Zepp and Amazfit aren't counted yet.");
  });

  it('states the fact and never accuses', () => {
    // The exclusion is inert. The Philippine market runs cheap bands that write
    // under their own identifiers, and wording this as suspicion would accuse
    // the target market of cheating for owning its own hardware.
    const value = motionRows(['Mi Fitness']).at(-1)!.value.toLowerCase();
    for (const accusation of ['cheat', 'invalid', 'not allowed', 'rejected', 'untrusted', 'suspicious', 'blocked']) {
      expect(value, `the line accuses: ${accusation}`).not.toContain(accusation);
    }
  });

  it('keeps the Daily Walk sentence readable when a note follows it', () => {
    const rows = motionRows(['Mi Fitness']);
    expect(rows.at(-1)?.id).toBe('dropped-sources');
    expect(rows.some((row) => row.id === 'walk-note')).toBe(true);
  });
});

describe('todayDetails', () => {
  it('separates personal Streak from the Daily Walk run and uses raw units', () => {
    const sections = todayDetails(base);
    expect(sections.find((section) => section.id === 'motion')?.rows.map((row) => row.value))
      .toEqual(['4,321 steps', '3.3 km', '4 days', WALK_BODY]);
    expect(JSON.stringify(sections)).not.toContain('Streak');
  });

  it('keeps one sentence explaining what the Daily Walk is', () => {
    // Deleting `DailyWalkCard` otherwise removes the only place in the running
    // app that says the baseline is fixed. The sentence is reused, not rewritten.
    const walk = todayDetails(base).find((s) => s.id === 'motion')?.rows.at(-1);
    expect(walk?.value).toBe(WALK_BODY);
    expect(walk?.value).toContain(DAILY_STEP_BASELINE.toLocaleString());
  });

  it('shows verified strength minutes only when positive', () => {
    expect(JSON.stringify(todayDetails(base))).toContain('45 min');
    expect(JSON.stringify(todayDetails({ ...base, verifiedStrengthMinutes: 0 }))).not.toContain('Strength session');
  });

  it('removes Mind completely without capability or a verified reading', () => {
    for (const patch of [{ hasSleepSource: false }, { sleepMinutes: null }]) {
      expect(todayDetails({ ...base, ...patch }).some((section) => section.id === 'mind')).toBe(false);
    }
  });

  it('shows a Motion explanation only when the scoring shift is relevant', () => {
    expect(JSON.stringify(todayDetails({ ...base, motionNote: 'Motion eased after three active hours.' })))
      .toContain('Motion eased after three active hours.');
    expect(JSON.stringify(todayDetails(base))).not.toContain("Today's Motion");
  });

  it('never emits score totals, tiers, XP, or engine keys', () => {
    const json = JSON.stringify(todayDetails(base));
    expect(json).not.toMatch(/bronze|silver|gold|\bXP\b|score total/i);
    // Case-sensitive and word-bounded. A loose `/str/i` matches the "Verified
    // strength session" row the test above requires, and `/agi/i` matches
    // "Dagit" — a guard that fails on real input gets loosened until it guards
    // nothing.
    expect(json).not.toMatch(/\b(AGI|STR|MND)\b/);
  });
});
