import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { isValidCharacterName } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { DEFAULT_SPECIES } from '@/features/character/species.ts';
import { useOnboardingAnswers } from '@/features/onboarding/answers.ts';
import { onboardingBeat } from '@/features/onboarding/beats.ts';
import { NameScreen } from '@/features/onboarding/NameScreen.tsx';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { useCreateProfile } from '@/features/profile/create-profile.ts';
import { useUpdateProfile } from '@/features/profile/update-profile.ts';

export default function MeetYourKairo() {
  const router = useRouter();
  const beat = onboardingBeat('name');
  useBeatImpression('name');
  const session = useSessionStore((state) => state.session);
  const createProfile = useCreateProfile(session?.user.id);
  const updateProfile = useUpdateProfile(session?.user.id);
  const answers = useOnboardingAnswers();
  const [name, setName] = useState('');
  const submitting = useRef(false);
  const valid = isValidCharacterName(name);

  function submit() {
    // TanStack publishes pending state asynchronously. The ref closes the
    // same-tick keyboard/tap window so the profile INSERT still occurs once.
    if (!valid || createProfile.isPending || submitting.current) return;
    submitting.current = true;
    createProfile.mutate(
      { name, species: DEFAULT_SPECIES },
      {
        onSuccess: () => {
          // These were answered before the profile existed. Keep them as the
          // post-insert UPDATE rather than widening the one profile INSERT.
          updateProfile.mutate({
            quest_tier_override: answers.questTier,
            squad_data_consent_at: answers.shareTotals ? new Date().toISOString() : null,
          });
          answers.reset();
          router.replace('/');
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  return (
    <NameScreen
      beat={beat}
      name={name}
      onNameChange={setName}
      valid={valid}
      busy={createProfile.isPending}
      error={createProfile.error?.message ?? null}
      onBack={() => router.back()}
      onSubmit={submit}
    />
  );
}
