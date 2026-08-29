import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CORE_STATS } from '@kairo/core';
import { STAT_WHY } from '@/features/character/stat-detail.ts';
import { colors, font, ramp, space } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { BackRow, Screen, StatIcon, STAT_NAMES, Text } from '@/ui/index.ts';

/**
 * How progress works — one place, every idea.
 *
 * The QA pass counted daily score, mastery, XP, level, streak and the
 * consistency and recovery bonuses all visible at once, with the tier
 * thresholds behind them deliberately hidden (deviation #23). Every one of them
 * is explained *somewhere*, which is the problem: a reader assembling the model
 * from six places assembles six models.
 *
 * The organising idea is the timescale, because that is what actually separates
 * them and it is the thing no individual label says: today, lifetime per stat,
 * all-time total, your best ever, and the run of days. Grouped any other way
 * these read as synonyms for "points".
 *
 * **Rewritten 2026-08-29, because it had gone false.** It said active minutes
 * and active hours "earn points" — they stopped earning points at deviation #41
 * and became threshold shifts — and it never mentioned sleep or Mind at all.
 * This is the only screen in the app that explains the model, so a stale entry
 * here is worse than no entry: a reader has no second source to correct it
 * against. The three "Today only" entries are new and are the whole reason the
 * rewrite happened — spreading and strength are real mechanics that changed a
 * player's day with nothing anywhere saying so.
 *
 * **Still no points, no tiers and no totals** (deviations #23 and #34). Every
 * entry says what a thing *is* and what moves it, in real units or in none. The
 * ban was never the problem; the model being unexplainable was.
 *
 * A route, not a modal — `PermissionAsks` owns the one modal the app is allowed
 * to present (two on one root view controller and UIKit silently drops the
 * second), and a pushed screen gets back-navigation for free.
 */
const ENTRIES: ReadonlyArray<{ term: string; scope: string; body: string }> = [
  {
    term: 'Your day',
    scope: 'Today only',
    body: 'Steps, active calories and last night’s sleep each earn Kairo something behind the scenes, and together they are today. You won’t see the number — it is what ranks the flock and what a battle is measured against. It resets at midnight in your own timezone, never the squad’s.',
  },
  {
    term: 'Spreading it out',
    scope: 'Today only',
    body: 'Moving in more hours of the day makes Motion easier to top out — up to a quarter easier. Nothing else changes: the same walk still counts the same, it just arrives sooner. The Daily Walk below is the one figure this never touches.',
  },
  {
    term: 'Strength counts as Body',
    scope: 'Today only',
    body: 'A tracked gym session earns Body on top of the calories it burned, because lifting asks more of you than a calorie count can see. It has to come from an app Kairo recognises and carry a heart rate, so a session you typed in yourself earns nothing.',
  },
  {
    term: 'Mastery',
    scope: 'Lifetime, per stat',
    body: 'Every day you score adds to the stat that earned it, and mastery grows from that running total. It never falls, so a quiet week costs you nothing here. It describes your practice rather than your day — two people at the same level look different.',
  },
  {
    term: 'Level and XP',
    scope: 'All-time total',
    body: 'Finishing a day earns XP, and so do quests, challenges and beating your squad’s boss. Enough XP is the next level. Unlike mastery, XP does not care which stat it came from.',
  },
  {
    term: 'Records',
    scope: 'Your best, ever',
    body: 'The best day you have had on each stat, and when you had it. Records are yours alone — they never appear on the flock, because past the day’s finish line extra steps buy no ground on anyone else.',
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
