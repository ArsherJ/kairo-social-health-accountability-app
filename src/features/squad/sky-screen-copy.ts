import { RACE_FINISH_LINE } from '@kairo/core';
export const SKY_SCREEN_COPY = {
  title: 'One sky. Your pace.',
  eyebrow: 'The daily flight',
  locate: 'Find my bird',
  explain: 'How the flight works',
  explanation: `Your steps carry you toward the ridge at ${
    RACE_FINISH_LINE.toLocaleString('en-US')
  } steps. Every bird stops at the same finish line.`,
} as const;
