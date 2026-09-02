import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INVITE_HOST } from '../squad/invite-link.ts';
import { feedbackMailto, PRIVACY_POLICY_URL, SUPPORT_EMAIL } from './links.ts';

describe('support links', () => {
  it('serves the policy from the invite host', () => {
    expect(PRIVACY_POLICY_URL).toBe(`https://${INVITE_HOST}/privacy`);
  });

  it('opens mail to the monitored address with a subject', () => {
    expect(feedbackMailto()).toBe(`mailto:${SUPPORT_EMAIL}?subject=Kairo%20feedback`);
  });
});

/**
 * One test owns the privacy policy's facts, read off disk.
 *
 * The policy is standalone HTML with no build step — a property worth keeping,
 * and the reason it cannot import anything. So the guard runs the other way:
 * the repository's constants are asserted against the page. Every claim pinned
 * here is one that went stale somewhere else once already (deviation #47, the
 * invite message, the Info.plist string), or is a fact App Review checks
 * against the binary.
 */
describe('the privacy policy page', () => {
  const page = readFileSync('web/privacy.html', 'utf8');

  it('names the same contact address the app does', () => {
    expect(page).toContain(SUPPORT_EMAIL);
  });

  it('states what a consenting squadmate sees, which is daily totals', () => {
    for (const total of ['steps', 'distance', 'calories', 'sleep']) {
      expect(page).toContain(total);
    }
    expect(page).toMatch(/both agreed|each other|both of you/i);
  });

  it('names what a squadmate never sees', () => {
    expect(page).toMatch(/heart rate/i);
    expect(page).toMatch(/workouts/i);
    expect(page).toMatch(/hour/i);
  });

  it('names the pooled Battle total and the two-person limit', () => {
    // The one figure shared without the agreement, and the arithmetic that
    // makes it a partner's figure in a squad of two. Named, never implied.
    expect(page).toMatch(/pooled/i);
    expect(page).toMatch(/two/i);
  });

  it('says how to delete everything, from inside the app', () => {
    expect(page).toMatch(/delete (your|my) account/i);
  });

  it('never writes to Apple Health, and says so', () => {
    expect(page).toMatch(/never writes|writes nothing|does not write/i);
  });

  it('speaks the surface vocabulary, never an engine key or a retired tier', () => {
    // Bronze/Silver/Gold went internal at deviation #23, the engine keys at
    // #51. The 2026-08-08 draft named all of them, which is why it is not
    // this page.
    const body = page.replace(/<style>[\s\S]*?<\/style>/, '');
    expect(body).not.toMatch(/\b(AGI|STR|MND)\b/);
    expect(body).not.toMatch(/\b(Bronze|Silver|Gold)\b/);
  });

  it('makes no retired promise', () => {
    expect(page).not.toMatch(/never your raw/i);
    expect(page).not.toMatch(/scores only/i);
    expect(page).not.toMatch(/never see your steps/i);
  });

  it('carries no placeholder', () => {
    expect(page).not.toMatch(/\[\[TODO/);
  });

  it('makes no external request', () => {
    // Same rule as the landing page: no fonts, no scripts, no images.
    expect(page).not.toMatch(/<script/);
    expect(page).not.toMatch(/<link[^>]+href="https?:/);
    expect(page).not.toMatch(/<img/);
  });
});
