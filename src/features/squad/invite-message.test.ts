import { readFileSync } from 'node:fs';
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

  it('attempts no privacy claim, because it has no room to make one honestly', () => {
    // **Case-sensitive, and deliberately narrow to one word.**
    //
    // The retired clause was "Steps, never Health data". It was false in two
    // ways at once: steps *are* Health data, and since the reciprocal consent
    // gate (deviation #47) a consenting squadmate sees four daily totals rather
    // than none. It also had no subject, so it asserted nothing about who sees
    // what — the compression is the cause, which is why the fix was to move the
    // claim rather than to shorten it again.
    //
    // "Health" is the word that makes the sentence false, and the message needs
    // it for nothing else. "Steps" is deliberately *not* banned: it is ordinary
    // English this copy may legitimately want. And the match is case-sensitive
    // and word-bounded for the reason every guard in this repo is — a loose
    // /health/i would fire on "healthy", and a guard that fails on legitimate
    // copy gets loosened until it guards nothing.
    expect(inviteMessage(base)).not.toMatch(/\bHealth\b/);
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

/**
 * One test owns the privacy claim across every surface that carries it.
 *
 * **This is the structural fix, not a nicety.** The claim was written once when
 * it was true and then copied to four places: the HealthKit permission sheet,
 * the sign-in pitch, this message, and the landing page. Deviation #47's
 * reciprocal consent gate made it false in one move, and only the surface with
 * a test — the permission sheet — was corrected. The page and the message had
 * no guard between them, and neither was counted in the launch-blocker note,
 * which names only the privacy policy and the App Store answers. Without a
 * single guard, the claim goes stale again the next time the consent model
 * moves.
 *
 * The page is read off disk rather than imported: it is standalone HTML with no
 * build step, which is a property worth keeping, and the vitest root is the
 * repository root.
 *
 * **What this guard does not do.** The page's six-character validation is a
 * second copy of `isValidInviteCode`, which standalone HTML cannot import. This
 * catches that copy being *deleted*; it cannot catch it *diverging*. That limit
 * is recorded here rather than hidden, and is why the duplication was accepted
 * rather than solved with a build step for one rule.
 */
describe('the privacy claim, across the message and the page', () => {
  const page = readFileSync('web/index.html', 'utf8');

  it('sends the reader to the page that makes the claim', () => {
    // The message no longer carries a claim of its own, so the link is the only
    // thing connecting a recipient to one. If this ever stops being true, the
    // claim reaches nobody before install.
    expect(inviteMessage(base)).toContain(`https://${INVITE_HOST}/`);
  });

  /**
   * The privacy section's own text, not the whole file.
   *
   * Scoped deliberately: asserting `page.toContain('steps')` passes on a page
   * whose privacy section has been deleted, because "steps" appears in the
   * Daily Walk card too. A guard that survives the deletion of its subject is
   * not a guard, and this one exists precisely because the claim went stale in
   * four places with nothing watching.
   */
  const privacy = /<section class="privacy">([\s\S]*?)<\/section>/.exec(page)?.[1] ?? '';

  it('has a privacy section at all', () => {
    expect(privacy).not.toBe('');
  });

  it('states what a squadmate actually sees, which is daily totals', () => {
    // Deviation #47: consenting squadmates see steps, distance, calories and
    // sleep. Matched on the substance rather than the sentence — the wording is
    // copy, the four totals are the promise.
    for (const total of ['steps', 'distance', 'calories', 'sleep']) {
      expect(privacy).toContain(total);
    }
  });

  it('says the sharing is mutual, so nobody reads it as one-way', () => {
    // A stranger deciding whether to install needs to know they are not signing
    // anything away: sharing is reciprocal and refusable.
    expect(privacy).toMatch(/both agreed|each other/i);
  });

  it('still names what a squadmate never sees', () => {
    expect(privacy).toMatch(/heart rate/i);
    expect(privacy).toMatch(/workouts/i);
  });

  it('no longer promises that squadmates never see your steps', () => {
    // The retired phrasing, and the exact one that went stale. It read
    // "They never see your steps, your heart rate or when you moved."
    expect(page).not.toMatch(/never see your steps/i);
    expect(page).not.toMatch(/nobody sees your steps/i);
  });

  it('no longer promises the code will be waiting in the app', () => {
    // It never was: the code is only captured by a route inside the app, and
    // nothing carried it across an install. The page shows the code instead.
    expect(page).not.toMatch(/still be waiting/i);
  });

  it('shows the recipient their own code, and says the link fills it in', () => {
    expect(page).toContain('id="code-value"');
    expect(page).toMatch(/tap this link again/i);
  });

  it('validates six characters before revealing anything', () => {
    // A mangled address must show nothing rather than show garbage in a box
    // that looks authoritative.
    expect(page).toContain('[A-Z0-9]{6}');
  });

  it('keeps the code block hidden in the markup itself', () => {
    // A visitor with no code, a crawler, and a browser with scripting off all
    // get today's page unchanged rather than an empty box.
    expect(page).toMatch(/<section class="code" id="code" hidden>/);
  });
});
