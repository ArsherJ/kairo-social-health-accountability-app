import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, space } from '@/theme.ts';
import { Button, Label, Panel } from '@/ui/index.ts';
import {
  BODY_METRIC_LIMITS,
  parseBodyMetric,
  type BodyMetricField,
} from './body-metrics.ts';
import type { Profile } from './queries.ts';
import { useUpdateProfile } from './update-profile.ts';

/**
 * §5's body metrics, behind §5's soft prompt.
 *
 * Height and weight sharpen STR — active calories depend on body mass — but
 * the spec is explicit that they are *never* required. So the prompt is one
 * line of explanation, the fields start empty, and clearing one is as valid an
 * answer as filling it. Nothing here gates anything.
 *
 * These columns live on `profiles`, which is owner-readable only: this is the
 * screen where that matters most, and no projection ever carries them to a
 * squadmate.
 */

const FIELDS: ReadonlyArray<{ field: BodyMetricField; placeholder: string }> = [
  { field: 'height_cm', placeholder: '170' },
  { field: 'weight_kg', placeholder: '65' },
  { field: 'birth_year', placeholder: '1995' },
];

function initialText(profile: Profile, field: BodyMetricField) {
  const value = profile[field];
  return value === null ? '' : String(value);
}

/**
 * `profile` is the loaded row, never a pending query — the caller gates on it.
 * That is what lets the drafts be seeded once in `useState` and then owned by
 * the user's typing: re-syncing them on every refetch would yank characters
 * out from under someone mid-edit.
 */
export function BodyMetricsCard({
  userId,
  profile,
}: {
  userId: string | undefined;
  profile: Profile;
}) {
  const update = useUpdateProfile(userId);

  const [drafts, setDrafts] = useState<Record<BodyMetricField, string>>(() => ({
    height_cm: initialText(profile, 'height_cm'),
    weight_kg: initialText(profile, 'weight_kg'),
    birth_year: initialText(profile, 'birth_year'),
  }));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const missingBodyMetrics =
    profile.height_cm === null || profile.weight_kg === null;

  function edit(field: BodyMetricField, text: string) {
    setDrafts((current) => ({ ...current, [field]: text }));
    setError(null);
    setSaved(false);
  }

  function save() {
    // Validate everything before writing anything: a partial save would leave
    // the row half-updated and the screen unable to say which half.
    const edits: Record<string, number | null> = {};
    for (const { field } of FIELDS) {
      const parsed = parseBodyMetric(field, drafts[field]);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      edits[field] = parsed.value;
    }

    setError(null);
    update.mutate(edits, {
      onSuccess: () => setSaved(true),
      onError: (cause) => setError(cause.message),
    });
  }

  return (
    <Panel>
      <Label>Body Metrics</Label>

      {missingBodyMetrics && (
        <Text style={styles.prompt}>
          Add your height and weight for more accurate STR tracking.
        </Text>
      )}

      {FIELDS.map(({ field, placeholder }) => {
        const limit = BODY_METRIC_LIMITS[field];
        return (
          <View key={field} style={styles.field}>
            <Text style={styles.fieldLabel}>
              {limit.label}
              {limit.unit ? ` (${limit.unit})` : ''}
            </Text>
            <TextInput
              value={drafts[field]}
              onChangeText={(text) => edit(field, text)}
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              keyboardType={limit.decimals > 0 ? 'decimal-pad' : 'number-pad'}
              style={styles.input}
              accessibilityLabel={limit.label}
            />
          </View>
        );
      })}

      <Text style={styles.optional}>Optional. Leave a field empty to remove it.</Text>

      {error !== null && <Text style={styles.error}>{error}</Text>}
      {saved && !update.isPending && <Text style={styles.saved}>Saved.</Text>}

      <Button
        label={update.isPending ? 'Saving…' : 'Save'}
        onPress={save}
        disabled={update.isPending}
        busy={update.isPending}
      />
    </Panel>
  );
}

const styles = StyleSheet.create({
  prompt: { color: colors.accent, fontSize: 13, marginTop: space.sm, lineHeight: 18 },
  field: { marginTop: space.md },
  fieldLabel: { color: colors.subtle, fontSize: 13, fontFamily: 'Figtree-SemiBold' },
  input: {
    marginTop: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    fontSize: 16,
  },
  optional: { color: colors.muted, fontSize: 12, marginTop: space.sm },
  error: { color: colors.damage, fontSize: 13, marginTop: space.sm, lineHeight: 18 },
  saved: { color: colors.subtle, fontSize: 13, marginTop: space.sm },
});
