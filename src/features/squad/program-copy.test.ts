import { describe, expect, it } from 'vitest';
import { SQUAD_PROGRAMS } from '@kairo/core';
import {
  PROGRAM_OPTIONS,
  PROGRAM_OPTION_VALUES,
  RECOVERY_ACCURACY_NOTE,
  STRENGTH_ACCURACY_NOTE,
  boostChipLabel,
  programLabel,
  programNote,
} from './program-copy.ts';

describe('PROGRAM_OPTIONS', () => {
  it('offers every program the core declares', () => {
    // A program in @kairo/core with no copy here would be weightable but
    // unpickable, and unlabelled on the board header.
    expect([...PROGRAM_OPTION_VALUES].sort()).toEqual([...SQUAD_PROGRAMS].sort());
  });

  it('leads with the focused programs, not the default', () => {
    // The database default is all_around; leading with it in the UI would make
    // it the answer founders pick by inertia, and the beta needs squads on each
    // program to answer the per-program risk question at all.
    expect(PROGRAM_OPTIONS[0]!.value).not.toBe('all_around');
    expect(PROGRAM_OPTIONS[PROGRAM_OPTIONS.length - 1]!.value).toBe('all_around');
  });

  it('gives every option a label and a blurb', () => {
    for (const option of PROGRAM_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('programLabel', () => {
  it('labels each program', () => {
    expect(programLabel('running')).toBe('Running');
    expect(programLabel('strength')).toBe('Strength');
    expect(programLabel('all_around')).toBe('All-around');
  });

  it('falls back to All-around for a squad row from before programs shipped', () => {
    expect(programLabel(undefined)).toBe('All-around');
  });
});

describe('boostChipLabel', () => {
  it('names the boosted stat and the multiplier', () => {
    expect(boostChipLabel('running')).toBe('AGI ×1.5');
    expect(boostChipLabel('strength')).toBe('STR ×1.5');
    // Walking boosted VIT until deviation #41 retired it; VIT's signal now
    // makes AGI's bands easier instead.
    expect(boostChipLabel('walking')).toBe('AGI ×1.5');
    expect(boostChipLabel('recovery')).toBe('MND ×1.5');
  });

  it('shows nothing on an untilted board', () => {
    expect(boostChipLabel('all_around')).toBeNull();
    expect(boostChipLabel(undefined)).toBeNull();
  });

  it('never names a stat that no longer exists', () => {
    // END and VIT are retired (deviation #41). A chip promising either would
    // name a stat no board can show and no day can score.
    for (const program of SQUAD_PROGRAMS) {
      expect(boostChipLabel(program) ?? '').not.toContain('END');
      expect(boostChipLabel(program) ?? '').not.toContain('VIT');
    }
  });
});

describe('programNote', () => {
  it('warns about phone-only strength tracking, where it actually bites', () => {
    expect(programNote('strength')).toBe(STRENGTH_ACCURACY_NOTE);
  });

  it('warns that recovery needs a sleep tracker, which a phone is not', () => {
    // The sharper case of the same honest-capability rule: a recovery squad
    // founded on phones alone is an all-around squad with extra words.
    expect(programNote('recovery')).toBe(RECOVERY_ACCURACY_NOTE);
  });

  it('says nothing on programs a phone measures well', () => {
    expect(programNote('running')).toBeNull();
    expect(programNote('walking')).toBeNull();
    expect(programNote('all_around')).toBeNull();
  });
});
