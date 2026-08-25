import { Image, StyleSheet, View } from 'react-native';
import { CORE_STATS, ratingForStatPoints } from '@kairo/core';
import { SPECIES_FIGURES } from '@/features/character/species-art.ts';
import { SPECIES_NAMES } from '@/features/character/species.ts';
import { leaderboardRowLabel } from './row-label.ts';
import type { LeaderboardMode, LeaderboardRow as Row } from './queries.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Avatar, StatIcon, STAT_NAMES, Text } from '@/ui/index.ts';

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
  gap,
}: {
  row: Row;
  mode: LeaderboardMode;
  gap: number | null;
}) {
  const isLeader = row.rank === 1;

  return (
    <View
      // One stop, not twelve. Every piece below is drawn separately and reads
      // separately, which turns a six-person board into seventy-odd swipes
      // with the ranking arriving in fragments. `leaderboardRowLabel` owns the
      // reading order, and is tested — the pluralisation and the partial
      // ratings map are both wrong in ways that look right.
      //
      // `accessible` alone should collapse this on iOS and did not, on the
      // 2026-08-14 build. The mechanism is unconfirmed — RN Text is an
      // accessibility element by default and this app is New Architecture
      // only — so the children are hidden explicitly rather than trusting the
      // implicit behaviour. Do not remove one half thinking it is redundant.
      accessible
      accessibilityLabel={leaderboardRowLabel({
        rank: row.rank,
        characterName: row.character_name,
        isSelf: row.is_self,
        // The name, resolved here — `row-label.ts` takes the word, never the
        // id, so it keeps importing no UI. Undefined for anyone predating the
        // choice, which is what drops the clause rather than emptying it.
        ...(row.species ? { species: SPECIES_NAMES[row.species] } : {}),
        level: row.level,
        gap,
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
        statNames: STAT_NAMES,
      })}
      style={[
        styles.row,
        isLeader && styles.leader,
        row.is_self && styles.self,
      ]}
    >
      <Text
        scale="fixed"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.rank, row.is_self && styles.rankSelf]}
      >
        {row.rank}
      </Text>

      {row.species ? (
        // Replaces the disc rather than sitting beside it. `Avatar`'s tints are
        // terracotta and sage — the palette's only two hues, and both already
        // mean something here (your own row, the leader's) — so four species
        // hues next to them would be two colour systems in one row.
        <Image
          source={SPECIES_FIGURES[row.species]}
          style={styles.species}
          resizeMode="contain"
          // The row is one element and `leaderboardRowLabel` already names the
          // species in its own reading order.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        /* `Avatar` already hides itself. Kept for anyone predating the choice —
           a row with no picture at all would be less identifiable, not more. */
        <Avatar name={row.character_name} self={row.is_self} />
      )}

      {/* Hiding the wrapper takes the whole name / meta / ratings subtree with
          it, which is why this is four props and not twenty. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.middle}
      >
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

          <View style={styles.ratings}>
            {CORE_STATS.map((stat) => {
              // The RPC returns lifetime POINTS; the curve lives in
              // @kairo/core and is applied here, never in SQL. Same rule
              // deviation #18 applies to event arithmetic — one implementation.
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

      {/* Relative, not absolute. The leader has nothing above them, so the
          column is empty rather than showing a zero that reads as a score. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {gap !== null && gap > 0 && (
          <Text scale="fixed" style={styles.gap}>
            −{gap.toLocaleString()}
          </Text>
        )}
      </View>
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
  // `neutral[600]` is legitimate *here* and nowhere else on this row: at
  // `display.minor` the rank qualifies as WCAG large text, where 3:1 applies.
  rank: { ...font.display.minor, minWidth: 18, color: ramp.neutral[600] },
  rankSelf: { color: ramp.accent[800] },
  // Identical to `meta` today, and deliberately not merged with it: this is the
  // right-hand column and that is the meta line, so they answer to different
  // layouts and only one of them may ever grow. `neutral[700]`, not the
  // `neutral[600]` this shipped with — at 11.5pt this is body text, so 4.5:1
  // applies, and 600 measured ~3.5:1 against the `self` and `leader` tints. The
  // element this replaced used `colors.text`, so 600 was a regression on the
  // very thing that took the total's place.
  gap: { ...font.body.strong, fontSize: 11.5, color: ramp.neutral[700] },
  // Matches `Avatar`'s default size, so a mixed board — some rows chose an
  // animal, some have not — keeps one column edge rather than two.
  species: { width: 44, height: 44 },
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
  // Wraps rather than truncating: four ratings plus a streak plus a flagged chip
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
