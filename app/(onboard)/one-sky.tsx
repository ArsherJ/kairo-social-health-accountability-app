import { useRouter } from 'expo-router';
import { OneSkyScreen } from '@/features/onboarding/OneSkyScreen.tsx';
import { onboardingBeat, onboardingSkipTarget } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';

export default function OneSky() {
  const router = useRouter();
  const beat = onboardingBeat('one-sky');
  useBeatImpression('one-sky');
  return (
    <OneSkyScreen
      beat={beat}
      onBack={() => router.back()}
      onContinue={() => router.push('/mirror')}
      onSkip={() => router.replace(onboardingSkipTarget())}
    />
  );
}
