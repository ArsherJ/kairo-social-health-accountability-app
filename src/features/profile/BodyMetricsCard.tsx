import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, ramp, radius, space } from '@/theme.ts';
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

/**
 * Height and weight pair up on one row — they are the two that sharpen STR,
 * they are asked in the same breath, and side by side they read as one
 * question. Birth year sits below on its own because it answers a different
 * one. `wide` is what carries that split into the layout.
 */
const FIELDS: ReadonlyArray<{
  field: BodyMetricField;
  placeholder: string;
  wide?: boolean;
}> = [
  { field: 'height_cm', placeholder: '170' },
  { field: 'weight_kg', placeholder: '65' },
  { field: 'birth_year', placeholder: '1995', wide: true },
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

      <View style={styles.fields}>
        {FIELDS.map(({ field, placeholder, wide }) => {
          const limit = BODY_METRIC_LIMITS[field];
          return (
            <View key={field} style={wide ? styles.fieldWide : styles.field}>
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
      </View>

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
  prompt: {
    ...font.body.body,
    fontSize: 13,
    color: ramp.accent[700],
    marginTop: space.sm,
    lineHeight: 18,
  },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  /** Half the row each, so height and weight read as one question. */
  field: { flexGrow: 1, flexBasis: 0, minWidth: 110 },
  fieldWide: { width: '100%' },
  fieldLabel: { ...font.body.strong, fontSize: 12, color: ramp.neutral[700] },
  // A pill on a tinted plate, not a bordered box: on the warm system the fill
  // is the edge, and a 1px outline is what the redesign replaced.
  input: {
    marginTop: space.xs,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[100],
    paddingHorizontal: 15,
    paddingVertical: 11,
    color: colors.text,
    ...font.display.small,
    fontSize: 17,
  },
  optional: { ...font.body.body, fontSize: 11.5, color: ramp.neutral[600], marginTop: space.sm },
  error: { ...font.body.body, fontSize: 13, color: colors.damage, marginTop: space.sm, lineHeight: 18 },
  saved: { ...font.body.body, fontSize: 13, color: colors.subtle, marginTop: space.sm },
});
