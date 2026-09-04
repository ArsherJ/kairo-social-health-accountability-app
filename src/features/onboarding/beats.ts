/**
 * The onboarding run, written down once.
 *
 * Every beat of the run used to hand-write its own rail position — `filled={2}
 * partial={0.5}` on the difficulty screen, `filled={4}` on the name screen, and
 * so on across seven render sites. That is arithmetic restated seven times
 * against a shape nothing declared: adding a beat meant finding all seven and
 * hoping the sums still landed, and getting one wrong is invisible until
 * somebody watches the bar on a device.
 *
 * So the run declares its **phases** and the rail positions are derived. A beat
 * says which phase it belongs to; `resolveBeats` gives it `filled` (the phase)
 * and `partial` (how far through that phase's beats it sits). Adding a beat is
 * one entry and the partials around it re-derive themselves.
 *
 * **The rail measures phases, not screens** — four segments for seven beats,
 * for the reasons in `OnboardingChrome.tsx`. That component owns how the rail
 * *looks*; this module owns where each beat sits on it.
 *
 * **Zero runtime imports, deliberately.** Root Vitest defines no `@/` alias and
 * cannot parse React Native's Flow syntax, so a module that reaches either is
 * untestable — the same constraint `stat-names.ts` and `kairo-voice.ts` record.
 * The run's order and its copy are exactly the things worth a test.
 */

/** Segments the rail draws. Four phases: what this is, letting it in, your choices, the name. */
export const RAIL_PHASES = 4;

export type BeatName =
  | 'welcome'
  | 'one-sky'
  | 'mirror'
  | 'connect'
  | 'hatching'
  | 'difficulty'
  | 'privacy'
  | 'name';

/**
 * The routes the run actually has files for.
 *
 * Written out rather than derived as `` `/${BeatName}` ``, because the hatch is
 * a beat with no route and that template would mint `/hatching` — a path Expo
 * Router's typed routes correctly refuse, at every call site that passes one of
 * these to `router`.
 */
export type BeatRoute =
  | '/welcome'
  | '/one-sky'
  | '/mirror'
  | '/connect'
  | '/difficulty'
  | '/privacy'
  | '/name';

export interface BeatSpec {
  name: BeatName;
  /**
   * The route this beat lives on, and the name its impression reports.
   *
   * `null` for a beat that is a *phase* of another beat's screen rather than a
   * route of its own — the hatch, which `/connect` swaps to in place. It draws
   * a rail step and has no impression to report.
   */
  route: BeatRoute | null;
  /** Which rail phase this beat belongs to, 0-indexed. */
  phase: number;
  /**
   * The words on this beat's one fat button.
   *
   * Each beat says what *this* beat is for. Three identical "Next" taps told a
   * new account nothing about where they were, on the one run whose whole job
   * is orientation. `null` where the beat has no button of its own — the hatch
   * advances on a timer.
   *
   * `/connect` carries the ask's label. Its two other buttons ("Continue" past
   * an already-granted or unsupported source, "Not now") are contextual copy
   * for states this beat alone has, and stay on that screen.
   */
  cta: string | null;
}

export interface OnboardingBeat extends BeatSpec {
  /** Phases completed, 0–RAIL_PHASES. */
  filled: number;
  /** 0–1 through the current phase. */
  partial: number;
}

/**
 * The run, in the order it is walked. Beats of a phase are contiguous.
 */
const SPECS: readonly BeatSpec[] = [
  { name: 'welcome', route: '/welcome', phase: 0, cta: "Let's fly" },
  { name: 'one-sky', route: '/one-sky', phase: 0, cta: "I'm in" },
  { name: 'mirror', route: '/mirror', phase: 0, cta: 'Show me' },
  { name: 'connect', route: '/connect', phase: 1, cta: 'Connect Apple Health' },
  { name: 'hatching', route: null, phase: 1, cta: null },
  { name: 'difficulty', route: '/difficulty', phase: 2, cta: 'Lock it in' },
  { name: 'privacy', route: '/privacy', phase: 2, cta: 'Good to know' },
  { name: 'name', route: '/name', phase: 3, cta: 'Say hello' },
];

