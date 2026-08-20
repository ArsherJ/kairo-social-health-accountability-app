import { beforeEach, describe, expect, it } from 'vitest';
import { replayScores } from './replay.deno.ts';
import { rescoreDay } from './rescore.deno.ts';

/**
 * `replay-scores` end to end, in plain Node, against a fake PostgREST client.
 *
 * **Why this file is allowed to import `.deno.ts` modules.** The convention is
 * that anything under `_shared` importing a Deno-only specifier is out of
 * vitest's reach — and it is, for *value* imports. Both `replay.deno.ts` and
 * `rescore.deno.ts` import from `npm:` with `import type` only, so the
 * specifier vanishes at transform time and the modules load here unchanged. If
 * anyone adds a value import from `npm:` to either, this file stops loading and
 * says so; that is the tripwire, and it is worth having, because the two
 * properties the replay exists to guarantee live in a query and a call rather
 * than in any pure function:
 *
 *   1. the enumeration is **unfiltered on status**, so `final` days are seen —
 *      `finalizable_days()` filters them out, which is why "replay all history"
 *      through `finalize-days` rewrites one day of nine;
 *   2. a replayed day keeps the `finalized_at` it already had.
 *
 * Neither is reachable from `replay-plan.ts` alone, and a test that settled for
 * what is reachable would be this project's recurring defect again.
 *
 * The fake is a real store, not a call recorder: assertions are made against
 * the rows that end up in it. What it does **not** have is Postgres —
 * `daily_scores_finalized_at_present` is not enforced here. That half is pinned
 * in `supabase/tests/schema.test.ts` against PGlite.
 */

type Row = Record<string, unknown>;

interface Filter {
  op: 'eq' | 'in' | 'gte' | 'lte';
  column: string;
  value: unknown;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const actual = row[f.column];
    switch (f.op) {
      case 'eq':
        return actual === f.value;
      case 'in':
        return (f.value as unknown[]).includes(actual);
      case 'gte':
        return String(actual) >= String(f.value);
      case 'lte':
        return String(actual) <= String(f.value);
    }
  });
}

/**
 * A PostgREST-shaped query builder over an in-memory table store.
 *
 * Only the surface these two modules use: select/eq/in/gte/lte/order/limit/
 * maybeSingle, update and upsert. Projection is real — a select naming a
 * column the seeded row lacks yields `undefined`, the way a drifted select
 * does over the wire.
 */
