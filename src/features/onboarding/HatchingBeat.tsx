import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Gradient, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';
import { OnboardingRail } from './OnboardingChrome.tsx';
import { pickTrivia } from './trivia.ts';

/**
 * Night, deepening downward.
 *
 * The design draws a radial from the top; this is a vertical linear plus one
 * soft body behind the lamp, which at this scale is indistinguishable and costs
 * a column of `<View>`s rather than a ring of them. `Gradient` bands linearly
 * only — see its own comment on why no gradient library is installed and none
 * is coming.
 */
const NIGHT: Stop[] = [
  { color: '#221a4a', at: 0 },
  { color: colors.midnight, at: 0.52 },
  { color: '#100c28', at: 1 },
];

/**
 * The beat between granting Health and seeing your own step count.
 *
 * **The work behind it is real** — `healthSource.readStepsToday` is running,
 * which on a device with years of Health data and a cold HealthKit daemon is
 * not instant. What `hatching-window.ts` adds is a floor so the sentence can be
 * read rather than flashed; that module carries the full argument for the
 * trade, including the one constant that removes it.
 *
 * It is a **phase of `/connect`, not a route of its own.** The design draws it
 * as a separate screen and visually it is one — full-bleed, its own ground, its
 * own rail position — but the work it covers lives in `/connect`'s `connect()`,
 * and a route boundary in the middle of an in-flight promise buys a back-swipe
 * into a screen whose work has already moved on. Same surface, no navigation.
 *
 * The whole card is **one accessibility element**. A lamp, an eyebrow, a
 * three-part headline, a note and a status line are six stops for something
 * that makes one statement and cannot be acted on. The status is spoken last
 * because it is the only part that is about the app rather than about the
 * reader.
 */
export function HatchingBeat({ userId }: { userId: string | undefined }) {
  const insets = useSafeAreaInsets();
  // Deterministic: `Math.random()` here is a side effect in a render body, and
  // React may render twice — the card would swap its own text while being read.
  const fact = pickTrivia(userId);

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View style={styles.screen}>
      <Gradient stops={NIGHT} steps={24} />
      <View {...hidden} style={styles.glow} />

      <View
        style={[
          styles.body,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <Text {...hidden} scale="fixed" style={styles.wordmark}>
          KAIRO
        </Text>

        {/* No back, and no skip. There is nothing to go back to — the
            permission has already been granted — and nothing to skip, because
            the beat ends when the read does. A control that did nothing would
            be worse than none. */}
        <OnboardingRail filled={1} partial={1} tone="light" />

        <View
          accessible
          accessibilityLabel={
            `Did you know? ${fact.lead} ${fact.figure} ${fact.tail} ${fact.note}. ` +
            'Setting up your Kairo.'
          }
          style={styles.middle}
        >
          <View {...hidden} style={styles.lamp}>
            <MaterialCommunityIcons name="lightbulb-on" size={30} color={ramp.gold[400]} />
          </View>

          <Text {...hidden} scale="chrome" style={styles.eyebrow}>
            DID YOU KNOW?
          </Text>

          {/* One `Text` with a nested span, not three siblings in a row: the
              headline has to wrap as a paragraph, and a flex row of three
              pieces would break between them instead of between words. */}
          <Text {...hidden} scale="chrome" style={styles.headline}>
            {fact.lead}{' '}
            <Text style={styles.figure}>{fact.figure}</Text>
            {fact.tail ? ` ${fact.tail}` : ''}
          </Text>

          <Text {...hidden} scale="chrome" style={styles.note}>
            {fact.note}
          </Text>
        </View>

        <View {...hidden} style={styles.foot}>
          <KairoThumbnail pose="run" size={66} decorative />
          <View style={styles.status}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.55)" />
            <Text scale="chrome" style={styles.statusLabel}>
              Setting up your Kairo…
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.midnight },
  glow: {
    position: 'absolute',
    top: -160,
    alignSelf: 'center',
    width: 420,
    height: 320,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(124,77,255,0.22)',
  },
  // Flow-based and spaced by one flexible middle. No child carries a `top` —
  // the 2026-08-14 rule, which the character HUD learned the hard way.
  body: { flex: 1, paddingHorizontal: space.lg, gap: space.md },
  wordmark: {
    ...font.display.brandSmall,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  lamp: {
    width: 64,
    height: 64,
    borderRadius: 22,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: space.sm,
  },
  eyebrow: { ...font.body.label, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5 },
  headline: {
    ...font.display.major,
    fontSize: 28,
    lineHeight: 35,
    textAlign: 'center',
    color: colors.bg,
  },
  // The one painted accent on a dark ground, which is what makes it the hook.
  // `accent` rather than `accentInk` deliberately: `accentInk` is tuned to be
  // readable on *cream*, and on this ground the brighter step is both legible
  // and the thing the eye lands on.
  figure: { color: colors.accent },
  note: {
    ...font.body.body,
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    marginTop: space.xs,
  },
  foot: { alignItems: 'center', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusLabel: { ...font.body.body, fontSize: 13.5, color: 'rgba(255,255,255,0.55)' },
});
