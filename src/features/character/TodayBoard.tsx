import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { font, radius, space, type Theme } from '@/theme.ts';
import { StatIcon, Text, Tile, useStyles, useTheme } from '@/ui/index.ts';
import { questHeadline, questLabel, questProgressLine } from '../quests/quest-copy.ts';
import type { TodayQuest } from '../quests/queries.ts';
import { stackDashboard } from './dashboard-layout.ts';
import type { TileReading } from './today-board.ts';

/**
 * The dashboard's tiles and the quest list (deviation #72).
 *
 * Draws what `today-board.ts` composed and decides nothing: every sentence,
 * fraction and label arrives ready. Motion lives with the character in
 * `TodayProgressHero`; Body and Mind are its supporting pair here.
 *
 * The stat glyphs take their own hues (`STAT_COLORS`) — the same reason a
 * Flock row's do: the supporting tiles are told apart at a glance by
 * colour before they are read.
 */
export function TodayTiles({
  body,
  mind,
}: {
  body: TileReading;
  mind: TileReading;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = stackDashboard(width, fontScale);
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();

  return (
    <View style={styles.tiles}>
      <View style={[styles.pair, stacked && styles.pairStacked]}>
        <Tile
          eyebrow={body.eyebrow}
          figure={body.figure}
          unit={body.unit}
          caption={body.caption}
          meter={body.fraction === null ? null : { fraction: body.fraction, color: colors.coral }}
          accessibilityLabel={body.label}
          glyph={<StatIcon stat="STR" size={14} />}
        />
        <Tile
          eyebrow={mind.eyebrow}
          figure={mind.figure}
          unit={mind.unit}
          caption={mind.caption}
          meter={mind.fraction === null ? null : { fraction: mind.fraction, color: ramp.sage[500] }}
          accessibilityLabel={mind.label}
          glyph={<StatIcon stat="MND" size={14} />}
        />
      </View>
    </View>
  );
}

/**
 * Today's three quests, as rows in one card.
 *
 * **The quest contract is untouched.** These are exactly the three entries
 * `todayQuests()` resolved and `finalize-days` grades; the dashboard shows all
 * three where the Living Mirror showed one, and `selected` marks the one
 * `selectNextStep` ranked first. One accessibility element per row, both
 * halves of the grouping fix, and `questLabel` composes the sentence.
 */
export function QuestRows({
  quests,
  selected,
}: {
  quests: readonly TodayQuest[];
  /** The index `selectNextStep` chose, or null on a rest day. */
  selected: number | null;
}) {
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();
  if (quests.length === 0) return null;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View style={styles.card}>
      <Text scale="chrome" style={styles.cardTitle}>
        Quests
      </Text>
      {quests.map(({ quest, state }, index) => (
        <View
          key={quest.id}
          accessible
          accessibilityLabel={questLabel(quest, state)}
          style={[styles.row, index > 0 && styles.rowRule]}
        >
          <View {...hidden} style={styles.rowHead}>
            <View style={[styles.check, state.met && styles.checkOn]}>
              {state.met && (
                <MaterialCommunityIcons name="check-bold" size={12} color={colors.ink} />
              )}
            </View>
            {/* `flex: 1` so the headline takes the width it needs and the XP
                is pushed to the end — never a fixed width. */}
            <Text scale="chrome" numberOfLines={2} style={styles.rowTitle}>
              {questHeadline(quest)}
            </Text>
            {selected === index && !state.met && (
              <View style={styles.nextChip}>
                <Text scale="fixed" style={styles.nextChipLabel}>
                  NEXT
                </Text>
              </View>
            )}
            <Text scale="chrome" style={styles.xp}>
              {quest.xp} XP
            </Text>
          </View>
          <View {...hidden} style={styles.rowMeter}>
            <View style={styles.rowTrack}>
              <View
                style={[
                  styles.rowFill,
                  {
                    width: `${Math.round(Math.min(1, Math.max(0, state.fraction)) * 100)}%` as const,
                    backgroundColor: state.met ? ramp.gold[400] : colors.accent,
                  },
                ]}
              />
            </View>
            <Text scale="chrome" numberOfLines={1} style={styles.progress}>
              {questProgressLine(quest, state)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) =>
  StyleSheet.create({
    tiles: { marginTop: space.md },
    pair: { flexDirection: 'row', gap: space.sm + 2 },
    pairStacked: { flexDirection: 'column' },

    card: {
      marginTop: space.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      paddingHorizontal: space.md,
      paddingTop: space.md,
      paddingBottom: space.xs,
      ...shadow.sm,
    },
    cardTitle: { ...font.display.small, color: colors.text, marginBottom: space.xs },
    row: { paddingVertical: space.sm + 4 },
    rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    check: {
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: ramp.neutral[400],
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Gold, because a cleared quest is *earned* — the ridge flag's own colour.
    checkOn: { backgroundColor: ramp.gold[400], borderColor: ramp.gold[400] },
    rowTitle: { flex: 1, ...font.body.body, fontSize: 14, color: colors.text },
    nextChip: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: ramp.accent[200],
    },
    nextChipLabel: { ...font.body.label, fontSize: 9, color: colors.accentDeep },
    xp: { ...font.body.strong, fontSize: 11.5, color: colors.muted },
    rowMeter: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 8, paddingLeft: 28 },
    rowTrack: {
      flex: 1,
      height: 5,
      borderRadius: radius.pill,
      backgroundColor: ramp.neutral[300],
      overflow: 'hidden',
    },
    rowFill: { height: 5, borderRadius: radius.pill },
    progress: { ...font.body.strong, fontSize: 11.5, color: colors.subtle, flexShrink: 0 },
  });
