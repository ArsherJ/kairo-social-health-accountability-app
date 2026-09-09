import { FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';

export const WELCOME_SCREEN_COPY = {
  eyebrow: 'Small steps. Real growth.',
  title: 'A little bird.\nA reason to move.',
  body:
    'Your everyday movement brings your Kairo to life. Start with yourself. Find your flock along the way.',
  detail: 'How does it work?',
  less: 'Got it',
  solo: 'Your pace comes first',
  soloBody: 'Walk, move, rest. Your real activity shapes your bird, even when the app is closed.',
  flock: 'Good company helps',
  flockBody:
    `Make a flock of up to ${FREE_SQUAD_MAX_MEMBERS}. A shared sky gives you a reason to show up again.`,
} as const;
