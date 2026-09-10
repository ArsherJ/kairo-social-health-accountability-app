import { type TextStyle } from 'react-native';
import { font } from '../theme.ts';
import { useCountUp, useReduceMotionState } from './motion.ts';
import { Text } from './Text.tsx';
import { useTheme } from './use-theme.ts';

/**
 * Every focal point in Kairo is a number, and this is the only thing that
 * renders one. Strings are accepted for ordinals ("3rd") so the hero slot has
 * one component rather than two.
 *
 * `animate` only means something for a numeric `value`; the union below makes
 * `animate` on a string `value` a type error instead of a silent no-op.
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

export function Numeral({ value, size = 'major', color, animate = false, style }: NumeralProps) {
  const { colors } = useTheme();
  const ink = color ?? colors.text;
  const numeric = typeof value === 'number' ? value : 0;
  const wantsCountUp = animate && typeof value === 'number';
  const counted = useCountUp(numeric, wantsCountUp);
  const { reduce: reduceMotion, ready: motionReady } = useReduceMotionState();

  // Until the Reduce Motion state resolves nothing is shown at all, so no
  // flash occurs when it flips true and forces the animation to zero.
  const shown = (() => {
    if (typeof value !== 'number') return value;
    if (!wantsCountUp) return value.toLocaleString();
    if (!motionReady) return value.toLocaleString();
    if (reduceMotion) return value.toLocaleString();
    return counted.toLocaleString();
  })();

  // Reserve the layout box by rendering with opacity: 0 until motion state is known.
  const opacity = wantsCountUp && !motionReady ? 0 : 1;
  // `style` is spread before the colour/opacity object, not after: a
  // caller-supplied `opacity` silently beating the anti-flash guard would be a
  // correctness bug, not a feature.
  return (
    <Text
      // `fixed`: every numeral in the app sits in drawn geometry.
      scale="fixed"
      style={[font.display[size], style, { color: ink, opacity }]}
      // Announce the settled number, never the count-up.
      accessibilityLabel={typeof value === 'number' ? value.toLocaleString() : value}
    >
      {shown}
    </Text>
  );
}
