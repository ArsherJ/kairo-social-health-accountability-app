/**
 * Client-side validation for §5's body metrics.
 *
 * The bounds are the CHECK constraints from `20260727120000_init_core.sql`,
 * deliberately mirrored rather than invented: a client limit tighter than the
 * database's rejects a legitimate value, and a looser one hands the user a
 * 23514 they can do nothing with.
 *
 *   height_cm  numeric(5,1) check (height_cm between 50 and 260)
 *   weight_kg  numeric(5,1) check (weight_kg between 20 and 400)
 *   birth_year smallint     check (birth_year between 1900 and 2200)
 */

/**
 * What the card says these three are for — and, by omission, what they are not.
 *
 * **The claim it replaces was false** (roadmap deviation #60). The card read
 * "Add your height and weight for more accurate Body tracking", on the
 * reasoning that active calories depend on body mass. They do, and Apple has
 * already applied them: HealthKit computes `activeEnergyBurned` against the
 * body profile held in the *Health app*, and Kairo's `height_cm` / `weight_kg`
 * are a second copy that never reaches it. No scoring path reads either — not
 * `planDay`, not `statPointsFor`, not the interpolation — so editing them
 * changes no score, no rank and no quest, and a prompt implying otherwise sold
 * a benefit the app cannot deliver.
 *
 * `birth_year` is the one with a consumer, and it is display-only:
 * `maxHeartRateForAge()` backs the `220 - age` ceiling Strain is measured
 * against (deviation #24). Strain never touches `daily_scores`, and the note
 * says so in the player's terms — "shows you rather than ranks" — because
 * naming the one field that *is* read, without saying what reads it, invites
 * exactly the belief the rest of this note removes.
 *
 * Here rather than in the component because root Vitest cannot load a `.tsx`,
 * and a claim the app makes about its own scoring is exactly the sort that
 * should fail a test when it stops being true.
 */
export const BODY_METRICS_NOTE =
  'Your own reference — Apple applies your body profile before Kairo ever sees a calorie. Birth year sets the maximum heart rate behind Strain, a figure Kairo shows you rather than ranks.';

export type BodyMetricField = 'height_cm' | 'weight_kg' | 'birth_year';

interface Limit {
  min: number;
  max: number;
  label: string;
  unit: string;
  /** Decimal places the column stores. Zero means the value must be whole. */
  decimals: number;
}

export const BODY_METRIC_LIMITS: Record<BodyMetricField, Limit> = {
  height_cm: { min: 50, max: 260, label: 'Height', unit: 'cm', decimals: 1 },
  weight_kg: { min: 20, max: 400, label: 'Weight', unit: 'kg', decimals: 1 },
  birth_year: { min: 1900, max: 2200, label: 'Birth year', unit: '', decimals: 0 },
};

export type ParsedBodyMetric =
  | { ok: true; value: number | null }
  | { ok: false; message: string };

export function parseBodyMetric(
  field: BodyMetricField,
  raw: string,
): ParsedBodyMetric {
  const limit = BODY_METRIC_LIMITS[field];
  const trimmed = raw.trim();

  // §5 asks for these; it never requires them. Emptying a field is a valid
  // answer and writes null, not a validation error.
  if (trimmed === '') return { ok: true, value: null };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false, message: `${limit.label} must be a number.` };
  }

  if (limit.decimals === 0 && !Number.isInteger(parsed)) {
    return { ok: false, message: `${limit.label} must be a whole number.` };
  }

  // Round before the range check so a value that only exceeds the bound in a
  // digit the column would discard is not rejected for a difference the
  // database will never see.
  const factor = 10 ** limit.decimals;
  const value = Math.round(parsed * factor) / factor;

  if (value < limit.min || value > limit.max) {
    const unit = limit.unit ? ` ${limit.unit}` : '';
    return {
      ok: false,
      message: `${limit.label} must be between ${limit.min}${unit} and ${limit.max}${unit}.`,
    };
  }

  return { ok: true, value };
}
