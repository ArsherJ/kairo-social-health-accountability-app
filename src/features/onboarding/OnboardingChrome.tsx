import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Text, useStyles, useTheme } from '@/ui/index.ts';
import { RAIL_STEPS, railStepLabel } from './beats.ts';

/**
 * The rail across the top of every onboarding beat.
 *
 * **The same seven segments on every step**, so the run always says how much
 * is left. That is the one thing the previous two-screen onboarding could not
 * do and did not need to: a run of two has no shape worth drawing. A run of
 * seven does, and a person part-way through one with no end in sight abandons
 * it.
 *
 * One segment per routed beat (deviation #75). It drew four *phases* so that
 * adding a beat never lengthened the run, and testers read a half-filled
 * segment as no progress and the run as stalled — so now every tap visibly
 * moves the bar. The hatch is the one exception: a wait the player cannot act
 * on shares the Health ask's segment, drawn half-filled for the ask and whole
 * for the hatch, rather than counting as progress of its own.
 *
 * **Neither number is written by hand.** Every beat reads its pair out of
 * `beats.ts`, which derives them from the run's declared steps — see that
 * module for why seven hand-written positions were the wrong source of truth.
 * The segment count is derived the same way.
 */
export function OnboardingRail({
  filled,
  partial = 0,
  onBack,
  onSkip,
  tone = 'page',
}: {
  /** Steps completed, 0–RAIL_STEPS. Comes from `onboardingBeat()`. */
  filled: number;
  /** 0–1 through the current step. */
  partial?: number;
  /** Omit on the first beat, which has nowhere to go back to. */
  onBack?: () => void;
  /** Omit past the point where skipping is meaningful. */
  onSkip?: () => void;
  /** Explicitly invert only when the rail sits on an intentional deep panel. */
  tone?: 'page' | 'inverse';
}) {
  const styles = useStyles(makeStyles);
  const { colors, glass } = useTheme();
  const inverse = tone === 'inverse';
  const on = inverse ? colors.onDeep : colors.text;
  const off = inverse ? glass.dark.edge : colors.borderStrong;
  const disc = inverse ? glass.dark.fillSoft : colors.surface;

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
            { borderColor: off, backgroundColor: disc },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={21} color={on} />
        </Pressable>
      )}

      {/* One accessible element for the whole bar. Seven separate segments are
          seven stops that each say nothing; the group says where you are. */}
      <View
        accessible
        accessibilityLabel={railStepLabel(filled)}
        style={styles.track}
      >
        {Array.from({ length: RAIL_STEPS }, (_, i) => (
          <View
            key={i}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.segment, { backgroundColor: off }]}
          >
            {/* The fill is a child at a width rather than a second background,
                so the Health ask draws as a genuinely half-filled segment
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
          style={({ pressed }) => [{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, pressed && styles.pressed]}
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
  const styles = useStyles(makeStyles);
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

const makeStyles = ({ colors }: Theme) => StyleSheet.create({
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
  // 4, not 5: seven segments between a 44-point disc and a 48-point Skip have
  // to fit a 320-point screen at `space.lg` either side.
  track: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  skip: { ...font.body.body, fontSize: 13 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 9 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    backgroundColor: colors.borderStrong,
  },
  dotOn: { backgroundColor: colors.accent },
});
