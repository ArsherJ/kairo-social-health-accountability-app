import { describe, expect, it } from 'vitest';
import { BODY_METRIC_LIMITS, parseBodyMetric } from './body-metrics.ts';

describe('BODY_METRIC_LIMITS', () => {
  // These mirror the CHECK constraints in 20260727120000_init_core.sql. If
  // they drift, the client accepts a value the database then rejects with a
  // 23514 the user cannot act on.
  it('mirrors the database CHECK constraints', () => {
    expect(BODY_METRIC_LIMITS.height_cm).toMatchObject({ min: 50, max: 260 });
    expect(BODY_METRIC_LIMITS.weight_kg).toMatchObject({ min: 20, max: 400 });
    expect(BODY_METRIC_LIMITS.birth_year).toMatchObject({ min: 1900, max: 2200 });
  });
});

describe('parseBodyMetric', () => {
  it('accepts a plain value inside the range', () => {
    expect(parseBodyMetric('height_cm', '172')).toEqual({ ok: true, value: 172 });
  });

  it('accepts a decimal weight', () => {
    expect(parseBodyMetric('weight_kg', '68.4')).toEqual({ ok: true, value: 68.4 });
  });

  // The column is numeric(5,1): Postgres would silently round a second
  // decimal, leaving the field and the stored row disagreeing.
  it('rounds to the one decimal place the column stores', () => {
    expect(parseBodyMetric('weight_kg', '68.44')).toEqual({ ok: true, value: 68.4 });
    expect(parseBodyMetric('weight_kg', '68.46')).toEqual({ ok: true, value: 68.5 });
  });

  // §5 never requires body metrics, so removing one has to be as easy as
  // adding it.
  it('reads an empty field as clearing the value', () => {
    expect(parseBodyMetric('height_cm', '')).toEqual({ ok: true, value: null });
    expect(parseBodyMetric('height_cm', '   ')).toEqual({ ok: true, value: null });
  });

  it('rejects text that is not a number', () => {
    const result = parseBodyMetric('height_cm', 'tall');
    expect(result.ok).toBe(false);
  });

  it('rejects a value below the range and names the bound', () => {
    const result = parseBodyMetric('weight_kg', '5');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('20');
    expect(result.ok === false && result.message).toContain('400');
  });

  it('rejects a value above the range', () => {
    expect(parseBodyMetric('height_cm', '300').ok).toBe(false);
  });

  it('accepts the exact bounds', () => {
    expect(parseBodyMetric('height_cm', '50')).toEqual({ ok: true, value: 50 });
    expect(parseBodyMetric('height_cm', '260')).toEqual({ ok: true, value: 260 });
  });

  // smallint, not numeric — a fractional year is meaningless and Postgres
  // would round it into a different year.
  it('rejects a fractional birth year', () => {
    expect(parseBodyMetric('birth_year', '1994.5').ok).toBe(false);
    expect(parseBodyMetric('birth_year', '1994')).toEqual({ ok: true, value: 1994 });
  });
});
