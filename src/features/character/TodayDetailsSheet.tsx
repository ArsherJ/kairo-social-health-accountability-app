import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Panel, Text, useReduceMotion } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';
import { SyncStatus } from './SyncStatus.tsx';
import type { TodayDetailSection } from './today-details.ts';

/**
 * The whole day, on demand.
 *
 * **It decides nothing.** `today-details.ts` composes the sections and their
 * accessible labels; this draws them, and it is the only place the raw figures
 * appear on Today.
 *
 * The geometry is `PermissionAsks`' proven arrangement, and every part of it is
 * load-bearing — the lessons were paid for on 2026-08-17 and again on the
 * species picker. A bounded card (`maxHeight: '85%'`), a ScrollView that is
 * `flexGrow: 0, flexShrink: 1` so a short sheet still hugs its content, and a
 * plain `View` with an explicit **point** width around the content. That last
 * one is the fix rather than a preference: `width: '100%'` resolves against a
 * ScrollView whose own size depends on measuring the content, and RN resolves
 * the circularity by laying text out unbounded — which `Panel`'s
 * `overflow: 'hidden'` then clips mid-word, invisibly at normal text sizes.
 *
 * It leases the root view controller through `modal-owner.ts`; the caller owns
 * the claim, so this stays a dumb renderer that is visible when told to be.
 */
export function TodayDetailsSheet({
  visible,
  sections,
  userId,
  timeZone,
  showChallenges,
  onClose,
  onDismiss,
  onChallenges,
  onProgress,
}: {
  visible: boolean;
  sections: readonly TodayDetailSection[];
  userId: string | undefined;
  timeZone: string | undefined;
  /** `disclosure.stage === 'full'` — the one gated surface left on Today. */
  showChallenges: boolean;
  onClose: () => void;
  /** Fires after the native dismissal completes; the caller restores focus. */
  onDismiss: () => void;
  onChallenges: () => void;
  onProgress: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const sheetWidth = windowWidth - space.lg * 2 - space.lg * 2;
  const reduceMotion = useReduceMotion();
  // A `<Modal>` presents on the root view controller and gets no inset of its
  // own, so the sheet took the bottom edge itself and sat "Close" — its only
  // dismissal, and the one control that must always be reachable — over the
  // home indicator's swipe region. The same rule `Screen` applies to every tab.
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        {/* `Panel` takes a single `ViewStyle`, not a `StyleProp`, so the
            inset is merged rather than layered. */}
        <Panel
          variant="plain"
          style={{ ...styles.sheet, marginBottom: insets.bottom + space.lg }}
        >
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
            <View style={{ width: sheetWidth }}>
              <Text accessibilityRole="header" style={styles.title}>Today with KAIRO</Text>

              {sections.map((section) => (
                <View key={section.id} style={styles.section}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.rows.map((row) => (
                    // Both halves of the 2026-08-14 grouping fix. `accessible`
                    // on a parent is documented to collapse its descendants on
                    // iOS and did not on that build, so the children are hidden
                    // explicitly; removing either half is how one row becomes
                    // two stops again.
                    <View
                      key={row.id}
                      accessible
                      accessibilityLabel={row.accessibilityLabel}
                      style={styles.row}
                    >
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={styles.rowBody}
                      >
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        <Text style={styles.rowValue}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}

              {/* The one gated surface left on Today. A Challenge target is a
                  trailing median over workout sessions a `core` account may
                  have none of — `stage`, not `resolved && stage`, because this
                  hides a link rather than navigating. `/train`'s own redirect
                  is the door that has to wait. */}
              {showChallenges && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open Challenges"
                  hitSlop={space.sm}
                  onPress={onChallenges}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                >
                  <Text style={styles.link}>Open Challenges</Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="link"
                accessibilityLabel="How progress works"
                hitSlop={space.sm}
                onPress={onProgress}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.link}>How progress works</Text>
              </Pressable>

              {/* Silent for a healthy fresh sync — inside a sheet somebody
                  opened on purpose, "synced 3 minutes ago" is noise. Every
                  state that explains something stays. */}
              <SyncStatus userId={userId} timeZone={timeZone} attentionOnly />
            </View>
          </ScrollView>

          {/* Outside the scroll, so the dismissal is reachable at every text
              size. That is the 2026-08-17 lesson exactly: the XXXL Health sheet
              lost its "Not now" inside the scroll and became a trap. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close today's details"
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </Panel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: `${colors.bg}CC`,
  },
  // `marginBottom` is applied at the call site from the safe-area inset.
  sheet: {
    marginTop: 0,
    marginHorizontal: space.lg,
    maxHeight: '85%',
    padding: 0,
  },
  // `flexGrow: 0` + `flexShrink: 1`: growing off, shrinking on, so the card
  // hugs a short day and only bounds a long one. See `PermissionAsks`.
  scroll: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  content: { flexGrow: 0, padding: space.lg },

  title: { ...font.display.small, fontSize: 22, color: colors.text },

  section: { marginTop: space.lg },
  sectionTitle: { ...font.body.strong, color: colors.muted, marginBottom: space.xs },

  row: { paddingVertical: 6 },
  // Stacked rather than a two-column row: a label-and-value row could not fit
  // past ~1.3x on the permission sheet, and this one carries a whole sentence
  // in its Daily Walk value.
  rowBody: { gap: 2 },
  rowLabel: { ...font.body.body, fontSize: 13, color: colors.muted },
  rowValue: { ...font.body.strong, color: colors.text },

  link: { ...font.body.strong, color: colors.accentDeep, marginTop: space.lg },

  close: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  closeLabel: { ...font.body.strong, color: colors.accentDeep },
});
