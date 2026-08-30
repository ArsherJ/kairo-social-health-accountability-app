import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';
import { Gradient, ProgressRing, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';
import { xpProgress } from './xp-progress.ts';

const RING = 100;
const DISC = 86;

/** The band the bird stands in: page, into sky, into the warm ground. */
const SCENE: Stop[] = [
  { color: colors.bg, at: 0 },
  { color: ramp.sky[300], at: 0.34 },
  { color: ramp.sky[400], at: 0.74 },
  { color: '#ffb067', at: 1 },
];

/**
 * Who you are, at the top of the You tab.
 *
 * Three passes at this: a name over an `XpBar`, then a name beside an XP ring
 * (which is the right shape for it — levelling is quadratic, so a bar creeps at
 * high levels and reads as broken while a ring reads as nearly closed), and now
 * the ring over a **scene**.
 *
 * The scene is what changed and it is not decoration. The You tab is the one
 * screen where the bird was absent entirely — Today has the diorama and Sky has
 * the flight, and the tab about *you* had an initial in a disc. It is the same
 * animal in the same daylight as the other two tabs, standing on the ground
 * rather than flying, which is the one register the other two do not use.
 *
 * The XP ring survives the change and still carries the figures beside it: the
 * fraction alone stops being informative once a level spans thousands of XP.
 *
 * **The gear is the only way to Settings**, which is deliberate. Everything
 * that used to be loose at the foot of this screen — quest difficulty,
 * timezone, notifications, sign out, delete account — is behind it now, so this
 * tab can be about the player rather than about the app's preferences.
 */
export function ProfileHeader({
  name,
  handle,
  totalXp,
  species,
  joined,
}: {
  name: string;
  /** `@bagwis`, derived by the caller from the name. */
  handle: string;
  totalXp: number;
  /** Already resolved through `displaySpecies` by the caller. */
  species: string;
  /** "Joined August 2026", or null while the profile is loading. */
  joined: string | null;
}) {
  const router = useRouter();
  const xp = xpProgress(totalXp);
  const toNext = xp.neededForNext - xp.intoLevel;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View>
      <View style={styles.topRow}>
        <Text scale="chrome" numberOfLines={1} style={styles.handle}>
          {handle}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.disc, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cog" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* The scene. `overflow: 'hidden'` so the ramp is cut to the band, and
          the two ground shadows are the only thing in it besides the bird —
          enough to say "standing on something" without drawing a landscape
          that would fight the flat character art, which is the same argument
          `Diorama` makes about its own sky. */}
      <View {...hidden} style={styles.scene}>
        <Gradient stops={SCENE} steps={20} />
        <View style={[styles.shade, { left: 34, width: 60, height: 20 }]} />
        <View style={[styles.shade, { right: 44, width: 44, height: 16, opacity: 0.35 }]} />
        <View style={styles.sceneBird}>
          <KairoThumbnail pose="idle" size={104} decorative />
        </View>
      </View>

      {/* The avatar sits over the seam, which is what ties the ring to the
          scene rather than stacking two unrelated blocks. A negative margin is
          the honest way to say "overlaps the thing above"; the alternative is
          absolute positioning, and this whole screen is flow-based since the
          2026-08-14 pass. */}
      <View style={styles.identity}>
        <View
          accessible
          accessibilityLabel={
            `${name}, a ${species}. Level ${xp.level}, ${toNext.toLocaleString()} XP to the next.`
          }
        >
          <View {...hidden}>
            <ProgressRing
              fraction={xp.fraction}
              size={RING}
              thickness={5}
              color={colors.accent}
              track={ramp.neutral[200]}
            >
              <View style={styles.disc2}>
                <KairoThumbnail pose="idle" size={DISC - 12} decorative />
              </View>
            </ProgressRing>
          </View>
        </View>

        <Text {...hidden} scale="chrome" numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        {joined != null && (
          <Text {...hidden} scale="chrome" style={styles.meta}>
            {joined} · Level {xp.level}
          </Text>
        )}
        <Text {...hidden} scale="chrome" style={styles.xp}>
          {toNext.toLocaleString()} XP to {xp.level + 1}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    ...shadow.md,
  },
  pressed: { opacity: 0.6 },

  scene: {
    height: 132,
    marginTop: space.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  shade: {
    position: 'absolute',
    bottom: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(90,60,30,0.45)',
  },
  sceneBird: { paddingBottom: 6 },

  identity: { alignItems: 'center', marginTop: -42, paddingHorizontal: space.lg },
  disc2: {
    width: DISC,
    height: DISC,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  name: { ...font.display.major, fontSize: 26, color: colors.text, marginTop: space.sm },
  meta: { ...font.body.strong, color: colors.muted, marginTop: 2 },
  xp: { ...font.body.strong, color: colors.accentDeep, marginTop: 4 },
});
