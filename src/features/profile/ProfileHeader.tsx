import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
 * **The band carries no bird of its own.** It drew one, centred, and the avatar
 * ring then overlapped the band by 42pt and landed squarely on it — the same
 * art at two sizes, the larger sliced across the chest by the smaller. The ring
 * is the bird on this screen; the band is the daylight behind it.
 *
 * The XP ring survives the change and still carries the figures beside it: the
 * fraction alone stops being informative once a level spans thousands of XP.
 *
 * **The gear is the only way to Settings**, which is deliberate. Everything
 * that used to be loose at the foot of this screen — quest difficulty,
 * timezone, notifications, sign out, delete account — is behind it now, so this
 * tab can be about the player rather than about the app's preferences.
 *
 * **It takes the safe-area inset itself, and that is not optional.** The You tab
 * is a `Screen bleed`, which hands the top inset back so the scene band can run
 * under the status bar — and a bleeding screen that forgets to re-apply it puts
 * its first row under the notch. This component did exactly that on first build:
 * the handle collided with the clock and the gear sat inside the Dynamic
 * Island's cutout, where it could not be tapped. The only control that opens
 * Settings was unreachable, and nothing about the screen looked broken enough to
 * say so — which is why `bleed-inset.test.ts` now checks every bleeding screen
 * for it rather than trusting the doc comment on `Screen` that already said it.
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
          <MaterialCommunityIcons name="cog" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* The scene. `overflow: 'hidden'` so the ramp is cut to the band, and
          the ground shadow is the only thing in it — enough to say "standing on
          something" without drawing a landscape that would fight the flat
          character art, which is the same argument `Diorama` makes about its
          own sky.

          **One bird, and it is the one in the ring.** The band drew a 104pt
          bird of its own, centred, and the avatar then overlapped it by 42pt —
          so the screen showed the same art twice, the larger copy sliced across
          the chest by the smaller one sitting on it. Two shadows at fixed left
          and right offsets compounded it: with the bird they belonged to hidden
          behind the disc they read as two stray grey pills floating at the
          horizon. The band is the daylight the bird stands in now, and the
          shadow is centred under the disc that actually casts it. */}
      <View {...hidden} style={styles.scene}>
        <Gradient stops={SCENE} steps={20} />
        <View style={styles.shade} />
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
  /**
   * The ground under the avatar. Centred, and sized a little wider than the
   * ring, so it reads as the disc's own shadow rather than as scenery of its
   * own — which is what the two offset pills it replaced had become once the
   * bird they were drawn for went.
   */
  shade: {
    alignSelf: 'center',
    width: RING + 24,
    height: 18,
    marginBottom: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(90,60,30,0.28)',
  },

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
