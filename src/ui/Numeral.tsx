import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, type TextStyle } from 'react-native';
import { colors, font } from '../theme.ts';
import { useCountUp, useReduceMotion } from './motion.ts';

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
  const reduceMotion = useReduceMotion();

  // useCountUp seeds its displayed value at 0 the instant it is enabled,
  // before React can know whether this device has Reduce Motion on — that
  // check is asynchronous, so `counted` cannot be trusted until it resolves.
  // `useReduceMotion()` has the same blind spot (it also defaults to `false`
  // pre-resolution), so it can't answer "is it safe yet" on its own — only
  // "what is the answer once known". This second, minimal check exists
  // purely to learn *when* that resolution has happened; once it has,
  // `reduceMotion` above is trusted for the actual (and any later, live)
  // value.
  const [motionKnown, setMotionKnown] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(() => {
      if (alive) setMotionKnown(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shown = (() => {
    if (typeof value !== 'number') return value;
    if (!wantsCountUp) return value.toLocaleString();
    if (!motionKnown) return ''; // unresolved: withhold rather than risk counted's 0 seed
    if (reduceMotion) return value.toLocaleString(); // no animation is ever correct here
    return counted.toLocaleString();
  })();

  return <Text style={[font.display[size], { color }, style]}>{shown}</Text>;
}
