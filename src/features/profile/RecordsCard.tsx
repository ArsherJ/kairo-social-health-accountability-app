import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { RECORDS_EMPTY, recordDate, recordValue } from './record-copy.ts';
import type { StatRecord } from './records.ts';
import { Panel, STAT_NAMES, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

/**
 * Your best day on each stat — the one place a day past the ceiling lands.
 *
 * **This is what the cap gave back.** The race stops at the finish line and the
 * daily score stops at its ceiling, both deliberately: the cap is the
 * anti-cheat, and raising it would reopen the raw-step arms race. The cost was
 * that an exceptional day had nowhere at all to go, and this is where it goes.
 * It pays the character and never the ranking — records are owner-only in the
 * database, not merely unrendered elsewhere.
 *
 * **On You rather than Today**, because a record is permanent and Today is
 * about the present moment. It sits under the mastery rail for the same reason
 * the help link does: somebody reading their lifetime numbers is already asking
 * this question.
 *
 * **No medals, no rank, no ordinal.** A record is a memory, so the design is a
 * list of days: the figure, then when. Anything more would make a personal best
 * look like a competitive standing, which is precisely the thing it is not.
 * A stat with no record is simply absent — see `stat_records()`, which returns
 * no row rather than a zero.
 */
export function RecordsCard({
  records,
  today,
}: {
  records: readonly StatRecord[] | undefined;
  /** The player's local date, for deciding whether a year is worth printing. */
  today: string | undefined;
}) {
  const byStat = new Map<CoreStat, StatRecord>(
    (records ?? []).map((r) => [r.stat, r]),
  );

  // The same threshold and the same hook the permission sheets use: reactive,
  // because iOS can change text size under a running app from Control Centre,
  // where a one-off `PixelRatio.getFontScale()` would leave the layout in
  // whichever shape it mounted with.
  //
  // **A row here is three columns, not two**, and CLAUDE.md's own note is that
  // two stop fitting a 390pt screen at about 1.3x. Stat, figure and date at
  // 1.4x would leave the figure — the only part anybody came to read — with
  // whatever the other two did not take, wrapping mid-number. Stacked, the
  // figure gets the full width and the label and date sit above it.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;

  return (
    <Panel>
      <Text scale="chrome" style={styles.title}>
        YOUR BEST DAYS
      </Text>

      {byStat.size === 0 ? (
        <Text style={styles.empty}>{RECORDS_EMPTY}</Text>
      ) : (
        // CORE_STATS order rather than the server's, so the rows do not
        // reshuffle as records are set — a list that reorders under the reader
        // reads as a leaderboard, which is the one thing this must not be.
        CORE_STATS.filter((stat) => byStat.has(stat)).map((stat) => {
          const record = byStat.get(stat)!;
          const value = recordValue(stat, record.value);
          const when = recordDate(record.localDate, today);

          return (
            // One element per row. Three separate stops would make a six-swipe
            // card out of three facts, which is the 2026-08-14 grouping lesson.
            <View
              key={stat}
              accessible
              accessibilityLabel={`${STAT_NAMES[stat]} best, ${value}${when ? `, set ${when}` : ''}`}
              style={stacked ? styles.rowStacked : styles.row}
            >
              {stacked ? (
                <>
                  {/* Label and date share the top line — both are short and
                      neither is the thing being read. The figure gets a line to
                      itself below, at full width. */}
                  <View style={styles.metaLine}>
                    <Text scale="chrome" style={styles.stat}>
                      {STAT_NAMES[stat]}
                    </Text>
                    <Text scale="chrome" style={styles.when}>
                      {when}
                    </Text>
                  </View>
                  <Text style={styles.valueStacked}>{value}</Text>
                </>
              ) : (
                <>
                  {/* A **minimum width** on the label, not just `flexShrink`.
                      Motion, Body and Mind are three different widths, so
                      without it every row's figure starts at a different x and
                      the card reads as three unrelated lines rather than as one
                      table. Scaled by `fontScale` so the column widens with the
                      type instead of squeezing the figure; capped at the same
                      1.3 the stacking threshold uses, past which there is no
                      row to align anyway. */}
                  <Text
                    scale="chrome"
                    style={[styles.stat, { minWidth: 64 * Math.min(fontScale, 1.3) }]}
                  >
                    {STAT_NAMES[stat]}
                  </Text>
                  {/* `flex: 1` on the figure, `flexShrink: 0` on the date, so
                      the figure absorbs the slack rather than the date wrapping
                      to a line of its own. */}
                  <Text style={styles.value}>{value}</Text>
                  <Text scale="chrome" style={styles.when}>
                    {when}
                  </Text>
                </>
              )}
            </View>
          );
        })
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  title: { ...font.display.small, color: colors.text, marginBottom: space.sm },
  // `flex-start` for the same reason GrowthCard uses it: past ~1.3x the figure
  // wraps and a centred label floats beside the middle of it.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginTop: space.md,
  },
  rowStacked: { marginTop: space.md, gap: 2 },
  // `space-between` rather than a gap: the date sits at the right edge, which
  // keeps the stacked row reading as the same table as the unstacked one.
  metaLine: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  stat: { ...font.body.label, color: colors.muted, letterSpacing: 0.5, flexShrink: 0 },
  valueStacked: { ...font.body.body, fontSize: 15, color: colors.text },
  value: { flex: 1, ...font.body.body, fontSize: 15, color: colors.text },
  when: { ...font.body.label, color: colors.muted, flexShrink: 0 },
  empty: { ...font.body.body, fontSize: 14, lineHeight: 20, color: colors.subtle },
});
