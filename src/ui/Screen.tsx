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

/**
 * The scrolling body of every tab.
 *
 * `bleed` is for the three screens whose header runs to the edge of the glass —
 * Today's sky, Flock's and You's gradient bands. It drops the horizontal and
 * top padding and hands both back to the screen, which then pads its own
 * sections; **the bottom clearance is not negotiable and stays**, because that
 * is what keeps content out from under the floating nav and no screen has a
 * reason to want it gone.
 *
 * A bleeding screen draws under the status bar on purpose, which is why it gets
 * no top inset here: the header art is meant to run behind the clock, and the
 * content inside it takes `useSafeAreaInsets` itself. A screen that bleeds and
 * then forgets that will put its first line under the notch.
 */
export function Screen({
  scroll = true,
  bleed = false,
  refreshControl,
  children,
}: {
  scroll?: boolean;
  bleed?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // When the nav stands down (create/join), so does its clearance — otherwise
  // the form floats above a gap where the nav used to be.
  const navHidden = useChromeStore((s) => s.navHidden);
  const padding = {
    paddingTop: bleed ? 0 : insets.top + space.lg,
    paddingBottom: insets.bottom + (navHidden ? space.lg : TAB_PILL_CLEARANCE),
    paddingHorizontal: bleed ? 0 : space.lg,
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
