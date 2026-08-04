import { Text, type TextStyle } from 'react-native';
import { colors, font } from '../theme.ts';
import { useCountUp, useReduceMotionState } from './motion.ts';

/**
 * Every focal point in Kairo is a number, and this is the only thing that
 * renders one. Strings are accepted for ordinals ("3rd") so the hero slot has
 * one component rather than two.
 */
export function Numeral({
  value,
  size = 'major',
  color = colors.text,
  animate = false,
  style,
}: {
  value: number | string;
  size?: 'hero' | 'major' | 'minor';
  color?: string;
  animate?: boolean;
  style?: TextStyle;
}) {
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
  return <Text style={[font.display[size], { color, opacity }, style]}>{shown}</Text>;
}
