import { create } from 'zustand';

/**
 * App chrome that a *screen* needs to control but does not own.
 *
 * Creating or joining a squad is a full-screen task: the orbit nav floating
 * over the form reads as an escape hatch out of a half-finished thing, and it
 * paints over the bottom of the form. The obvious fix — promoting those panes
 * to their own route group — is the expensive one: `app/_layout.tsx` renders a
 * bare `<Slot/>` and `redirectTarget()` in `features/auth/route.ts` branches on
 * `segments[0]`, so a new group hands that module a value it has never seen and
 * 17 tests' worth of routing behaviour goes with it.
 *
 * So the nav is told to stand down instead. In-memory on purpose, matching
 * `useOnboardingStore`: chrome state that outlives a force-quit would be a bug,
 * not a feature.
 *
 * `TabPill` reads this to render nothing, and `Screen` reads it to drop
 * `TAB_PILL_CLEARANCE` — both halves have to move together or the form floats
 * above a gap where the nav used to be.
 */
type ChromeState = { navHidden: boolean };

export const useChromeStore = create<ChromeState>(() => ({ navHidden: false }));

export function setNavHidden(hidden: boolean): void {
  useChromeStore.setState({ navHidden: hidden });
}
