import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHARACTER_NAME_MAX, isValidCharacterName } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { DEFAULT_SPECIES, SPECIES } from '@/features/character/species.ts';
import { SPECIES_FIGURES } from '@/features/character/species-art.ts';
import { useCreateProfile } from '@/features/profile/create-profile.ts';
import { OnboardingRail } from '@/features/onboarding/OnboardingChrome.tsx';
import { beatCta, onboardingBeat } from '@/features/onboarding/beats.ts';
import { useBeatImpression } from '@/features/onboarding/useBeatImpression.ts';
import { useOnboardingAnswers } from '@/features/onboarding/answers.ts';
import { useUpdateProfile } from '@/features/profile/update-profile.ts';
import { Button, Label, Panel, Text } from '@/ui/index.ts';
import { colors, font, radius, space } from '@/theme.ts';

/**
 * Meet your Kairo — the last onboarding screen (`Canvas.dc.html` 2a).
 *
 * Onboarding is `/connect` → here, two screens, as of 2026-08-27. It used to be
 * three: the species picker sat between them and is retired with deviation #55.
 *
 * **The profile row still commits exactly once, and still here.** Removing a
 * step strengthens deviation #22's rule rather than merely respecting it —
 * that deviation deleted the `finishingOnboarding` flag when onboarding
 * collapsed, and anything asked *after* the INSERT flips `resolveRoute` to
 * `'ready'` underneath an unfinished screen and needs the flag back. Add
 * onboarding steps before the name, never after.
 *
 * The screen is a meeting rather than a form: the bird is already there, and
 * the only question is what to call it.
 */
export default function MeetYourKairo() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const beat = onboardingBeat('name');
  useBeatImpression('name');
  const session = useSessionStore((s) => s.session);
  const createProfile = useCreateProfile(session?.user.id);
  const updateProfile = useUpdateProfile(session?.user.id);
  const answers = useOnboardingAnswers();
  const [name, setName] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  const valid = isValidCharacterName(name);

  // createProfile.isPending flips through TanStack's notifyManager, which by
  // default schedules the update via setTimeout(fn, 0) rather than delivering
  // it synchronously with mutate(). A keyboard "Done" and an already-queued
  // touch can both fire within the same tick and both still read the previous
  // render's isPending === false, producing two inserts with the same id. This
  // ref is flipped synchronously, before mutate() runs, so the second event in
  // the same tick is rejected regardless of render timing.
  const submitting = useRef(false);

  function submit() {
    if (!valid || createProfile.isPending || submitting.current) return;
    submitting.current = true;
    createProfile.mutate(
      // `DEFAULT_SPECIES`, not a route param. The picker is gone and there is
      // nothing to carry — but the column is still written, because it is a
      // real column and a null here would be a second way of saying "eagle".
      { name, species: DEFAULT_SPECIES },
      {
        onSuccess: () => {
          /*
            The two answers the earlier beats collected, written now.

            **This is not "asking something after the INSERT"** — deviation
            #22's rule is about *asking*, and nothing is asked here: the
            difficulty and the sharing choice were both made two screens ago
            and have been sitting in `useOnboardingAnswers` since. The row
            still commits exactly once, on this screen, and the user is not
            standing on an unfinished screen when `resolveRoute` flips to
            'ready' — they are done.

            It has to be an UPDATE rather than part of the INSERT because
            `quest_tier_override` and `squad_data_consent_at` are in
            `profiles`' column-level UPDATE grant and not its INSERT grant.
            Naming them in the insert would be rejected outright.

            Fire-and-forget, and deliberately not awaited before navigating:
            both columns have defaults that match the screens' own defaults
            (automatic difficulty, sharing on), so a dropped update leaves the
            account in exactly the state a user who accepted both would be in.
            Blocking the last step of onboarding on a second round trip — and
            showing an error for it — would be a worse trade than that.
          */
          updateProfile.mutate({
            quest_tier_override: answers.questTier,
            squad_data_consent_at: answers.shareTotals ? new Date().toISOString() : null,
          });
          answers.reset();

          // The profile row now exists, so the route gate reads this user as
          // onboarded and would send them here on its own. Replacing
          // explicitly keeps the transition predictable and one frame earlier.
          router.replace('/');
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/*
        Scrolls, and its text sits in a container with a real width. Both are
        the permission sheet's 2026-08-17 lessons: at the largest content sizes
        this screen's copy plus a 28pt input plus a button does not fit a
        phone, and a direct `Text` child of a scroll container lays out wider
        than the screen and clips mid-word.
      */}
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* The rail, closed out. This is the last beat and the only one in
            its phase, so its phase fills completely and all four segments are
            full — a run that never shows its own completion is a run that felt
            longer than it was. */}
        <View style={styles.rail}>
          <OnboardingRail
            filled={beat.filled}
            partial={beat.partial}
            tone="dark"
            onBack={() => router.back()}
          />
        </View>

        <Panel variant="sky" style={styles.stage}>
          <Image
            source={SPECIES_FIGURES[DEFAULT_SPECIES]}
            style={styles.figure}
            resizeMode="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Your ${SPECIES[DEFAULT_SPECIES].name}, wings half open`}
          />
        </Panel>

        <View style={styles.copy}>
          <Label>It found you</Label>
          <Text style={styles.title}>Meet your Kairo</Text>
          <Text style={styles.help}>
            {`A ${SPECIES[DEFAULT_SPECIES].name}, and from today it lives off your movement — your walks, your sessions, your sleep. Nothing you buy, nothing you tap.`}
          </Text>
        </View>

        <Panel variant="tint">
          <Label>Its name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            autoCorrect={false}
            maxLength={CHARACTER_NAME_MAX}
            // The placeholder instructs rather than exemplifies. A specimen
            // name read as a name already entered — sighted, next to a
            // disabled button, that looks like a broken app; unlabelled, a
            // screen reader announced it as the field's value, on the one
            // screen where the whole task is choosing your own. The label is
            // still needed: a placeholder is not an accessible name whatever
            // it says.
            accessibilityLabel="Your Kairo's name"
            accessibilityHint={`Up to ${CHARACTER_NAME_MAX} characters`}
            maxFontSizeMultiplier={1.4}
            placeholder="Name your Kairo"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accentDeep}
            style={[
              styles.input,
              { borderBottomColor: inputFocused ? colors.accentDeep : colors.borderStrong },
            ]}
            returnKeyType="done"
            onSubmitEditing={submit}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </Panel>

        {createProfile.error && <Text style={styles.error}>{createProfile.error.message}</Text>}

        <Button
          label={beatCta(beat)}
          onPress={submit}
          variant="primary"
          disabled={!valid}
          busy={createProfile.isPending}
        />

        <Text style={styles.footnote}>Rename it whenever you like.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingBottom: space.md },
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: space.lg, gap: space.sm },
  stage: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderCurve: 'continuous',
  },
  figure: { width: 200, height: 200 },
  copy: { marginTop: space.md, gap: space.sm },
  title: { color: colors.text, ...font.display.major },
  help: { color: colors.subtle, ...font.body.body, lineHeight: 22 },
  input: {
    marginTop: space.sm,
    borderBottomWidth: 2,
    color: colors.text,
    fontSize: 28,
    fontFamily: font.body.body.fontFamily,
    paddingVertical: space.sm,
  },
  error: { color: colors.damage, ...font.body.body, marginTop: space.md },
  footnote: {
    color: colors.muted,
    ...font.body.strong,
    textAlign: 'center',
    marginTop: space.sm,
  },
});
