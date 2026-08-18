import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '@/features/auth/session.ts';
import { SpeciesPicker } from '@/features/character/SpeciesPicker.tsx';
import type { SpeciesId } from '@/features/character/species.ts';
import { profileKey, useProfile } from '@/features/profile/queries.ts';
import { supabase } from '@/lib/supabase.ts';
import { colors, space } from '@/theme.ts';
import { BackRow } from '@/ui/index.ts';

/**
 * Choose or change your species.
 *
 * **Groupless on purpose, and it is the only shape that works.**
 * `redirectTarget` cuts both ways: a `ready` user in `(onboard)` is bounced to
 * `/`, and a `needs-profile` user *outside* `(onboard)` is bounced to
 * `/connect`. So no single route can serve both onboarding and an existing
 * user — `app/(onboard)/character.tsx` mounts the same picker for onboarding,
 * and this route serves everyone past it. Groupless is what the `ready` case's
 * denylist explicitly permits, the same as `/goal/new` and `/delete-account`.
 *
 * Unlike the onboarding mount, this one **writes**: the profile row already
 * exists, so there is no INSERT to defer to and deviation #22's ordering rule
 * does not apply here.
 *
 * **Not wrapped in `Screen`**, and that is not a style preference. `Screen`
 * applies its own `paddingHorizontal: space.lg` and, by default, is itself a
 * ScrollView — and `SpeciesPicker` is a `flex: 1` column that already owns
 * both. Doubling the padding would leave the picker's `textWidth` arithmetic
 * describing a width the cards no longer have, which is precisely the
 * clip-mid-word failure that comment exists to prevent; nesting its ScrollView
 * inside another gives the inner one no bounded height to scroll within. The
 * onboarding mount wraps the picker in a plain inset `View` for the same
 * reason, so this matches it, plus a way back out.
 */
export default function ChooseSpecies() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const [selected, setSelected] = useState<SpeciesId | null>(
    profile.data?.species ?? null,
  );

  const save = useMutation({
    mutationFn: async (species: SpeciesId) => {
      if (!userId) throw new Error('Not signed in.');
      // A direct UPDATE under the column-scoped grant — there is no RPC, and
      // RLS confines it to auth.uid()'s own row. Raw PostgrestError text never
      // reaches the screen; see create-profile.ts for why.
      const { error } = await supabase
        .from('profiles')
        .update({ species })
        .eq('id', userId);
      if (error) {
        console.warn('[chooseSpecies] update failed', error.code, error.message);
        throw new Error("Couldn't save that. Check your connection and try again.");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileKey(userId) });
      router.back();
    },
  });

  const first = profile.data?.species == null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xl,
      }}
    >
      {/* The picker owns the screen's horizontal padding, so the way out has
          to carry its own to line up with the cards below it. */}
      <View style={{ paddingHorizontal: space.lg }}>
        <BackRow onPress={() => router.back()} disabled={save.isPending} />
      </View>

      <SpeciesPicker
        title={first ? 'Who’s coming with you?' : 'Change your companion'}
        help={
          first
            ? 'Your character is one of four animals found only in the Philippines. You can change this any time.'
            : 'Purely cosmetic — nothing about your stats or scores changes.'
        }
        cta={first ? 'Choose' : 'Save'}
        selected={selected}
        onSelect={setSelected}
        onConfirm={(id) => save.mutate(id)}
        busy={save.isPending}
      />
    </View>
  );
}
