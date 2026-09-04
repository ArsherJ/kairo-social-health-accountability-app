import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { OnboardingCta } from '@/features/onboarding/OnboardingCta.tsx';
import { OnboardingDots, OnboardingRail } from '@/features/onboarding/OnboardingChrome.tsx';
import { beatCta, onboardingBeat, valueCardPosition } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { colors, font, ramp, space } from '@/theme.ts';
import { Gradient, GroundShadow, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';

/**
 * Dusk. Dark at the top, the last of the light at the horizon.
 *
 * The run's only dark beat, and its position is the argument: the welcome card
 * is violet-to-pink and the sky card is daylight, so this one drops in value
 * between them and hands over to `/connect`'s cream ground as morning. A day
 * ending is what the copy is about.
 */
const FIELD: Stop[] = [
  { color: colors.midnight, at: 0 },
  { color: ramp.sage[800], at: 0.58 },
  { color: ramp.sage[700], at: 1 },
];

/**
 * Beat 3 of the onboarding run — the mirror.
 *
 * **Its whole job is to move the blame before the Health ask.** The dialog on
 * the next beat is the one whose refusal cannot be undone from inside the app,
 * and the person most likely to refuse it is the person who believes their own
 * days are not worth reading. Nothing above this beat addressed that: the
 * welcome card says what Kairo is and the sky card says what the game is, and
 * both are pitches. This one is the reason.
 *
 * The structure is deliberate and is the only thing on the screen: negate the
 * shameful self-diagnosis, name the real cause, position the app as the fix,
 * and ask softly. The button says "Show me" for that last part — the registry
 * owns the words.
 *
 * **Kairo is a pose here and touches nothing in the reaction system.** The
 * character reads as low, which is `tired`'s territory — and `tired` is
 * declared in `KAIRO_REACTIONS` with no producer *deliberately*, because
 * sleepiness is a daily Mind state rather than an event, and an onboarding
 * screen has no account state to key an occurrence against. Wiring one here
 * would breach that in passing. It is a still image with a heavy ground
 * shadow, drawn the same way the welcome beat draws its three birds.
 *
 * **This beat carries no Skip.** Both skip affordances land *here* now rather
 * than past it — see `onboardingSkipTarget`. Skip's purpose is getting past
 * the pitch, and once you are on the last beat of the pitch there is nothing
 * left to skip.
 *
 * It is also the third of the three paged dots. Those promised three cards
 * while two existed; this beat makes the count honest without the dots being
 * edited.
 */
export default function Mirror() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const beat = onboardingBeat('mirror');
  useBeatImpression('mirror');

  return (
    <View style={styles.screen}>
      <Gradient stops={FIELD} steps={28} />

      <View
        style={[
          styles.body,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <OnboardingRail filled={beat.filled} partial={beat.partial} onBack={() => router.back()} />

        {/*
          Scrolls, and its copy sits inside a `View` rather than being a direct
          `Text` child of the scroll container. Both are the permission sheet's
          2026-08-17 lessons, and this is the wordiest beat in the run: at the
          largest content sizes three paragraphs plus a figure plus a button do
          not fit a phone, and a direct `Text` child lays out wider than the
          screen and clips mid-word.
        */}
        <ScrollView
          style={styles.scrollBox}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.copy}>
            {/* Two sentences at two sizes — the statement and its correction.
                Not one line with a word picked out in another colour: the
                turn *is* the second sentence, so the type scale carries it. */}
            <Text scale="chrome" style={styles.headline}>
              You're not lazy.
            </Text>
            <Text scale="chrome" style={styles.correction}>
              You're just not being counted.
            </Text>
          </View>

          {/* Low, small against the ground, and heavier in shadow than in
              bird. Decorative: the copy says all of this, and an announced
              image would say it again with less precision. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.stage}
          >
            {/* The shadow first, so the bird stands on it rather than under
                it — `GroundShadow` is `bottom: 0` in a centring parent, which
                is why this stage centres. `CharacterFigure` orders it the same
                way for the same reason. */}
            <GroundShadow width={148} color={colors.midnight} opacity={0.5} />
            <KairoThumbnail pose="idle" size={124} decorative />
          </View>

          <View style={styles.copy}>
            <Text style={styles.pitch}>
              Most days disappear the moment they end. Nothing saw the walk to
              the jeepney stop, the stairs, the long way home.
            </Text>
            {/* Full-strength cream against the paragraph above it at 0.78 —
                the system builds emphasis from presence, not from a second
                hue, and this sentence is the one the beat exists to land. */}
            <Text style={styles.turn}>
              Kairo counts them. That's all it does — and that turns out to be
              enough.
            </Text>
          </View>
        </ScrollView>

        <OnboardingDots {...valueCardPosition(beat)} />

        <OnboardingCta
          label={beatCta(beat)}
          tone="glass"
          icon="arrow-right"
          onPress={() => router.push('/connect')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ramp.sage[800] },
  body: { flex: 1, paddingHorizontal: space.lg, gap: space.lg },
  // `flex: 1` on the box and `flexGrow: 1` on its content, which are two
  // different jobs and both are needed. The box takes the space the rail, the
  // dots and the button leave — without it a ScrollView in a flex column sizes
  // to its content, overflows, and pushes the button off the bottom of the
  // screen at exactly the content sizes this scrolls for. The content grows to
  // fill that box so short copy still centres.
  scrollBox: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', gap: space.lg, paddingVertical: space.md },
  copy: { gap: space.sm },
  headline: {
    ...font.display.major,
    fontSize: 34,
    lineHeight: 38,
    textAlign: 'center',
    color: colors.bg,
  },
  correction: {
    ...font.display.minor,
    lineHeight: 27,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.82)',
  },
  // Centred, which `GroundShadow` requires: it pins itself to `bottom: 0` and
  // relies on the parent to place it horizontally, so a stage that does not
  // centre puts the shadow in a corner.
  stage: { alignItems: 'center' },
  pitch: {
    ...font.body.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.78)',
  },
  turn: {
    ...font.body.body,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    color: colors.bg,
  },
});
