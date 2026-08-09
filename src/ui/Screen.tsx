import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme.ts';
import { useChromeStore } from './chrome.ts';
import { NAV_HEIGHT } from './TabPill.tsx';

/**
 * Clearance for the floating orbit nav so content never hides beneath it.
 * `NAV_HEIGHT` plus a gap — see `TabPill`, which owns the other half of this.
 */
export const TAB_PILL_CLEARANCE = NAV_HEIGHT + space.lg;

export function Screen({
  scroll = true,
  refreshControl,
  children,
}: {
  scroll?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // When the nav stands down (create/join), so does its clearance — otherwise
  // the form floats above a gap where the nav used to be.
  const navHidden = useChromeStore((s) => s.navHidden);
  const padding = {
    paddingTop: insets.top + space.lg,
    paddingBottom: insets.bottom + (navHidden ? space.lg : TAB_PILL_CLEARANCE),
    paddingHorizontal: space.lg,
  };

  if (!scroll) {
    return <View style={[styles.container, padding]}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={padding}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
