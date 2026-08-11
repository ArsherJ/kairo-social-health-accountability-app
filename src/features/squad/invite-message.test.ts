import { describe, expect, it } from 'vitest';
import { inviteMessage, inviteTitle } from './invite-message.ts';

const base = { squadName: 'Barangay Runners', inviteCode: 'NRN7P7' };

describe('inviteMessage', () => {
  it('carries the code, which is the only thing the reader has to act on', () => {
    expect(inviteMessage(base)).toContain('NRN7P7');
  });

  it('names the squad, because that is what makes it from a person', () => {
    expect(inviteMessage(base)).toContain('Barangay Runners');
  });

  it('says what Kairo is to someone who has never heard of it', () => {
    // The recipient is not a user yet. A bare code and a squad name would mean
    // nothing to them.
    expect(inviteMessage(base)).toMatch(/activity|leaderboard/i);
  });

  it('trims a name padded by the create form', () => {
    expect(inviteMessage({ ...base, squadName: '  Runners  ' })).toContain(
      'Join Runners on Kairo',
    );
  });

  it('stays short enough to survive a message preview', () => {
    expect(inviteMessage(base).length).toBeLessThan(200);
  });

  it('ends on the code rather than burying it mid-sentence', () => {
    expect(inviteMessage(base).trimEnd().endsWith('NRN7P7')).toBe(true);
  });
});

describe('inviteTitle', () => {
  it('adds nothing the body does not already say', () => {
    const title = inviteTitle('Barangay Runners');
    expect(title).toBe('Join Barangay Runners on Kairo');
    // Not every share target shows a title, so it must not be load-bearing.
    expect(inviteMessage(base)).toContain('NRN7P7');
  });
});
