import { createContext, createElement, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { type Scheme, type Theme, themes } from '../theme.ts';
import { resolveScheme } from './appearance.ts';
import { useAppearanceStore } from './appearance-store.ts';

const SchemeContext = createContext<Scheme | undefined>(undefined);

/** A local rendering scope; never writes the remembered device preference. */
export function ThemeScope({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return createElement(SchemeContext.Provider, { value: scheme }, children);
}

/**
 * The scheme the app is drawing in right now.
 *
 * Two inputs: the remembered preference and the phone's own answer.
 * `useColorScheme` only ever reports what `UIUserInterfaceStyle` lets it —
 * `app.config.ts` sets `userInterfaceStyle: 'automatic'` for exactly this
 * reason, and pinning it back to a scheme would make `system` a lie.
 */
export function useScheme(): Scheme {
  const scoped = useContext(SchemeContext);
  const preference = useAppearanceStore((s) => s.preference);
  const system = useColorScheme();
  // RN can answer `'unspecified'` on some hosts; the policy reads anything
  // that is not `'dark'` as light, so it is passed through as unknown.
  return scoped ??
    resolveScheme(preference, system === 'dark' ? 'dark' : system === 'light' ? 'light' : null);
}

/** The tokens for the current scheme. Same names as the static exports. */
export function useTheme(): Theme {
  return themes[useScheme()];
}

/**
 * A stylesheet built per scheme and cached per factory.
 *
 * `StyleSheet.create` at module scope captures token *values* at load time,
 * which is what made the palette a static thing. A screen that follows the
 * scheme writes its styles as `(t: Theme) => StyleSheet.create({...})` and
 * reads them through this — the sheet is built once per scheme and per
 * factory, so a re-render costs a map lookup and a tab switch costs nothing.
 *
 * The cache is keyed by the factory's identity, so it has to be a module-level
 * constant: a factory written inline in a component is a new function on every
 * render and would rebuild the sheet each time.
 */
const cache = new WeakMap<object, Partial<Record<Scheme, unknown>>>();

export function useStyles<S>(factory: (theme: Theme) => S): S {
  const theme = useTheme();
  return useMemo(() => {
    let perScheme = cache.get(factory);
    if (perScheme === undefined) {
      perScheme = {};
      cache.set(factory, perScheme);
    }
    let sheet = perScheme[theme.scheme] as S | undefined;
    if (sheet === undefined) {
      sheet = factory(theme);
      perScheme[theme.scheme] = sheet;
    }
    return sheet;
  }, [factory, theme]);
}
