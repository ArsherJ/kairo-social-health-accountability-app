import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Panel } from '@/ui/index.ts';
import { colors, space } from '@/theme.ts';
import { HealthAsk } from '@/features/health/HealthPermissionSheet.tsx';
import { healthSource } from '@/features/health/health-source.ts';
import { track } from '@/features/telemetry/events.ts';
import type { HealthPermissionState } from '@/features/health/permission-state.ts';
import { NotificationAsk } from '@/features/notifications/NotificationPermissionSheet.tsx';
import type { NotificationPermission } from '@/features/notifications/ask-policy.ts';
import { readNotificationPermission } from '@/features/notifications/permission.ts';
import { nextPermissionAsk } from './ask-order.ts';

/**
 * The one place that presents a permission sheet.
 *
 * **There is exactly one `<Modal>` in this app's permission flow, and it lives
 * here.** That is the whole point. A `<Modal>` presents on the root view
 * controller no matter where it is mounted, so two of them mounted in different
 * subtrees are not independent — when both turned visible in the same frame,
 * UIKit refused the second (*"Attempt to present … which is already
 * presenting …"*), suppressed it with no error the user could see, and left the
 * window wedged badly enough that the tab bar stopped taking touches.
 *
 * Which ask wins, and whether to ask at all, is `nextPermissionAsk` — pure and
 * tested. This component only owns the I/O it decides from: the two permission
 * reads, the per-session dismissals, and the one-ask-per-session latch.
 *
 * Mounted at the tabs shell, not on a screen: the ask is keyed to what has
 * happened to the user, not to where they are standing. In practice the app
 * opens on the character tab, so the Health ask still overlays the character it is
 * about to power, which is what §5 wanted from putting it there.
 */
