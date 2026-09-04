import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_PRIVACY_NOTE,
  calibrationNote,
  questDifficultyHelp,
} from './calibration-copy.ts';

describe('calibrationNote', () => {
  it('states the measurement and the proposal in one sentence', () => {
    const note = calibrationNote({
      outcome: 'proposed',
      tier: 'steady',
      medianSteps: 6_240,
    });

    expect(note?.line).toBe("Your typical day is 6,240 steps. We'd start you on Steady.");
  });

  it('rounds the half step an even window produces', () => {
    const note = calibrationNote({ outcome: 'proposed', tier: 'steady', medianSteps: 7_050.5 });
    expect(note?.line).toContain('7,051 steps');
    // No decimal point in the figure — a "7,050.5 steps" typical day reads as
    // a rounding artefact rather than as a measurement.
    expect(note?.line).not.toMatch(/\d\.\d/);
  });

  /*
    The three states are genuinely different sentences, and the third is the
    one that is easy to get wrong: a run where calibration never happened —
    the ask was skipped, or the platform has no health source — must say
    nothing at all, because volunteering "we could not measure you" to somebody
    who never let it try is an accusation.
  */
  it('says nothing at all when no reading was taken', () => {
    expect(calibrationNote(null)).toBeNull();
  });

  it('hands a thin fortnight to Automatic without blaming anybody', () => {
    const note = calibrationNote({ outcome: 'no-history' });
    expect(note?.line).toContain('Automatic');

    // HealthKit does not report a read-permission denial, so neither a refusal
    // nor a failed read is knowable from here. A sentence asserting either
    // would be believed.
    for (const forbidden of [
      /could ?n'?o?t read/i,
      /unable to/i,
      /denied/i,
      /you did ?n'?o?t/i,
      /permission/i,
      /failed/i,
      /error/i,
    ]) {
      expect(note?.line, `no-history claims too much: ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('carries the same privacy claim on every state it speaks at all', () => {
    expect(calibrationNote({ outcome: 'no-history' })?.privacy).toBe(CALIBRATION_PRIVACY_NOTE);
    expect(
      calibrationNote({ outcome: 'proposed', tier: 'strong', medianSteps: 14_000 })?.privacy,
    ).toBe(CALIBRATION_PRIVACY_NOTE);
  });

  it('claims only what is true — read here, and one setting saved', () => {
    expect(CALIBRATION_PRIVACY_NOTE).toMatch(/on your phone/i);
    expect(CALIBRATION_PRIVACY_NOTE).toMatch(/only the size/i);
  });

  it('names no engine key', () => {
    // Case-sensitive and word-bounded: a loose `/str/i` matches "Starter".
    const spoken = [
      calibrationNote({ outcome: 'no-history' }),
      calibrationNote({ outcome: 'proposed', tier: 'starter', medianSteps: 2_000 }),
      calibrationNote({ outcome: 'proposed', tier: 'steady', medianSteps: 8_000 }),
      calibrationNote({ outcome: 'proposed', tier: 'strong', medianSteps: 14_000 }),
    ]
      .flatMap((note) => (note ? [note.line, note.privacy] : []))
      .join(' ');

    expect(spoken).not.toMatch(/\b(AGI|STR|MND)\b/);
  });
});

describe('questDifficultyHelp', () => {
  /*
    One sentence cannot be true of both cohorts, and the unconditional version
    shipped in this feature's own first pass: it told an account on Automatic
    that its recent days had been read, on a card whose value says "Auto".
  */
  it('tells an account on Automatic what actually decides its size', () => {
    const help = questDifficultyHelp(null);

    expect(help).toMatch(/how long you have been here/);
    // It has never been read, so it may not be told that it was.
    expect(help).not.toMatch(/your (recent )?days/i);
    expect(help).not.toMatch(/\bmeasured\b|\bsized\b|\bset once\b/i);
  });

  it('tells a calibrated account its size was seeded and stays put', () => {
    const help = questDifficultyHelp('steady');

    expect(help).toMatch(/once/);
    expect(help).toMatch(/stays there|leaves it/);
    // Automatic is still a real choice on this screen, so the line names it.
    expect(help).toMatch(/Automatic/);
  });

  it('promises the override wins, in both states', () => {
    for (const override of [null, 'starter', 'steady', 'strong'] as const) {
      expect(questDifficultyHelp(override)).toMatch(/your choice always wins/i);
    }
  });

  it('never says the automatic rule follows the player', () => {
    // "grows with you" was the first wording and is the exact conflation
    // `questTier`'s comment calls wrong by construction: the rule counts days
    // that scored, so it follows tenure, not the person.
    for (const override of [null, 'steady'] as const) {
      expect(questDifficultyHelp(override)).not.toMatch(/grows? with you/i);
    }
    expect(calibrationNote({ outcome: 'no-history' })?.line).not.toMatch(/grows? with you/i);
  });
});

/*
  The claim above is only worth making if the code keeps it. `medianSteps`
  exists to be said out loud once and then forgotten: it crosses from the
  connect beat to the difficulty beat in an in-memory store, is never written
  to `profiles`, and never rides in a telemetry payload.

  Only the first half is here. The payload half lives in
  `src/features/telemetry/telemetry-payloads.test.ts`, with the rest of the
  onboarding run's emitters — one rule, one scan, because two scans enforcing
  the same ban are two chances for one of them to be quietly narrowed. This
  half stays because it is a different rule: not what leaves the phone, but
  what the account carries afterwards.

  It is a scan rather than a type for the same reason the other half is: the
  failure is a field name typed into a call that legitimately takes an object.
*/
describe('the median is never written to the profile row', () => {
  const CALIBRATION_SITES = [
    'src/features/onboarding/calibration.ts',
    'app/(onboard)/connect.tsx',
    'app/(onboard)/difficulty.tsx',
    'app/(onboard)/name.tsx',
    'src/features/onboarding/answers.ts',
  ];

  it('reaches no profile write', () => {
    let scanned = 0;
    for (const path of CALIBRATION_SITES) {
      const source = readFileSync(path, 'utf8');
      const writes = source.match(/(?:updateProfile\.mutate|createProfile\.mutate)\([^;]*?\);/gs) ?? [];
      scanned += writes.length;
      for (const write of writes) {
        expect(write, `${path} persists a step figure`).not.toMatch(/median/i);
      }
    }
    // A scan over nothing passes, so the write the name beat makes has to be
    // found: renaming that mutation is what would silently empty this test.
    expect(scanned, 'no profile write was found to scan').toBeGreaterThan(0);
  });
});
