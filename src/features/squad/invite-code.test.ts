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
