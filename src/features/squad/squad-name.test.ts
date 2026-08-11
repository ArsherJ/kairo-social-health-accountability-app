import { describe, expect, it } from 'vitest';
import {
  isValidSquadName,
  SQUAD_NAME_MAX,
  SQUAD_NAME_MIN,
  squadNameHint,
} from './squad-name.ts';

const atMax = 'x'.repeat(SQUAD_NAME_MAX);

describe('isValidSquadName', () => {
  it('measures the trimmed length, like the database CHECK does', () => {
    expect(isValidSquadName(' a ')).toBe(false);
    expect(isValidSquadName(` ${'x'.repeat(SQUAD_NAME_MAX)} `)).toBe(true);
  });

  it('holds both ends of the range', () => {
    expect(isValidSquadName('x'.repeat(SQUAD_NAME_MIN))).toBe(true);
    expect(isValidSquadName('x'.repeat(SQUAD_NAME_MIN - 1))).toBe(false);
    expect(isValidSquadName(atMax)).toBe(true);
    expect(isValidSquadName('x'.repeat(SQUAD_NAME_MAX + 1))).toBe(false);
  });
});

describe('squadNameHint', () => {
  it('says nothing about a field nobody has touched', () => {
    expect(squadNameHint('')).toBeNull();
    expect(squadNameHint('   ')).toBeNull();
  });

  it('says nothing about a perfectly ordinary name', () => {
    expect(squadNameHint('Barangay Runners')).toBeNull();
  });

  it('explains a Create button that will not arm', () => {
    // The QA finding: disabled, with no reason given anywhere on screen.
    expect(squadNameHint('x')).toMatch(/at least 2/);
  });

  it('warns before the ceiling rather than at it', () => {
    // A limit you cannot see coming is the actual complaint — by the time the
    // field stops accepting keys it is too late for a counter to help.
    expect(squadNameHint('x'.repeat(SQUAD_NAME_MAX - 5))).toBe(`25 of ${SQUAD_NAME_MAX}`);
    expect(squadNameHint('x'.repeat(SQUAD_NAME_MAX - 6))).toBeNull();
  });

  it('explains the dead field once the limit is reached', () => {
    expect(squadNameHint(atMax)).toMatch(/longest a squad name can be/);
  });

  it('never blames the user', () => {
    for (const value of ['x', atMax, 'x'.repeat(SQUAD_NAME_MAX - 2)]) {
      expect(squadNameHint(value) ?? '').not.toMatch(/invalid|error|you must/i);
    }
  });
});