class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Filter[] = [];
  private columns: string[] | null = null;
  private orderBy: string[] = [];
  private max: number | null = null;
  private single = false;
  private mode: 'select' | 'update' | 'upsert' = 'select';
  private payload: Row[] = [];
  private conflict: string[] = [];

  constructor(
    private readonly store: Record<string, Row[]>,
    private readonly table: string,
    private readonly log: string[],
    private readonly failures: Record<string, string>,
  ) {}

  select(columns: string): this {
    this.mode = 'select';
    this.columns = columns.split(',').map((c) => c.trim());
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    if (value.length === 0) throw new Error('PostgREST cannot render an empty .in()');
    this.filters.push({ op: 'in', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  order(column: string, _opts?: { ascending?: boolean }): this {
    this.orderBy.push(column);
    return this;
  }

  limit(count: number): this {
    this.max = count;
    return this;
  }

  maybeSingle(): this {
    this.single = true;
    return this;
  }

  update(payload: Row): this {
    this.mode = 'update';
    this.payload = [payload];
    return this;
  }

  upsert(payload: Row | Row[], opts: { onConflict: string }): this {
    this.mode = 'upsert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.conflict = opts.onConflict.split(',').map((c) => c.trim());
    return this;
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const rows = this.store[this.table] ?? (this.store[this.table] = []);

    if (this.mode === 'select') {
      let out = rows.filter((r) => matches(r, this.filters));
      for (const column of [...this.orderBy].reverse()) {
        out = [...out].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
      }
      if (this.max !== null) out = out.slice(0, this.max);
      const projected = out.map((r) =>
        Object.fromEntries((this.columns ?? Object.keys(r)).map((c) => [c, r[c]])),
      );
      if (this.single) return { data: projected[0] ?? null, error: null };
      return { data: projected, error: null };
    }

    if (this.mode === 'update') {
      this.log.push(`update ${this.table}`);
      for (const row of rows.filter((r) => matches(r, this.filters))) {
        Object.assign(row, this.payload[0]);
      }
      return { data: null, error: null };
    }

    this.log.push(`upsert ${this.table}`);
    for (const incoming of this.payload) {
      const key = this.failures[`${incoming.user_id}:${incoming.local_date}`];
      if (key) return { data: null, error: { message: key } };
      const existing = rows.find((r) => this.conflict.every((c) => r[c] === incoming[c]));
      if (existing) Object.assign(existing, incoming);
      else rows.push({ ...incoming });
    }
    return { data: null, error: null };
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly writes: string[] = [];
  /** `${user}:${date}` -> message, to make one day's upsert fail. */
  readonly upsertFailures: Record<string, string> = {};

  constructor(readonly store: Record<string, Row[]>) {}

  from(table: string): FakeQuery {
    return new FakeQuery(this.store, table, this.writes, this.upsertFailures);
  }
}

/**
 * The fake stands in for a `SupabaseClient`, whose type cannot be imported
 * here — `npm:` does not resolve outside Deno. The cast lives in the test,
 * which is where a cast belongs; the production modules stay fully typed and
 * are checked by `npm run check:functions`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asClient(fake: FakeClient): any {
  return fake as unknown as any;
}

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-08-20T04:00:00Z');
const STAMP = '2026-08-15T16:05:12.443Z';

function buckets(userId: string, localDate: string): Row[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    user_id: userId,
    local_date: localDate,
    hour,
    steps: hour >= 8 && hour < 18 ? 1_100 : 0,
    distance_m: hour >= 8 && hour < 18 ? 825 : 0,
    active_kcal: hour >= 8 && hour < 18 ? 26 : 0,
    active_minutes: hour >= 8 && hour < 18 ? 6 : 0,
    had_workout: false,
    elevated_heart_rate: false,
  }));
}

/** A stored day in the retired four-stat shape — what live actually holds. */
function fourStatRow(over: Row = {}): Row {
  return {
    user_id: USER,
    local_date: '2026-08-14',
    status: 'final',
    finalized_at: STAMP,
    agi_points: 900,
    str_points: 600,
    mind_points: 0,
    consistency_points: 200,
    total: 2_400,
    normalization_factor: '1.000',
    contributing_stats: 4,
    xp_awarded: 240,
    ...over,
  };
}

let fake: FakeClient;

beforeEach(() => {
  fake = new FakeClient({
    profiles: [
      { id: USER, timezone: 'Asia/Manila' },
      { id: OTHER, timezone: 'America/New_York' },
    ],
    daily_scores: [
      // Eight final days and one provisional, the live shape on 2026-08-20.
      fourStatRow({ local_date: '2026-08-14' }),
      fourStatRow({ local_date: '2026-08-16' }),
      fourStatRow({
        local_date: '2026-08-20',
        status: 'provisional',
        finalized_at: null,
        contributing_stats: 3,
      }),
    ],
    health_buckets: [
      ...buckets(USER, '2026-08-14'),
      ...buckets(USER, '2026-08-16'),
      ...buckets(USER, '2026-08-20'),
    ],
    daily_sleep: [
      { user_id: USER, local_date: '2026-08-14', minutes: 420, was_user_entered: false },
      { user_id: USER, local_date: '2026-08-16', minutes: 430, was_user_entered: false },
      { user_id: USER, local_date: '2026-08-20', minutes: 415, was_user_entered: false },
    ],
    workout_sessions: [],
  });
});

function stored(localDate: string): Row {
  return fake.store.daily_scores!.find((r) => r.local_date === localDate)!;
}

async function replay(over: Partial<Parameters<typeof replayScores>[1]> = {}) {
  const result = await replayScores(asClient(fake), {
    now: NOW,
    dryRun: false,
    userId: null,
    limit: 1_000,
    ...over,
  });
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('the enumeration', () => {
  it('reaches final days, which is the bug this exists to fix', async () => {
    // `finalizable_days()` filters `ds.status = 'provisional'`, so a replay run
    // through finalize-days would touch 1 row of 3 here and leave both
    // contributing_stats = 4 rows standing — the exact rows the contract
    // migration's `validate constraint` aborts on.
    const report = await replay();

    expect(report.scanned).toBe(3);
    expect(report.days.map((d) => d.localDate)).toEqual([
      '2026-08-14',
      '2026-08-16',
      '2026-08-20',
    ]);
    expect(report.days.filter((d) => d.status === 'final')).toHaveLength(2);
  });

  it('clears every contributing_stats = 4 row it found', async () => {
    expect(
      fake.store.daily_scores!.filter((r) => Number(r.contributing_stats) > 3),
    ).toHaveLength(2);

    await replay();

    // Step 7 of the runbook checks exactly this against live.
    expect(
      fake.store.daily_scores!.filter((r) => Number(r.contributing_stats) > 3),
    ).toHaveLength(0);
    expect(
      Math.max(...fake.store.daily_scores!.map((r) => Number(r.contributing_stats))),
    ).toBe(3);
  });

  it('replays one user when asked, and every user otherwise', async () => {
    fake.store.daily_scores!.push(
      fourStatRow({ user_id: OTHER, local_date: '2026-08-14' }),
    );
    fake.store.health_buckets!.push(...buckets(OTHER, '2026-08-14'));

    expect((await replay()).scanned).toBe(4);
    expect((await replay({ userId: OTHER })).scanned).toBe(1);
  });

  it('reports truncation rather than looking complete', async () => {
    const report = await replay({ limit: 2 });
    expect(report.scanned).toBe(2);
    expect(report.truncated).toBe(true);
    expect((await replay({ limit: 3 })).truncated).toBe(false);
  });

  it('returns early on an empty table instead of rendering .in.()', async () => {
    fake.store.daily_scores = [];
    // FakeQuery throws on an empty `.in()`, the way PostgREST 400s on `id=in.()`.
    const report = await replay();
    expect(report).toMatchObject({ scanned: 0, replayed: 0, days: [], truncated: false });
  });
});

describe('the lifecycle survives the replay', () => {
  it('leaves a final day final, with the timestamp it already had', async () => {
    await replay();

    expect(stored('2026-08-14')).toMatchObject({
      status: 'final',
      finalized_at: STAMP,
    });
    expect(stored('2026-08-16')).toMatchObject({
      status: 'final',
      finalized_at: STAMP,
    });
    // Not merely "not null": re-stamping with the replay's own clock is the
    // failure mode, and NOW is what it would be stamped with.
    expect(stored('2026-08-14').finalized_at).not.toBe(NOW.toISOString());
  });

  it('leaves a provisional day provisional, with no timestamp', async () => {
    await replay();

    expect(stored('2026-08-20')).toMatchObject({
      status: 'provisional',
      finalized_at: null,
    });
  });

  it('recomputes the scoring columns on a final day, which is the point', async () => {
    // The §19 freeze is what `replayFrozen` suspends; without it a final day
    // gets `xp_awarded` and `flagged` only, and its four-stat ranking columns
    // stay exactly as they were.
    const before = { ...stored('2026-08-14') };
    await replay();
    const after = stored('2026-08-14');

    expect(after.contributing_stats).not.toBe(before.contributing_stats);
    expect(Number(after.total)).toBeGreaterThan(0);
    expect(after.total).not.toBe(before.total);
    expect(after.normalization_factor).toBeDefined();
  });
});

describe('a dry run', () => {
  it('writes nothing at all', async () => {
    const before = JSON.stringify(fake.store.daily_scores);
    const report = await replay({ dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.replayed).toBe(3);
    expect(fake.writes).toEqual([]);
    expect(JSON.stringify(fake.store.daily_scores)).toBe(before);
  });

  it('reports the same numbers the commit then writes', async () => {
    // The operator's whole basis for saying yes. A dry run that modelled the
    // write separately could differ from it; this one is the same call with a
    // flag.
    const dry = await replay({ dryRun: true });
    await replay();

    for (const day of dry.days) {
      const row = stored(day.localDate);
      expect(Number(row.total)).toBe(day.after.total);
      expect(Number(row.contributing_stats)).toBe(day.after.contributingStats);
      expect(Number(row.xp_awarded)).toBe(day.after.xpAwarded);
      expect(row.finalized_at).toBe(day.finalizedAt);
      expect(row.status).toBe(day.status);
    }
  });
});

describe('failure handling and idempotency', () => {
  it('collects a failed day and keeps going', async () => {
    fake.upsertFailures[`${USER}:2026-08-16`] = 'boom';

    const report = await replay();

    expect(report.failures).toEqual([
      { userId: USER, localDate: '2026-08-16', error: 'boom' },
    ]);
    expect(report.replayed).toBe(2);
    // The other two still landed.
    expect(Number(stored('2026-08-14').contributing_stats)).toBe(3);
    expect(Number(stored('2026-08-20').contributing_stats)).toBe(3);
  });

  it('converges: a second run changes nothing and says so', async () => {
    const first = await replay();
    expect(first.changed).toBe(3);

    const snapshot = JSON.stringify(fake.store.daily_scores);
    const second = await replay();

    expect(second.changed).toBe(0);
    expect(JSON.stringify(fake.store.daily_scores)).toBe(snapshot);
  });
});

describe('rescoreDay without replayFrozen is unchanged', () => {
  it('still writes only xp_awarded and flagged on a final day (§19)', async () => {
    // The freeze rule holds for `finalize-days` and `sync-health` exactly as
    // before. If `replayFrozen` had been folded into the existing branch this
    // would fail, and so would every leaderboard already settled.
    const before = { ...stored('2026-08-14') };

    const result = await rescoreDay(asClient(fake), {
      userId: USER,
      localDate: '2026-08-14',
      timeZone: 'Asia/Manila',
      now: NOW,
    });
    expect('error' in result).toBe(false);

    const after = stored('2026-08-14');
    expect(after.contributing_stats).toBe(before.contributing_stats);
    expect(after.total).toBe(before.total);
    expect(after.agi_points).toBe(before.agi_points);
    expect(after.finalized_at).toBe(STAMP);
  });

  it('still stamps finalized_at when finalize-days asks it to', async () => {
    const result = await rescoreDay(asClient(fake), {
      userId: USER,
      localDate: '2026-08-20',
      timeZone: 'Asia/Manila',
      now: NOW,
      finalize: true,
    });
    expect('error' in result).toBe(false);

    expect(stored('2026-08-20')).toMatchObject({
      status: 'final',
      finalized_at: NOW.toISOString(),
    });
  });
});
