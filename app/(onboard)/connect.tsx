import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSessionStore } from '@/features/auth/session.ts';
import { connectHealth } from '@/features/health/connect-health.ts';
import { healthSource } from '@/features/health/health-source.ts';
import { deviceTimeZone } from '@/features/profile/device-timezone.ts';
import { HatchingBeat } from '@/features/onboarding/HatchingBeat.tsx';
import { OnboardingRail } from '@/features/onboarding/OnboardingChrome.tsx';
import { beatCta, onboardingBeat } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { hatchingWindow, msUntilNextChange } from '@/features/onboarding/hatching-window.ts';
import { track } from '@/features/telemetry/events.ts';
import { Button, Label, Numeral, Text } from '@/ui/index.ts';
import { colors, font, ramp, space } from '@/theme.ts';

/**
 * The first onboarding screen (design §7).
 *
 * Health used to be asked fourth — after sign-in, choosing a body and naming a
 * character — so the first thing a new user saw was a dashboard of zeroes.
 * Asking here means the name screen lands on a home tab with real numbers.
 *
 * **It reads HealthKit locally and never syncs.** There is no profile row yet,
 * so there is nothing for `health_buckets` to hang from and no
 * `profiles.timezone` to key a local day by; the device zone stands in, and the
 * first `sync-health` call still happens after `/name`. That is what lets the
 * reveal below work at all this early — it needs no server.
 *
 * **This screen writes nothing.** The body choice and the name both land in the
 * single INSERT on `/name`, and every onboarding step stays before it —
 * deviation #22 deleted the `finishingOnboarding` flag, and asking anything
 * after that INSERT needs it back.
 */
/**
 * `hatching` is the "Did you know?" beat, and it is a **phase rather than a
 * route** on purpose. The design draws it as its own screen and visually it is
 * one — full bleed, its own ground, its own rail position — but the work it
 * covers is the `readStepsToday` call below, and a route boundary in the middle
 * of an in-flight promise buys a back-swipe into a screen whose work has
 * already moved on. See `HatchingBeat`.
 */
type Phase = 'asking' | 'hatching' | 'revealed';

