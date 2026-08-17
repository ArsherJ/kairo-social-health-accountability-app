import { describe, expect, it } from 'vitest';
import {
  PENDING_INVITE_TTL_MS,
  inviteCodeFromParam,
  isPendingInviteFresh,
  parsePendingInvite,
} from './pending-invite.ts';

const NOW = 1_800_000_000_000;

describe('inviteCodeFromParam', () => {
  it('accepts a canonical code', () => {
    expect(inviteCodeFromParam('AB12CD')).toBe('AB12CD');
  });

  it('normalises the shapes a chat client produces', () => {
    // A link retyped, lowercased, or broken up with a dash. The manual field
    // already forgives all three; a link that did not would be worse than one.
    expect(inviteCodeFromParam('ab12cd')).toBe('AB12CD');
    expect(inviteCodeFromParam('ab1-2cd')).toBe('AB12CD');
    expect(inviteCodeFromParam(' AB12CD ')).toBe('AB12CD');
  });

  it('rejects anything that is not a code', () => {
    expect(inviteCodeFromParam('AB12C')).toBeNull();
    expect(inviteCodeFromParam('AB12CDE')).toBeNull();
    expect(inviteCodeFromParam('AB!2CD')).toBeNull();
    expect(inviteCodeFromParam('')).toBeNull();
    expect(inviteCodeFromParam(undefined)).toBeNull();
  });

  it('rejects a repeated param rather than picking one', () => {
    // Expo Router hands back an array for `?code=a&code=b`. There is no
    // sensible reading of two codes, and guessing would join the wrong squad.
    expect(inviteCodeFromParam(['AB12CD', 'EF34GH'])).toBeNull();
  });
});

describe('isPendingInviteFresh', () => {
  it('is fresh the moment it is written', () => {
    expect(isPendingInviteFresh({ code: 'AB12CD', savedAt: NOW }, NOW)).toBe(true);
  });

  it('is fresh just inside the window', () => {
    const invite = { code: 'AB12CD', savedAt: NOW - PENDING_INVITE_TTL_MS + 1 };
    expect(isPendingInviteFresh(invite, NOW)).toBe(true);
  });

  it('is stale at the window and beyond', () => {
    expect(
      isPendingInviteFresh({ code: 'AB12CD', savedAt: NOW - PENDING_INVITE_TTL_MS }, NOW),
    ).toBe(false);
    expect(
      isPendingInviteFresh({ code: 'AB12CD', savedAt: NOW - 7 * 24 * 3_600_000 }, NOW),
    ).toBe(false);
  });

  it('keeps an invite whose clock moved backwards', () => {
    // A device clock can shift between the write and the read. Discarding on a
    // negative age would lose the code this module exists to keep, for a
    // reason the user could never guess at.
    expect(isPendingInviteFresh({ code: 'AB12CD', savedAt: NOW + 60_000 }, NOW)).toBe(true);
  });
});

describe('parsePendingInvite', () => {
  it('reads back what was written', () => {
    expect(parsePendingInvite({ code: 'AB12CD', savedAt: NOW })).toEqual({
      code: 'AB12CD',
      savedAt: NOW,
    });
  });

  it('normalises a code stored by an older build', () => {
    expect(parsePendingInvite({ code: 'ab12cd', savedAt: NOW })?.code).toBe('AB12CD');
  });

  it('returns null for anything malformed rather than throwing', () => {
    // Written by whichever build was installed last. A bad record must read as
    // "no pending invite", never as a crash on the first screen after sign-in.
    for (const bad of [
      null,
      undefined,
      'AB12CD',
      42,
      {},
      { code: 'AB12CD' },
      { savedAt: NOW },
      { code: 'NOPE', savedAt: NOW },
      { code: 'AB12CD', savedAt: 'soon' },
      { code: 'AB12CD', savedAt: Number.NaN },
      { code: 123456, savedAt: NOW },
    ]) {
      expect(parsePendingInvite(bad)).toBeNull();
    }
  });
});
