import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Panel, Text } from '@/ui/index.ts';
import { colors, font, ramp, space } from '@/theme.ts';
import { useGrantSquadDataConsent } from './consent.ts';

/**
 * The one-way door, asked out loud (spec §4.5, deviation #47).
 *
 * Racing needs squadmates to see how far you got, and that is real health data
 * leaving your account. This is the screen that says so before it happens: what
 * becomes visible, what does not, and a way to decline. Not a line in a policy
 * — HealthKit data disclosed to other users engages App Review guideline 5.1.3,
 * and explicit consent is the defensible posture where an implicit one is not.
 *
 * **It is deliberately built to look like the HealthKit ask**, down to the
 * two-column schedule that stacks at large text sizes. That is the design
 * decision, not laziness: someone who granted Health access already learned
 * what a Kairo disclosure looks like, and a second promise in a different shape
 * would read as a different kind of promise.
 *
 * Unlike `HealthAsk`, this owns its own chrome — it is rendered as a pane
 * rather than inside `PermissionAsks`' single `<Modal>`, so the three
 * 2026-08-17 lessons have to be re-applied here rather than inherited:
 *
 *   1. `Panel` sets `overflow: 'hidden'`, so an oversized sheet is not visibly
 *      spilled — it is silently clipped *inside* the card. That is how the
 *      Health ask lost its "Not now" at XXXL, the one control that lets someone
 *      decline. Bound the height.
 *   2. The `ScrollView` is `flexGrow: 0, flexShrink: 1`, so the card still hugs
 *      short content instead of always taking the cap.
 *   3. The text sits in a `View` with an explicit **point** width.
 *      `width: '100%'` does not work: the percentage resolves against a
 *      ScrollView whose own size depends on measuring that content, and RN
 *      breaks the circularity by measuring against an unbounded width — every
 *      line lays out wider than the card and is clipped mid-word.
 */

/** Named so the stylesheet and the width arithmetic below cannot drift. */
const CARD_MARGIN = space.lg;
const CARD_PADDING = space.lg;

/**
 * What leaves your account, and what it is for.
 *
 * A schedule rather than a bulleted list, for the same reason
 * `HEALTH_DISCLOSURE` is one: "what is shared, and why anyone would want it"
 * is two columns of information, and drawing it as two columns is what makes
 * it scannable rather than a paragraph in disguise.
 */
const SHARED: ReadonlyArray<{ label: string; purpose: string }> = [
  { label: 'Steps', purpose: 'Your place on the track' },
  { label: 'Distance', purpose: 'How far you covered' },
  { label: 'Active calories', purpose: 'How hard the day was' },
  { label: 'Sleep duration', purpose: 'Whether you recovered' },
];

/**
 * Named individually rather than summarised as "everything else".
 *
 * These are the four things people actually worry about, and a category word
 * would let each reader assume a different boundary. Naming them is the only
 * way the promise is checkable.
 */
const PRIVATE = 'When you moved during the day, your heart rate, your workouts and your pace.';

