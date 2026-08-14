import { StyleSheet, View } from 'react-native';
import { CORE_STATS, ratingForStatPoints } from '@kairo/core';
import { boostChipLabel } from './program-copy.ts';
import { leaderboardRowLabel } from './row-label.ts';
import type { LeaderboardMode, LeaderboardRow as Row } from './queries.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Avatar, Numeral, StatIcon, STAT_NAMES, Text } from '@/ui/index.ts';

/**
 * One squadmate.
 *
 * Ability ratings are the only per-stat detail on this screen: §5 lets
 * squadmates see aggregates and totals, never raw steps or hourly movement, so
 * there is no number here that can be widened into one. A rating is a lifetime
 * aggregate, which puts it a step *further* from the raw data than the tier
 * dots it replaces — a tier is invertible to a same-day step range, and a
 * rating is not.
 *
 * Those dots were four colours saying Bronze/Silver/Gold, and they went with
 * the medals everywhere else. What replaces them is the same number the owner
 * sees on their own character sheet, which is the point: comparing builds is
 * what a squad screen is for, and "AGI 41 vs AGI 27" is a comparison where two
 * gold dots were not.
 */
export function LeaderboardRow({
  row,
  mode,
}: {
  row: Row;
  mode: LeaderboardMode;
}) {
  const isLeader = row.rank === 1;

  // Only on your own row. The character screen shows the *unweighted* total
  // for the same day — stored scores are program-independent (deviation #11) —
  // so anyone who compares the two numbers will find them different. The chip
  // is the explanation; hiding the gap would cost trust in the score.
  const boost = row.is_self ? boostChipLabel(row.program) : null;

  return (
    <View
      // One stop, not twelve. Every piece below is drawn separately and reads
      // separately, which turns a six-person board into seventy-odd swipes
      // with the ranking arriving in fragments. `leaderboardRowLabel` owns the
      // reading order, and is tested — the pluralisation and the partial
      // ratings map are both wrong in ways that look right.
      accessible
      accessibilityLabel={leaderboardRowLabel({
        rank: row.rank,
        characterName: row.character_name,
        isSelf: row.is_self,
        level: row.level,
        total: row.total,
        ratings: Object.fromEntries(
          CORE_STATS.filter((stat) => row.ratings?.[stat] !== undefined).map((stat) => [
            stat,
            ratingForStatPoints(row.ratings[stat] ?? 0),
          ]),
        ),
        // Matches the render conditions exactly rather than approximating
        // them: a label describing a streak the row is not showing would be
        // the same wrong-day bug the render guard exists to avoid.
        ...(mode === 'current' ? { streakDays: row.current_streak } : {}),
        provisional: mode === 'completed' && row.status === 'provisional',
        flagged: row.flagged,
        boost,
        statNames: STAT_NAMES,
      })}
      style={[
        styles.row,
        isLeader && styles.leader,
        row.is_self && styles.self,
      ]}
    >
      <Text scale="fixed" style={[styles.rank, row.is_self && styles.rankSelf]}>
        {row.rank}
      </Text>

      <Avatar name={row.character_name} self={row.is_self} />

      <View style={styles.middle}>
        <View style={styles.nameLine}>
          <Text
            scale="chrome"
            style={[styles.name, row.is_self && styles.nameSelf]}
            numberOfLines={1}
          >
            {row.character_name}
          </Text>
          {row.is_self && (
            <View style={styles.youChip}>
              <Text scale="fixed" style={styles.you}>
                YOU
              </Text>
            </View>
          )}
        </View>

        <View style={styles.metaLine}>
          <Text scale="chrome" style={styles.meta}>
            Lv {row.level}
          </Text>

          {/* The RPC returns TODAY's streak whatever day is ranked, so on the
              completed board the number and the date would disagree. Showing
              it only on the live board removes the mismatch at zero cost —
              a deliberate choice, not an omission. */}
          {mode === 'current' && row.current_streak > 0 && (
            <Text scale="chrome" style={styles.meta}>
              · {row.current_streak}-day streak
            </Text>
          )}

          {mode === 'completed' && row.status === 'provisional' && (
            <Text scale="chrome" style={styles.meta}>
              · not final yet
            </Text>
          )}

          {/* §20 social anti-cheat. A marker the squad can see, never a ban
              and never a score reduction — so it reads as a note, not a
              verdict. */}
          {row.flagged && (
            <View style={styles.flaggedChip}>
              <Text scale="fixed" style={styles.flagged}>
                flagged
              </Text>
            </View>
          )}

          {boost && (
            <View style={styles.boostChip}>
              <Text scale="fixed" style={styles.boostLabel}>
                {boost}
              </Text>
            </View>
          )}

          <View style={styles.ratings}>
            {CORE_STATS.map((stat) => {
              // The RPC returns lifetime POINTS; the curve lives in
              // @kairo/core and is applied here, never in SQL. Same rule
              // deviation #18 applies to goal arithmetic — one implementation.
              const rating = ratingForStatPoints(row.ratings?.[stat] ?? 0);
              return (
                // No `accessible` of its own any more: the row above is the
                // accessible element, so a label here would be unreachable
                // and would read as a promise the row does not keep. The
                // stat names still reach a screen reader — through
                // `leaderboardRowLabel`, in the row's own order.
                <View key={stat} style={styles.ratingPair}>
                  <StatIcon stat={stat} size={11} color={ramp.neutral[700]} />
                  <Text scale="fixed" style={styles.rating}>
                    {rating}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <Numeral
        value={row.total}
        size="minor"
        color={row.is_self ? ramp.accent[800] : colors.text}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  leader: { backgroundColor: ramp.sage[200] },
  // Your own row wins over the leader tint when you are both — being first is
  // already said by the rank, and losing track of yourself in your own squad
  // is the worse failure.
  self: { backgroundColor: ramp.accent[200], borderWidth: 2, borderColor: ramp.accent[500] },
  // minWidth, not width: the column still aligns at the default text size,
  // but a scaled rank glyph grows the box instead of being clipped by it.
  rank: { ...font.display.minor, minWidth: 18, color: ramp.neutral[600] },
  rankSelf: { color: ramp.accent[800] },
  middle: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { ...font.display.small, fontSize: 17, color: colors.text, flexShrink: 1 },
  nameSelf: { color: ramp.accent[900] },
  youChip: {
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  you: { ...font.body.label, fontSize: 9, color: colors.bg },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { ...font.body.strong, fontSize: 11.5, color: ramp.neutral[700] },
  flaggedChip: {
    backgroundColor: ramp.accent[300],
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  flagged: { ...font.body.label, fontSize: 9, color: ramp.accent[900] },
  boostChip: {
    backgroundColor: ramp.sage[300],
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  boostLabel: { ...font.body.label, fontSize: 9, color: ramp.sage[900] },
  // Wraps rather than truncating: four ratings plus a streak plus a boost chip
  // can outrun a phone's width, and a clipped ability number is worse than a
  // second line. The glyphs bought this line real room back — a footprint is
  // narrower than "AGI" — so it wraps in fewer cases than it used to, but the
  // long-name case still exists and this still has to survive it.
  ratings: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 2 },
  // 2pt inside a pair against 6pt between them: the glyph and its number have
  // to group, or four icons and four numbers read as two separate rows of
  // things at this size.
  ratingPair: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rating: { ...font.body.label, fontSize: 9.5, color: ramp.neutral[700] },
});
