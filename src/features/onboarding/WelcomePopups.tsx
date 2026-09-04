import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { track } from '@/features/telemetry/events.ts';
import { hasReached, markReached } from '@/features/telemetry/milestone-store.ts';
import { colors, font, radius, shadow, space } from '@/theme.ts';
import { Gradient, Text } from '@/ui/index.ts';
import { claimModal, releaseModal, useModalOwner } from '@/ui/modal-owner.ts';
import { OnboardingCta } from './OnboardingCta.tsx';
import {
  WELCOME_CARDS,
  WELCOME_NEXT_LABEL,
  type FlockAnswer,
} from './welcome-cards.ts';

/**
 * The four cards that land on Today after onboarding.
 *
 * Onboarding drops you on the home screen, dimmed, and a sheet rises: an art
 * panel, one line, one button. Four of them, in an order that is an argument —
 * **who you are**, then **the one rule**, then **what a flock is**, then **the
 * ask**. The first three are linear reads with a next button; only the last has
 * options, and `welcome-cards.ts` holds every word of it.
 *
 * **The flock ask is a card here, not a first-run sheet of its own** — and
 * three things follow from that, all of them the point:
 *
 *  - *No second modal owner.* This run already leases the root view controller
 *    (`modal-owner.ts`). A separately leased flock sheet would mean a
 *    brand-new account meets both on the same first focus, one loses the lease,
 *    and the loser reappears later out of context.
 *  - *No second once-ever marker, and none needed.* The run is claimed on
 *    `welcome_seen` when it opens, so the card cannot be reached twice — which
 *    is the whole guarantee a marker of its own would buy.
 *  - *No ordering rule between two first-run surfaces*, because there is only
 *    one.
 *
 * **A known and accepted loss.** `welcome_seen` is claimed when the run
 * *opens*, not when it finishes, so somebody who force-quits before card four
 * never sees the flock ask at all. Two repairs suggest themselves and both are
 * refused. Moving the ask to the front is the ask arriving before its why —
 * recruiting friends before the game has been explained — which is the rule the
 * notification policy already enforces. A second marker that survived the
 * interruption would fix it and reintroduce exactly the two-surface ordering
 * problem above. **The loss is bounded**: the Sky tab's flock rail carries a
 * permanent trailing invite slot, so a missed card costs a nudge rather than
 * the feature. Leave it as it is.
 *
 * **Once ever, on an MMKV marker.** Not a `profiles` column: this is a fact
 * about an install having shown something, and a column would need a migration
 * and a grant to record a thing no server logic reads. Claimed on the *first*
 * card rather than the last, so a user who force-quits half way through is not
 * shown the set again from the top — the alternative traps somebody in a loop
 * they cannot finish, and is the direct cause of the loss recorded above.
 */
