import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Easing } from 'react-native';
import { useReduceMotionState } from '@/ui/motion.ts';
import { skyDriftProfile } from './sky-flight.ts';

export const SkyDriftActiveContext = createContext(false);

/** Resolve Reduce Motion once for the flock, before any bird may move. */
export function SkyDriftProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const { ready, reduce } = useReduceMotionState();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  return (
    <SkyDriftActiveContext.Provider value={active && foreground && ready && !reduce}>
      {children}
    </SkyDriftActiveContext.Provider>
  );
}

/** Horizontal decoration only. The value never participates in placement. */
export function useSkyDrift(
  identity: string,
  active: boolean,
): Animated.AnimatedInterpolation<number> {
  const value = useRef(new Animated.Value(0)).current;
  const profile = useMemo(() => skyDriftProfile(identity), [identity]);

  useEffect(() => {
    value.stopAnimation();
    value.setValue(0);
    if (!active) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: profile.direction,
          duration: profile.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(value, {
          toValue: -profile.direction,
          duration: profile.duration * 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: profile.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
      value.stopAnimation();
      value.setValue(0);
    };
  }, [active, profile.direction, profile.duration, value]);

  return value.interpolate({
    inputRange: [-1, 1],
    outputRange: [-profile.amplitude, profile.amplitude],
  });
}
