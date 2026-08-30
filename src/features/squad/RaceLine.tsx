import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Racer } from '@kairo/core';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';
import { Gradient, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';

/** Night, so the one dark card on Today reads as the sky it opens. */
const NIGHT: Stop[] = [
  { color: colors.text, at: 0 },
  { color: '#4a2e8c', at: 1 },
];

/**
 * The race, as one line and a door.
 *
 * Today has said the race four ways across three redesigns: a full track, then
 * a card, then a bare sentence (2026-08-27, when the race got its own tab), now
 * a line with faces on it. The sentence was the right call and slightly too
 * quiet — it read as the bird's commentary rather than as a way through to the
 * Sky, so nothing on Today pointed at the tab beside it.
 *
 * **It is the gap, never a total** (deviation #34). "1,240 to Ramon" is the one
 * figure, and it is the same one `row-label.ts` speaks on a leaderboard row —
 * the distance to the bird ahead, which is the only part of a race that belongs
 * on a screen about your own day.
 *
 * **This adds no request.** The board payload is already fetched by Today for
 * the hero sentence, ranked by the same client-side `rankRacers` over capped
 * steps — `squad_leaderboard()` orders by the program-weighted total, and
 * ranking once in SQL silently deletes the program feature (deviation #11).
 *
 * Renders nothing when there is nobody ahead. A solo player, or the player in
 * front, has no gap to name, and a card saying "you are winning" is a different
 * proposition that the Sky tab already makes properly.
 */
export function RaceLine({
  racers,
  me,
  ahead,
}: {
  racers: readonly Racer[];
  me: Racer | undefined;
  ahead: Racer | undefined;
}) {
  const router = useRouter();
  if (!me || !ahead) return null;

  const gap = Math.max(0, ahead.cappedSteps - me.cappedSteps);
  const faces = racers.slice(0, 3);

  return (
    <Pressable
      accessibilityRole="button"
      // One element, one sentence. The faces are decoration and the chevron is
      // affordance; neither is a fact, so neither is spoken.
      accessibilityLabel={`${gap.toLocaleString()} steps behind ${ahead.characterName}. Open the sky.`}
      onPress={() => router.push('/sky')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Gradient stops={NIGHT} steps={12} style={styles.fill} />

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.body}
      >
        {/* Overlapping thumbnails, which is the one place in Kairo a negative
            margin is right: the stack says "several of you" without spending
            the width three separate avatars would. */}
        <View style={styles.faces}>
          {faces.map((racer, i) => (
            <View
              key={racer.userId}
              style={[styles.face, i > 0 && styles.faceOverlap]}
            >
              <KairoThumbnail pose="run" size={30} decorative />
            </View>
          ))}
        </View>

        <MaterialCommunityIcons name="arrow-up-bold" size={16} color={ramp.gold[400]} />
        {/* `flexShrink` on the name and not on the number: at large Dynamic
            Type the rival's name is what may truncate, never the gap — the gap
            is the entire content of this row. */}
        <Text scale="fixed" style={styles.gap}>
          {gap.toLocaleString()}
        </Text>
        <Text scale="chrome" numberOfLines={1} style={styles.rival}>
          to {ahead.characterName}
        </Text>

        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color="rgba(255,255,255,0.7)"
          style={styles.chevron}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: radius.lg + 4,
    borderCurve: 'continuous',
    overflow: 'hidden',
    ...shadow.md,
  },
  pressed: { opacity: 0.85 },
  fill: { borderRadius: radius.lg + 4 },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  faces: { flexDirection: 'row' },
  face: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ramp.accent[300],
    overflow: 'hidden',
  },
  faceOverlap: { marginLeft: -10 },
  gap: { ...font.display.minor, color: colors.bg },
  rival: { ...font.body.strong, color: 'rgba(255,255,255,0.66)', flexShrink: 1 },
  chevron: { marginLeft: 'auto' },
});
