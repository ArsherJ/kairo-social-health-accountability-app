import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboardingAnswers } from '@/features/onboarding/answers.ts';
import { onboardingBeat } from '@/features/onboarding/beats.ts';
import { PrivacyScreen } from '@/features/onboarding/PrivacyScreen.tsx';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { PRIVACY_CLAIM } from '@/features/privacy/claim-copy.ts';
import { PRIVACY_POLICY_URL } from '@/features/support/links.ts';

export default function Privacy() {
  const router = useRouter();
  const beat = onboardingBeat('privacy');
  useBeatImpression('privacy');
  const shareTotals = useOnboardingAnswers((state) => state.shareTotals);
  const onShareTotalsChange = useOnboardingAnswers((state) => state.setShareTotals);

  return (
    <PrivacyScreen
      beat={beat}
      shareTotals={shareTotals}
      onShareTotalsChange={onShareTotalsChange}
      healthCopy={PRIVACY_CLAIM.healthRequired}
      sharingCopy={PRIVACY_CLAIM.sharingTotals}
      onBack={() => router.back()}
      onContinue={() => router.push('/name')}
      onPolicy={() => void Linking.openURL(PRIVACY_POLICY_URL)}
      onCounting={() => router.push('/counting')}
    />
  );
}
