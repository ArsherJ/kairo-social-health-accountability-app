import { StyleSheet, View } from 'react-native';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { ProgressRing, Text } from '@/ui/index.ts';
import { xpProgress } from './xp-progress.ts';

const RING = 96;
const DISC = 74;

/**
 * Who you are, and how far into the level you are — in one mark.
 *
 * This replaced `XpBar`, which put the same numbers behind a horizontal meter
 * under the name. The ring is the better shape for it: levelling is quadratic,
 * so the fill creeps at high levels, and a bar that barely moves reads as a
 * broken bar while a ring reads as a ring that is nearly closed. The absolute
 * figures sit beside it for the same reason they did before — the fraction
 * alone stops being informative once a level spans thousands of XP.
 *
 * `Avatar` is deliberately not reused: it tints by name hash across both
 * families, and here the ring is already spending the terracotta. Sage holds
 * the disc so the two colours keep their separate jobs (see `theme.ts`).
 */
export function ProfileHeader({
  name,
  totalXp,
}: {
  name: string;
  totalXp: number;
}) {
  const xp = xpProgress(totalXp);
  // Intl-safe: `[...name]` splits by code point, so an accented character or
  // an emoji survives being taken as an initial. Same rule as `Avatar`.
  const initial = ([...name.trim()][0] ?? '?').toUpperCase();
  const toNext = xp.neededForNext - xp.intoLevel;

  return (
    <View style={styles.header}>
      <ProgressRing fraction={xp.fraction} size={RING} thickness={6}>
        <View style={styles.disc}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      </ProgressRing>

      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.level}>
          Level {xp.level} · {toNext.toLocaleString()} XP to {xp.level + 1}
        </Text>
        <Text style={styles.lifetime}>{totalXp.toLocaleString()} lifetime</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { ...font.display.major, fontSize: 30, color: ramp.sage[900] },
  text: { flex: 1 },
  name: { color: colors.text, ...font.display.major, fontSize: 30 },
  level: { ...font.body.strong, fontSize: 13.5, color: ramp.neutral[700], marginTop: 3 },
  lifetime: { ...font.body.body, fontSize: 12, color: ramp.neutral[600], marginTop: 2 },
});
