import { RACE_FINISH_LINE } from '@kairo/core';

/**
 * How Kairo counts your activity — the words, in one place.
 *
 * Nothing in the app told a player how a walk becomes a figure: which apps'
 * steps are counted, what a typed-in number does, where the day stops, what
 * a flag means. The player who saw "Steps from X aren't counted yet" or a
 * flag had nowhere to go. This is where they go, reached from Settings, the
 * privacy beat and the Today details sheet.
 *
 * Zero React import so root Vitest can hold it, the way `step-sources.ts`
 * and `claim-copy.ts` are held. `counting-copy.test.ts` bans the hourly
 * ceilings — formatted and bare — because the one reader with a motive to
 * know the bar is the one sitting just under it (`health-ingest.md`), and
 * bans the accusing words `step-sources.ts` refuses: a cheap band that writes
 * under its own identifier is *not counted yet*, and its owner is not a
 * suspect. It names the ridge through the constant and never a literal.
 *
 * It uses the glossary's words — counted, typed in, ridge, flag — so the
 * sentence here and the sentence on Today are about the same thing.
 */
export const COUNTING_COPY = {
  title: 'How Kairo counts your activity',
  standfirst:
    'Your bird lives off what Apple Health already recorded. This is how that becomes a day.',
  sections: [
    {
      title: 'Where steps come from',
      body:
        'Steps your iPhone, your Apple Watch or another Apple-recorded device wrote to Health are counted. Steps another app wrote — a band that keeps its own record, say — aren’t counted yet, and Today names the app so you know why a number looks low. Owning one is fine; Kairo just hasn’t learned to read it.',
    },
    {
      title: 'What is left out',
      body:
        'A figure typed into the Health app by hand is left out at the read, on every kind of figure. For Kairo that day never happened, rather than happened and got discounted. Kairo never writes to Apple Health — the read goes one way.',
    },
    {
      title: 'Where the day stops',
      body:
        `The ridge is ${RACE_FINISH_LINE.toLocaleString('en-US')} steps, and steps past it don’t carry you further — on the sky, everybody who crossed it sits at the same line. Each stat’s points stop at its own top the same way, so a huge day and a full day look alike.`,
    },
    {
      title: 'What a flag means',
      body:
        'A flag marks a day whose hours don’t look like human movement. It costs no points: the day still scores, still feeds your bird and still counts for your streak. What it can’t do is set a personal best that day, and your flock sees the flag on your row. It is about that day only. Tomorrow starts clean.',
    },
    {
      title: 'Where it happens',
      body:
        'The sorting — counted, typed in, left out — happens on your phone before anything is sent. The server then keeps each day as hours and re-scores the whole day from them every time, which is why a correction Apple makes later simply becomes the new day rather than a second one.',
    },
  ],
} as const;
