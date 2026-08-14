import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CharacterBody } from '@/features/profile/character-body.ts';
import { Button, Label, Text } from '@/ui/index.ts';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';

/**
 * The first thing anyone sees after signing in.
 *
 * §5's onboarding philosophy is "Character First" — name and character on
 * screen inside 60 seconds, for the emotional investment. Until now the first
 * screen was a text field; meeting the two characters and picking one is closer
 * to what that section describes.
 *
 * **This screen writes nothing.** The choice rides to the name screen as a
 * route param and lands in the single INSERT there. That ordering is
 * load-bearing: deviation #22 deleted the `finishingOnboarding` flag because a
 * profile row committed on step 1 flipped `resolveRoute` to 'ready' while step
 * 2 was still on screen, and the gate bounced the user off it. Choosing before
 * naming keeps the commit at the end, so neither the flag nor a store comes
 * back.
 */
const CHOICES: { body: CharacterBody; art: number }[] = [
  { body: 'male', art: require('../../assets/character/anchor-male.png') },
  { body: 'female', art: require('../../assets/character/anchor-female.png') },
];

export default function ChooseCharacter() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [chosen, setChosen] = useState<CharacterBody | null>(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.xl }]}>
      <View style={styles.top}>
        <Label>CHOOSE YOUR CHARACTER</Label>
        <Text style={styles.title}>Who are you playing as?</Text>
        {/* Deliberately silent on whether this can be changed later: it cannot yet.
            `character_body` is in the UPDATE grant, but no screen writes it and the
            spec scoped that toggle out — so a promise here would be one the app does
            not keep, made at the highest-attention moment in onboarding. */}
        <Text style={styles.help}>This is the character that levels with you.</Text>

        <View style={styles.row}>
          {CHOICES.map(({ body, art }) => (
            <Pressable
              key={body}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen === body }}
              accessibilityLabel={body === 'male' ? 'Male character' : 'Female character'}
              onPress={() => setChosen(body)}
              style={[styles.card, chosen === body && styles.cardChosen]}
            >
              <Image source={art} style={styles.art} resizeMode="contain" />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        <Button
          label="Continue"
          onPress={() => chosen && router.push(`/name?body=${chosen}`)}
          variant="primary"
          disabled={chosen === null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
  },
  top: { flex: 1 },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  // Raised is *lighter* on this system, and depth comes from shadow rather
  // than from a border (see theme.ts) — so an unchosen card carries no ring at
  // all and the chosen one earns the terracotta.
  card: {
    flex: 1,
    aspectRatio: 0.72,
    borderRadius: radius.xl,
    backgroundColor: ramp.sage[200],
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    // Transparent border reserves the space a selection border needs, so
    // choosing a card only recolours the ring instead of resizing the card
    // (RN insets borders, which would otherwise nudge the art on tap).
    borderWidth: 3,
    borderColor: 'transparent',
    ...shadow.sm,
  },
  cardChosen: { borderColor: colors.accent, ...shadow.md },
  art: { width: '86%', height: '86%' },
});
