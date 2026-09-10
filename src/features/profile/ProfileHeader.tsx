import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import type { LifetimePoints } from '@/features/character/plumage.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { ProgressRing, Text, useStyles, useTheme } from '@/ui/index.ts';
import { xpProgress } from './xp-progress.ts';

const RING = 96;
const DISC = 82;

/**
 * Who you are, at the top of the You tab.
 *
 * The ring is the bird on this screen, and since deviation #72 it stands on
 * the page rather than over a sky band: the band was a fourth painting of the
 * same daylight and the one surface on the tab that did not say anything the
 * ring did not. What is left is the ring, the name, the species line, the
 * meta line and the XP to the next level — the five things a profile is.
 *
 * **The gear is the only way to Settings**, which is deliberate: everything
 * that is a preference rather than a fact about the player lives behind it.
 *
 * **It takes the safe-area inset itself, and that is not optional.** The You
 * tab is a `Screen bleed`, which hands the top inset back; a bleeding screen
 * that forgets to re-apply it puts its first row under the notch. This
 * component did exactly that once — the gear sat inside the Dynamic Island's
 * cutout, where it could not be tapped — which is why `bleed-inset.test.ts`
 * checks every bleeding screen for it.
 */
export function ProfileHeader({
  name,
  handle,
  totalXp,
  speciesLine,
  joined,
  lifetimePoints,
}: {
  name: string;
  /** `@bagwis`, derived by the caller from the name. */
  handle: string;
  totalXp: number;
  /**
   * "A Philippine eagle" — what the bird is, from `speciesLine()` (issue #32).
   * The one screen that says it, and it says it once, in the quiet register:
   * a fact stated, not a claim made.
   */
  speciesLine: string;
  /** "Joined August 2026", or null while the profile is loading. */
  joined: string | null;
  /**
   * The account's own lifetime rollups — the same three the rail below reads,
   * so the bird in the ring wears the crest Today and the flock draw it with
   * (issue #33).
   */
  lifetimePoints: LifetimePoints | undefined;
}) {
  const router = useRouter();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  // The You tab bleeds, so the inset comes back here — see the note above.
  const insets = useSafeAreaInsets();
  const xp = xpProgress(totalXp);
  const toNext = xp.neededForNext - xp.intoLevel;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View>
      <View style={[styles.topRow, { paddingTop: insets.top + space.sm }]}>
        <Text scale="chrome" numberOfLines={1} style={styles.handle}>
          {handle}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.disc, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cog-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.identity}>
        <View
          accessible
          accessibilityLabel={
            `${name}. ${speciesLine}. Level ${xp.level}, ${toNext.toLocaleString()} XP to the next.`
          }
        >
          <View {...hidden}>
            <ProgressRing fraction={xp.fraction} size={RING} thickness={5}>
              <View style={styles.avatar}>
                <KairoThumbnail pose="idle" size={DISC - 10} decorative lifetimePoints={lifetimePoints} />
              </View>
            </ProgressRing>
          </View>
        </View>

        <View {...hidden} style={styles.words}>
          <Text scale="chrome" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {/* The quiet register: the species is the one line here that is not
              a figure, so it is the one line that is not bold. */}
          <Text scale="chrome" style={styles.species}>
            {speciesLine}
          </Text>
          {joined != null && (
            <Text scale="chrome" style={styles.meta}>
              {joined} · Level {xp.level}
            </Text>
          )}
          <Text scale="chrome" style={styles.xp}>
            {toNext.toLocaleString()} XP to {xp.level + 1}
          </Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = ({ colors, shadow }: Theme) =>
  StyleSheet.create({
    topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
    handle: { ...font.display.minor, color: colors.text, flexShrink: 1 },
    disc: {
      marginLeft: 'auto',
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      ...shadow.sm,
    },
    pressed: { opacity: 0.6 },
    // The ring beside the words rather than above them: a centred stack put
    // four lines of type under a picture and left half the width empty.
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      marginTop: space.lg,
      paddingHorizontal: space.lg,
    },
    avatar: {
      width: DISC,
      height: DISC,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    words: { flex: 1, minWidth: 0 },
    name: { ...font.display.major, fontSize: 24, color: colors.text },
    species: { ...font.body.quiet, color: colors.muted, marginTop: 2 },
    meta: { ...font.body.strong, color: colors.muted, marginTop: 2 },
    xp: { ...font.body.strong, color: colors.accentDeep, marginTop: 4 },
  });