export function SquadDataConsentSheet({
  userId,
  onDecline,
}: {
  userId: string | undefined;
  onDecline: () => void;
}) {
  const grant = useGrantSquadDataConsent(userId);

  // `useWindowDimensions` rather than a one-off read: iOS can change the text
  // size under a running app from Control Centre, and a static read would
  // leave the layout in whichever shape it mounted with.
  const { width, fontScale } = useWindowDimensions();

  // RN's box model is border-box, so this is the card's full width less its
  // own padding. `Panel` draws no border in the `plain` variant, so there is
  // no border width in this sum — if that ever changes, it belongs here.
  const contentWidth = width - CARD_MARGIN * 2 - CARD_PADDING * 2;

  // The same 1.3 threshold `HealthAsk` uses, and for the same measured reason:
  // that is roughly where two columns stop both fitting on a 390pt screen.
  // It is a layout threshold, not an accessibility cutoff — nothing here stops
  // scaling type.
  const stacked = fontScale > 1.3;

  return (
    <View style={styles.pane}>
      <Panel variant="plain" style={styles.card}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          bounces={false}
        >
          <View style={{ width: contentWidth }}>
            <Text style={styles.eyebrow}>BEFORE YOU RACE</Text>
            <Text style={styles.title} accessibilityRole="header">
              Your squad will see four numbers
            </Text>
            <Text style={styles.body}>
              A race needs everyone's distance from the finish line. Joining a
              squad shares these totals with the people in it, once a day:
            </Text>

            <View style={styles.schedule}>
              {SHARED.map((item) => (
                <View
                  key={item.label}
                  style={[styles.row, stacked && styles.rowStacked]}
                >
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={[styles.rowPurpose, stacked && styles.rowPurposeStacked]}>
                    {item.purpose}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.privateLabel}>WHAT THEY NEVER SEE</Text>
            <Text style={styles.private}>{PRIVATE}</Text>

            {/* The reciprocity rule, stated as a rule rather than buried in the
                terms. It is the reason declining is not strictly dominant, and
                someone weighing this decision is entitled to know that. */}
            <Text style={styles.mutual}>
              This goes both ways. You see a squadmate's totals only if you are
              sharing yours.
            </Text>

            {grant.error && (
              <Text style={styles.error}>
                That didn't save. Check your connection and try again.
              </Text>
            )}
          </View>
        </ScrollView>
      </Panel>

      {/* Outside the ScrollView, so the decision is reachable at every text
          size without scrolling to find it. The clipped-"Not now" failure is
          exactly what a scrolled-away decline button reproduces. */}
      <View style={styles.actions}>
        <Button
          label="Share and race"
          variant="primary"
          busy={grant.isPending}
          onPress={() => grant.mutate()}
        />
        <Pressable
          accessibilityRole="button"
          disabled={grant.isPending}
          onPress={onDecline}
        >
          <Text style={styles.later}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, justifyContent: 'center' },
  // `maxHeight` rather than a height: at normal text sizes the card still hugs
  // its content. The bound only engages when the content would otherwise run
  // off the screen, which is the only case that was ever broken.
  card: { marginHorizontal: CARD_MARGIN, maxHeight: '78%', padding: CARD_PADDING },
  // `flexGrow: 0` + `flexShrink: 1` is the whole trick and both halves matter.
  // A ScrollView's default is to grow, so with `maxHeight` on the card the
  // sheet would take the full 78% at *every* text size — short content spread
  // down a near-full-screen panel.
  scroll: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  scrollContent: { flexGrow: 0 },

  eyebrow: { color: colors.accent, ...font.body.label, textTransform: 'uppercase' },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  body: { color: colors.subtle, ...font.body.body, marginTop: space.md, lineHeight: 22 },

  schedule: { marginTop: space.md },
  // Hairline-separated rows rather than bullets: this is a schedule of what
  // is being shared, and it should read like one.
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // `alignItems` moves off `baseline`, which is meaningless in a column and
  // silently collapses the children's width in RN.
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: space.sm },
  rowLabel: { color: colors.text, ...font.body.strong, flexShrink: 0 },
  rowPurpose: {
    color: colors.muted,
    ...font.body.strong,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: space.sm,
  },
  // Right-alignment and the gutter were both holding the second column off the
  // first. In a stack there is no first column to clear.
  rowPurposeStacked: { textAlign: 'left', marginLeft: 0, marginTop: 2 },

  // Sage, not terracotta: terracotta is the primary action and this is the
  // opposite of an action — it is the part of the promise that costs nothing.
  privateLabel: {
    color: ramp.sage[700],
    ...font.body.label,
    textTransform: 'uppercase',
    marginTop: space.lg,
  },
  private: { color: colors.subtle, ...font.body.body, marginTop: space.sm, lineHeight: 22 },
  mutual: { color: colors.muted, fontSize: 13, marginTop: space.md, lineHeight: 19 },
  error: { color: colors.damage, fontSize: 13, marginTop: space.md, lineHeight: 19 },

  actions: { paddingHorizontal: CARD_MARGIN, paddingTop: space.lg },
  later: {
    color: colors.muted,
    ...font.body.body,
    textAlign: 'center',
    marginTop: space.md,
  },
});
