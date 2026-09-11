import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSessionStore } from '@/features/auth/session.ts';
import { connectHealth } from '@/features/health/connect-health.ts';
import { healthSource } from '@/features/health/health-source.ts';
import { useOnboardingAnswers } from '@/features/onboarding/answers.ts';
import { onboardingBeat } from '@/features/onboarding/beats.ts';
import { runCalibration } from '@/features/onboarding/calibration.ts';
import { ConnectScreen } from '@/features/onboarding/ConnectScreen.tsx';
import { HatchingBeat } from '@/features/onboarding/HatchingBeat.tsx';
import { hatchingWindow, msUntilNextChange } from '@/features/onboarding/hatching-window.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { PRIVACY_CLAIM } from '@/features/privacy/claim-copy.ts';
import { deviceTimeZone } from '@/features/profile/device-timezone.ts';
import { track } from '@/features/telemetry/events.ts';

type Phase = 'asking' | 'hatching' | 'revealed';

export default function Connect() {
  const router = useRouter();
  const beat = onboardingBeat('connect');
  useBeatImpression('connect');
  const userId = useSessionStore((state) => state.session)?.user.id;
  const setCalibration = useOnboardingAnswers((state) => state.setCalibration);
  const [phase, setPhase] = useState<Phase>('asking');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [steps, setSteps] = useState<number | null>(null);
  // The hatch starts only after the system permission sheet is down, then
  // stays until both its reading floor and the two Health reads are complete.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pendingSteps = useRef<number | null>(null);

  useEffect(() => {
    void track(userId, 'onboarding_started');
  }, [userId]);

  async function connect() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await connectHealth(userId);
      if (!result.ok) {
        setFailed(true);
        return;
      }

      // Starting at tap would spend the hatch's minimum behind the iOS sheet.
      setOpenedAt(Date.now());
      setNow(Date.now());
      setPhase('hatching');

      // Keep the reveal and calibration seed atomic so Difficulty cannot mount
      // and then change its proposed answer under the reader's thumb.
      const [today, calibration] = await Promise.all([
        healthSource.readStepsToday(deviceTimeZone()).catch(() => null),
        runCalibration(userId),
      ]);
      pendingSteps.current = today;
      setCalibration(calibration);
      setFinishedAt(Date.now());
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  }

  const window = hatchingWindow({ openedAt, finishedAt, now });
  useEffect(() => {
    if (phase !== 'hatching') return;
    const wait = msUntilNextChange({ openedAt, finishedAt, now: Date.now() });
    // A non-positive result advances through the comparison below; scheduling
    // a zero-delay timer here would loop.
    if (wait === null || wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [phase, openedAt, finishedAt, now]);

  useEffect(() => {
    if (phase !== 'hatching' || !window.mayAdvance) return;
    setSteps(pendingSteps.current);
    setPhase('revealed');
  }, [phase, window.mayAdvance]);

  if (phase === 'hatching') return <HatchingBeat userId={userId} />;

  return (
    <ConnectScreen
      beat={beat}
      supportsPermission={healthSource.policy.supportsPermission}
      phase={phase}
      busy={busy}
      failed={failed}
      steps={steps}
      privacyCopy={PRIVACY_CLAIM.connectHealth}
      onBack={() => router.back()}
      onConnect={() => void connect()}
      onContinue={() => router.push('/difficulty')}
    />
  );
}
