import { describe, expect, it } from 'vitest';
import { sampleTrust, scoresAtAll } from './trust.ts';

const ALLOWLIST = ['com.apple.health.watch', 'com.ouraring.oura', 'com.northcube.sleepcycle'];

describe('sampleTrust', () => {
  // Layer one. Apple flags its own manual-entry path, and the spike confirmed
  // HKWasUserEntered is typed on sleep samples today. This is what makes the
  // trivial cheat — open Health, type "9h" — cost nothing to catch.
  it('rejects anything the user typed in, whatever wrote it', () => {
    expect(sampleTrust({ wasUserEntered: true, sourceBundleId: null }, ALLOWLIST)).toBe('rejected');
    expect(
      sampleTrust({ wasUserEntered: true, sourceBundleId: 'com.ouraring.oura' }, ALLOWLIST),
    ).toBe('rejected');
  });

  it('trusts a sensor source on the allowlist', () => {
    expect(
      sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.ouraring.oura' }, ALLOWLIST),
    ).toBe('trusted');
  });

  // Layer three. A legitimate but obscure sleep app scoring zero is
  // indistinguishable from Kairo being broken, and `flagged` is already
  // documented as social-only — never a ban, never a score reduction (§20).
  it('flags an unknown source rather than rejecting it', () => {
    expect(
      sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.unknown.sleepapp' }, ALLOWLIST),
    ).toBe('flagged');
  });

  it('flags a sample with no source at all', () => {
    expect(sampleTrust({ wasUserEntered: false, sourceBundleId: null }, ALLOWLIST)).toBe('flagged');
  });

  it('flags everything when the allowlist is empty', () => {
    expect(sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.ouraring.oura' }, [])).toBe(
      'flagged',
    );
  });

  it('matches bundle ids exactly, never by prefix', () => {
    expect(
      sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.ouraring.oura.fake' }, ALLOWLIST),
    ).toBe('flagged');
  });
});

describe('scoresAtAll', () => {
  it('scores trusted and flagged samples, and only discards rejected ones', () => {
    expect(scoresAtAll('trusted')).toBe(true);
    expect(scoresAtAll('flagged')).toBe(true);
    expect(scoresAtAll('rejected')).toBe(false);
  });
});
