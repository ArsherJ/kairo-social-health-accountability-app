/**
 * Pure decisions for seed-health, the development-only data generator.
 *
 * No imports, no I/O, no clock reads — so it runs under plain Node in the same
 * suite as the other planners. The randomness lives here rather than in
 * `@kairo/core`, which stays deterministic by design.
 *
 * Nothing here fabricates a score. It produces hourly buckets; the real
 * scoring engine turns those into a total, which is what makes a seeded
 * leaderboard worth looking at.
 */

export type Persona = 'sedentary' | 'average' | 'active' | 'athlete';

export const PERSONAS: readonly Persona[] = [
  'sedentary',
  'average',
  'active',
  'athlete',
];

export interface SeedBucket {
  hour: number;
  steps: number;
  distanceM: number;
  activeKcal: number;
  activeMinutes: number;
}

/** Daily step totals the personas aim at. Jitter moves each run around these. */
const PERSONA_STEPS: Record<Persona, number> = {
  sedentary: 2500,
  average: 7000,
  active: 12000,
  athlete: 18000,
};

/**
 * Relative activity by hour, 0..23. Two commute humps and a lunch bump, close
 * to nothing overnight. Not normalised by hand — generateDay divides by the
 * sum, so these stay editable without arithmetic.
 */
const HOUR_WEIGHTS = [
  0.002, 0.001, 0.001, 0.001, 0.002, 0.010, 0.035, 0.090, 0.075, 0.045,
  0.040, 0.045, 0.070, 0.050, 0.040, 0.045, 0.060, 0.095, 0.080, 0.055,
  0.045, 0.035, 0.020, 0.008,
];

const STRIDE_M = 0.72;
const KCAL_PER_STEP = 0.04;
const STEPS_PER_ACTIVE_MINUTE = 110;

/** The column's CHECK. An hour cannot hold more than sixty minutes. */
const MAX_ACTIVE_MINUTES = 60;

/** A seeding run longer than this is a mistake, not an intention. */
export const MAX_SEED_DAYS = 90;

/**
 * mulberry32 — small, fast, and good enough for shaping fake step counts.
 * Deterministic so a seeded scenario can be re-run and compared.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the parts, so a user-day always seeds the same way. */
export function hashSeed(...parts: string[]): number {
  let hash = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export function generateDay(persona: Persona, seed: number): SeedBucket[] {
  const rng = makeRng(seed);
  const target = PERSONA_STEPS[persona];
  const weightSum = HOUR_WEIGHTS.reduce((sum, w) => sum + w, 0);

  return HOUR_WEIGHTS.map((weight, hour) => {
    // ±15%, so two squadmates on the same persona do not have identical days
    // while the daily total stays recognisably that persona.
    const jitter = 0.85 + rng() * 0.3;
    const steps = Math.max(0, Math.round(((target * weight) / weightSum) * jitter));

    return {
      hour,
      steps,
      distanceM: Math.round(steps * STRIDE_M * 100) / 100,
      activeKcal: Math.round(steps * KCAL_PER_STEP * 100) / 100,
      activeMinutes: Math.min(
        MAX_ACTIVE_MINUTES,
        Math.round(steps / STEPS_PER_ACTIVE_MINUTE),
      ),
    };
  });
}

/** Inclusive of both endpoints. Dates are `YYYY-MM-DD`. */
export function expandDateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`invalid date range: ${from}..${to}`);
  }
  if (end < start) {
    throw new Error(`range end ${to} is before start ${from}`);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((end - start) / dayMs) + 1;
  if (days > MAX_SEED_DAYS) {
    throw new Error(`range spans ${days} days, more than the ${MAX_SEED_DAYS} allowed`);
  }

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(new Date(start + i * dayMs).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Which requested ids are not on the allowlist.
 *
 * The caller refuses the whole request if this is non-empty — a partial write
 * that silently skipped the unlisted users would be harder to notice than an
 * outright rejection.
 */
export function findUnlistedUsers(
  requested: string[],
  allowlisted: string[],
): string[] {
  const allowed = new Set(allowlisted);
  return [...new Set(requested)].filter((id) => !allowed.has(id));
}
