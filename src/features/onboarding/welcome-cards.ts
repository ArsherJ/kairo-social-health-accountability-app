import { FREE_SQUAD_MAX_MEMBERS, RACE_FINISH_LINE } from '@kairo/core';
// Relative, not `@/` — root Vitest defines no alias, so a value import through
// it is a load failure for this module's test. The same reason `living-mirror.ts`
// and `quest-copy.ts` reach sideways. `theme.ts` loads in Node; the two type
// imports below are erased at transform.
import { colors, ramp } from '../../theme.ts';
import type { KairoPose } from '../character/character-contract.ts';
import type { Stop } from '../../ui/gradient.ts';

/**
 * What the welcome run says, apart from how it is drawn.
 *
 * It lives here rather than in `WelcomePopups.tsx` for the reason every copy
 * module in this codebase does: root Vitest cannot load a `.tsx`, so a claim
 * made in one is a claim no test can hold. The component keeps the geometry.
 *
 * **Four cards, and the order is an argument** — who you are, the one rule,
 * what a flock is, then the ask. The first three are linear reads with a next
 * button; only the fourth carries actions, and that asymmetry is the point.
 * The ask is last because asking somebody to recruit friends before the game
 * has been explained is the ask arriving before its why, which is the rule the
 * notification policy already enforces.
 *
 * **It teaches `RACE_FINISH_LINE` and `FREE_SQUAD_MAX_MEMBERS`, never a
 * literal.** The finish line *is* `DAILY_STEP_BASELINE`, which *is* the Daily
 * Walk — one number the app teaches once and then reads three ways.
 */

/**
 * How the flock card was answered.
 *
 * **It records which door was taken, not what came of it.** `joined` means the
 * player asked for the join form, not that a squad accepted them; `squad_joined`
 * and `squad_created` already say whether anything landed. Conflating the two
 * here would make the card look like it converts far better than it does.
 */
export const FLOCK_ANSWERS = ['joined', 'invited', 'skipped'] as const;

export type FlockAnswer = (typeof FLOCK_ANSWERS)[number];

/**
 * `quiet` is the plain text link, not an `OnboardingCta` tone — declining has
 * to be frictionless and a third fat pill would make the not-now weigh as much
 * as the two asks above it.
 */
export type WelcomeActionTone = 'ink' | 'bright' | 'quiet';

export interface WelcomeAction {
  label: string;
  answer: FlockAnswer;
  tone: WelcomeActionTone;
  /** A MaterialCommunityIcons name. Solid tones only; `quiet` carries none. */
  icon?: 'ticket-confirmation-outline' | 'account-plus' | 'share-variant';
  /**
   * What VoiceOver reads, where the visible words are too short to stand alone.
   * "Not now" out of context does not say what is being declined.
   */
  spoken?: string;
}

export interface WelcomeCard {
  pose: KairoPose;
  field: Stop[];
  /**
   * Functions, not strings. `title` because the first card carries the
   * character's name and a template baked at module load would need that value
   * at module load; `body` for symmetry with it, so a card that later needs a
   * value can take one without every call site changing shape.
   */
  title: (characterName: string) => string;
  body: () => string;
  /** Present on the flock ask and nowhere else. */
  actions?: (inviteCode: string | null) => WelcomeAction[];
}

/**
 * The three options, all real and none of them dark.
 *
 * **The join door is withheld from somebody who already has a squad.** Their
 * own invite code is the proof of one, the free tier holds exactly one, so a
 * join door for them is a path that can only fail — and an option that cannot
 * work is worse than one fewer option. They are offered the share instead,
 * which is the thing they can actually do.
 */
export function flockActions(inviteCode: string | null): WelcomeAction[] {
  const notNow: WelcomeAction = {
    label: 'Not now',
    answer: 'skipped',
    tone: 'quiet',
    spoken: 'Not now. Carry on without a flock.',
  };

  if (inviteCode !== null) {
    return [
      {
        label: 'Share my code',
        answer: 'invited',
        tone: 'bright',
        icon: 'share-variant',
      },
      notNow,
    ];
  }

  return [
    {
      label: 'I have a code',
      answer: 'joined',
      tone: 'ink',
      icon: 'ticket-confirmation-outline',
    },
    {
      label: 'Invite a friend',
      answer: 'invited',
      tone: 'bright',
      icon: 'account-plus',
    },
    notNow,
  ];
}

const SUNSET: Stop[] = [
  { color: '#ff8a4c', at: 0 },
  { color: colors.coral, at: 1 },
];
const DAYLIGHT: Stop[] = [
  { color: ramp.sky[400], at: 0 },
  { color: ramp.sky[500], at: 1 },
];
const DUSK: Stop[] = [
  { color: '#9b6bff', at: 0 },
  { color: ramp.sage[500], at: 1 },
];
// Violet into teal — squad warmth arriving at rest. Distinct from `DUSK` above
// it because two consecutive cards about the flock must not look like one card
// the tap failed to advance.
const NIGHTFALL: Stop[] = [
  { color: ramp.sage[500], at: 0 },
  { color: ramp.teal[500], at: 1 },
];

/**
 * The one word on a linear read's button. Here rather than in the component so
 * that every word the run says lives in one testable module — and because the
 * beat registry's scan forbids a `label="…"` literal in these directories, for
 * exactly that reason.
 */
export const WELCOME_NEXT_LABEL = 'Next';

export const WELCOME_CARDS: WelcomeCard[] = [
  {
    pose: 'race_victory',
    field: SUNSET,
    title: (name) => `Welcome to Kairo, ${name}!`,
    body: () => 'Your bird is hatched and your day has already started.',
  },
  {
    pose: 'run',
    field: DAYLIGHT,
    title: () => `Cross ${RACE_FINISH_LINE.toLocaleString()} and the day is yours`,
    body: () => 'Same flag for everybody, every day. Miss one and your shield covers it.',
  },
  {
    // The reason, not the ask — which is why it kept a next button when the
    // fourth card took the invite CTA off it. "flock", never "barkada":
    // deviation #26 retired that word along with "Hunter".
    pose: 'walk',
    field: DUSK,
    title: () => `A flock is up to ${FREE_SQUAD_MAX_MEMBERS} birds`,
    body: () =>
      'Everybody chases the same flag, all day. At the end of it somebody gets named the day’s leader.',
  },
  {
    pose: 'idle',
    field: NIGHTFALL,
    title: () => 'Flying alone is fine',
    body: () =>
      'It’s better with a flock. Start one, or join somebody else’s — and the Sky tab keeps the invite open if now is not the moment.',
    actions: flockActions,
  },
];