export function WelcomePopups({
  userId,
  characterName,
  inviteCode,
  onJoin,
  onInvite,
}: {
  userId: string | undefined;
  characterName: string;
  /**
   * The squad's code, when there is one. Non-null means this account already
   * has a squad, which is what takes the join door off the last card.
   */
  inviteCode: string | null;
  /** Open the join form, prefilled by nothing — the player has a code to type. */
  onJoin: () => void;
  /** Share an existing code, or start the squad there is not one of yet. */
  onInvite: () => void;
}) {
  // Read once, on mount, through a lazy initialiser: reading MMKV on every
  // render would be a side effect in a render body, and re-reading after
  // `markReached` would close the sheet the moment the first card was shown.
  const [open, setOpen] = useState(() => {
    if (!userId) return false;
    try {
      if (hasReached(userId, 'welcome_seen')) return false;
      // Claimed here, not on the last card. Somebody who force-quits half way
      // through must not meet the set again from the top.
      markReached(userId, 'welcome_seen');
      return true;
    } catch (error) {
      // Milestone bookkeeping must never break the screen it is observed from
      // — the same guard `markFirstScoreSeen` carries. A store that throws
      // means no welcome, which is the safe direction.
      console.warn('[welcome] milestone read', error);
      return false;
    }
  });
  const [index, setIndex] = useState(0);

  // The welcome cards lease the same root view controller the permission asks
  // and Today's details sheet do — see `modal-owner.ts`. Above the early return
  // on purpose: a hook below one is a conditional hook, and the release has to
  // run on the frame `open` turns false.
  const owner = useModalOwner((state) => state.owner);

  useEffect(() => {
    if (open && owner === null) claimModal('welcome');
    if (!open && owner === 'welcome') releaseModal('welcome');
  }, [open, owner]);

  useEffect(() => () => releaseModal('welcome'), []);

  /**
   * The sheet's content width in points, computed rather than a percentage.
   *
   * The permission sheet's 2026-08-17 lesson, and it is not a style preference:
   * `width: '100%'` resolves against the `ScrollView`, whose own size depends on
   * measuring this content, and RN breaks that circularity by measuring text
   * against an *unbounded* width — every line laid out wider than the card and
   * then clipped mid-word by `overflow: 'hidden'`. It reads as a text-wrapping
   * bug and is not one, and it is invisible at every normal text size.
   *
   * `maxWidth` on the card is mirrored here rather than inferred: the card
   * takes the smaller of the two, so the inner width has to as well.
   */
  const { width: windowWidth } = useWindowDimensions();
  const sheetWidth = Math.min(windowWidth - space.lg * 2, SHEET_MAX_WIDTH);

  /**
   * One answer per run, enforced on a ref rather than on `open`.
   *
   * `setOpen(false)` lands on the next render, and RN can deliver taps to two
   * different `Pressable`s inside one frame — so without this a fast
   * double-tap across two buttons files two `flock_prompt_answered` rows *and*
   * pushes both destinations. `welcome_seen` bounds the *card*, not the frame.
   */
  const answered = useRef(false);

  if (!open || !userId) return null;

  const card = WELCOME_CARDS[index] as (typeof WELCOME_CARDS)[number];
  const actions = card.actions?.(inviteCode) ?? null;

  /**
   * The one emitter, and the payload is the answer alone.
   *
   * **The dismissal is queued in the same commit as the navigation, not
   * awaited** — nothing here can observe the `<Modal>` actually going away.
   * That is safe because both destinations are plain screens on the Flock tab
   * and neither presents a native sheet on arrival; a destination that did
   * would need the lease released first, and this is the comment that should
   * stop somebody assuming it already is.
   */
  function answerFlock(answer: FlockAnswer): void {
    if (answered.current) return;
    answered.current = true;
    void track(userId, 'flock_prompt_answered', { answer });
    setOpen(false);
    if (answer === 'joined') onJoin();
    if (answer === 'invited') onInvite();
  }

  return (
    <Modal
      visible={open && owner === 'welcome'}
      transparent
      animationType="fade"
      onRequestClose={() => setOpen(false)}
    >
      {/* The dim. Not pressable to dismiss: four cards is a short read and a
          stray tap on the scrim would skip the one rule of the game. */}
      <View style={styles.scrim}>
        <View style={[styles.sheet, { width: sheetWidth }]}>
          {/* Bounded and scrolling, with the content in a View that has a real
              point width — all three halves of the permission sheet's
              2026-08-17 lesson, and all three needed here now that the last
              card stacks two pills and a decline under a 240pt art panel. The
              art scrolls with the rest rather than being pinned: at XXXL a
              pinned panel eats the bound and the thing pushed off the bottom
              is "Not now", which is the exact control that must never be the
              one that goes. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            bounces={false}
          >
            {/* A plain View with an explicit point width. The evidence for it
                is specific: `<Text>` as a direct child of a scroll container
                lays out against an unbounded width and is then cut off by the
                card's `overflow: 'hidden'`, mid-word and with no ellipsis. A
                View establishes the bound; `width: '100%'` does not. */}
            <View style={{ width: sheetWidth }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.art}
            >
              <Gradient stops={card.field} steps={18} />
              <View style={[styles.blob, { top: 24, left: -40, width: 200, height: 56 }]} />
              <View style={[styles.blob, { bottom: 40, right: -30, width: 180, height: 52 }]} />
              <KairoThumbnail pose={card.pose} size={168} decorative />

              <View style={styles.dots}>
                {WELCOME_CARDS.map((_, i) => (
                  <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
                ))}
              </View>
            </View>

            <View style={styles.body}>
              {/* One element for the pair: a headline and its sentence are one
                  statement, and read apart the headline is a fragment. */}
              <View
                accessible
                accessibilityLabel={`${card.title(characterName)}. ${card.body()}`}
              >
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  scale="chrome"
                  style={styles.title}
                >
                  {card.title(characterName)}
                </Text>
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.text}
                >
                  {card.body()}
                </Text>
              </View>

              {actions === null ? (
                <OnboardingCta
                  label={WELCOME_NEXT_LABEL}
                  tone="bright"
                  onPress={() => setIndex((i) => i + 1)}
                />
              ) : (
                actions.map((action) =>
                  // The quiet one is a text link, not a third fat pill: declining
                  // has to be frictionless, and a pill would make "Not now" weigh
                  // as much as the two asks above it.
                  action.tone === 'quiet' ? (
                    <Pressable
                      key={action.answer}
                      accessibilityRole="button"
                      accessibilityLabel={action.spoken ?? action.label}
                      hitSlop={space.sm}
                      onPress={() => answerFlock(action.answer)}
                      style={({ pressed }) => pressed && { opacity: 0.6 }}
                    >
                      <Text scale="chrome" style={styles.decline}>
                        {action.label}
                      </Text>
                    </Pressable>
                  ) : (
                    <OnboardingCta
                      key={action.answer}
                      label={action.label}
                      tone={action.tone}
                      icon={action.icon}
                      // Two, because this pill is inside a sheet inside a scrim
                      // and has lost four lots of `space.lg` — at the 1.4× cap a
                      // three-word label no longer fits on a 320pt screen, and a
                      // truncated control is one somebody cannot act on.
                      lines={2}
                      onPress={() => answerFlock(action.answer)}
                    />
                  ),
                )
              )}
            </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The card's own cap, mirrored into the point width the scroll content is laid
 * out against — see `sheetWidth`. A `maxWidth` in the stylesheet alone would
 * let the two disagree on a tablet.
 */
const SHEET_MAX_WIDTH = 420;

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(24,16,52,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  // No fixed height: the sheet is as tall as its copy, which is what keeps it
  // whole at the largest content sizes. The permission sheet's 2026-08-17
  // lesson — an oversized sheet inside a bounded card is silently clipped, and
  // at XXXL it lost the one control that let somebody decline.
  // `maxHeight` rather than a height: at normal text sizes the card still hugs
  // its copy and sits centred in the scrim, exactly as before. The bound only
  // engages when the content would otherwise exceed the screen — which, until
  // the flock ask added two more controls, it never did.
  sheet: {
    maxHeight: '90%',
    borderRadius: radius.xl + 4,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...shadow.lg,
  },
  // `flexGrow: 0` + `flexShrink: 1`, and both halves matter. A ScrollView grows
  // by default, so with `maxHeight` on the card above it the sheet would take
  // 90% of the screen at *every* text size — a four-line card spread down the
  // page. Growing off, shrinking on: the card hugs its content until the
  // content exceeds the cap, and only then does this bound it and scroll.
  scroll: { flexGrow: 0, flexShrink: 1 },
  // `flexGrow: 0` so a short card is not stretched to the bound.
  scrollContent: { flexGrow: 0 },
  art: { height: 240, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  blob: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dots: { position: 'absolute', top: 22, right: 22, flexDirection: 'row', gap: 7 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotOn: { backgroundColor: colors.bg },
  body: { padding: space.lg, gap: space.sm, alignItems: 'stretch' },
  title: {
    ...font.display.major,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    color: colors.text,
  },
  text: {
    ...font.body.body,
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.muted,
    marginTop: 4,
    marginBottom: space.sm,
  },
  decline: {
    ...font.body.body,
    fontSize: 13,
    textAlign: 'center',
    color: colors.muted,
    marginTop: 4,
  },
});
