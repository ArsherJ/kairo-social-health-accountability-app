import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/index.ts';
import { computeStrain, maxHeartRateForAge, type DayTotals } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';

/**
 * The day's real figures, in the units a person actually did them in.
 *
 * The full ledger under the shelf's headline figure. Points are the game, and
 * the game is downstream of a day someone lived — 8,412 steps, 6.1 km, 412
 * kcal. This panel used to be the *translation* of a point total above it. Since
 * 2026-08-15 the hero says steps too, so real units are the whole shelf's
 * vocabulary and the panel is the rest of the day rather than a decoding of it.
 *
 * The Steps row therefore repeats the hero verbatim, on purpose. The hero is one
 * headline figure and this is the ledger; a ledger missing its first line reads
 * as an omission, and the row is also what gives Distance and Calories a scale
 * to sit against. Dropping it was raised when the hero changed and deliberately
 * left out of scope: it is a layout decision about the shelf as a whole, not a
 * loose end from that change.
 *
 * Hand-testing asked for these outright, and they were already synced: steps,
 * distance, calories and active minutes have been in `health_buckets` since the
 * first migration, with distance stored purely for the §5 anti-cheat stride
 * check and never once displayed.
 *
 * **Strain and Sleep appear only for wearable users** (§5). `has_wearable` is
 * server-observed by `sync-health` from the presence of sleep data — never
 * asserted by the client — and this is that column's first reader. A phone-only
 * user sees four rows and no empty slots, which is §5's rule verbatim: "the REC
 * row simply doesn't appear — zero penalty".
 */
export function TodayPanel({
  totals,
  hourlyAvgHr,
  restingHr,
  birthYear,
  sleepMinutes,
  hasWearable,
  today,
}: {
  totals: DayTotals | undefined;
  hourlyAvgHr: readonly (number | null)[] | undefined;
  restingHr: number | null | undefined;
  birthYear: number | null | undefined;
  sleepMinutes: number | null | undefined;
  hasWearable: boolean;
  /** The user's own local date, for deriving age from birth year. */
  today: string | undefined;
}) {
  // A pending query is not an answer. Rendering "0 steps" for a frame and then
  // correcting it is the same discipline the hero number keeps above.
  if (!totals) return null;

  const age =
    birthYear != null && today ? Number(today.slice(0, 4)) - birthYear : null;

  const strain = hasWearable && hourlyAvgHr
    ? computeStrain({
        hourlyAvgHr,
        restingHr,
        maxHr: maxHeartRateForAge(age),
      })
    : null;

  return (
    <View style={styles.panel}>
      <Row label="Steps" value={totals.steps.toLocaleString()} />
      <Row label="Distance" value={`${(totals.distanceM / 1000).toFixed(2)} km`} />
      <Row label="Calories" value={`${Math.round(totals.activeKcal).toLocaleString()} kcal`} />
      <Row label="Active minutes" value={`${Math.round(totals.activeMinutes)} min`} />

      {/* Null strain with a wearable connected means the watch reported no
          heart rate today — absent, not zero. Saying "0.0" would claim a day
          of complete rest from a device that was simply on the charger. */}
      {hasWearable && strain !== null && (
        <Row label="Strain" value={strain.toFixed(1)} wearable />
      )}

      {hasWearable && sleepMinutes != null && sleepMinutes > 0 && (
        <Row
          label="Sleep"
          value={`${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m`}
          wearable
        />
      )}
    </View>
  );
}

function Row({
  label,
  value,
  wearable = false,
}: {
  label: string;
  value: string;
  wearable?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>
        {label}
        {/* §5's wearable marker. It is also the passive advertisement the spec
            describes: a phone-only user never sees these rows, and a squadmate
            who does starts wanting the band. */}
        {wearable && <Text style={styles.link}> 🔗</Text>}
      </Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { ...font.body.strong, fontSize: 13, color: ramp.neutral[700] },
  link: { fontSize: 11 },
  value: { ...font.display.small, fontSize: 17, color: colors.text },
});
