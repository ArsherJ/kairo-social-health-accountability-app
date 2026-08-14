import { type TextStyle } from 'react-native';
import { colors, font } from '../theme.ts';
import { useCountUp, useReduceMotionState } from './motion.ts';
import { Text } from './Text.tsx';

/**
 * Every focal point in Kairo is a number, and this is the only thing that
 * renders one. Strings are accepted for ordinals ("3rd") so the hero slot has
 * one component rather than two.
 *
 * `animate` only means something for a numeric `value` — an ordinal string
 * has nothing to count up from. The two-member union below makes
 * `animate` on a string `value` a type error instead of a silent no-op, so a
 * caller cannot reasonably expect "3rd" to animate.
 */
type NumeralProps =
  | {
      value: number;
      size?: 'hero' | 'major' | 'minor';
      color?: string;
      animate?: boolean;
      style?: TextStyle;
    }
  | {
      value: string;
      size?: 'hero' | 'major' | 'minor';
      color?: string;
      animate?: false;
      style?: TextStyle;
    };

export function Numeral({
  value,
  size = 'major',
  color = colors.text,
  animate = false,
  style,
}: NumeralProps) {
  const numeric = typeof value === 'number' ? value : 0;
  const wantsCountUp = animate && typeof value === 'number';
  const counted = useCountUp(numeric, wantsCountUp);
  const { reduce: reduceMotion, ready: motionReady } = useReduceMotionState();

  // useCountUp seeds its displayed value at 0 the instant it is enabled,
  // before the Reduce Motion state resolves asynchronously. Until resolution,
  // we must not display any value at all (neither counted's initial 0 nor the
  // real value), so no flash occurs when reduceMotion flips true and forces
  // the animation to zero. useReduceMotionState() provides both the boolean
  // and the readiness flag in one subscription, avoiding duplication.
  const shown = (() => {
    if (typeof value !== 'number') return value;
    if (!wantsCountUp) return value.toLocaleString();
    if (!motionReady) return value.toLocaleString(); // unresolved: display with opacity 0
    if (reduceMotion) return value.toLocaleString(); // motion not allowed: show final value
    return counted.toLocaleString(); // motion allowed: show animated value
  })();

  // Reserve the layout box by rendering with opacity: 0 until motion state is known.
  // This prevents a visible width shift when the value becomes opaque.
  const opacity = wantsCountUp && !motionReady ? 0 : 1;
  // `style` is spread before the colour/opacity object, not after: every
  // current caller only reaches for `style` to add layout (margin), and a
  // caller-supplied `color`/`opacity` silently beating the anti-flash guard
  // would be a correctness bug, not a feature. If a real escape hatch is ever
  // needed, add a dedicated prop rather than reordering this.
  return (
    <Text
      // `fixed`: hero is already 64pt and every numeral in the app sits in
      // drawn geometry — a coin, a ring, a fixed-height row. Growing it does
      // not make it more readable, it makes it collide.
      scale="fixed"
      style={[font.display[size], style, { color, opacity }]}
      // Announce the settled number, never the count-up. A screen reader
      // re-reads a changing value, so an animating Numeral would otherwise
      // narrate every frame between 0 and the total.
      accessibilityLabel={typeof value === 'number' ? value.toLocaleString() : value}
    >
      {shown}
    </Text>
  );
}