export function PermissionAsks({
  userId,
  hasSquad,
  hasGoal,
}: {
  userId: string | undefined;
  hasSquad: boolean;
  hasGoal: boolean;
}) {
  const [health, setHealth] = useState<HealthPermissionState | null>(null);
  const [notification, setNotification] = useState<NotificationPermission | null>(null);
  const [healthDismissed, setHealthDismissed] = useState(false);
  const [notificationDismissed, setNotificationDismissed] = useState(false);
  const [answeredAnAskThisSession, setAnswered] = useState(false);

  /**
   * The sheet's content width, in points, computed rather than expressed as a
   * percentage — and that is the fix, not a style preference.
   *
   * `width: '100%'` resolves against the ScrollView, and the ScrollView hugs
   * its content vertically (see `sheetScroll`), so its own size depends on
   * measuring that content. The measurement is circular, and RN resolves it by
   * measuring the text against an unbounded width: every line was laid out
   * wider than the card and then cut off by `Panel`'s `overflow: 'hidden'`,
   * clipped mid-word with no ellipsis. It reads exactly like a text-wrapping
   * bug and is not one.
   *
   * At normal text sizes no line was long enough to cross the boundary, so this
   * was invisible in every screenshot until an XXXL one.
   *
   * RN's box model is border-box, so this is the card's full width and the
   * `space.lg` padding on the content container sits inside it.
   */
  const { width: windowWidth } = useWindowDimensions();
  const sheetWidth = windowWidth - space.lg * 2;

  useEffect(() => {
    let cancelled = false;
    void healthSource.readPermissionState().then((state) => {
      if (!cancelled) setHealth(state);
    });
    void readNotificationPermission().then((state) => {
      if (!cancelled) setNotification(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Both reads must land before anything is decided. Deciding on a half-read
  // state would present the Health sheet and then swap it for the notification
  // one a frame later, which is the flicker the single modal exists to avoid.
  //
  // `userId` gates the whole thing. The tabs shell now stays mounted while the
  // Gate resolves (see `app/_layout.tsx`), so on a cold start this component
  // exists for a frame or two before the redirect to sign-in lands — and
  // without this guard the Health sheet would present over it, asking for
  // HealthKit on behalf of nobody.
  const ask =
    userId === undefined || health === null || notification === null
      ? null
      : nextPermissionAsk({
          health,
          healthDismissed,
          notification,
          notificationDismissed,
          hasSquad,
          hasGoal,
          answeredAnAskThisSession,
        });

  return (
    <Modal visible={ask !== null} transparent animationType="slide">
      <View style={styles.backdrop}>
        {/* The sheet is bounded and its contents scroll.

            Neither was true until 2026-08-17, and the failure was invisible in
            every screenshot taken at a normal text size: `Panel` sets
            `overflow: 'hidden'`, so at the largest accessibility sizes the
            content did not spill past the card — it was silently cut off
            inside it. On an XXXL simulator the Health sheet lost its "Not now"
            entirely, which is the one control that lets someone decline. A
            permission sheet whose dismissal is unreachable is a trap, not a
            layout bug.

            It lives here rather than in either sheet because this component
            owns the geometry — both asks are plain content, and putting the
            bound in one of them would leave the other to rediscover this. */}
        <Panel variant="plain" style={styles.sheet}>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            // The sheet is only as tall as it needs to be at normal sizes, so
            // at those sizes this never scrolls and shows no indicator.
            showsVerticalScrollIndicator
            bounces={false}
          >
          {/* A plain View with an explicit point width, wrapping the whole
              sheet. This is the fix, and the evidence for it is specific: with
              the asks' `<Text>` elements as *direct* children of the scroll
              content, every line was laid out wider than the card and cut off
              by `Panel`'s `overflow: 'hidden'` — while the disclosure rows,
              which are Views containing Text, wrapped perfectly in the same
              pass. A View establishes the bound; a Text measuring against the
              content container did not get one. */}
          <View style={[styles.sheetInner, { width: sheetWidth }]}>
          {ask === 'health' && (
            <HealthAsk
              userId={userId}
              onAnswered={() => {
                // 'asked' rather than re-reading: HealthKit deliberately will
                // not tell us what was granted, so the request completing is
                // the only signal there is.
                setHealth('asked');
                setAnswered(true);
              }}
              onDismiss={() => {
                setHealthDismissed(true);
                void track(userId, 'health_ask_dismissed');
              }}
            />
          )}

          {ask === 'notifications' && (
            <NotificationAsk
              onAnswered={(result) => {
                setNotification(result);
                setAnswered(true);
              }}
              onDismiss={() => setNotificationDismissed(true)}
            />
          )}
          </View>
          </ScrollView>
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
  // `maxHeight` rather than a height: at normal text sizes the sheet still
  // hugs its content and sits at the bottom of the screen, exactly as before.
  // The bound only engages when the content would otherwise exceed the screen,
  // which is the only case that was broken. 85% leaves the backdrop visible so
  // the sheet still reads as a sheet rather than as a full-screen takeover.
  // `padding: 0` overrides `Panel`'s own `space.lg`, and the padding moves onto
  // the scroll content below instead. That is not cosmetic: with the padding on
  // the card, the ScrollView inside it was being laid out against the card's
  // *outer* width, so every line wrapped ~48pt wider than the box that clips
  // it. At normal text sizes the lines were short enough that nothing crossed
  // the boundary and the layout looked correct; it only showed up once the type
  // was large enough for a line to reach the edge — which is why this survived
  // until an XXXL screenshot.
  //
  // It also puts the scroll indicator at the card's edge rather than inset
  // inside the padding, which is where it belongs.
  sheet: {
    marginTop: 0,
    marginBottom: space.lg,
    marginHorizontal: space.lg,
    maxHeight: '85%',
    padding: 0,
  },
  // `flexGrow: 0` + `flexShrink: 1` is the whole trick, and both halves matter.
  // A ScrollView's default is to grow, so with `maxHeight` on the card above it
  // the sheet took the full 85% at *every* text size — a short notification ask
  // became a near-full-screen panel with its content spread down the page.
  // Growing off, shrinking on: the card hugs its content until the content
  // exceeds the cap, and only then does the ScrollView bound it and scroll.
  sheetScroll: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  // `flexGrow: 0` so a short sheet is not stretched to the bound. Without it
  // the notification ask — which is half the height of the health one — would
  // be padded out to 85% of the screen at every text size.
  //
  sheetContent: { flexGrow: 0 },
  // The padding lives here rather than on `Panel` (which is overridden to 0)
  // so the scroll indicator sits at the card's edge, and the width is a point
  // value rather than '100%' — a percentage resolves against the ScrollView,
  // whose own size depends on measuring this content, and the circularity is
  // what produced the unbounded text width.
  sheetInner: { padding: space.lg },
});
