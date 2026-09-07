import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_LENGTH,
  isValidInviteCode,
  normalizeInviteCode,
} from './invite-code.ts';

describe('normalizeInviteCode', () => {
  it('upper-cases and trims, because codes are read aloud in group chats', () => {
    expect(normalizeInviteCode('  ab12cd  ')).toBe('AB12CD');
  });

  it('strips inner spaces and dashes people add when typing', () => {
    expect(normalizeInviteCode('AB1-2CD')).toBe('AB12CD');
    expect(normalizeInviteCode('AB1 2CD')).toBe('AB12CD');
  });
});

describe('isValidInviteCode', () => {
  it('accepts exactly six alphanumerics', () => {
    expect(isValidInviteCode('AB12CD')).toBe(true);
    expect(isValidInviteCode('ab12cd')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidInviteCode('AB12C')).toBe(false);
    expect(isValidInviteCode('AB12CDE')).toBe(false);
    expect(isValidInviteCode('')).toBe(false);
  });

  it('rejects characters the database CHECK would refuse', () => {
    // The column constraint is ^[A-Z0-9]{6}$.
    expect(isValidInviteCode('AB12C!')).toBe(false);
    expect(isValidInviteCode('AB 12C')).toBe(false);
  });

  it('agrees with INVITE_CODE_LENGTH', () => {
    expect(isValidInviteCode('A'.repeat(INVITE_CODE_LENGTH))).toBe(true);
  });
});

describe('the rendered code', () => {
  /**
   * Six characters that get read aloud in one breath, so they have to stay on
   * one line at every text size.
   *
   * They did not. The block took the default `prose` scale — 1.8x on a 38pt
   * face, with 10pt of letter-spacing under it — and at the largest
   * accessibility sizes broke to a second line with a single character
   * orphaned under the tab bar, seen on a device.
   *
   * A source scan because this is a `.tsx` and root Vitest cannot load one at
   * all; the same arrangement `bleed-inset.test.ts` and `ask-copy.test.ts`
   * already use, for the same reason. It reads the block the code is rendered
   * in rather than the whole file, so a `numberOfLines` somewhere else on the
   * board cannot satisfy it.
   */
  const block = (() => {
    const source = readFileSync('src/features/squad/Leaderboard.tsx', 'utf8');
    const match = /<Text\b[^>]*style={styles\.code}[^>]*>/s.exec(source);
    if (match === null) throw new Error('No <Text style={styles.code}> on the board.');
    return match[0];
  })();

  it('takes the fixed type scale, because a code is drawn geometry', () => {
    expect(block).toMatch(/scale="fixed"/);
  });

  it('shrinks to fit one line rather than reflowing', () => {
    // Both, and only together: `adjustsFontSizeToFit` without a line limit is
    // free to wrap, and a line limit without it truncates a character instead.
    expect(block).toMatch(/numberOfLines={1}/);
    expect(block).toMatch(/adjustsFontSizeToFit/);
  });

  it('keeps a legible floor under the shrinking', () => {
    expect(block).toMatch(/minimumFontScale={0\.\d+}/);
  });
});
