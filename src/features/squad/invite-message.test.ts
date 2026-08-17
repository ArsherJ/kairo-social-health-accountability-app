import { describe, expect, it } from 'vitest';
import { INVITE_HOST, INVITE_PATH_PREFIX, inviteUrl } from './invite-link.ts';
import { inviteMessage, inviteTitle } from './invite-message.ts';
import { inviteCodeFromParam } from './pending-invite.ts';
import { SQUAD_NAME_MAX } from './squad-name.ts';

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
    //
    // Matched on "walk" rather than the old /activity|leaderboard/: the body
    // was rewritten on 2026-08-17 to name what the recipient is being asked
    // into — a group holding each other to a daily walk — instead of describing
    // the scoring mechanism to somebody with no reason to care about it yet.
    // "Leaderboard" also invited the public-fitness-feed reading this product
    // is positioned against.
    expect(inviteMessage(base)).toMatch(/walk/i);
  });

  it('carries the privacy promise, the one claim a non-user can act on', () => {
    // The invite is the only Kairo copy someone who has never installed it
    // reads. Pinned because it is the first clause that gets cut when the
    // message next runs up against the length budget below — which is exactly
    // what happened on the day it was written.
    //
    // Matched loosely on purpose. The claim is what must survive; the exact
    // wording is copy, and pinning it makes every future trim a test failure
    // that says nothing about whether the promise is still being made.
    expect(inviteMessage(base)).toMatch(/never .{0,6}Health data/i);
  });

  it('trims a name padded by the create form', () => {
    expect(inviteMessage({ ...base, squadName: '  Runners  ' })).toContain(
      'Join Runners on Kairo',
    );
  });

  it('stays short enough to survive a message preview', () => {
    expect(inviteMessage(base).length).toBeLessThan(200);
  });

  it('stays under the budget for the longest squad name allowed', () => {
    // The fixture above is 16 characters and `SQUAD_NAME_MAX` is 30, so the
    // assertion above passes on copy that overflows for half of all legal
    // names. It did: the 2026-08-17 rewrite measured 196 here and 210 with a
    // real long name. The budget is only meaningful at the worst case.
    const longest = inviteMessage({ ...base, squadName: 'x'.repeat(SQUAD_NAME_MAX) });

    expect(longest.length).toBeLessThan(200);
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

describe('inviteMessage — the link', () => {
  it('carries a link that opens the app straight onto the join form', () => {
    expect(inviteMessage(base)).toContain(
      'https://kairo-teal-nine.vercel.app/join/NRN7P7',
    );
  });

  it('builds its host from INVITE_HOST, so it cannot drift from the entitlement', () => {
    // The guard this file exists for. `ios.associatedDomains` is generated from
    // the same constant; if the message ever names a different host, every link
    // falls back to Safari and nothing anywhere reports an error.
    expect(inviteMessage(base)).toContain(`https://${INVITE_HOST}/`);
  });

  it('matches the path the association file claims', () => {
    // `paths` in web/.well-known/apple-app-site-association is `/join/*`. A
    // message pointing anywhere else would open the landing page instead.
    expect(inviteMessage(base)).toContain(`${INVITE_PATH_PREFIX}/NRN7P7`);
  });

  it('keeps the bare code as well as the link', () => {
    // Some chat clients strip or wrap links, and an SMS has nothing to tap.
    // Six characters always survive, and the manual field still accepts them.
    const message = inviteMessage(base);
    expect(message).toMatch(/code in the app: NRN7P7$/);
  });

  it('names no scheme in the host constant', () => {
    // Apple's format is `applinks:<host>`. A scheme here would produce
    // `applinks:https://…`, which is the documented way to make every link
    // silently fall back to Safari.
    expect(INVITE_HOST).not.toMatch(/^https?:|\/$/);
  });
});

describe('inviteUrl', () => {
  it('is exactly the shape the route parses', () => {
    expect(inviteUrl('AB12CD')).toBe('https://kairo-teal-nine.vercel.app/join/AB12CD');
  });
});

describe('the link round-trips', () => {
  it('produces a code the route can read back', () => {
    // Producer and consumer, checked against each other. The message builds
    // the URL and `app/join/[code].tsx` parses the last segment out of it; a
    // change to either that the other did not follow would ship a link that
    // opens the app and then says the code was unusable.
    const url = inviteUrl('NRN7P7');
    const lastSegment = url.slice(url.lastIndexOf('/') + 1);
    expect(inviteCodeFromParam(lastSegment)).toBe('NRN7P7');
  });

  it('survives a client that lowercases the whole link', () => {
    const url = inviteUrl('NRN7P7').toLowerCase();
    const lastSegment = url.slice(url.lastIndexOf('/') + 1);
    expect(inviteCodeFromParam(lastSegment)).toBe('NRN7P7');
  });
});