/**
 * Give each beat its place on the rail.
 *
 * `filled` is the beat's phase and `partial` is its position within that
 * phase's beats, so the last beat of a phase always closes it out at 1 — which
 * is what stops a two-beat phase feeling like the bar has stalled.
 */
export function resolveBeats(specs: readonly BeatSpec[]): readonly OnboardingBeat[] {
  return specs.map((spec) => {
    const inPhase = specs.filter((s) => s.phase === spec.phase);
    return {
      ...spec,
      filled: spec.phase,
      partial: (inPhase.indexOf(spec) + 1) / inPhase.length,
    };
  });
}

export const ONBOARDING_BEATS: readonly OnboardingBeat[] = resolveBeats(SPECS);

export function onboardingBeat(name: BeatName): OnboardingBeat {
  const beat = ONBOARDING_BEATS.find((b) => b.name === name);
  if (!beat) throw new Error(`No onboarding beat named ${name}`);
  return beat;
}

/**
 * A beat's button words, narrowed to a string.
 *
 * `cta` is nullable because the hatch has no button, and a screen that *does*
 * have one should not have to decide what a missing label means — an empty
 * string renders a blank pill and nothing anywhere notices.
 */
export function beatCta(beat: OnboardingBeat): string {
  if (beat.cta === null) throw new Error(`Onboarding beat ${beat.name} has no button`);
  return beat.cta;
}

/**
 * A beat's own route, narrowed to a real one.
 *
 * The same shape as `beatCta` and for the same reason: `route` is nullable
 * because the hatch is a phase of `/connect` rather than a screen, and a caller
 * that navigates or reports an impression should not have to decide what a
 * missing route means.
 */
export function beatRoute(beat: OnboardingBeat): BeatRoute {
  if (beat.route === null) throw new Error(`Onboarding beat ${beat.name} has no route`);
  return beat.route;
}

/**
 * Where Skip lands.
 *
 * **The last beat of the opening phase, derived — never a route written down
 * twice.** Skip's purpose is getting past the pitch, and the pitch *is* phase
 * 0, so skipping to the end of that phase is the rule rather than a
 * coincidence of which screens exist today. Both skip affordances used to name
 * `/connect`, which was right while the pitch ended there; the mirror beat is
 * the reason it no longer is, and the argument aimed at the people most likely
 * to decline is exactly the one a skip must not route around.
 *
 * It follows that the destination beat carries no skip of its own: there is
 * nothing left to skip.
 */
export function onboardingSkipTarget(): BeatRoute {
  const opening = ONBOARDING_BEATS.filter((b) => b.phase === 0);
  const last = opening.at(-1);
  if (!last) throw new Error('The onboarding run has no opening phase');
  return beatRoute(last);
}

/**
 * Which of the paged dots this beat lights, and how many there are.
 *
 * **The opening phase and the value cards are the same three beats**, so the
 * dots are derived from the run rather than restated on each card. They were
 * hand-written — `index={0} count={3}` and `index={1} count={3}` — and had gone
 * wrong in exactly the way that invites: they promised three cards while two
 * existed. The mirror beat happens to make that count right again, which is
 * luck, and luck is not a guard. This is the same move `filled`/`partial`
 * already made, applied to the one pair of numbers ticket 01 left behind.
 *
 * The dots stay, and they do **not** duplicate the rail: the rail answers how
 * far through the run, the dots answer which value card, and the dots are
 * hidden from assistive technology so only one of them announces position.
 */
export function valueCardPosition(beat: OnboardingBeat): { index: number; count: number } {
  const cards = ONBOARDING_BEATS.filter((b) => b.phase === 0);
  const index = cards.findIndex((b) => b.name === beat.name);
  if (index < 0) throw new Error(`Onboarding beat ${beat.name} is not a value card`);
  return { index, count: cards.length };
}

/**
 * What the rail says out loud.
 *
 * Lives here rather than in the component so the sentence is pinned by a test —
 * a rail that renders identically and *speaks* differently is the regression
 * this is most likely to hide. Clamped, because the last beat closes the rail
 * out and there is no fifth step to announce.
 */
export function railStepLabel(filled: number): string {
  return `Step ${Math.min(RAIL_PHASES, filled + 1)} of ${RAIL_PHASES}`;
}
