import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, font, radius, space } from '@/theme.ts';
import { Text } from '@/ui/index.ts';

/**
 * The rail across the top of every onboarding beat.
 *
 * **The same four segments on every step**, so the run always says how much is
 * left. That is the one thing the previous two-screen onboarding could not do
 * and did not need to: a run of two has no shape worth drawing. A run of six
 * does, and a person part-way through one with no end in sight abandons it.
 *
 * Four segments for six screens, deliberately. The rail measures *phases*, not
 * files — welcome and the sky are one phase (what this is), permissions and the
 * hatch are one (letting it in), difficulty and privacy are one (your choices),
 * and the name is its own. Numbering each screen would make the rail jump
 * about, and it would have to change every time a beat is added or removed.
 *
 * `filled` is how many phases are done and `partial` is progress through the
 * current one, so the rail can move *within* a phase — which is what stops the
 * two-screen phases feeling like the bar has stalled.
 */
export function OnboardingRail({
  filled,
  partial = 0,
  onBack,
  onSkip,
  tone = 'light',
}: {
  /** Phases completed, 0–4. */
  filled: number;
  /** 0–1 through the current phase. */
  partial?: number;
  /** Omit on the first beat, which has nowhere to go back to. */
  onBack?: () => void;
  /** Omit past the point where skipping is meaningful. */
  onSkip?: () => void;
  /** `light` on a saturated ground (cream marks), `dark` on a pale one. */
  tone?: 'light' | 'dark';
}) {
  const on = tone === 'light' ? colors.bg : colors.text;
  const off = tone === 'light' ? 'rgba(255,255,255,0.3)' : 'rgba(36,27,77,0.16)';

  return (
    <View style={styles.rail}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={space.sm}
          onPress={onBack}
          style={({ pressed }) => [
            styles.disc,
            { borderColor: off, backgroundColor: off },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={21} color={on} />
        </Pressable>
      )}

      {/* One accessible element for the whole bar. Four separate segments are
          four stops that each say nothing; the group says where you are. */}
      <View
        accessible
        accessibilityLabel={`Step ${Math.min(4, filled + 1)} of 4`}
        style={styles.track}
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.segment, { backgroundColor: off }]}
          >
            {/* The fill is a child at a width rather than a second background,
                so a half-done phase draws as a genuinely half-filled segment
                instead of an on/off one. */}
            {(i < filled || (i === filled && partial > 0)) && (
              <View
                style={[
                  styles.fill,
                  { backgroundColor: on, width: i < filled ? '100%' : `${partial * 100}%` },
                ]}
              />
            )}
          </View>
        ))}
      </View>

      {onSkip && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip the introduction"
          hitSlop={space.sm}
          onPress={onSkip}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text scale="chrome" style={[styles.skip, { color: on }]}>
            Skip
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The dots under a full-bleed value card.
 *
 * Diamonds rather than circles — a rotated square is the design's mark, and it
 * distinguishes "which card of three" from the rail above, which answers a
 * different question. Decorative: the rail already says where you are, and two
 * position indicators announcing themselves is one too many.
 */
export function OnboardingDots({ index, count }: { index: number; count: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.dots}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  disc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  track: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  skip: { ...font.body.body, fontSize: 13 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 9 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotOn: { backgroundColor: colors.bg },
});
