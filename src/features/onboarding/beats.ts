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
  | 'connect'
  | 'hatching'
  | 'difficulty'
  | 'privacy'
  | 'name';

export interface BeatSpec {
  name: BeatName;
  /**
   * The route this beat lives on, and the name beat telemetry reports.
   *
   * `null` for a beat that is a *phase* of another beat's screen rather than a
   * route of its own — the hatch, which `/connect` swaps to in place. It draws
   * a rail step and has no impression to report.
   */
  route: `/${BeatName}` | null;
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
