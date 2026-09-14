import { RACE_FINISH_LINE } from '@kairo/core';
export const SKY_SCREEN_COPY = {
  title: 'One sky. Your pace.',
  eyebrow: 'The daily flight',
  locate: 'Find my bird',
  explain: 'How the flight works',
  explanation: `Your steps carry you toward the ridge at ${
    RACE_FINISH_LINE.toLocaleString('en-US')
  } steps. Every bird stops at the same finish line.`,
  /** The rail's title over a squad's flight. */
  railFlock: 'YOUR FLOCK TODAY',
  /**
   * The rail's title over a ghost race, and the one line under the seats
   * saying what a faded bird is. Without them a solo player's own past days
   * read as strangers, or as a bug.
   */
  railGhosts: 'YOUR RECENT DAYS',
  railGhostsNote: 'Each faded bird is one of your own past days.',
} as const;
