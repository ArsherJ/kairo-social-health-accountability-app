import {
  ONBOARDING_BEATS,
  type BeatName,
  type BeatRoute,
  type OnboardingBeat,
} from '../onboarding/beats.ts';

type PreviewBeat = OnboardingBeat & {
  name: Exclude<BeatName, 'hatching'>;
  route: BeatRoute;
};

export const PREVIEW_BEATS = ONBOARDING_BEATS.filter(
  (beat): beat is PreviewBeat => beat.route !== null,
);

export function previewBeatAfter(index: number): number {
  return Math.min(PREVIEW_BEATS.length - 1, Math.max(0, index + 1));
}

export function previewKeyboardOffset(windowY: number): number {
  return Number.isFinite(windowY) ? Math.max(0, windowY) : 0;
}
