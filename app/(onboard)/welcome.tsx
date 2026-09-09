import { useRouter } from 'expo-router';
import { WelcomeScreen } from '@/features/onboarding/WelcomeScreen.tsx';
import { onboardingBeat, onboardingSkipTarget } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';

export default function Welcome() {
  const router = useRouter();
  const beat = onboardingBeat('welcome');
  useBeatImpression('welcome');
  return <WelcomeScreen beat={beat} onContinue={() => router.push('/one-sky')} onSkip={() => router.replace(onboardingSkipTarget())} />;
}
