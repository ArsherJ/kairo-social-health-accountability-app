import { useRouter } from 'expo-router';
import { MirrorScreen } from '@/features/onboarding/MirrorScreen.tsx';
import { onboardingBeat } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';

export default function Mirror() {
  const router = useRouter();
  const beat = onboardingBeat('mirror');
  useBeatImpression('mirror');
  return <MirrorScreen beat={beat} onBack={() => router.back()} onContinue={() => router.push('/connect')} />;
}
