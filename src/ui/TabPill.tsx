import type { BottomTabBarProps } from 'expo-router/tabs';
import { useChromeStore } from './chrome.ts';
import { TabBar, type TabId } from './TabBar.tsx';
import { TAB_ITEMS } from './tab-copy.ts';

/**
 * The tab bar. A `BottomTabBar` replacement passed as the `tabBar` prop on the
 * `Tabs` navigator, so it receives React Navigation's own props unmodified —
 * including `insets`, which is why no `useSafeAreaInsets` call lives here.
 *
 * Presentation and motion live in `TabBar`, which is shared with the preview.
 * This adapter keeps React Navigation's press and long-press event semantics.
 *
 * `NAV_HEIGHT` is unchanged at 96, so `TAB_PILL_CLEARANCE` does not move and
 * no screen's bottom padding changes with this.
 */
export const NAV_HEIGHT = 96;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  // Create and join are full-screen tasks. `Screen` drops its clearance on the
  // same flag, so the two stay in step.
  const navHidden = useChromeStore((s) => s.navHidden);
  const focusedRoute = state.routes[state.index];
  const focusedId = TAB_ITEMS.find((item) => item.id === focusedRoute?.name)?.id;

  if (navHidden || focusedRoute === undefined || focusedId === undefined) return null;

  const routeFor = (id: TabId) => state.routes.find((route) => route.name === id);

  return (
    <TabBar
      value={focusedId}
      bottomInset={insets.bottom}
      onChange={(id) => {
        const route = routeFor(id);
        if (route === undefined) return;
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (route.key !== focusedRoute.key && !event.defaultPrevented) {
          navigation.navigate(route.name, route.params);
        }
      }}
      onLongPress={(id) => {
        const route = routeFor(id);
        if (route === undefined) return;
        navigation.emit({ type: 'tabLongPress', target: route.key });
      }}
    />
  );
}
