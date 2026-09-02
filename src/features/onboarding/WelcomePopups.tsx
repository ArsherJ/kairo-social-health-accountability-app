import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { RACE_FINISH_LINE } from '@kairo/core';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { hasReached, markReached } from '@/features/telemetry/milestone-store.ts';
import { colors, font, radius, ramp, shadow, space } from '@/theme.ts';
import { Gradient, Text } from '@/ui/index.ts';
import { claimModal, releaseModal, useModalOwner } from '@/ui/modal-owner.ts';
import type { Stop } from '@/ui/gradient.ts';
import { OnboardingCta } from './OnboardingCta.tsx';

/**
 * The three cards that land on Today after onboarding.
 *
 * Onboarding drops you on the home screen, dimmed, and a sheet rises: an art
 * panel, one line, one button. Three of them, in an order that is an argument —
 * **who you are**, then **the one rule**, then **the ask that makes the app
 * work**. The third is the only one with a second option, because inviting
 * somebody is genuinely optional and pretending otherwise would be the kind of
 * dark pattern the privacy beat two screens earlier just promised not to be.
 *
 * **Once ever, on an MMKV marker.** Not a `profiles` column: this is a fact
 * about an install having shown something, and a column would need a migration
 * and a grant to record a thing no server logic reads. The marker is claimed on
 * the *first* card rather than the last, so a user who force-quits half way
 * through is not shown the set again from the top — the alternative traps
 * somebody in a loop they cannot finish.
 *
 * **It teaches `RACE_FINISH_LINE`, never a literal.** That figure *is*
 * `DAILY_STEP_BASELINE`, which *is* the Daily Walk — one number the app teaches
 * once and then reads three ways. `10_000` must not appear here.
 */
export function WelcomePopups({
  userId,
  characterName,
  inviteCode,
  onInvite,
}: {
  userId: string | undefined;
  characterName: string;
  /** The squad's code, when there is one. Null turns card three into a nudge. */
  inviteCode: string | null;
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

  if (!open || !userId) return null;

  const card = CARDS[index] as (typeof CARDS)[number];
  const last = index === CARDS.length - 1;

  return (
    <Modal
      visible={open && owner === 'welcome'}
      transparent
      animationType="fade"
      onRequestClose={() => setOpen(false)}
    >
      {/* The dim. Not pressable to dismiss: three cards is a short read and a
          stray tap on the scrim would skip the one rule of the game. */}
      <View style={styles.scrim}>
        <View style={styles.sheet}>
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
              {CARDS.map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
          </View>

          <View style={styles.body}>
            {/* One element for the pair: a headline and its sentence are one
                statement, and read apart the headline is a fragment. */}
            <View
              accessible
              accessibilityLabel={`${card.title(characterName)}. ${card.body(inviteCode)}`}
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
                {card.body(inviteCode)}
              </Text>
            </View>

            <OnboardingCta
              label={last ? (inviteCode ? 'Share my code' : 'Find my flock') : 'Next'}
              tone="bright"
              icon={last ? 'share-variant' : undefined}
              onPress={() => {
                if (!last) return setIndex((i) => i + 1);
                setOpen(false);
                onInvite();
              }}
            />

            {/* Only on the last card, and it is a real option. */}
            {last && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue without inviting anyone"
                hitSlop={space.sm}
                onPress={() => setOpen(false)}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text scale="chrome" style={styles.decline}>
                  I&apos;ll walk alone for now
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const SUNSET: Stop[] = [
  { color: '#ff8a4c', at: 0 },
  { color: colors.coral, at: 1 },
];
const DAYLIGHT: Stop[] = [
  { color: ramp.sky[400], at: 0 },
  { color: ramp.sky[500], at: 1 },
];
const DUSK: Stop[] = [
  { color: '#9b6bff', at: 0 },
  { color: ramp.sage[500], at: 1 },
];

/**
 * The three, in order.
 *
 * `title` and `body` are functions because two of them carry a real value —
 * the character's name and the squad's invite code — and a template baked at
 * module load would need the values at module load.
 */
const CARDS = [
  {
    pose: 'race_victory' as const,
    field: SUNSET,
    title: (name: string) => `Welcome to Kairo, ${name}!`,
    body: () => 'Your bird is hatched and your day has already started.',
  },
  {
    pose: 'run' as const,
    field: DAYLIGHT,
    title: () => `Cross ${RACE_FINISH_LINE.toLocaleString()} and the day is yours`,
    body: () =>
      'Same flag for everybody, every day. Miss one and your shield covers it.',
  },
  {
    pose: 'walk' as const,
    field: DUSK,
    // "flock", never "barkada" — deviation #26 retired that word along with
    // "Hunter", and the design's copy predates it.
    title: () => 'Kairo is better with a flock',
    body: (code: string | null) =>
      code
        ? 'Send one person your code and tomorrow’s sky has somebody in it.'
        : 'Start a flock and tomorrow’s sky has somebody else in it.',
  },
];

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
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl + 4,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...shadow.lg,
  },
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