export default function Connect() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const beat = onboardingBeat('connect');
  useBeatImpression('connect');
  const userId = useSessionStore((s) => s.session)?.user.id;
  const [phase, setPhase] = useState<Phase>('asking');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [steps, setSteps] = useState<number | null>(null);

  /*
    The beat's two clocks.

    `openedAt` is when `connectHealth` resolved — **not** when the button was
    tapped, which is the load-bearing detail: iOS presents the Health sheet
    during `connectHealth`, and a beat started at tap would spend its whole
    minimum behind that sheet. Somebody who took ten seconds over the
    permissions would dismiss it and watch the card vanish in the same frame,
    having never seen it.

    `finishedAt` is when the step read landed. `hatching-window.ts` turns the
    pair into "is the card up, and may we move on", and holds it for whichever
    of the two comes later.
  */
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The read's result, parked until the beat is done with it. Held in a ref
  // rather than state because nothing renders from it — writing it through
  // `setSteps` early would let the reveal paint under the card.
  const pendingSteps = useRef<number | null>(null);

  // Names the start of onboarding, not this particular screen — it moved here
  // from `/character` when the order changed.
  useEffect(() => {
    void track(userId, 'onboarding_started');
  }, [userId]);

  async function connect() {
    setBusy(true);
    setFailed(false);
    try {
      // The whole sequence — request, background delivery, sync kickoff, state
      // read, telemetry — lives in one module shared with `HealthAsk`. It was
      // paraphrased here once and lost three of those five steps silently; see
      // `connect-health.ts`. It never throws.
      const result = await connectHealth(userId);

      if (!result.ok) {
        // Does **not** advance. A failed connect that reached the reveal would
        // be indistinguishable from a quiet phone — the user would read "we'll
        // pick up your activity as it comes in" about a connection that never
        // happened, and go on with a character powered by nothing.
        setFailed(true);
        return;
      }

      // The permission sheet is down and the grant landed. From here the work
      // is ours rather than the user's, so this is the moment the beat can
      // honestly claim to be visible — see `openedAt` above.
      setOpenedAt(Date.now());
      setNow(Date.now());
      setPhase('hatching');

      // A read that throws and a phone with no steps are the same thing *here*,
      // below a successful connect — both mean "nothing to show yet", and
      // neither is a failure. That is only true because the failure case
      // returned above.
      const today = await healthSource.readStepsToday(deviceTimeZone()).catch(() => null);
      pendingSteps.current = today;
      setFinishedAt(Date.now());
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  }

  /*
    One timer, not a render loop.

    `msUntilNextChange` says when the answer can next change on the clock alone
    and returns null when it cannot — the read has not landed, so the next
    change comes from the promise rather than from time passing. Waking on a
    schedule the pure module computes is what keeps this to a single `setNow`
    per transition instead of a 60Hz tick behind a static card.
  */
  const window = hatchingWindow({ openedAt, finishedAt, now });
  useEffect(() => {
    if (phase !== 'hatching') return;
    const wait = msUntilNextChange({ openedAt, finishedAt, now: Date.now() });
    // `<= 0` as well as null. A zero means the window has already passed, and
    // scheduling `setTimeout(0)` for it would set `now`, re-run this effect,
    // compute zero again and spin — the advance effect below is what handles
    // an already-due window, and it fires off the same comparison.
    if (wait === null || wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [phase, openedAt, finishedAt, now]);

  // The handover. Both halves come off one comparison inside `hatchingWindow`,
  // so there is no frame in which the card is down and the reveal has not been
  // handed its number.
  useEffect(() => {
    if (phase !== 'hatching' || !window.mayAdvance) return;
    setSteps(pendingSteps.current);
    setPhase('revealed');
  }, [phase, window.mayAdvance]);

  // Full bleed and above everything: this beat is its own screen in every way
  // except the route it lives on.
  if (phase === 'hatching') return <HatchingBeat userId={userId} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.md }]}>
      {/* The same four-segment rail every other beat carries. Without it this
          screen — the one that asks for something — would be the only step in
          the run with no sense of how much is left, which is exactly backwards.
          `tone="dark"` because this beat sits on the cream ground. */}
      <View style={styles.rail}>
        <OnboardingRail
          filled={beat.filled}
          partial={beat.partial}
          tone="dark"
          onBack={() => router.back()}
        />
      </View>

      <ScrollView contentContainerStyle={styles.top}>
        <Label>
          {healthSource.policy.supportsPermission
            ? 'CONNECT APPLE HEALTH'
            : 'ANDROID DEVELOPMENT BUILD'}
        </Label>
        <Text style={styles.title}>
          {healthSource.policy.supportsPermission
            ? 'Your character levels from what you already do.'
            : 'Health tracking is coming to Android.'}
        </Text>
        <Text style={styles.help}>
          {healthSource.policy.supportsPermission
            ? 'Kairo reads your steps, active minutes and calories from Apple Health. Your squad sees your progress — never the raw numbers.'
            : 'This build is for account, navigation and native-device smoke tests. It does not request health permissions, read device health data or sync health data.'}
        </Text>

        {phase === 'revealed' && steps !== null && steps > 0 && (
          // The reveal, and the whole reason the ask moved to the front: the
          // user sees their own real activity before committing to anything.
          //
          // Set exactly as the home screen's hero is — `Numeral size="hero"` in
          // accent[700] with the unit in the display face at accent[600]. That
          // is the point rather than a coincidence: the first number Kairo shows
          // you is the number that will greet you every morning, in the same
          // face at the same size, so the home tab reads as a promise kept.
          //
          // One accessible element with the children hidden, per the 2026-08-14
          // device pass — ungrouped this is three stops for one sentence.
          <View
            style={styles.reveal}
            accessible
            accessibilityLabel={`${steps.toLocaleString()} steps today, already counted`}
          >
            <View
              style={styles.revealRow}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Numeral value={steps} size="hero" color={ramp.accent[700]} animate />
              <Text scale="fixed" style={styles.revealUnit}>
                steps
              </Text>
            </View>
            <Text
              style={styles.revealCaption}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              today, already counted
            </Text>
          </View>
        )}

        {failed && (
          // Names what happened and what to do, in the interface's voice — it
          // does not apologise and does not blame. "Try again" because the
          // button below is still there and pressing it again is the fix.
          <Text style={styles.failed}>
            Apple Health didn't connect. Try again, or skip and connect later
            from Settings.
          </Text>
        )}

        {phase === 'revealed' && (steps === null || steps === 0) && (
          // Not an error: a new phone, or a phone left on a desk, both land
          // here. Saying "couldn't read" would blame the user for a quiet day,
          // and HealthKit will not tell us whether they declined anyway.
          <Text style={styles.quiet}>We'll pick up your activity as it comes in.</Text>
        )}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        {!healthSource.policy.supportsPermission ? (
          <Button
            label="Continue"
            variant="primary"
            onPress={() => router.push('/difficulty')}
          />
        ) : phase === 'asking' ? (
          <>
            <Button
              label={beatCta(beat)}
              variant="primary"
              busy={busy}
              onPress={() => void connect()}
            />
            {/* A deferral, not a refusal — `PermissionAsks` asks again later,
                and nothing downstream depends on the answer. */}
            <Button label="Not now" variant="ghost" onPress={() => router.push('/difficulty')} />
          </>
        ) : (
          <Button label="Continue" variant="primary" onPress={() => router.push('/difficulty')} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { paddingBottom: space.lg },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
  },
  // A ScrollView, matching the sign-in hero: the reveal appears *after* the
  // copy rather than replacing it, so this block is at its tallest exactly when
  // Dynamic Type is at its largest.
  top: { flexGrow: 1, gap: space.sm, paddingBottom: space.lg },
  title: { ...font.body.title, color: colors.text, marginTop: space.sm },
  help: { ...font.body.body, fontSize: 15, color: colors.subtle, lineHeight: 22 },
  reveal: { marginTop: space.xl, alignItems: 'center' },
  // `baseline` and `wrap`, the same as the home hero's row: six display glyphs
  // at 64pt plus the unit overflow a 320pt screen before Dynamic Type is
  // touched, and wrapping moves the unit to its own line instead of clipping.
  revealRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: space.xs,
  },
  revealUnit: { ...font.display.minor, color: ramp.accent[600], flexShrink: 1 },
  revealCaption: {
    ...font.body.strong,
    color: ramp.neutral[700],
    marginTop: space.xs,
    textAlign: 'center',
  },
  quiet: { ...font.body.body, fontSize: 14, color: colors.muted, marginTop: space.xl },
  // `colors.text`, not `damage` — that is reserved for a battle slipping away and
  // nothing else, and a permission that did not connect is not that. The system
  // builds emphasis from presence and legibility, the same call `sign-in.tsx`'s
  // notice makes.
  failed: {
    ...font.body.strong,
    fontSize: 13,
    color: colors.text,
    marginTop: space.lg,
    lineHeight: 19,
  },
});
