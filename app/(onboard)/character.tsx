import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpeciesPicker } from '@/features/character/SpeciesPicker.tsx';
import type { SpeciesId } from '@/features/character/species.ts';
import { colors, space } from '@/theme.ts';

/**
 * The second onboarding screen: `/connect` → here → `/name`.
 *
 * §5's onboarding philosophy is "Character First" — name and character on
 * screen inside 60 seconds, for the emotional investment. Until now the first
 * screen was a text field; meeting the two characters and picking one is closer
 * to what that section describes.
 *
 * It was the first screen until 2026-08-17, when the Health ask moved ahead of
 * it so the name screen could land on a home tab with real numbers rather than
 * zeroes. `onboarding_started` went with it — the event names the start of
 * onboarding, not this particular screen.
 *
 * **This screen writes nothing.** The choice rides to the name screen as a
 * route param and lands in the single INSERT there. That ordering is
 * load-bearing: deviation #22 deleted the `finishingOnboarding` flag because a
 * profile row committed on step 1 flipped `resolveRoute` to 'ready' while step
 * 2 was still on screen, and the gate bounced the user off it. Choosing before
 * naming keeps the commit at the end, so neither the flag nor a store comes
 * back.
 */
export default function ChooseCharacter() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [chosen, setChosen] = useState<SpeciesId | null>(null);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xl,
      }}
    >
      <SpeciesPicker
        title="Who are you playing as?"
        // The promise is now kept: `species` is in the UPDATE grant and the
        // profile screen pushes /species to change it. This comment used to
        // explain why the screen had to stay silent — a promise the app did
        // not keep, made at the highest-attention moment in onboarding.
        help="You can change this any time."
        cta="Continue"
        selected={chosen}
        onSelect={setChosen}
        onConfirm={(id) => router.push(`/name?species=${id}`)}
      />
    </View>
  );
}
