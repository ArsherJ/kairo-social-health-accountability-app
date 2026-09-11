import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  PREVIEW_BEATS,
  previewBeatAfter,
  previewKeyboardOffset,
} from './onboarding-preview.ts';

it('previews exactly the real seven routes and does not invent a hatch route', () => {
  expect(PREVIEW_BEATS.map((beat) => beat.route)).toEqual([
    '/welcome', '/one-sky', '/mirror', '/connect', '/difficulty', '/privacy', '/name',
  ]);
  expect(previewBeatAfter(0)).toBe(1);
  expect(previewBeatAfter(6)).toBe(6);
});

it('clamps unexpected indexes back into the preview run', () => {
  expect(previewBeatAfter(-4)).toBe(0);
  expect(previewBeatAfter(99)).toBe(6);
});

it('uses the shared screen window position as the nested keyboard offset', () => {
  const mainToolbar = 84;
  const onboardingControls = 116;
  expect(previewKeyboardOffset(mainToolbar + onboardingControls)).toBe(200);
  expect(previewKeyboardOffset(-8)).toBe(0);
  expect(previewKeyboardOffset(Number.NaN)).toBe(0);
});

it('measures in window coordinates and leaves the shared name default unchanged', () => {
  const preview = readFileSync(
    new URL('./OnboardingPreviewScreen.tsx', import.meta.url),
    'utf8',
  );
  const nameScreen = readFileSync(
    new URL('../onboarding/NameScreen.tsx', import.meta.url),
    'utf8',
  );
  expect(preview).toContain('measureInWindow');
  expect(preview).toContain('keyboardVerticalOffset={keyboardOffset}');
  expect(nameScreen).toContain('keyboardVerticalOffset = 0');
});
