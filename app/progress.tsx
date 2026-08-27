import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CORE_STATS } from '@kairo/core';
import { STAT_WHY } from '@/features/character/stat-detail.ts';
import { colors, font, ramp, space } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { BackRow, Screen, StatIcon, STAT_NAMES, Text } from '@/ui/index.ts';

/**
 * How progress works — one place, four ideas.
 *
 * The QA pass counted daily score, ability ratings, XP, level, streak and the
 * consistency and recovery bonuses all visible at once, with the tier
 * thresholds behind them deliberately hidden (deviation #23). Every one of them
 * is explained *somewhere*, which is the problem: a reader assembling the model
 * from six places assembles six models.
 *
 * The organising idea is the timescale, because that is what actually separates
 * them and it is the thing no individual label says: today, lifetime per stat,
 * all-time total, and the run of days. Grouped any other way these read as four
 * synonyms for "points".
 *
 * A route, not a modal — `PermissionAsks` owns the one modal the app is allowed
 * to present (two on one root view controller and UIKit silently drops the
 * second), and a pushed screen gets back-navigation for free.
 */
const ENTRIES: ReadonlyArray<{ term: string; scope: string; body: string }> = [
  {
    term: 'Daily score',
    scope: 'Today only',
    body: 'Steps, calories, active minutes and how many hours you moved each earn points behind the scenes. Together they are today’s score — you won’t see the number, but it is what ranks you on the squad board and what your squad’s battles are measured against. It resets at midnight in your own timezone — not the squad’s.',
  },
  {
    term: 'Ability ratings',
    scope: 'Lifetime, per stat',
    body: 'Every day you score adds to the stat that earned it, and the rating grows from that running total. Ratings never reset, so they describe your character rather than your day. Two people at the same level look different here.',
  },
  {
    term: 'Level and XP',
    scope: 'All-time total',
    body: 'Finishing a day earns XP, and so does beating your squad’s boss. Enough XP is the next level. Unlike ability ratings, XP does not care which stat it came from.',
  },
  {
    term: 'Streak',
    scope: 'Days in a row',
    body: 'Days you scored, consecutively. A shield covers one missed day so a single rest day does not undo a month.',
  },
];

export default function ProgressHelp() {
  const router = useRouter();

  // Same shape as the event routes: this is a card over the tab shell, so the
  // orbit nav is covered rather than absent and `Screen` must not reserve room
  // for it. The cleanup is the load-bearing half.
  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  return (
    <Screen>
      <BackRow onPress={() => router.back()} />

      <Text style={styles.title}>How progress works</Text>
      <Text style={styles.standfirst}>
        Four numbers, four different spans of time. That is the whole difference
        between them.
      </Text>

      {ENTRIES.map((entry) => (
        <View key={entry.term} style={styles.entry}>
          <Text style={styles.term}>{entry.term}</Text>
          {/* The scope is the point, so it is set as a label rather than
              buried in the first sentence of the body. */}
          <Text style={styles.scope}>{entry.scope}</Text>
          <Text style={styles.body}>{entry.body}</Text>
        </View>
      ))}

      {/* Every stat, and why each one is worth measuring. Kairo has always
          had this reasoning in its spec and has never said it out loud — the
          stats read as arbitrary game currencies without it. This is the sheet
          for it: the reader is already here asking what the numbers mean. */}
      <Text style={styles.sectionTitle}>What each stat is for</Text>

      {CORE_STATS.map((stat) => (
        // One element per stat, not three stops. The glyph hides itself and the
        // name is repeated in the label, so the composed sentence is the whole
        // announcement. Children are hidden explicitly as well as the parent
        // being marked accessible — neither half is redundant (CLAUDE.md).
        <View
          key={stat}
          style={styles.stat}
          accessible
          accessibilityLabel={`${STAT_NAMES[stat]}. ${STAT_WHY[stat]}`}
        >
          <View
            style={styles.statHead}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <StatIcon stat={stat} size={16} color={colors.accentDeep} />
            <Text style={styles.statName}>{STAT_NAMES[stat]}</Text>
          </View>
          <Text
            style={styles.body}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {STAT_WHY[stat]}
          </Text>
        </View>
      ))}

      <Text style={styles.footnote}>
        A bonus sits on top of the daily score for covering every stat you can
        earn in one day — two without a sleep tracker, three with. A tracker
        buys another way to reach the same daily best, never a higher one.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, ...font.body.title, marginTop: space.md },
  standfirst: {
    color: colors.subtle,
    ...font.body.body,
    marginTop: space.sm,
    lineHeight: 21,
  },
  entry: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  term: { color: colors.text, ...font.display.minor },
  scope: {
    color: colors.accentDeep,
    ...font.body.label,
    textTransform: 'uppercase',
    marginTop: space.xs,
  },
  body: {
    color: colors.subtle,
    ...font.body.body,
    marginTop: space.sm,
    lineHeight: 21,
  },
  sectionTitle: {
    color: colors.text,
    ...font.body.title,
    marginTop: space.xl,
  },
  // Tighter than `entry`: these are four short lines under one heading, not
  // four independent definitions, so they read as a list rather than as four
  // more sections. No border — the heading above already divides them off.
  stat: { marginTop: space.md },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  statName: { color: colors.text, ...font.body.label, textTransform: 'uppercase' },
  footnote: {
    color: ramp.neutral[600],
    ...font.body.body,
    fontSize: 12,
    marginTop: space.lg,
    lineHeight: 18,
  },
});
