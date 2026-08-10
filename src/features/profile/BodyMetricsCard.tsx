import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
 *
 * **Read by default, edit on request.** The card used to render three live
 * inputs with a Save button under them, and report success as one 13pt grey
 * `Saved.` line that the next keystroke cleared. Hand-testing read that as "it
 * didn't save" — reasonably, because a form that looks identical before and
 * after a write has told you nothing. Leaving edit mode is now the receipt: the
 * card visibly returns to showing the values it just stored.
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

function draftsFrom(profile: Profile): Record<BodyMetricField, string> {
  return {
    height_cm: initialText(profile, 'height_cm'),
    weight_kg: initialText(profile, 'weight_kg'),
    birth_year: initialText(profile, 'birth_year'),
  };
}

/** What the read view shows for one field. Em dash, not blank: unset is an answer. */
function displayValue(profile: Profile, field: BodyMetricField): string {
  const value = profile[field];
  if (value === null) return '—';
  const { unit } = BODY_METRIC_LIMITS[field];
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * `profile` is the loaded row, never a pending query — the caller gates on it.
 */
export function BodyMetricsCard({
  userId,
  profile,
}: {
  userId: string | undefined;
  profile: Profile;
}) {
  const update = useUpdateProfile(userId);

  const [editing, setEditing] = useState(false);
  // Seeded on every entry into edit mode rather than once at mount. That is
  // what replaces the old "never re-sync or you yank characters out from under
  // someone mid-edit" rule: outside edit mode there is no draft to protect, so
  // the drafts can simply be rebuilt from the row each time they are needed.
  const [drafts, setDrafts] = useState<Record<BodyMetricField, string>>(() =>
    draftsFrom(profile),
  );
  const [error, setError] = useState<string | null>(null);

  const missingBodyMetrics =
    profile.height_cm === null || profile.weight_kg === null;

  function open() {
    setDrafts(draftsFrom(profile));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setDrafts(draftsFrom(profile));
    setError(null);
    setEditing(false);
  }

  function edit(field: BodyMetricField, text: string) {
    setDrafts((current) => ({ ...current, [field]: text }));
    setError(null);
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
      // Closing the card *is* the confirmation, and it only closes on a write
      // the server accepted. An error keeps the form open with the values still
      // in it, so a rejected save is never mistaken for a successful one.
      onSuccess: () => setEditing(false),
      onError: (cause) => setError(cause.message),
    });
  }

  return (
    <Panel>
      <View style={styles.header}>
        <Label>Body Metrics</Label>
        {!editing && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit body metrics"
            // The pill is ~32pt tall by design; hitSlop brings the target to 44.
            hitSlop={space.sm}
            onPress={open}
            style={({ pressed }) => [styles.edit, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.editLabel}>Edit</Text>
          </Pressable>
        )}
      </View>

      {missingBodyMetrics && (
        <Text style={styles.prompt}>
          Add your height and weight for more accurate STR tracking.
        </Text>
      )}

      {editing ? (
        <>
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
                    editable={!update.isPending}
                  />
                </View>
              );
            })}
          </View>

          <Text style={styles.optional}>Optional. Leave a field empty to remove it.</Text>

          {error !== null && <Text style={styles.error}>{error}</Text>}

          <Button
            label={update.isPending ? 'Saving…' : 'Save'}
            onPress={save}
            disabled={update.isPending}
            busy={update.isPending}
          />
          <Button
            label="Cancel"
            onPress={cancel}
            variant="ghost"
            disabled={update.isPending}
          />
        </>
      ) : (
        <View style={styles.readout}>
          {FIELDS.map(({ field }) => (
            <View key={field} style={styles.readRow}>
              <Text style={styles.readLabel}>{BODY_METRIC_LIMITS[field].label}</Text>
              <Text style={styles.readValue}>{displayValue(profile, field)}</Text>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  // A pill, not a bare word: on cream a coloured word alone does not read as a
  // control. Same treatment the squad and goal cards use for their one action.
  edit: {
    marginLeft: 'auto',
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[100],
  },
  editLabel: { ...font.display.small, fontSize: 14, color: ramp.accent[700] },
  prompt: {
    ...font.body.body,
    fontSize: 13,
    color: ramp.accent[700],
    marginTop: space.sm,
    lineHeight: 18,
  },
  readout: { marginTop: space.md, gap: space.sm },
  readRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  readLabel: { ...font.body.strong, fontSize: 13, color: ramp.neutral[700] },
  readValue: {
    marginLeft: 'auto',
    ...font.display.small,
    fontSize: 17,
    color: colors.text,
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
});
