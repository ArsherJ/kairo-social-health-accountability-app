import { create } from 'zustand';

/**
 * Whether the dev demo fixtures are standing in for the server.
 *
 * In-memory and default off, the same idiom as `useOnboardingStore`. It is a
 * simulator affordance, not a setting: a demo mode that survived a relaunch is
 * a demo mode somebody eventually ships.
 *
 * `since` is when it was switched on. Every relative timestamp in the fixtures
 * is measured back from it, so "14m" stays "14m" for as long as the toggle is
 * held rather than ageing while the screen is open.
 */
type DemoState = { on: boolean; since: number };

export const useDemoStore = create<DemoState>(() => ({ on: false, since: 0 }));

export function toggleDemo(): void {
  useDemoStore.setState((state) => ({ on: !state.on, since: Date.now() }));
}
