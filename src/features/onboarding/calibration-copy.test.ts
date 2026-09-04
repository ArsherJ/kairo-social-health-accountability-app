import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALIBRATION_PRIVACY_NOTE, calibrationNote } from './calibration-copy.ts';

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

/*
  The claim above is only worth making if the code keeps it. `medianSteps`
  exists to be said out loud once and then forgotten: it crosses from the
  connect beat to the difficulty beat in an in-memory store, is never written
  to `profiles`, and never rides in a telemetry payload. Both halves are a scan
  rather than a type, because both failures are a field name typed into a call
  that legitimately takes an object.
*/
describe('the median never leaves the phone', () => {
  const CALIBRATION_SITES = [
    'app/(onboard)/connect.tsx',
    'app/(onboard)/difficulty.tsx',
    'app/(onboard)/name.tsx',
    'src/features/onboarding/answers.ts',
  ];

  it('is never sent to a telemetry event', () => {
    for (const path of CALIBRATION_SITES) {
      const source = readFileSync(path, 'utf8');
      // Every `track(...)` argument list in the file, flattened.
      const calls = source.match(/track\([^;]*?\);/gs) ?? [];
      for (const call of calls) {
        expect(call, `${path} puts a step figure in a telemetry payload`).not.toMatch(
          /median|steps/i,
        );
      }
    }
  });

  it('is never written to the profile row', () => {
    for (const path of CALIBRATION_SITES) {
      const source = readFileSync(path, 'utf8');
      const writes = source.match(/(?:updateProfile\.mutate|createProfile\.mutate)\([^;]*?\);/gs) ?? [];
      for (const write of writes) {
        expect(write, `${path} persists a step figure`).not.toMatch(/median/i);
      }
    }
  });
});
