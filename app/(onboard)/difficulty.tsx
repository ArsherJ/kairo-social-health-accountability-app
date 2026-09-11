import { useRouter } from 'expo-router';
import { useOnboardingAnswers } from '@/features/onboarding/answers.ts';
import { onboardingBeat } from '@/features/onboarding/beats.ts';
import { calibrationNote } from '@/features/onboarding/calibration-copy.ts';
import { DifficultyScreen } from '@/features/onboarding/DifficultyScreen.tsx';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';

export default function Difficulty() {
  const router = useRouter();
  const beat = onboardingBeat('difficulty');
  useBeatImpression('difficulty');
  const chosen = useOnboardingAnswers((state) => state.questTier);
  const onChoose = useOnboardingAnswers((state) => state.setQuestTier);
  const note = calibrationNote(useOnboardingAnswers((state) => state.calibration));

  return (
    <DifficultyScreen
      beat={beat}
      chosen={chosen}
      onChoose={onChoose}
      note={note}
      onBack={() => router.back()}
      onContinue={() => router.push('/privacy')}
    />
  );
}
