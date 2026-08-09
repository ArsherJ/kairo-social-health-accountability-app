import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { UserFocus } from '@kairo/core';
import { FocusChips } from '@/features/onboarding/FocusChips.tsx';
import {
  FOCUS_RULE_COPY,
  focusLabel,
} from '@/features/onboarding/focus-options.ts';
import { track } from '@/features/telemetry/events.ts';
import { colors, font, radius, space } from '@/theme.ts';
import type { Profile } from './queries.ts';
import { useUpdateProfile } from './update-profile.ts';

/**
 * Where a skipped or changed-my-mind focus gets set.
 *
 * Writes the same `profiles.focus` column the onboarding step does, through the
 * same chips, so the question cannot come to mean two different things. Closed
 * by default: it is a preference, not a task, and the body-metrics card next to
 * it already owns the "there is something to fill in" attention.
 */
export function FocusCard({
  userId,
  profile,
}: {
  userId: string | undefined;
  profile: Profile;
}) {
  const updateProfile = useUpdateProfile(userId);
  const [editing, setEditing] = useState(false);

  function choose(focus: UserFocus | null) {
    if (updateProfile.isPending) return;
    track(userId, focus === null ? 'focus_skipped' : 'focus_selected', { focus });
    updateProfile.mutate({ focus }, { onSuccess: () => setEditing(false) });
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.label}>YOUR FOCUS</Text>
          <Text style={styles.value}>{focusLabel(profile.focus)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing((open) => !open)}
          style={({ pressed }) => [styles.edit, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.editLabel}>{editing ? 'Close' : 'Change'}</Text>
        </Pressable>
      </View>

      {editing ? (
        <View style={styles.chips}>
          <FocusChips
            value={profile.focus}
            onChange={choose}
            disabled={updateProfile.isPending}
          />
          {updateProfile.isPending && (
            <ActivityIndicator color={colors.subtle} style={styles.spinner} />
          )}
          {updateProfile.error && (
            <Text style={styles.error}>{updateProfile.error.message}</Text>
          )}
        </View>
      ) : (
        <Text style={styles.help}>{FOCUS_RULE_COPY}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerText: { flex: 1 },
  label: { color: colors.muted, ...font.body.label },
  value: { color: colors.text, ...font.display.minor, fontSize: 21, marginTop: space.xs },
  edit: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  editLabel: { color: colors.accent, fontSize: 14, fontFamily: 'Figtree-Bold' },
  chips: { marginTop: space.md },
  spinner: { marginTop: space.sm },
  help: { color: colors.muted, fontSize: 12, marginTop: space.sm, lineHeight: 18 },
  error: { color: colors.damage, ...font.body.body, marginTop: space.sm },
});
