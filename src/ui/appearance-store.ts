import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  type AppearancePreference,
} from './appearance.ts';

/**
 * The remembered appearance, on this device.
 *
 * MMKV rather than a profile column: which scheme a phone draws in is a fact
 * about the phone, not about the account — the same reasoning that keeps the
 * sync state and the milestone markers local — and a preference that had to
 * round-trip through Supabase would paint the wrong scheme for the first frame
 * of every cold launch.
 *
 * Its own storage id, so clearing sync state or telemetry markers on sign-out
 * leaves it alone: the next person to sign in on this phone is, nearly always,
 * the same person.
 *
 * Read synchronously at module load. That is what lets the very first render
 * — the font-loading spinner in `RootLayout` — already sit on the right ground.
 */
const storage = createMMKV({ id: 'kairo.appearance' });
const KEY = 'appearance.v1';

type AppearanceState = { preference: AppearancePreference };

export const useAppearanceStore = create<AppearanceState>(() => ({
  preference: parseAppearance(storage.getString(KEY) ?? DEFAULT_APPEARANCE),
}));

export function setAppearance(preference: AppearancePreference): void {
  storage.set(KEY, preference);
  useAppearanceStore.setState({ preference });
}
