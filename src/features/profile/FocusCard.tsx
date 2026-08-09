import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { UserFocus } from '@kairo/core';
import { FocusChips } from '@/features/onboarding/FocusChips.tsx';
import {
  FOCUS_RULE_COPY,
  focusLabel,
} from '@/features/onboarding/focus-options.ts';
import { track } from '@/features/telemetry/events.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Label, Panel } from '@/ui/index.ts';
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
    <Panel>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Label tone="muted">Your focus</Label>
          <Text style={styles.value}>{focusLabel(profile.focus)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Close focus picker' : 'Change your focus'}
          // The pill is ~32pt tall by design; hitSlop is what brings the
          // target itself up to 44.
          hitSlop={space.sm}
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
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1 },
  value: { color: colors.text, ...font.display.minor, fontSize: 21, marginTop: space.xs },
  // A pill, not a bare word: it is the only tappable thing on the card, and on
  // cream a coloured word alone does not read as a control.
  edit: {
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[100],
  },
  editLabel: { ...font.display.small, fontSize: 14, color: ramp.accent[700] },
  chips: { marginTop: space.md },
  spinner: { marginTop: space.sm },
  help: { color: colors.muted, fontSize: 12, marginTop: space.sm, lineHeight: 18 },
  error: { color: colors.damage, ...font.body.body, marginTop: space.sm },
});
