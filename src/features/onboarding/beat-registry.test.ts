import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_BEATS, onboardingSkipTarget } from './beats.ts';

/**
 * Nothing outside the registry writes down where a beat sits, or what its
 * button says.
 *
 * This is the guard that makes the registry worth having. Seven screens each
 * hand-wrote a `filled`/`partial` pair against a shape nothing declared, so
 * adding a beat meant restating the arithmetic seven times — and getting one
 * wrong is invisible until somebody watches the bar move on a device. Moving
 * the values into `beats.ts` fixes today; this stops the next screen putting
 * one back, which is how the seven accumulated in the first place.
 *
 * A scan rather than a type, because the failure is a *literal* passed to a
 * prop that legitimately takes a number, and no type can tell the two apart.
 */

const BEAT_DIRS = ['app/(onboard)', 'src/features/onboarding'];

function beatSources(): { path: string; source: string }[] {
  return BEAT_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => ({ path: join(dir, f), source: readFileSync(join(dir, f), 'utf8') })),
  );
}

describe('the beat registry is the only source', () => {
  it('finds the beat screens it is meant to be scanning', () => {
    const paths = beatSources().map((f) => f.path);
    for (const beat of ONBOARDING_BEATS) {
      if (beat.route === null) continue;
      expect(paths).toContain(`app/(onboard)/${beat.name}.tsx`);
    }
    expect(paths).toContain('src/features/onboarding/HatchingBeat.tsx');
  });

  it('lets no screen hand-write a rail position', () => {
    // `OnboardingChrome.tsx` is the rail itself and declares the props; every
    // other file in these directories must pass a value it was given.
    const offenders = beatSources()
      .filter((f) => !f.path.endsWith('OnboardingChrome.tsx'))
      .filter((f) => /\b(filled|partial)=\{[\d.]/.test(f.source))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it('lets no beat hand-write its button words', () => {
    const offenders = beatSources()
      .filter((f) => /<OnboardingCta[^>]*\blabel="/s.test(f.source))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it('lets no screen hand-write which paged dot it lights', () => {
    // The pair ticket 01 left behind. `index`/`count` are the same arithmetic
    // as `filled`/`partial` and went wrong the same way — they promised three
    // cards while two existed — so they read from the registry now, and this
    // is the guard that keeps a fourth value card from restating them.
    const offenders = beatSources()
      .filter((f) => !f.path.endsWith('OnboardingChrome.tsx'))
      .filter((f) => /<OnboardingDots[^>]*\b(index|count)=\{\d/s.test(f.source))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it('lets no screen hand-write where Skip lands', () => {
    // The two value cards both named `/connect` while the pitch ended there.
    // A literal here is the drift that sends the people most likely to decline
    // around the argument written for them — see `onboardingSkipTarget`.
    const offenders = beatSources()
      .filter((f) => /onSkip=\{[^}]*['"]\//s.test(f.source))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it('gives the beat Skip lands on no skip of its own', () => {
    const target = ONBOARDING_BEATS.find((b) => b.route === onboardingSkipTarget());
    const file = beatSources().find((f) => f.path.endsWith(`/${target?.name}.tsx`));
    expect(file?.source).not.toContain('onSkip');
  });

  it('records one impression per beat that is its own screen', () => {
    const sources = beatSources();
    for (const beat of ONBOARDING_BEATS) {
      if (beat.route === null) continue;
      const file = sources.find((f) => f.path.endsWith(`/${beat.name}.tsx`));
      expect(file?.source, `${beat.name} reports no impression`).toContain(
        `useBeatImpression('${beat.name}')`,
      );
    }
    // The hatch is a phase of `/connect`, not a screen — `/connect`'s own
    // impression already covers the moment, and a second one would double-count
    // the beat the funnel is measuring drop-off across.
    const hatch = sources.find((f) => f.path.endsWith('HatchingBeat.tsx'));
    expect(hatch?.source).not.toContain('useBeatImpression');
  });

  it('lets no screen emit the impression itself', () => {
    // One emitter, taking a beat name and nothing else, is what makes "the
    // route name and nothing else" true by construction rather than by review.
    const offenders = beatSources()
      .filter((f) => /onboarding_beat_seen/.test(f.source))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it('has every registered label actually reachable from a screen', () => {
    const sources = beatSources();
    for (const beat of ONBOARDING_BEATS) {
      if (beat.cta === null) continue;
      const file = sources.find((f) =>
        f.path.endsWith(`/${beat.name}.tsx`),
      );
      expect(file, `no screen file for beat ${beat.name}`).toBeDefined();
      expect(file?.source, `${beat.name} never reads its own registry entry`).toContain(
        `onboardingBeat('${beat.name}')`,
      );
    }
  });
});
