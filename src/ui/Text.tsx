import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

/**
 * The only Text in Kairo.
 *
 * React Native's `Text` scales with iOS Dynamic Type without any upper bound,
 * so at the largest accessibility sizes a 34pt display line becomes ~80pt and
 * every fixed-height row in the app tears apart. Nothing in the codebase set a
 * bound until 2026-08-14, which meant the accessibility setting the app most
 * needed to respect was the one most likely to break it.
 *
 * The answer is a **cap, never a refusal**. `allowFontScaling={false}` would
 * make the layout safe by making the app unreadable for the people the setting
 * exists for, so it does not appear anywhere in this codebase and should not
 * start now.
 *
 * Wrapping rather than configuring: `Text.defaultProps` no longer works on
 * modern React Native, so a component is the only way to set this once. Import
 * `Text` from `@/ui` and not from `react-native` — the two are otherwise
 * identical, which is exactly why the wrong one is easy to reach for.
 */

/**
 * How far each kind of type may grow.
 *
 * The scale is set by **what the type sits inside**, not by how important it
 * is. Prose reflows and can grow a long way; a numeral centred in a drawn
 * circle cannot grow at all without leaving the circle.
 */
export const textScale = {
  /**
   * Body copy, help text, empty states, error explanations — anything whose
   * container grows with it.
   *
   * The most generous cap in the system, deliberately: this is the type a
   * person who has turned Dynamic Type up is actually trying to read, and it
   * lives in containers that can afford it.
   */
  prose: 1.8,
  /**
   * Buttons, tabs, eyebrows, meta lines. Type inside chrome that has some give
   * but not unlimited give — a button grows its height happily and its width
   * only so far before the label wraps into something that no longer reads as
   * a button.
   */
  chrome: 1.4,
  /**
   * Type locked to geometry the app draws: the numeral inside a stat coin, a
   * rank in a fixed-height leaderboard row, the wordmark.
   *
   * Scaling further does not make these more readable, it makes them collide.
   * Where a number matters and cannot grow, the accessible answer is the
   * `accessibilityLabel` that spells it out — not a bigger glyph.
   */
  fixed: 1.2,
} as const;

export type TextScale = keyof typeof textScale;

export interface TextProps extends RNTextProps {
  /**
   * Defaults to `prose`, so the generous case is what you get without
   * thinking about it and tightening is a deliberate act at the few places
   * geometry demands it.
   */
  scale?: TextScale;
}

export function Text({ scale = 'prose', ...props }: TextProps) {
  // `maxFontSizeMultiplier` is a prop rather than a style, which is why it
  // cannot live in the `font` tokens beside the sizes it bounds.
  return <RNText maxFontSizeMultiplier={textScale[scale]} {...props} />;
}
