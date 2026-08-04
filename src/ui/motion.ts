import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { animationDuration, shouldRecount } from './motion-policy.ts';

/**
 * Internal: tracks both Reduce Motion state and whether it has been resolved.
 * Separate from the public useReduceMotion so that useCountUp can know when the
 * value is actually known (not just the initial false from useState).
 */
function _useReduceMotionFull() {
  const [state, setState] = useState({ reduce: false, ready: false });

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setState({ reduce: on, ready: true });
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      setState({ reduce: on, ready: true });
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return state;
}

/** Live Reduce Motion state. Read once here so no screen can forget it. */
export function useReduceMotion(): boolean {
  return _useReduceMotionFull().reduce;
}

/**
 * Counts to `value` on arrival and on change. Returns the displayed number.
 *
 * `enabled` is a parameter rather than a caller-side condition because hooks
 * cannot be called conditionally, and `Numeral` renders both animated and
 * static numbers.
 */
export function useCountUp(value: number, enabled = true): number {
  const { reduce: reduceMotion, ready: reduceMotionReady } = _useReduceMotionFull();
  const [shown, setShown] = useState<number>(0);
  const previous = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      previous.current = value;
      setShown(value);
      return;
    }

    // No animation may start before the Reduce Motion state is actually known.
    // Until ready, the hook returns false (initial state), which could cause
    // animations to start on devices with Reduce Motion enabled.
    if (!reduceMotionReady) {
      return;
    }

    if (!shouldRecount(previous.current, value)) return;

    const from = previous.current ?? 0;
    previous.current = value;

    const ms = animationDuration(600, reduceMotion);
    if (ms === 0) {
      setShown(value);
      return;
    }

    const driver = new Animated.Value(0);
    const id = driver.addListener(({ value: t }) =>
      setShown(Math.round(from + (value - from) * t)),
    );
    const animation = Animated.timing(driver, {
      toValue: 1,
      duration: ms,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) setShown(value);
    });

    return () => {
      animation.stop();
      driver.removeListener(id);
    };
  }, [value, enabled, reduceMotion, reduceMotionReady]);

  return shown;
}

/** The Hunter's idle float. ±6px, 4.5s, forever. Nothing else uses this. */
export function useFloat(): Animated.Value {
  const reduceMotion = useReduceMotion();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animationDuration(2_250, reduceMotion) === 0) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2_250,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2_250,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduceMotion]);

  return drift;
}

/** Grows a meter from zero to `fraction` (0–1). */
export function useFillIn(fraction: number): Animated.Value {
  const reduceMotion = useReduceMotion();
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: Math.max(0, Math.min(1, fraction)),
      duration: animationDuration(500, reduceMotion),
      easing: Easing.out(Easing.cubic),
      // Width is not a transform, so this cannot run on the native driver.
      useNativeDriver: false,
    }).start();
  }, [fill, fraction, reduceMotion]);

  return fill;
}

/** Press feedback for cards and buttons — scale, not the old opacity flicker. */
export function usePressScale() {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const to = (toValue: number) => () => {
    Animated.timing(scale, {
      toValue,
      duration: animationDuration(120, reduceMotion),
      useNativeDriver: true,
    }).start();
  };

  return { scale, onPressIn: to(0.97), onPressOut: to(1) };
}
