import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { animationDuration, shouldRecount } from './motion-policy.ts';

/**
 * Tracks both Reduce Motion state and whether it has been resolved.
 * Separate from the public useReduceMotion so that useCountUp and Numeral
 * can know when the accessibility check has actually resolved (not just the
 * initial false from useState).
 */
export function useReduceMotionState(): { reduce: boolean; ready: boolean } {
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
  return useReduceMotionState().reduce;
}

/**
 * Counts to `value` on arrival and on change. Returns the displayed number.
 *
 * `enabled` is a parameter rather than a caller-side condition because hooks
 * cannot be called conditionally, and `Numeral` renders both animated and
 * static numbers.
 */
export function useCountUp(value: number, enabled = true): number {
  const { reduce: reduceMotion, ready: reduceMotionReady } = useReduceMotionState();
  const [shown, setShown] = useState<number>(() => (enabled ? 0 : value));
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
  const { reduce: reduceMotion, ready: reduceMotionReady } = useReduceMotionState();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Do not start the loop until the Reduce Motion state is known.
    if (!reduceMotionReady) {
      return;
    }

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
  }, [drift, reduceMotion, reduceMotionReady]);

  return drift;
}

/** Grows a meter from zero to `fraction` (0–1). */
export function useFillIn(fraction: number): Animated.Value {
  const { reduce: reduceMotion, ready: reduceMotionReady } = useReduceMotionState();
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Do not animate until the Reduce Motion state is known. A meter sitting at
    // 0 width for one bridge round trip is correct; it is what "grows from zero" means.
    if (!reduceMotionReady) {
      return;
    }

    Animated.timing(fill, {
      toValue: Math.max(0, Math.min(1, fraction)),
      duration: animationDuration(500, reduceMotion),
      easing: Easing.out(Easing.cubic),
      // Width is not a transform, so this cannot run on the native driver.
      useNativeDriver: false,
    }).start();
  }, [fill, fraction, reduceMotion, reduceMotionReady]);

  return fill;
}

/** Press feedback for cards and buttons — scale, not the old opacity flicker. */
export function usePressScale() {
  const { reduce: reduceMotion, ready: reduceMotionReady } = useReduceMotionState();
  const scale = useRef(new Animated.Value(1)).current;

  const to = (toValue: number) => () => {
    // User-triggered handlers typically run after Reduce Motion is resolved,
    // but gate on readiness for correctness and uniformity with other hooks.
    if (!reduceMotionReady) {
      return;
    }

    Animated.timing(scale, {
      toValue,
      duration: animationDuration(120, reduceMotion),
      useNativeDriver: true,
    }).start();
  };

  return { scale, onPressIn: to(0.97), onPressOut: to(1) };
}
