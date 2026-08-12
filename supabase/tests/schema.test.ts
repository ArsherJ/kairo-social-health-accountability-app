import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, isFinalizable, mostRecentlyCompletedLocalDate } from '../../packages/kairo-core/src/day.ts';
import {
  DEFAULT_SQUAD_PROGRAM,
  SQUAD_PROGRAMS,
  weightedBoardTotal,
} from '../../packages/kairo-core/src/program.ts';
import { levelForXp, ratingForStatPoints } from '../../packages/kairo-core/src/progression.ts';
import { squadTopic } from '../../src/features/squad/squad-topic.ts';
import { planDay } from '../functions/_shared/sync-plan.ts';
import { setupHarness, type Harness } from './harness.ts';

let h: Harness;

beforeAll(async () => {
  h = await setupHarness();
}, 60_000);

afterAll(async () => {
  await h?.close();
});

/** Asserts a promise rejects with a message matching `pattern`. */
async function rejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toThrow(pattern);
}

describe('XP rollup', () => {
  async function xpState(userId: string) {
    const rows = await h.asService<{ total_xp: number; level: number }>(
      'select total_xp, level from public.profiles where id = $1',
      [userId],
    );
    return rows[0]!;
  }

  async function setDayXp(userId: string, date: string, xp: number) {
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, xp_awarded)
       values ($1, $2, $3)
       on conflict (user_id, local_date) do update set xp_awarded = excluded.xp_awarded`,
      [userId, date, xp],
    );
  }

  it('sums xp_awarded across days into the profile', async () => {
    const user = await h.createUser();
    await setDayXp(user, '2026-07-26', 95);
    await setDayXp(user, '2026-07-27', 60);
    expect((await xpState(user)).total_xp).toBe(155);
  });

  it('recomputes rather than increments, so re-syncing a day is idempotent', async () => {
    const user = await h.createUser();
    // The same day scored three times, as background delivery would.
    for (const xp of [40, 85, 85]) await setDayXp(user, '2026-07-27', xp);
    expect((await xpState(user)).total_xp).toBe(85);
  });

  it('follows a day being revised downward', async () => {
    const user = await h.createUser();
    await setDayXp(user, '2026-07-27', 200);
    await setDayXp(user, '2026-07-27', 25);
    expect((await xpState(user)).total_xp).toBe(25);
  });

  it('follows a deleted day', async () => {
    const user = await h.createUser();
    await setDayXp(user, '2026-07-27', 120);
    await h.asService('delete from public.daily_scores where user_id = $1', [user]);
    expect((await xpState(user)).total_xp).toBe(0);
  });

  it('derives a level that agrees with kairo-core', async () => {
    // Cross-language check: the SQL formula and levelForXp() must not drift.
    const user = await h.createUser();
    for (const xp of [0, 24, 25, 100, 624, 625, 2_500, 9_999, 10_000]) {
      await setDayXp(user, '2026-07-27', xp);
      const state = await xpState(user);
      expect(state.total_xp).toBe(xp);
      expect(state.level).toBe(levelForXp(xp));
    }
  });
});

describe('heart rate and strain inputs', () => {
  // Display only — nothing here reaches `daily_scores`, ranks anybody, or
  // enters a goal. `computeStrain()` is a read-time projection over these rows.

  it('leaves avg_heart_rate null on an ordinary sync', async () => {
    // A phone-only user has no heart-rate source at all, and null must mean
    // "not measured" rather than "resting" — computeStrain skips null hours.
    const user = await h.createUser();
    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps)
       values ($1, '2026-07-27', 7, 500)`,
      [user],
    );
    const rows = await h.asService<{ avg_heart_rate: string | null }>(
      'select avg_heart_rate from public.health_buckets where user_id = $1',
      [user],
    );
    expect(rows[0]!.avg_heart_rate).toBeNull();
  });

  it('rejects an implausible bpm on the bucket', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.health_buckets (user_id, local_date, hour, steps, avg_heart_rate)
         values ($1, '2026-07-27', 7, 500, 300)`,
        [user],
      ),
      /avg_heart_rate/,
    );
  });

  it('stores one resting rate per local day', async () => {
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_heart (user_id, local_date, resting_hr)
       values ($1, '2026-07-27', 58)`,
      [user],
    );
    // Idempotent under a re-sync, like every other health write.
    await h.asService(
      `insert into public.daily_heart (user_id, local_date, resting_hr)
       values ($1, '2026-07-27', 61)
       on conflict (user_id, local_date) do update set resting_hr = excluded.resting_hr`,
      [user],
    );
    const rows = await h.asService<{ resting_hr: number }>(
      'select resting_hr from public.daily_heart where user_id = $1',
      [user],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.resting_hr).toBe(61);
  });

  it('keeps daily_heart owner-readable and client-unwritable', async () => {
    const owner = await h.createUser();
    const stranger = await h.createUser();
    await h.asService(
      `insert into public.daily_heart (user_id, local_date, resting_hr)
       values ($1, '2026-07-27', 58)`,
      [owner],
    );

    const own = await h.asUser<{ resting_hr: number }>(
      owner,
      'select resting_hr from public.daily_heart',
    );
    expect(own).toHaveLength(1);

    // Heart rate is at least as revealing as the hourly movement pattern §5
    // already protects: it says when you slept and when you were stressed.
    const theirs = await h.asUser(stranger, 'select resting_hr from public.daily_heart');
    expect(theirs).toHaveLength(0);

    await rejects(
      h.asUser(
        owner,
        `insert into public.daily_heart (user_id, local_date, resting_hr)
         values ($1, '2026-07-28', 40)`,
        [owner],
      ),
      /permission denied/i,
    );
  });

  it('grants authenticated nothing beyond SELECT on daily_heart', async () => {
    // New public tables inherit ALL from Supabase's default privileges, and ALL
    // includes TRUNCATE — which RLS does not restrict.
    const rows = await h.asService<{ privs: string }>(
      `select string_agg(distinct privilege_type, ',' order by privilege_type) as privs
       from information_schema.table_privileges
       where table_name = 'daily_heart' and grantee = 'authenticated'`,
    );
    expect(rows[0]!.privs).toBe('SELECT');
  });

  it('cascades a deleted account', async () => {
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_heart (user_id, local_date, resting_hr)
       values ($1, '2026-07-27', 58)`,
      [user],
    );
    await h.asService('delete from public.profiles where id = $1', [user]);
    const rows = await h.asService('select 1 from public.daily_heart where user_id = $1', [user]);
    expect(rows).toHaveLength(0);
  });
});

describe('per-stat ability rollups', () => {
  async function ratings(userId: string) {
    const rows = await h.asService<{
      agi_total: number; str_total: number; end_total: number; vit_total: number;
    }>(
      `select agi_total, str_total, end_total, vit_total
       from public.profiles where id = $1`,
      [userId],
    );
    return rows[0]!;
  }

  async function setDayStats(
    userId: string,
    date: string,
    stats: { agi: number; str: number; end: number; vit: number; xp?: number },
  ) {
    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, str_points, end_points, vit_points, xp_awarded)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, local_date) do update set
         agi_points = excluded.agi_points,
         str_points = excluded.str_points,
         end_points = excluded.end_points,
         vit_points = excluded.vit_points,
         xp_awarded = excluded.xp_awarded`,
      [userId, date, stats.agi, stats.str, stats.end, stats.vit, stats.xp ?? 0],
    );
  }

  it('starts at zero, which reads as rating 1', async () => {
    const user = await h.createUser();
    expect(await ratings(user)).toEqual({
      agi_total: 0, str_total: 0, end_total: 0, vit_total: 0,
    });
  });

  it('sums each stat across days independently', async () => {
    const user = await h.createUser();
    await setDayStats(user, '2026-07-26', { agi: 900, str: 200, end: 0, vit: 500 });
    await setDayStats(user, '2026-07-27', { agi: 500, str: 200, end: 900, vit: 0 });
    expect(await ratings(user)).toEqual({
      agi_total: 1_400, str_total: 400, end_total: 900, vit_total: 500,
    });
  });

  it('recomputes rather than increments, so re-syncing a day is idempotent', async () => {
    // The property the whole design rests on. Background delivery rewrites the
    // same day repeatedly; an incrementing rollup would triple this.
    const user = await h.createUser();
    for (let i = 0; i < 3; i++) {
      await setDayStats(user, '2026-07-27', { agi: 900, str: 0, end: 0, vit: 0 });
    }
    expect((await ratings(user)).agi_total).toBe(900);
  });

  it('follows a same-tier rescore that leaves XP untouched', async () => {
    // The reason `daily_scores_xp_rollup`'s early return had to widen. 5,200
    // steps and 8,000 steps are both Silver, so a revision between them moves
    // agi_points and not xp_awarded at all — and the old skip would have
    // swallowed it silently, leaving the ability rating behind the days that
    // earned it.
    const user = await h.createUser();
    await setDayStats(user, '2026-07-27', { agi: 500, str: 0, end: 0, vit: 0, xp: 25 });
    await setDayStats(user, '2026-07-27', { agi: 620, str: 0, end: 0, vit: 0, xp: 25 });
    expect((await ratings(user)).agi_total).toBe(620);
  });

  it('follows a deleted day back down', async () => {
    const user = await h.createUser();
    await setDayStats(user, '2026-07-27', { agi: 900, str: 900, end: 900, vit: 900 });
    await h.asService('delete from public.daily_scores where user_id = $1', [user]);
    expect(await ratings(user)).toEqual({
      agi_total: 0, str_total: 0, end_total: 0, vit_total: 0,
    });
  });

  it('feeds a rating that agrees with kairo-core', async () => {
    // Cross-language check, the same one `level` gets: the rollup is the input
    // and `ratingForStatPoints` is the curve, and nothing in SQL may reimplement
    // the curve.
    const user = await h.createUser();
    for (const points of [0, 99, 100, 27_000, 328_500]) {
      await setDayStats(user, '2026-07-27', { agi: points, str: 0, end: 0, vit: 0 });
      const state = await ratings(user);
      expect(state.agi_total).toBe(points);
      expect(ratingForStatPoints(state.agi_total)).toBe(ratingForStatPoints(points));
    }
  });

  it('is not client-writable — an ability cannot be minted', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'update public.profiles set agi_total = 999999 where id = $1', [user]),
      /permission denied/i,
    );
  });
});

describe('planDay writes a row daily_scores can actually store', () => {
  /**
   * The seam that broke on 2026-08-09, and the only one nothing watched.
   *
   * `remove_sabotage` dropped `daily_scores.sabotage_delta` and the Edge
   * Functions were not redeployed, so the live `sync-health` kept sending that
   * column. Its bucket upsert runs first and committed; the score upsert 500'd.
   * Health data landed and nothing scored for two days, silently.
   *
   * Every test passed throughout, because the two layers are tested apart:
   * `sync-plan.test.ts` builds rows and never meets a database, and the suites
   * above write `daily_scores` by hand and never call `planDay`. Neither can
   * see the columns drift apart. This joins them — the row shape is taken from
   * `planDay`'s real output rather than restated, so a column added, renamed or
   * dropped on either side fails here at commit time.
   *
   * It does not replace `supabase/scripts/smoke-sync.mjs`: this proves the
   * source agrees with the schema, and that proves the *deployed* function does.
   */
  const BUCKETS = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    steps: hour >= 8 && hour < 18 ? 1_100 : 0,
    distanceM: hour >= 8 && hour < 18 ? 825 : 0,
    activeKcal: hour >= 8 && hour < 18 ? 26 : 0,
    activeMinutes: hour >= 8 && hour < 18 ? 6 : 0,
  }));

  function rowFor(userId: string) {
    return planDay({
      userId,
      localDate: '2026-07-27',
      timeZone: 'Asia/Manila',
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: BUCKETS,
      hadWorkoutHours: new Set(),
      elevatedHeartRateHours: new Set(),
      sleepMinutes: 420,
      existingStatus: null,
    }).row;
  }

  /** Insert whatever columns the planner emits, without naming them here. */
  async function insertPlannedRow(row: Record<string, unknown>) {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const values = columns.map((c) => {
      const value = row[c];
      // jsonb goes over the wire as text; everything else is already scalar.
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    });

    await h.asService(
      `insert into public.daily_scores (${columns.join(', ')})
       values (${placeholders.join(', ')})`,
      values,
    );
  }

  it('every column planDay emits exists and accepts its value', async () => {
    const user = await h.createUser();
    const row = rowFor(user);

    // Fails with `column "…" of relation "daily_scores" does not exist` the
    // moment a migration drops something the planner still sends.
    await insertPlannedRow(row as unknown as Record<string, unknown>);

    const stored = await h.asService<{ total: number; xp_awarded: number }>(
      'select total, xp_awarded from public.daily_scores where user_id = $1',
      [user],
    );
    expect(stored[0]!.total).toBe(row.total);
    expect(stored[0]!.xp_awarded).toBe(row.xp_awarded);
  });

  it('a day with real movement scores above zero and moves the rollups', async () => {
    // The invariant the outage violated end to end: non-zero buckets must not
    // be able to coexist with a zero score and untouched ability totals.
    const user = await h.createUser();
    const row = rowFor(user);
    expect(row.total).toBeGreaterThan(0);

    await insertPlannedRow(row as unknown as Record<string, unknown>);

    const profile = await h.asService<{ agi_total: number; total_xp: number }>(
      'select agi_total, total_xp from public.profiles where id = $1',
      [user],
    );
    expect(profile[0]!.agi_total).toBeGreaterThan(0);
    expect(profile[0]!.total_xp).toBeGreaterThan(0);
  });
});

describe('anti-cheat bucket columns', () => {
  it('default to false so an ordinary sync needs no extra fields', async () => {
    const user = await h.createUser();
    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps)
       values ($1, '2026-07-27', 7, 500)`,
      [user],
    );
    const rows = await h.asService<{
      had_workout: boolean;
      elevated_heart_rate: boolean;
    }>(
      `select had_workout, elevated_heart_rate from public.health_buckets
       where user_id = $1`,
      [user],
    );
    expect(rows[0]).toEqual({ had_workout: false, elevated_heart_rate: false });
  });

  it('persist corroborating signals for later re-evaluation', async () => {
    const user = await h.createUser();
    await h.asService(
      `insert into public.health_buckets
         (user_id, local_date, hour, steps, had_workout, elevated_heart_rate)
       values ($1, '2026-07-27', 18, 9500, true, true)`,
      [user],
    );
    const rows = await h.asService<{ had_workout: boolean }>(
      'select had_workout from public.health_buckets where user_id = $1',
      [user],
    );
    expect(rows[0]!.had_workout).toBe(true);
  });
});

describe('account deletion', () => {
  async function seedSquadWithHistory() {
    const leader = await h.createUser({ characterName: 'Leader' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Deletable')`,
    );
    const member = await h.createUser({ characterName: 'Member' });
    await h.asUser(member, 'select public.join_squad($1)', [squad[0]!.invite_code]);

    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps)
       values ($1, '2026-07-27', 9, 4000)`,
      [leader],
    );
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, agi_points, total)
       values ($1, '2026-07-27', 500, 500)`,
      [leader],
    );
    return { leader, member, squadId: squad[0]!.id };
  }

  it('lets a squad leader delete their account', async () => {
    // Right to erasure. Previously impossible: leader_id was ON DELETE RESTRICT.
    const { leader } = await seedSquadWithHistory();
    await h.asService('delete from public.profiles where id = $1', [leader]);
    const rows = await h.asService(
      'select id from public.profiles where id = $1',
      [leader],
    );
    expect(rows).toEqual([]);
  });

  it('transfers leadership to the longest-tenured remaining member', async () => {
    const { leader, member, squadId } = await seedSquadWithHistory();
    await h.asService('delete from public.profiles where id = $1', [leader]);
    const rows = await h.asService<{ leader_id: string }>(
      'select leader_id from public.squads where id = $1',
      [squadId],
    );
    expect(rows[0]!.leader_id).toBe(member);
  });

  it('deletes the squad when the last member leaves', async () => {
    const solo = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      solo,
      `select id from public.create_squad('Solo')`,
    );
    await h.asService('delete from public.profiles where id = $1', [solo]);
    const rows = await h.asService('select id from public.squads where id = $1', [
      squad[0]!.id,
    ]);
    expect(rows).toEqual([]);
  });

  it('erases the deleted user’s health and score rows', async () => {
    // The erasure guarantee docs/legal/privacy-policy.md makes. Every table
    // holding subject data cascades from profiles.
    const { leader } = await seedSquadWithHistory();
    await h.asService('delete from public.profiles where id = $1', [leader]);
    const rows = await h.asService<{ buckets: number; scores: number }>(
      `select
         (select count(*)::int from public.health_buckets where user_id = $1) as buckets,
         (select count(*)::int from public.daily_scores  where user_id = $1) as scores`,
      [leader],
    );
    expect(rows[0]).toEqual({ buckets: 0, scores: 0 });
  });

  it('survives a bulk purge that deletes a whole squad at once', async () => {
    // What an admin "delete these accounts" operation actually looks like. The
    // profiles go in ONE statement, so succession can be asked to promote a
    // member whose own profile is already gone.
    const { leader, member, squadId } = await seedSquadWithHistory();
    const third = await h.createUser();
    await h.asService(
      'insert into public.squad_members (squad_id, user_id) values ($1, $2)',
      [squadId, third],
    );

    await h.asService('delete from public.profiles where id = any($1)', [
      [leader, member, third],
    ]);

    const rows = await h.asService<{ profiles: number; squads: number }>(
      `select
         (select count(*)::int from public.profiles where id = any($1)) as profiles,
         (select count(*)::int from public.squads where id = $2) as squads`,
      [[leader, member, third], squadId],
    );
    expect(rows[0]).toEqual({ profiles: 0, squads: 0 });
  });

  it('leaves no squad pointing at a deleted leader', async () => {
    const { leader, member } = await seedSquadWithHistory();
    await h.asService('delete from public.profiles where id = any($1)', [
      [leader, member],
    ]);
    const orphans = await h.asService(
      `select s.id from public.squads s
       left join public.profiles p on p.id = s.leader_id
       where p.id is null`,
    );
    expect(orphans).toEqual([]);
  });

  // Two tests stood here, asserting that the append-only guarantee on
  // sabotage_events survived the erasure escape hatch. That table is gone
  // (20260809120000_remove_sabotage.sql), and `reject_mutation()` is now attached
  // to no trigger at all — so there is nothing left to assert. The function and
  // the `kairo.allow_purge` flag are deliberately left in place; see that
  // migration's closing comment for why.
});

describe('finalizable_days', () => {
  /**
   * Timezones spanning UTC-11 to UTC+14. For any given instant these put the
   * same calendar date at wildly different finalization moments, which is
   * exactly the OFW situation the per-user-day design exists to handle.
   */
  const ZONES = [
    'Pacific/Kiritimati', // UTC+14
    'Asia/Manila', // UTC+8
    'Asia/Dubai', // UTC+4
    'Europe/London',
    'America/New_York',
    'Pacific/Midway', // UTC-11
  ];

  it('agrees with isFinalizable() in kairo-core across the whole timezone range', async () => {
    // A differential test: the SQL grace window and the TypeScript one must
    // never drift, or days would finalize at a different moment than the app
    // told the user they would.
    // Read the clock as epoch millis: now()::text carries a "+00" offset, so
    // string-patching it into an ISO instant produces an invalid date.
    const nowRows = await h.asService<{ ms: string }>(
      'select (extract(epoch from now()) * 1000)::bigint::text as ms',
    );
    const dbNow = new Date(Number(nowRows[0]!.ms));

    const today = dbNow.toISOString().slice(0, 10);
    // Span the boundary: -1 and 0 are the interesting ones, since whether they
    // have cleared the grace window depends entirely on the zone.
    const dates = [-3, -2, -1, 0].map((offset) => addDays(today, offset));

    const myUsers = new Set<string>();
    const expected = new Set<string>();

    for (const zone of ZONES) {
      const user = await h.createUser({ timezone: zone });
      myUsers.add(user);
      for (const date of dates) {
        await h.asService(
          `insert into public.daily_scores (user_id, local_date, total)
           values ($1, $2, 100)`,
          [user, date],
        );
        if (isFinalizable(date, zone, dbNow)) expected.add(`${user}:${date}`);
      }
    }

    const rows = await h.asService<{ user_id: string; local_date: string }>(
      'select user_id, local_date::text as local_date from public.finalizable_days(10000)',
    );

    // Other suites seed rows too, so narrow to the users created here — then
    // compare exactly, so a spurious extra row fails just as loudly as a
    // missing one.
    const actual = new Set(
      rows
        .filter((r) => myUsers.has(r.user_id))
        .map((r) => `${r.user_id}:${r.local_date}`),
    );

    expect(actual).toEqual(expected);
    // Guard against the whole assertion passing because both sets are empty.
    expect(expected.size).toBeGreaterThan(0);
    expect(expected.size).toBeLessThan(myUsers.size * dates.length);
  });

  it('excludes days that already finalized', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    const longAgo = addDays(new Date().toISOString().slice(0, 10), -10);
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total, status, finalized_at)
       values ($1, $2, 100, 'final', now())`,
      [user, longAgo],
    );
    const rows = await h.asService<{ user_id: string }>(
      'select user_id from public.finalizable_days(1000) where user_id = $1',
      [user],
    );
    expect(rows).toEqual([]);
  });

  it('returns oldest days first so a backlog drains in order', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    const today = new Date().toISOString().slice(0, 10);
    for (const offset of [-2, -5, -3]) {
      await h.asService(
        `insert into public.daily_scores (user_id, local_date, total) values ($1, $2, 50)`,
        [user, addDays(today, offset)],
      );
    }
    const rows = await h.asService<{ local_date: string }>(
      `select local_date::text as local_date from public.finalizable_days(1000)
       where user_id = $1`,
      [user],
    );
    const dates = rows.map((r) => r.local_date);
    expect(dates).toEqual([...dates].sort());
  });

  it('honours the limit', async () => {
    const rows = await h.asService('select * from public.finalizable_days(2)');
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it('is not callable by a client', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'select * from public.finalizable_days(10)'),
      /permission denied/i,
    );
  });
});

describe('migrations', () => {
  it('apply cleanly in order', async () => {
    const rows = await h.asService<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public'`,
    );
    expect(rows[0]!.count).toBe(15);
  });

  it('enable row level security on every public table', async () => {
    const rows = await h.asService<{ tablename: string }>(
      `select tablename from pg_tables
       where schemaname = 'public' and rowsecurity = false`,
    );
    expect(rows).toEqual([]);
  });
});

describe('profiles constraints', () => {
  it('rejects an unknown timezone', async () => {
    const users = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['badtz@example.test'],
    );
    await rejects(
      h.asService(
        `insert into public.profiles (id, character_name, timezone)
         values ($1, 'Ghost', 'Mars/Olympus_Mons')`,
        [users[0]!.id],
      ),
      /unknown IANA timezone/,
    );
  });

  it('accepts the timezones an OFW squad actually spans', async () => {
    for (const tz of ['Asia/Manila', 'Asia/Dubai', 'America/New_York', 'Europe/London']) {
      const id = await h.createUser({ timezone: tz });
      expect(id).toBeTruthy();
    }
  });

  it('rejects a character name that is too short', async () => {
    const users = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['shortname@example.test'],
    );
    await rejects(
      h.asService(
        `insert into public.profiles (id, character_name) values ($1, 'X')`,
        [users[0]!.id],
      ),
      /character_name/,
    );
  });
});

describe('squad limits', () => {
  it('creates a squad with a well-formed invite code', async () => {
    const leader = await h.createUser();
    const rows = await h.asUser<{ invite_code: string; max_members: number }>(
      leader,
      `select invite_code, max_members from public.create_squad('Squad')`,
    );
    expect(rows[0]!.invite_code).toMatch(/^[A-Z0-9]{6}$/);
    // Unambiguous alphabet: no I, L, O, 0 or 1.
    expect(rows[0]!.invite_code).not.toMatch(/[ILO01]/);
    expect(rows[0]!.max_members).toBe(6);
  });

  it('gives Legendary squads 15 seats', async () => {
    const leader = await h.createUser({ isLegendary: true });
    const rows = await h.asUser<{ max_members: number }>(
      leader,
      `select max_members from public.create_squad('Legendary Crew')`,
    );
    expect(rows[0]!.max_members).toBe(15);
  });

  it('caps a free squad at six members', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Full House')`,
    );
    const code = squad[0]!.invite_code;

    // Leader plus five joiners fills it.
    for (let i = 0; i < 5; i++) {
      const member = await h.createUser();
      await h.asUser(member, 'select public.join_squad($1)', [code]);
    }

    const seventh = await h.createUser();
    await rejects(
      h.asUser(seventh, 'select public.join_squad($1)', [code]),
      /squad is full \(6 of 6\)/,
    );
  });

  it('limits a free user to one squad', async () => {
    const leaderA = await h.createUser();
    const leaderB = await h.createUser();
    const a = await h.asUser<{ invite_code: string }>(
      leaderA,
      `select invite_code from public.create_squad('Squad A')`,
    );
    const b = await h.asUser<{ invite_code: string }>(
      leaderB,
      `select invite_code from public.create_squad('Squad B')`,
    );

    const joiner = await h.createUser();
    await h.asUser(joiner, 'select public.join_squad($1)', [a[0]!.invite_code]);
    await rejects(
      h.asUser(joiner, 'select public.join_squad($1)', [b[0]!.invite_code]),
      /already belongs to 1 squad\(s\), limit is 1/,
    );
  });

  it('lets a Legendary user hold three squads but not four', async () => {
    const joiner = await h.createUser({ isLegendary: true });
    const codes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const leader = await h.createUser();
      const rows = await h.asUser<{ invite_code: string }>(
        leader,
        `select invite_code from public.create_squad($1)`,
        [`Squad ${i}`],
      );
      codes.push(rows[0]!.invite_code);
    }

    for (let i = 0; i < 3; i++) {
      await h.asUser(joiner, 'select public.join_squad($1)', [codes[i]!]);
    }
    await rejects(
      h.asUser(joiner, 'select public.join_squad($1)', [codes[3]!]),
      /limit is 3/,
    );
  });

  it('treats joining twice as a no-op rather than an error', async () => {
    const leader = await h.createUser();
    const rows = await h.asUser<{ invite_code: string }>(
      leader,
      `select invite_code from public.create_squad('Idempotent')`,
    );
    const code = rows[0]!.invite_code;
    const joiner = await h.createUser();

    await h.asUser(joiner, 'select public.join_squad($1)', [code]);
    await h.asUser(joiner, 'select public.join_squad($1)', [code]);

    const count = await h.asService<{ count: number }>(
      `select count(*)::int as count from public.squad_members where user_id = $1`,
      [joiner],
    );
    expect(count[0]!.count).toBe(1);
  });

  it('rejects an unknown invite code', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'select public.join_squad($1)', ['ZZZZZZ']),
      /invalid invite code/,
    );
  });
});

describe('health data is private', () => {
  it('lets a user read only their own buckets', async () => {
    const alice = await h.createUser();
    const bob = await h.createUser();

    for (const uid of [alice, bob]) {
      await h.asService(
        `insert into public.health_buckets (user_id, local_date, hour, steps)
         values ($1, '2026-07-27', 9, 1200)`,
        [uid],
      );
    }

    const seen = await h.asUser<{ user_id: string }>(
      alice,
      'select user_id from public.health_buckets',
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]!.user_id).toBe(alice);
  });

  it('hides a squadmate’s raw buckets even inside the same squad', async () => {
    const leader = await h.createUser();
    const rows = await h.asUser<{ invite_code: string }>(
      leader,
      `select invite_code from public.create_squad('Nosy')`,
    );
    const member = await h.createUser();
    await h.asUser(member, 'select public.join_squad($1)', [rows[0]!.invite_code]);

    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps)
       values ($1, '2026-07-27', 9, 9999)`,
      [leader],
    );

    const seen = await h.asUser(
      member,
      'select * from public.health_buckets where user_id = $1',
      [leader],
    );
    expect(seen).toEqual([]);
  });

  it('blocks clients from writing health buckets at all', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(
        user,
        `insert into public.health_buckets (user_id, local_date, hour, steps)
         values ($1, '2026-07-27', 9, 50000)`,
        [user],
      ),
      /permission denied/i,
    );
  });

  it('blocks clients from writing their own score', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(
        user,
        `insert into public.daily_scores (user_id, local_date, total)
         values ($1, '2026-07-27', 4400)`,
        [user],
      ),
      /permission denied/i,
    );
  });

  it('blocks clients from awarding themselves XP or Legendary status', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'update public.profiles set total_xp = 999999 where id = $1', [
        user,
      ]),
      /permission denied/i,
    );
    await rejects(
      h.asUser(user, 'update public.profiles set is_legendary = true where id = $1', [
        user,
      ]),
      /permission denied/i,
    );
  });

  it('blocks clients from inserting a profile with server-awarded columns', async () => {
    // A bare auth user with no profile yet — h.createUser() would create one.
    const seeded = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['insert-grant-probe@example.test'],
    );
    const id = seeded[0]!.id;

    await rejects(
      h.asUser(
        id,
        `insert into public.profiles (id, character_name, total_xp)
         values ($1, 'Cheater', 999999)`,
        [id],
      ),
      /permission denied/i,
    );

    await rejects(
      h.asUser(
        id,
        `insert into public.profiles (id, character_name, is_legendary)
         values ($1, 'Cheater', true)`,
        [id],
      ),
      /permission denied/i,
    );

    await rejects(
      h.asUser(
        id,
        `insert into public.profiles (id, character_name, level)
         values ($1, 'Cheater', 99)`,
        [id],
      ),
      /permission denied/i,
    );
  });

  it('lets a client create its own profile with the permitted columns', async () => {
    const seeded = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['onboarding-probe@example.test'],
    );
    const id = seeded[0]!.id;

    await h.asUser(
      id,
      `insert into public.profiles (id, character_name, timezone)
       values ($1, 'Aeon', 'Asia/Dubai')`,
      [id],
    );

    const created = await h.asService<{
      character_name: string;
      timezone: string;
      level: number;
      total_xp: number;
      is_legendary: boolean;
    }>(
      `select character_name, timezone, level, total_xp, is_legendary
       from public.profiles where id = $1`,
      [id],
    );

    expect(created[0]).toMatchObject({
      character_name: 'Aeon',
      timezone: 'Asia/Dubai',
      level: 1,
      total_xp: 0,
      is_legendary: false,
    });
  });

  it('still lets a user edit their own character name', async () => {
    const user = await h.createUser();
    await h.asUser(user, `update public.profiles set character_name = 'Renamed' where id = $1`, [
      user,
    ]);
    const rows = await h.asService<{ character_name: string }>(
      'select character_name from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.character_name).toBe('Renamed');
  });

  it('never exposes another user’s profile row', async () => {
    const alice = await h.createUser();
    const bob = await h.createUser();
    const seen = await h.asUser(alice, 'select * from public.profiles where id = $1', [
      bob,
    ]);
    expect(seen).toEqual([]);
  });
});

describe('daily_scores integrity', () => {
  it('requires finalized_at exactly when status is final', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.daily_scores (user_id, local_date, status)
         values ($1, '2026-07-27', 'final')`,
        [user],
      ),
      /daily_scores_finalized_at_present/,
    );
  });

  it('refuses a negative total', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.daily_scores (user_id, local_date, total)
         values ($1, '2026-07-27', -100)`,
        [user],
      ),
      /total/,
    );
  });

  it('upserts idempotently on (user, date)', async () => {
    const user = await h.createUser();
    for (const total of [1000, 2400, 2400]) {
      await h.asService(
        `insert into public.daily_scores (user_id, local_date, total)
         values ($1, '2026-07-27', $2)
         on conflict (user_id, local_date) do update set total = excluded.total`,
        [user, total],
      );
    }
    const rows = await h.asService<{ count: number; total: number }>(
      `select count(*)::int as count, max(total)::int as total
       from public.daily_scores where user_id = $1`,
      [user],
    );
    expect(rows[0]!.count).toBe(1);
    expect(rows[0]!.total).toBe(2400);
  });
});

describe('health_buckets idempotency', () => {
  it('overwrites rather than duplicating on re-sync', async () => {
    const user = await h.createUser();
    // Apple revises step counts retroactively; the second sync must win.
    for (const steps of [800, 1150]) {
      await h.asService(
        `insert into public.health_buckets (user_id, local_date, hour, steps)
         values ($1, '2026-07-27', 14, $2)
         on conflict (user_id, local_date, hour) do update set steps = excluded.steps`,
        [user, steps],
      );
    }
    const rows = await h.asService<{ count: number; steps: number }>(
      `select count(*)::int as count, max(steps)::int as steps
       from public.health_buckets where user_id = $1 and local_date = '2026-07-27'`,
      [user],
    );
    expect(rows[0]!.count).toBe(1);
    expect(rows[0]!.steps).toBe(1150);
  });

  it('rejects an out-of-range hour', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.health_buckets (user_id, local_date, hour) values ($1, '2026-07-27', 24)`,
        [user],
      ),
      /hour/,
    );
  });

  it('rejects more than 60 active minutes inside one hour', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.health_buckets (user_id, local_date, hour, active_minutes)
         values ($1, '2026-07-27', 10, 75)`,
        [user],
      ),
      /active_minutes/,
    );
  });
});

describe('squad_leaderboard', () => {
  async function seedSquad() {
    const leader = await h.createUser({ characterName: 'Alpha' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Leaderboard')`,
    );
    const member = await h.createUser({ characterName: 'Beta' });
    await h.asUser(member, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    return { leader, member, squadId: squad[0]!.id };
  }

  it('ranks members by total, highest first', async () => {
    const { leader, member, squadId } = await seedSquad();
    // The board recomputes its total from the per-stat columns rather than
    // reading daily_scores.total (deviation #11), so the fixture has to carry
    // points, not just a bottom line. This squad is all_around, so the two
    // numbers coincide.
    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, consistency_points, total, tiers)
       values ($1, '2026-07-27', 900, 400, 1300, '{"AGI":"silver"}'),
              ($2, '2026-07-27', 900, 2000, 2900, '{"AGI":"bronze"}')`,
      [leader, member],
    );

    const rows = await h.asUser<{ rank: string; character_name: string; total: number }>(
      leader,
      'select rank, character_name, total from public.squad_leaderboard($1, $2)',
      [squadId, '2026-07-27'],
    );

    expect(rows.map((r) => r.character_name)).toEqual(['Beta', 'Alpha']);
    expect(Number(rows[0]!.rank)).toBe(1);
    expect(rows[0]!.total).toBe(2900);
  });

  it('exposes tiers and totals but no raw health columns', async () => {
    const { leader, squadId } = await seedSquad();
    const rows = await h.asUser<Record<string, unknown>>(
      leader,
      'select * from public.squad_leaderboard($1)',
      [squadId],
    );
    const columns = Object.keys(rows[0]!);
    for (const forbidden of ['steps', 'distance_m', 'active_kcal', 'active_minutes', 'hour']) {
      expect(columns).not.toContain(forbidden);
    }
    expect(columns).toContain('tiers');
    expect(columns).toContain('total');
  });

  it('marks which row is the caller', async () => {
    const { leader, squadId } = await seedSquad();
    const rows = await h.asUser<{ character_name: string; is_self: boolean }>(
      leader,
      'select character_name, is_self from public.squad_leaderboard($1)',
      [squadId],
    );
    expect(rows.filter((r) => r.is_self).map((r) => r.character_name)).toEqual(['Alpha']);
  });

  it('shows zero for a member with no score yet, rather than omitting them', async () => {
    const { leader, squadId } = await seedSquad();
    const rows = await h.asUser<{ total: number }>(
      leader,
      'select total from public.squad_leaderboard($1)',
      [squadId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });

  it('refuses a caller who is not in the squad', async () => {
    const { squadId } = await seedSquad();
    const outsider = await h.createUser();
    await rejects(
      h.asUser(outsider, 'select * from public.squad_leaderboard($1)', [squadId]),
      /not a member of this squad/,
    );
  });

  it('scores each member against their own local date', async () => {
    // Manila is a day ahead of New York for part of every day. At 2026-07-27
    // 16:30Z it is the 28th in Manila and still the 27th in New York.
    const leader = await h.createUser({ characterName: 'Cebu', timezone: 'Asia/Manila' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('OFW')`,
    );
    const ofw = await h.createUser({
      characterName: 'Dubai',
      timezone: 'America/New_York',
    });
    await h.asUser(ofw, 'select public.join_squad($1)', [squad[0]!.invite_code]);

    const dates = await h.asUser<{ character_name: string; local_date: string }>(
      leader,
      'select character_name, local_date from public.squad_leaderboard($1)',
      [squad[0]!.id],
    );

    const byName = Object.fromEntries(dates.map((d) => [d.character_name, d.local_date]));
    // Same instant, and the two members can legitimately be on different dates.
    expect(byName['Cebu']).toBeTruthy();
    expect(byName['Dubai']).toBeTruthy();
  });
});

describe('realtime broadcast', () => {
  it('emits one message per squad when a score changes', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Broadcast')`,
    );
    const squadId = squad[0]!.id;

    await h.asService('delete from realtime.messages');
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total)
       values ($1, '2026-07-27', 1300)`,
      [leader],
    );

    const messages = await h.asService<{ topic: string; payload: { record: { total: number } } }>(
      'select topic, payload from realtime.messages',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]!.topic).toBe(squadTopic(squadId));
    expect(messages[0]!.payload.record.total).toBe(1300);
  });

  it('emits nothing for a user with no squad', async () => {
    const solo = await h.createUser();
    await h.asService('delete from realtime.messages');
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total)
       values ($1, '2026-07-27', 500)`,
      [solo],
    );
    const messages = await h.asService('select topic from realtime.messages');
    expect(messages).toEqual([]);
  });

  it('authorizes squad members to read their squad topic', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Auth')`,
    );
    const squadId = squad[0]!.id;

    await h.asService('delete from realtime.messages');
    await h.asService(
      `insert into realtime.messages (topic, extension, event, payload)
       values ($1, 'broadcast', 'UPDATE', '{}')`,
      [`squad:${squadId}`],
    );

    await h.db.exec('begin');
    await h.db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', leader]);
    await h.db.query('select set_config($1, $2, true)', ['realtime.topic', `squad:${squadId}`]);
    await h.db.exec('set local role authenticated');
    const visible = await h.db.query('select id from realtime.messages');
    await h.db.exec('commit');

    expect(visible.rows).toHaveLength(1);
  });

  it('hides a squad topic from a non-member', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Private')`,
    );
    const squadId = squad[0]!.id;
    const outsider = await h.createUser();

    await h.asService('delete from realtime.messages');
    await h.asService(
      `insert into realtime.messages (topic, extension, event, payload)
       values ($1, 'broadcast', 'UPDATE', '{}')`,
      [`squad:${squadId}`],
    );

    await h.db.exec('begin');
    await h.db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', outsider]);
    await h.db.query('select set_config($1, $2, true)', ['realtime.topic', `squad:${squadId}`]);
    await h.db.exec('set local role authenticated');
    const visible = await h.db.query('select id from realtime.messages');
    await h.db.exec('commit');

    expect(visible.rows).toEqual([]);
  });
});

describe('squad_leaderboard completed-day mode', () => {
  /** Creates a squad owned by `ownerId` and returns its id and invite code. */
  async function createSquad(ownerId: string, name: string) {
    // asUser's signature is (userId, sql, params) — the user id comes first.
    const created = await h.asUser<{ id: string }>(
      ownerId,
      `select (public.create_squad($1)).id as id`,
      [name],
    );
    const squadId = created[0]!.id;
    const codes = await h.asService<{ invite_code: string }>(
      'select invite_code from public.squads where id = $1',
      [squadId],
    );
    return { squadId, inviteCode: codes[0]!.invite_code };
  }

  it('ranks each member on their OWN yesterday', async () => {
    const manila = await h.createUser({ characterName: 'Aeon', timezone: 'Asia/Manila' });
    const newYork = await h.createUser({ characterName: 'Bex', timezone: 'America/New_York' });

    const { squadId, inviteCode } = await createSquad(manila, 'Zone Test');
    await h.asUser(newYork, `select public.join_squad($1)`, [inviteCode]);

    const rows = await h.asUser<{ user_id: string; local_date: string }>(
      manila,
      `select user_id, local_date::text as local_date
       from public.squad_leaderboard($1, null, 'completed')`,
      [squadId],
    );

    const expected = await h.asService<{ mnl: string; nyc: string }>(
      `select ((now() at time zone 'Asia/Manila')::date - 1)::text as mnl,
              ((now() at time zone 'America/New_York')::date - 1)::text as nyc`,
    );

    const byUser = new Map(rows.map((r) => [r.user_id, r.local_date]));
    expect(byUser.get(manila)).toBe(expected[0]!.mnl);
    expect(byUser.get(newYork)).toBe(expected[0]!.nyc);
  });

  it('rejects an unknown mode rather than silently defaulting', async () => {
    const user = await h.createUser();
    const { squadId } = await createSquad(user, 'Mode Test');

    await rejects(
      h.asUser(
        user,
        `select * from public.squad_leaderboard($1, null, 'yesterdayish')`,
        [squadId],
      ),
      /unknown leaderboard mode/i,
    );
  });

  it('still defaults to each member’s current day', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    const { squadId } = await createSquad(user, 'Current Test');

    const rows = await h.asUser<{ local_date: string }>(
      user,
      `select local_date::text as local_date
       from public.squad_leaderboard($1)`,
      [squadId],
    );
    const today = await h.asService<{ d: string }>(
      `select (now() at time zone 'Asia/Manila')::date::text as d`,
    );

    expect(rows[0]!.local_date).toBe(today[0]!.d);
  });

  it('lets an explicit pinned date override the mode', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    const { squadId } = await createSquad(user, 'Pin Test');

    const rows = await h.asUser<{ local_date: string }>(
      user,
      `select local_date::text as local_date
       from public.squad_leaderboard($1, '2026-01-15'::date, 'completed')`,
      [squadId],
    );
    expect(rows[0]!.local_date).toBe('2026-01-15');
  });

  it('is not executable by anon after the function was recreated', async () => {
    // A dropped SECURITY DEFINER function comes back with EXECUTE granted to
    // PUBLIC. If the migration forgets to re-revoke, this passes silently in
    // every test that runs as `authenticated`.
    const granted = await h.asService<{ has: boolean }>(
      `select has_function_privilege('anon',
         'public.squad_leaderboard(uuid, date, text, uuid)', 'execute') as has`,
    );
    expect(granted[0]!.has).toBe(false);

    const authed = await h.asService<{ has: boolean }>(
      `select has_function_privilege('authenticated',
         'public.squad_leaderboard(uuid, date, text, uuid)', 'execute') as has`,
    );
    expect(authed[0]!.has).toBe(true);
  });
});

describe('completed-day date agrees with kairo-core', () => {
  // The SQL expression and mostRecentlyCompletedLocalDate() are two
  // implementations of one rule. A single captured instant is passed to both,
  // so this cannot flake by straddling a midnight between the two reads.
  it('matches mostRecentlyCompletedLocalDate across zones', async () => {
    const now = new Date();
    const zones = [
      'Asia/Manila',
      'America/New_York',
      'Europe/London',
      'Pacific/Kiritimati',
      'Pacific/Niue',
      'Australia/Adelaide',
    ];

    for (const zone of zones) {
      const rows = await h.asService<{ d: string }>(
        `select (($1::timestamptz at time zone $2)::date - 1)::text as d`,
        [now.toISOString(), zone],
      );
      expect(rows[0]!.d).toBe(mostRecentlyCompletedLocalDate(now, zone));
    }
  });
});

describe('seed_test_users allowlist', () => {
  it('is unreachable by an authenticated client', async () => {
    const user = await h.createUser();

    await rejects(
      h.asUser(user, 'select * from public.seed_test_users'),
      /permission denied/i,
    );
    await rejects(
      h.asUser(
        user,
        `insert into public.seed_test_users (user_id, label) values ($1, 'self')`,
        [user],
      ),
      /permission denied/i,
    );
  });

  it('accepts a service-role insert and cascades on user deletion', async () => {
    const user = await h.createUser();

    await h.asService(
      `insert into public.seed_test_users (user_id, label) values ($1, 'squadmate-1')`,
      [user],
    );
    const before = await h.asService<{ n: string }>(
      'select count(*)::text as n from public.seed_test_users where user_id = $1',
      [user],
    );
    expect(before[0]!.n).toBe('1');

    await h.asService(`set local kairo.allow_purge = 'on'`);
    await h.asService('delete from auth.users where id = $1', [user]);

    const after = await h.asService<{ n: string }>(
      'select count(*)::text as n from public.seed_test_users where user_id = $1',
      [user],
    );
    expect(after[0]!.n).toBe('0');
  });

  it('rejects a blank label', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.seed_test_users (user_id, label) values ($1, '   ')`,
        [user],
      ),
      /check constraint/i,
    );
  });
});

describe('profiles.focus is gone', () => {
  // Removed in 20260810140000. squads.program is the only focus concept — the
  // same four choices, fixed at creation, and it actually weights the board.
  // The character screen's lane now reads observed dominance instead.

  it('no longer exists as a column', async () => {
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'focus'`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('is absent from the column-scoped client grants', async () => {
    // The grants are the written-down statement of what a client may write to
    // `profiles`. Dropping a column prunes them automatically, so this asserts
    // the *rest* of the list survived the revoke/re-grant intact — that is the
    // half a careless rebuild would get wrong.
    const rows = await h.asService<{ column_name: string }>(
      `select distinct column_name from information_schema.column_privileges
       where table_name = 'profiles' and grantee = 'authenticated'
         and privilege_type = 'UPDATE' order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'birth_year',
      'character_body',
      'character_name',
      'class',
      'exclude_from_recap',
      'height_cm',
      'sex',
      'timezone',
      'weight_kg',
    ]);
  });

  it('still keeps has_wearable out of those grants', async () => {
    // Unrelated to focus, and that is the point: the rebuild above rewrote the
    // whole list, and has_wearable being absent is the property 20260807100000
    // added it for.
    // Scoped to the write verbs: `profiles` carries a table-level SELECT for
    // `authenticated`, which surfaces here as a SELECT row per column. Owner-
    // only reads are RLS's job, not the grant's.
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from information_schema.column_privileges
       where table_name = 'profiles' and grantee = 'authenticated'
         and column_name = 'has_wearable'
         and privilege_type in ('INSERT', 'UPDATE')`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('has_wearable is server-observed', () => {
  it('blocks a client from claiming a wearable it does not have', async () => {
    // Capability is observed by sync-health from the presence of sleep data.
    // Client-writable would let a forged client fake the leaderboard's wearable
    // icon and the REC ceiling.
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'update public.profiles set has_wearable = true where id = $1', [
        user,
      ]),
      /permission denied/i,
    );
  });

  it('blocks a client from claiming one at profile creation either', async () => {
    const seeded = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['wearable-insert-probe@example.test'],
    );
    const id = seeded[0]!.id;
    await rejects(
      h.asUser(
        id,
        `insert into public.profiles (id, character_name, has_wearable)
         values ($1, 'Faker', true)`,
        [id],
      ),
      /permission denied/i,
    );
  });

  it('is still writable by the server', async () => {
    const user = await h.createUser();
    await h.asService('update public.profiles set has_wearable = true where id = $1', [
      user,
    ]);
    const rows = await h.asService<{ has_wearable: boolean }>(
      'select has_wearable from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.has_wearable).toBe(true);
  });
});

describe('squads.program', () => {
  it('defaults to all_around', async () => {
    const leader = await h.createUser();
    const rows = await h.asUser<{ program: string }>(
      leader,
      `select program from public.create_squad('Default Program')`,
    );
    expect(rows[0]!.program).toBe(DEFAULT_SQUAD_PROGRAM);
  });

  it('accepts every program @kairo/core declares', async () => {
    for (const program of SQUAD_PROGRAMS) {
      const leader = await h.createUser();
      const rows = await h.asUser<{ program: string }>(
        leader,
        `select program from public.create_squad($1, $2)`,
        [`Squad ${program}`, program],
      );
      expect(rows[0]!.program).toBe(program);
    }
  });

  it('refuses a program nobody defined rather than silently defaulting', async () => {
    const leader = await h.createUser();
    await rejects(
      h.asUser(leader, `select public.create_squad('Cyclists', 'cycling')`),
      /unknown squad program/,
    );
  });

  it('cannot be changed after creation, even by the leader', async () => {
    // Fixed at creation for MVP: changing it would silently re-rank every day
    // already on the board.
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Locked In', 'gym')`,
    );
    await rejects(
      h.asUser(leader, `update public.squads set program = 'running' where id = $1`, [
        squad[0]!.id,
      ]),
      /permission denied/i,
    );
  });

  it('still lets a leader rename their squad', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Typo Squda')`,
    );
    await h.asUser(leader, `update public.squads set name = 'Typo Squad' where id = $1`, [
      squad[0]!.id,
    ]);
    const rows = await h.asService<{ name: string }>(
      'select name from public.squads where id = $1',
      [squad[0]!.id],
    );
    expect(rows[0]!.name).toBe('Typo Squad');
  });

  it('is not executable by anon after create_squad was recreated', async () => {
    const anon = await h.asService<{ has: boolean }>(
      `select has_function_privilege('anon',
         'public.create_squad(text, text)', 'execute') as has`,
    );
    expect(anon[0]!.has).toBe(false);
    const authed = await h.asService<{ has: boolean }>(
      `select has_function_privilege('authenticated',
         'public.create_squad(text, text)', 'execute') as has`,
    );
    expect(authed[0]!.has).toBe(true);
  });

  it('left no single-argument overload behind', async () => {
    // Adding a defaulted parameter creates a SECOND function rather than
    // replacing the first, and two squad constructors is how the capacity rule
    // drifts apart.
    const rows = await h.asService<{ n: string }>(
      `select count(*)::text as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_squad'`,
    );
    expect(rows[0]!.n).toBe('1');
  });
});

describe('preview_squad', () => {
  it('shows a non-member the name and program behind a valid code', async () => {
    // The program is the game rule, so consenting to it is part of joining.
    const leader = await h.createUser();
    const squad = await h.asUser<{ invite_code: string }>(
      leader,
      `select invite_code from public.create_squad('Runners PH', 'running')`,
    );

    const outsider = await h.createUser();
    const rows = await h.asUser<{
      name: string;
      program: string;
      member_count: number;
      max_members: number;
      is_full: boolean;
      already_member: boolean;
    }>(outsider, 'select * from public.preview_squad($1)', [squad[0]!.invite_code]);

    expect(rows[0]).toMatchObject({
      name: 'Runners PH',
      program: 'running',
      member_count: 1,
      max_members: 6,
      is_full: false,
      already_member: false,
    });
  });

  it('accepts a lowercase code, the way people type it', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ invite_code: string }>(
      leader,
      `select invite_code from public.create_squad('Case Test')`,
    );
    const outsider = await h.createUser();
    const rows = await h.asUser<{ name: string }>(
      outsider,
      'select name from public.preview_squad($1)',
      [` ${squad[0]!.invite_code.toLowerCase()} `],
    );
    expect(rows[0]!.name).toBe('Case Test');
  });

  it('returns nothing for an unknown code rather than raising', async () => {
    const user = await h.createUser();
    const rows = await h.asUser(user, 'select * from public.preview_squad($1)', [
      'ZZZZZZ',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('tells an existing member they already belong', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ invite_code: string }>(
      leader,
      `select invite_code from public.create_squad('Home')`,
    );
    const rows = await h.asUser<{ already_member: boolean }>(
      leader,
      'select already_member from public.preview_squad($1)',
      [squad[0]!.invite_code],
    );
    expect(rows[0]!.already_member).toBe(true);
  });

  it('exposes no member identities and no invite code', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ invite_code: string }>(
      leader,
      `select invite_code from public.create_squad('Projection')`,
    );
    const outsider = await h.createUser();
    const rows = await h.asUser<Record<string, unknown>>(
      outsider,
      'select * from public.preview_squad($1)',
      [squad[0]!.invite_code],
    );
    const columns = Object.keys(rows[0]!);
    for (const forbidden of ['id', 'leader_id', 'invite_code', 'user_id', 'total']) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it('is not executable by anon', async () => {
    const rows = await h.asService<{ has: boolean }>(
      `select has_function_privilege('anon',
         'public.preview_squad(text)', 'execute') as has`,
    );
    expect(rows[0]!.has).toBe(false);
  });
});

describe('leaderboard program weighting', () => {
  /** A squad on `program` whose leader has the given stored day. */
  async function boardWith(
    program: string,
    day: {
      agi: number;
      str: number;
      end: number;
      vit: number;
      consistency?: number;
      rec?: number;
    },
  ) {
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad($1, $2)`,
      [`Board ${program} ${Math.random().toString(36).slice(2, 8)}`, program],
    );
    const squadId = squad[0]!.id;
    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, str_points, end_points, vit_points,
          consistency_points, rec_points, total)
       values ($1, '2026-07-27', $2, $3, $4, $5, $6, $7, 0)`,
      [
        leader,
        day.agi,
        day.str,
        day.end,
        day.vit,
        day.consistency ?? 0,
        day.rec ?? 0,
      ],
    );
    const rows = await h.asUser<{ total: number; program: string }>(
      leader,
      `select total, program from public.squad_leaderboard($1, '2026-07-27'::date)`,
      [squadId],
    );
    return rows[0]!;
  }

  const DAY = { agi: 900, str: 500, end: 0, vit: 900, consistency: 400, rec: 500 };

  it('leaves an all_around board unweighted', async () => {
    expect((await boardWith('all_around', DAY)).total).toBe(3_200);
  });

  it('boosts AGI on a running board', async () => {
    expect((await boardWith('running', DAY)).total).toBe(3_650);
  });

  it('boosts STR on a gym board', async () => {
    expect((await boardWith('gym', DAY)).total).toBe(3_450);
  });

  it('boosts VIT on a walking board', async () => {
    expect((await boardWith('walking', DAY)).total).toBe(3_650);
  });

  it('never boosts END, on any program', async () => {
    const endOnly = { agi: 0, str: 0, end: 900, vit: 0 };
    for (const program of SQUAD_PROGRAMS) {
      expect((await boardWith(program, endOnly)).total).toBe(900);
    }
  });

  it('reports the squad’s program on every row', async () => {
    expect((await boardWith('gym', DAY)).program).toBe('gym');
  });

  it('leaves tiers raw, so gold means the same on every board', async () => {
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Raw Tiers', 'running')`,
    );
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, agi_points, tiers)
       values ($1, '2026-07-27', 900, '{"AGI":"gold"}')`,
      [leader],
    );
    const rows = await h.asUser<{ tiers: Record<string, string>; total: number }>(
      leader,
      `select tiers, total from public.squad_leaderboard($1, '2026-07-27'::date)`,
      [squad[0]!.id],
    );
    expect(rows[0]!.tiers).toEqual({ AGI: 'gold' });
    expect(rows[0]!.total).toBe(1_350);
  });

  it('re-ranks members when the program tilts the board', async () => {
    // A runner and a lifter with identical raw totals. On a gym board the
    // lifter wins; the stored rows are untouched either way.
    const lifter = await h.createUser({ characterName: 'Lifter' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      lifter,
      `select id, invite_code from public.create_squad('Gym Rats', 'gym')`,
    );
    const runner = await h.createUser({ characterName: 'Runner' });
    await h.asUser(runner, 'select public.join_squad($1)', [squad[0]!.invite_code]);

    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, str_points, total)
       values ($1, '2026-07-27', 0, 900, 900),
              ($2, '2026-07-27', 900, 0, 900)`,
      [lifter, runner],
    );

    const rows = await h.asUser<{ character_name: string; total: number }>(
      lifter,
      `select character_name, total from public.squad_leaderboard($1, '2026-07-27'::date)`,
      [squad[0]!.id],
    );
    expect(rows.map((r) => r.character_name)).toEqual(['Lifter', 'Runner']);
    expect(rows.map((r) => r.total)).toEqual([1_350, 900]);
  });

  it('does not rewrite the stored total', async () => {
    // Deviation #11's whole point: weighting is a read, so stored scores stay
    // canonical and program-independent.
    const leader = await h.createUser();
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Read Only', 'running')`,
    );
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, agi_points, total)
       values ($1, '2026-07-27', 900, 900)`,
      [leader],
    );
    await h.asUser(
      leader,
      `select * from public.squad_leaderboard($1, '2026-07-27'::date)`,
      [squad[0]!.id],
    );
    const stored = await h.asService<{ total: number; agi_points: number }>(
      'select total, agi_points from public.daily_scores where user_id = $1',
      [leader],
    );
    expect(stored[0]).toEqual({ total: 900, agi_points: 900 });
  });
});

describe('program weights agree with kairo-core', () => {
  // program_weighted_total() in SQL and weightedBoardTotal() in
  // packages/kairo-core/src/program.ts are two implementations of one rule,
  // because a migration cannot import TypeScript. This is the
  // finalizable_days() / isFinalizable() precedent applied to the weights.
  const FIXTURES = [
    { agi: 0, str: 0, end: 0, vit: 0, consistency: 0, rec: 0 },
    { agi: 900, str: 500, end: 0, vit: 900, consistency: 400, rec: 500 },
    { agi: 900, str: 900, end: 900, vit: 900, consistency: 800, rec: 500 },
    { agi: 500, str: 200, end: 200, vit: 500, consistency: 400, rec: 0 },
    // Odd points force the .5 that round() has to resolve identically on both
    // sides. These cannot come out of the tier table, but nothing stops a
    // future one from producing them.
    { agi: 125, str: 375, end: 0, vit: 25, consistency: 0, rec: 0 },
    { agi: 1, str: 1, end: 1, vit: 1, consistency: 0, rec: 0 },
  ];

  it('matches weightedBoardTotal for every program on every fixture day', async () => {
    for (const program of SQUAD_PROGRAMS) {
      for (const f of FIXTURES) {
        const rows = await h.asService<{ total: number }>(
          `select public.program_weighted_total($1, $2, $3, $4, $5, $6, $7) as total`,
          [program, f.agi, f.str, f.end, f.vit, f.consistency, f.rec],
        );
        expect({ program, ...f, total: rows[0]!.total }).toEqual({
          program,
          ...f,
          total: weightedBoardTotal({
            program,
            statPoints: { AGI: f.agi, STR: f.str, END: f.end, VIT: f.vit },
            consistencyBonus: f.consistency,
            recBonus: f.rec,
          }),
        });
      }
    }
  });

  it('covers every program the TypeScript side declares', async () => {
    // A program added in TS but not in SQL would otherwise be weighted 1x
    // silently — the CHECK constraint is what catches it.
    for (const program of SQUAD_PROGRAMS) {
      const leader = await h.createUser();
      await h.asUser(leader, `select public.create_squad($1, $2)`, [
        `Coverage ${program}`,
        program,
      ]);
    }
  });
});

describe('leave_squad', () => {
  /** A squad with `extra` joined members beyond the leader. */
  async function seedSquad(extra: number) {
    const leader = await h.createUser({ characterName: 'Leader' });
    const rows = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Leavable')`,
    );
    const squadId = rows[0]!.id;

    const members: string[] = [];
    for (let i = 0; i < extra; i += 1) {
      const member = await h.createUser({ characterName: `Member${i}` });
      await h.asUser(member, 'select public.join_squad($1)', [rows[0]!.invite_code]);
      members.push(member);
    }
    return { leader, members, squadId };
  }

  async function memberIds(squadId: string): Promise<string[]> {
    const rows = await h.asService<{ user_id: string }>(
      'select user_id from public.squad_members where squad_id = $1',
      [squadId],
    );
    return rows.map((r) => r.user_id);
  }

  async function leaderOf(squadId: string): Promise<string | undefined> {
    const rows = await h.asService<{ leader_id: string }>(
      'select leader_id from public.squads where id = $1',
      [squadId],
    );
    return rows[0]?.leader_id;
  }

  it('removes an ordinary member and leaves the squad standing', async () => {
    const { leader, members, squadId } = await seedSquad(2);

    await h.asUser(members[0]!, 'select public.leave_squad($1)', [squadId]);

    expect((await memberIds(squadId)).sort()).toEqual([leader, members[1]!].sort());
    expect(await leaderOf(squadId)).toBe(leader);
  });

  it('passes leadership to the longest-tenured remaining member', async () => {
    const { leader, members, squadId } = await seedSquad(2);
    // Against joined_at, not insertion order: members[1] is made the elder, so
    // a succession that picked "the next row" rather than the oldest tenure
    // would name members[0] and fail here.
    await h.asService(
      `update public.squad_members set joined_at = now() - interval '10 days'
       where squad_id = $1 and user_id = $2`,
      [squadId, members[1]!],
    );

    await h.asUser(leader, 'select public.leave_squad($1)', [squadId]);

    expect(await leaderOf(squadId)).toBe(members[1]!);
    expect(await memberIds(squadId)).not.toContain(leader);
  });

  it('never leaves the squad led by the member who just left', async () => {
    // The membership delete runs before succession, so the leaver is not a
    // candidate to inherit their own squad.
    const { leader, members, squadId } = await seedSquad(1);
    await h.asUser(leader, 'select public.leave_squad($1)', [squadId]);
    expect(await leaderOf(squadId)).toBe(members[0]!);
  });

  it('deletes the squad, and its membership rows, when the last member leaves', async () => {
    const { leader, members, squadId } = await seedSquad(1);

    await h.asUser(members[0]!, 'select public.leave_squad($1)', [squadId]);
    await h.asUser(leader, 'select public.leave_squad($1)', [squadId]);

    const rows = await h.asService<{ squads: number; memberships: number }>(
      `select
         (select count(*)::int from public.squads        where id = $1)       as squads,
         (select count(*)::int from public.squad_members where squad_id = $1) as memberships`,
      [squadId],
    );
    expect(rows[0]).toEqual({ squads: 0, memberships: 0 });
  });

  it('rejects a non-member and changes nothing', async () => {
    const { leader, squadId } = await seedSquad(1);
    const outsider = await h.createUser();

    await rejects(
      h.asUser(outsider, 'select public.leave_squad($1)', [squadId]),
      /not a member of this squad/,
    );
    expect((await memberIds(squadId)).length).toBe(2);
    expect(await leaderOf(squadId)).toBe(leader);
  });

  it('rejects an unauthenticated caller', async () => {
    const { squadId } = await seedSquad(1);
    await rejects(
      h.asService('select public.leave_squad($1)', [squadId]),
      /permission denied|authentication required/,
    );
  });

  it('is the only exit: a raw DELETE on squad_members is refused', async () => {
    // The regression test for dropping squad_members_delete_self. That policy
    // let a leader leave without succession, stranding squads.leader_id on a
    // non-member.
    const { members, squadId } = await seedSquad(1);
    await rejects(
      h.asUser(members[0]!, 'delete from public.squad_members where squad_id = $1', [
        squadId,
      ]),
      /permission denied/,
    );
    expect((await memberIds(squadId)).length).toBe(2);
  });
});

describe('delete_account', () => {
  /** Everything erasure has to reach, counted in one go. */
  async function residue(userId: string) {
    const rows = await h.asService<{ table_name: string; n: number }>(
      `select 'profiles' as table_name, count(*)::int as n from public.profiles where id = $1
       union all select 'daily_scores', count(*)::int from public.daily_scores where user_id = $1
       union all select 'health_buckets', count(*)::int from public.health_buckets where user_id = $1
       union all select 'streaks', count(*)::int from public.streaks where user_id = $1
       union all select 'squad_members', count(*)::int from public.squad_members where user_id = $1
       union all select 'device_tokens', count(*)::int from public.device_tokens where user_id = $1
       union all select 'auth_users', count(*)::int from auth.users where id = $1`,
      [userId],
    );
    return Object.fromEntries(rows.map((r) => [r.table_name, r.n]));
  }

  it('erases the account and everything keyed to it', async () => {
    const user = await h.createUser({ characterName: 'Leaving' });
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total, xp_awarded)
       values ($1, '2026-07-27', 900, 25)`,
      [user],
    );
    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps)
       values ($1, '2026-07-27', 9, 1200)`,
      [user],
    );

    await h.asUser(user, 'select public.delete_account()');

    expect(await residue(user)).toEqual({
      profiles: 0,
      daily_scores: 0,
      health_buckets: 0,
      streaks: 0,
      squad_members: 0,
      device_tokens: 0,
      auth_users: 0,
    });
  });

  it('requires a session — an anonymous caller cannot erase anybody', async () => {
    await rejects(h.asService('select public.delete_account()'), /authentication required/);
  });

  it('hands the squad on rather than destroying it for everyone else', async () => {
    // The BEFORE DELETE trigger runs succession before the FK cascade, so the
    // leader erasing their account must not take the squad with them.
    const leader = await h.createUser({ characterName: 'Leader' });
    const rows = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Survivors')`,
    );
    const squadId = rows[0]!.id;
    const member = await h.createUser({ characterName: 'Member' });
    await h.asUser(member, 'select public.join_squad($1)', [rows[0]!.invite_code]);

    await h.asUser(leader, 'select public.delete_account()');

    const squad = await h.asService<{ leader_id: string }>(
      'select leader_id from public.squads where id = $1',
      [squadId],
    );
    expect(squad).toHaveLength(1);
    expect(squad[0]!.leader_id).toBe(member);
  });

  it('deletes a squad whose last member leaves this way', async () => {
    const leader = await h.createUser({ characterName: 'Solo' });
    const rows = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Empties')`,
    );

    await h.asUser(leader, 'select public.delete_account()');

    const squad = await h.asService(
      'select 1 from public.squads where id = $1',
      [rows[0]!.id],
    );
    expect(squad).toHaveLength(0);
  });

  describe("other people's goals", () => {
    it('survives with a null creator rather than being destroyed', async () => {
      // The gap this migration closed. `created_by` cascaded, so erasing the
      // author took a squad goal away from everyone still working on it.
      const leader = await h.createUser({ characterName: 'Author' });
      const rows = await h.asUser<{ id: string; invite_code: string }>(
        leader,
        `select id, invite_code from public.create_squad('Goalies')`,
      );
      const member = await h.createUser({ characterName: 'Other' });
      await h.asUser(member, 'select public.join_squad($1)', [rows[0]!.invite_code]);

      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Shared', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [rows[0]!.id],
      );
      const goalId = goal[0]!.id;

      await h.asUser(leader, 'select public.delete_account()');

      const stored = await h.asService<{ created_by: string | null }>(
        'select created_by from public.goals where id = $1',
        [goalId],
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]!.created_by).toBeNull();

      // And the survivor is still on it — a goal without its roster would be
      // a different kind of loss.
      const participants = await h.asService(
        'select 1 from public.goal_participants where goal_id = $1 and user_id = $2',
        [goalId, member],
      );
      expect(participants).toHaveLength(1);
    });

    it('lets nobody inherit the right to rename an orphaned goal', async () => {
      // `created_by = auth.uid()` against NULL is never true, which is the
      // intended reading of SET NULL here rather than an accident of it.
      const leader = await h.createUser({ characterName: 'Author' });
      const rows = await h.asUser<{ id: string; invite_code: string }>(
        leader,
        `select id, invite_code from public.create_squad('Goalies')`,
      );
      const member = await h.createUser({ characterName: 'Other' });
      await h.asUser(member, 'select public.join_squad($1)', [rows[0]!.invite_code]);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Shared', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [rows[0]!.id],
      );

      await h.asUser(leader, 'select public.delete_account()');

      await h.asUser(member, `update public.goals set title = 'Mine now' where id = $1`, [
        goal[0]!.id,
      ]);
      const stored = await h.asService<{ title: string }>(
        'select title from public.goals where id = $1',
        [goal[0]!.id],
      );
      expect(stored[0]!.title).toBe('Shared');
    });
  });
});

describe('users_at_local_hour', () => {
  interface HourRow {
    user_id: string;
    local_date: string;
    timezone: string;
  }

  // 16:05 UTC is 00:05 the NEXT day in Manila and 12:05 the SAME day in New
  // York — one instant, two local dates and two local hours, which is the whole
  // reason this function exists.
  const INSTANT = '2026-08-07T16:05:00Z';

  async function at(hour: number, instant = INSTANT) {
    return h.asService<HourRow>(
      // local_date as text: the driver hands back a Date otherwise, and the
      // whole point of the column is the calendar date, not an instant.
      `select user_id, local_date::text, timezone
         from public.users_at_local_hour($1, $2::timestamptz)`,
      [hour, instant],
    );
  }

  it('selects only the users whose own local hour matches', async () => {
    const manila = await h.createUser({ timezone: 'Asia/Manila' });
    const newYork = await h.createUser({ timezone: 'America/New_York' });

    const midnight = await at(0);
    const noon = await at(12);

    expect(midnight.map((r) => r.user_id)).toContain(manila);
    expect(midnight.map((r) => r.user_id)).not.toContain(newYork);
    expect(noon.map((r) => r.user_id)).toContain(newYork);
    expect(noon.map((r) => r.user_id)).not.toContain(manila);
  });

  it('returns the local date the user is living in, not the UTC date', async () => {
    const manila = await h.createUser({ timezone: 'Asia/Manila' });
    const row = (await at(0)).find((r) => r.user_id === manila);
    // UTC is still 2026-08-07; Manila has already rolled over.
    expect(row?.local_date).toBe('2026-08-08');
    expect(row?.timezone).toBe('Asia/Manila');
  });

  it('places a half-hour zone unambiguously inside one local hour', async () => {
    // The cron fires at seven past, so +05:30 and +05:45 still land cleanly.
    const kolkata = await h.createUser({ timezone: 'Asia/Kolkata' });
    const rows = await at(21, '2026-08-07T16:07:00Z');
    expect(rows.map((r) => r.user_id)).toContain(kolkata);
  });

  it('is cron-only — no client role may execute it', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'select * from public.users_at_local_hour(0)'),
      /permission denied/,
    );
  });
});

describe('device_tokens', () => {
  interface TokenRow {
    token: string;
    user_id: string;
    platform: string;
  }

  async function tokenRows(token: string) {
    return h.asService<TokenRow>(
      'select token, user_id, platform from public.device_tokens where token = $1',
      [token],
    );
  }

  it('registers the calling user against a token', async () => {
    const user = await h.createUser();
    await h.asUser(user, `select public.register_device_token($1, 'ios')`, ['tok-a']);
    expect(await tokenRows('tok-a')).toEqual([
      { token: 'tok-a', user_id: user, platform: 'ios' },
    ]);
  });

  it('re-points a token that changed hands instead of erroring or duplicating', async () => {
    // A phone sold or handed on keeps its APNs token. Accumulating a second row
    // would push one person's notifications to another person's phone.
    const first = await h.createUser();
    const second = await h.createUser();
    await h.asUser(first, `select public.register_device_token($1, 'ios')`, ['tok-b']);
    await h.asUser(second, `select public.register_device_token($1, 'ios')`, ['tok-b']);

    expect(await tokenRows('tok-b')).toEqual([
      { token: 'tok-b', user_id: second, platform: 'ios' },
    ]);
  });

  it('rejects a platform the sender cannot address', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, `select public.register_device_token($1, 'blackberry')`, ['tok-c']),
      /platform/,
    );
  });

  it('rejects an unauthenticated caller', async () => {
    await rejects(
      h.asService(`select public.register_device_token('tok-d', 'ios')`),
      /authentication required/,
    );
  });

  it('hides one user\'s token from another', async () => {
    const owner = await h.createUser();
    const stranger = await h.createUser();
    await h.asUser(owner, `select public.register_device_token($1, 'ios')`, ['tok-e']);

    const seen = await h.asUser<TokenRow>(
      stranger,
      'select token from public.device_tokens where token = $1',
      ['tok-e'],
    );
    expect(seen).toEqual([]);
  });

  it('lets a user delete their own registration on sign-out', async () => {
    const user = await h.createUser();
    await h.asUser(user, `select public.register_device_token($1, 'ios')`, ['tok-f']);
    await h.asUser(user, 'delete from public.device_tokens where token = $1', ['tok-f']);
    expect(await tokenRows('tok-f')).toEqual([]);
  });
});

describe('notification_log', () => {
  it('is server-written only — no client may insert a send', async () => {
    // sentToday is read from this table. A client that could insert could
    // silence its own notifications, or inflate someone else's budget.
    const user = await h.createUser();
    await rejects(
      h.asUser(
        user,
        `insert into public.notification_log (user_id, kind, local_date)
         values ($1, 'day_ends', '2026-08-07')`,
        [user],
      ),
      /permission denied/,
    );
  });

  it('shows a user only their own sends', async () => {
    const owner = await h.createUser();
    const stranger = await h.createUser();
    await h.asService(
      `insert into public.notification_log (user_id, kind, local_date)
       values ($1, 'day_ends', '2026-08-07')`,
      [owner],
    );

    const own = await h.asUser(owner, 'select id from public.notification_log');
    const theirs = await h.asUser(stranger, 'select id from public.notification_log');
    expect(own.length).toBe(1);
    expect(theirs).toEqual([]);
  });
});

describe('squad_leaderboard viewed on behalf of a user', () => {
  // dispatch-notifications runs as the cron, with no JWT, and has to tell a
  // user what rank they are in. Reproducing the ordering rule in the dispatcher
  // would be a second copy of it, and the number in the push would drift from
  // the number on the screen.
  async function seedSquad() {
    const leader = await h.createUser({ characterName: 'Alpha' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Dispatch')`,
    );
    const member = await h.createUser({ characterName: 'Beta' });
    await h.asUser(member, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    return { leader, member, squadId: squad[0]!.id };
  }

  it('lets a caller with no JWT name the viewer', async () => {
    const { leader, member, squadId } = await seedSquad();
    const rows = await h.asService<{ character_name: string; is_self: boolean }>(
      `select character_name, is_self
         from public.squad_leaderboard($1, null, 'current', $2)`,
      [squadId, member],
    );
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.is_self).map((r) => r.character_name)).toEqual(['Beta']);
    expect(leader).toBeTruthy();
  });

  it('ignores the named viewer when the caller has a JWT', async () => {
    // Otherwise any member could read the board as somebody else. The parameter
    // is a cron affordance, not an impersonation grant.
    const { leader, member, squadId } = await seedSquad();
    const rows = await h.asUser<{ character_name: string; is_self: boolean }>(
      leader,
      `select character_name, is_self
         from public.squad_leaderboard($1, null, 'current', $2)`,
      [squadId, member],
    );
    expect(rows.filter((r) => r.is_self).map((r) => r.character_name)).toEqual(['Alpha']);
  });

  it('still refuses a caller who is neither authenticated nor named', async () => {
    const { squadId } = await seedSquad();
    await rejects(
      h.asService('select * from public.squad_leaderboard($1)', [squadId]),
      /authentication required/,
    );
  });

  it('still refuses a named viewer who is not in the squad', async () => {
    const { squadId } = await seedSquad();
    const outsider = await h.createUser();
    await rejects(
      h.asService(`select * from public.squad_leaderboard($1, null, 'current', $2)`, [
        squadId,
        outsider,
      ]),
      /not a member of this squad/,
    );
  });
});

describe('goals', () => {
  /** A squad with `extra` members beyond the leader. */
  async function seedSquad(extra: number) {
    const leader = await h.createUser({ characterName: 'Leader' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad($1)`,
      [`Goals ${Math.random().toString(36).slice(2, 8)}`],
    );
    const squadId = squad[0]!.id;
    const members: string[] = [];
    for (let i = 0; i < extra; i++) {
      const m = await h.createUser({ characterName: `Member${i}` });
      await h.asUser(m, 'select public.join_squad($1)', [squad[0]!.invite_code]);
      members.push(m);
    }
    return { leader, members, squadId };
  }

  async function personalGoal(userId: string) {
    const rows = await h.asUser<{ id: string }>(
      userId,
      `select id from public.create_goal(
         'Ten thousand', null, 'cumulative', 60000, '2026-01-01'::date, '2026-01-30'::date)`,
    );
    return rows[0]!.id;
  }

  describe('create_goal', () => {
    it('creates a personal goal with the caller as its only participant', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      const rows = await h.asService<{ user_id: string }>(
        'select user_id from public.goal_participants where goal_id = $1',
        [goalId],
      );
      expect(rows).toEqual([{ user_id: user }]);
    });

    it('leaves required_members null on a personal goal', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      const rows = await h.asService<{ required_members: number | null }>(
        'select required_members from public.goals where id = $1',
        [goalId],
      );
      expect(rows[0]!.required_members).toBeNull();
    });

    it('freezes the whole squad onto a squad goal', async () => {
      const { leader, members, squadId } = await seedSquad(2);
      const goal = await h.asUser<{ id: string; required_members: number }>(
        leader,
        `select id, required_members from public.create_goal(
           'Together', null, 'cumulative', 300000, '2026-01-01'::date, '2026-01-30'::date,
           null, $1)`,
        [squadId],
      );
      const rows = await h.asService<{ n: number }>(
        'select count(*)::int as n from public.goal_participants where goal_id = $1',
        [goal[0]!.id],
      );
      expect(rows[0]!.n).toBe(3);
      // Defaults to everyone, which is what §8's "everyone must hit it" means.
      expect(goal[0]!.required_members).toBe(3);
    });

    it('does not change a frozen roster when the squad gains a member', async () => {
      // The whole reason the roster is a table rather than a live read: "everyone
      // must hit it" is meaningless if the denominator moves mid-window.
      const { leader, squadId } = await seedSquad(1);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal(
           'Frozen', null, 'cumulative', 1000, '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );
      const joiner = await h.createUser();
      const code = await h.asService<{ invite_code: string }>(
        'select invite_code from public.squads where id = $1',
        [squadId],
      );
      await h.asUser(joiner, 'select public.join_squad($1)', [code[0]!.invite_code]);

      const rows = await h.asService<{ n: number }>(
        'select count(*)::int as n from public.goal_participants where goal_id = $1',
        [goal[0]!.id],
      );
      expect(rows[0]!.n).toBe(2);
    });

    it('refuses a squad the caller is not in', async () => {
      const { squadId } = await seedSquad(0);
      const outsider = await h.createUser();
      await rejects(
        h.asUser(
          outsider,
          `select public.create_goal('Nope', null, 'cumulative', 1000,
             '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
          [squadId],
        ),
        /not a member of this squad/,
      );
    });

    it('clamps required_members to the roster rather than creating an unwinnable goal', async () => {
      const { leader, squadId } = await seedSquad(1);
      const goal = await h.asUser<{ required_members: number }>(
        leader,
        `select required_members from public.create_goal(
           'Greedy', null, 'cumulative', 1000, '2026-01-01'::date, '2026-01-30'::date,
           null, $1, 9::smallint)`,
        [squadId],
      );
      expect(goal[0]!.required_members).toBe(2);
    });

    it('rejects a consistency goal needing more days than its window has', async () => {
      const user = await h.createUser();
      await rejects(
        h.asUser(
          user,
          `select public.create_goal('Impossible', null, 'consistency', 2500,
             '2026-01-01'::date, '2026-01-07'::date, 10::smallint)`,
        ),
        /exceeds the 7 day window/,
      );
    });

    it('rejects an inverted window', async () => {
      const user = await h.createUser();
      await rejects(
        h.asUser(
          user,
          `select public.create_goal('Backwards', null, 'cumulative', 1000,
             '2026-01-30'::date, '2026-01-01'::date)`,
        ),
        /goals_window_ordered/,
      );
    });

    it('stores a description and normalises a blank one to null', async () => {
      const user = await h.createUser();
      const rows = await h.asUser<{ description: string | null }>(
        user,
        `select description from public.create_goal(
           'Described', '  Because I said I would.  ', 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date)`,
      );
      // Trimmed, not stored raw — the CHECK measures the trimmed length, so an
      // untrimmed store and the constraint would disagree about the same value.
      expect(rows[0]!.description).toBe('Because I said I would.');

      const blank = await h.asUser<{ description: string | null }>(
        user,
        `select description from public.create_goal(
           'Blank', '   ', 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date)`,
      );
      // Absent and empty must be one state, or the detail screen has to handle
      // both. The CHECK would reject '' outright; the RPC folds it to null.
      expect(blank[0]!.description).toBeNull();
    });

    it('rejects a description longer than the column allows', async () => {
      const user = await h.createUser();
      await rejects(
        h.asService(
          `insert into public.goals
             (created_by, title, description, kind, target, starts_on, ends_on)
           values ($1, 'Long', repeat('x', 281), 'cumulative', 1000,
                   '2026-01-01', '2026-01-30')`,
          [user],
        ),
        /goals_description_check/,
      );
    });

    it('creates an open-ended cumulative goal with no end date', async () => {
      const user = await h.createUser();
      const rows = await h.asUser<{ id: string; ends_on: string | null }>(
        user,
        `select id, ends_on from public.create_goal(
           'Half a million', null, 'cumulative', 500000, '2026-01-01'::date, null)`,
      );
      expect(rows[0]!.ends_on).toBeNull();

      // The roster is still frozen, exactly as for a dated goal.
      const participants = await h.asService<{ n: number }>(
        'select count(*)::int as n from public.goal_participants where goal_id = $1',
        [rows[0]!.id],
      );
      expect(participants[0]!.n).toBe(1);
    });

    it('refuses an open-ended consistency goal', async () => {
      // "Clear the bar on 25 days, however long it takes" can never become
      // unreachable, so it has no failure state and nothing for the pace marker
      // to sit at. Forbidden in the schema rather than only discouraged in the UI.
      const user = await h.createUser();
      await rejects(
        h.asUser(
          user,
          `select public.create_goal('Forever', null, 'consistency', 2500,
             '2026-01-01'::date, null, 25::smallint)`,
        ),
        /goals_consistency_needs_end/,
      );
    });

    it('skips the window validation for an open-ended goal rather than silently passing it', async () => {
      // `required_days > (null - starts_on) + 1` is NULL, so the IF would never
      // fire and the trigger would look present while enforcing nothing. The
      // early return is what makes that explicit. A cumulative goal has no
      // required_days at all, so reaching the trigger must simply be harmless.
      const user = await h.createUser();
      const rows = await h.asUser<{ id: string }>(
        user,
        `select id from public.create_goal(
           'Open', null, 'cumulative', 1000, '2026-01-01'::date, null)`,
      );
      expect(rows[0]!.id).toBeTruthy();
    });

    it('requires required_days on a consistency goal and forbids it otherwise', async () => {
      const user = await h.createUser();
      await rejects(
        h.asService(
          `insert into public.goals
             (created_by, title, kind, target, starts_on, ends_on)
           values ($1, 'No days', 'consistency', 2500, '2026-01-01', '2026-01-30')`,
          [user],
        ),
        /goals_required_days_iff_consistency/,
      );
      await rejects(
        h.asService(
          `insert into public.goals
             (created_by, title, kind, target, required_days, starts_on, ends_on)
           values ($1, 'Stray days', 'cumulative', 1000, 5, '2026-01-01', '2026-01-30')`,
          [user],
        ),
        /goals_required_days_iff_consistency/,
      );
    });
  });

  describe('goals are fixed after creation', () => {
    it('lets the creator rename a goal', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await h.asUser(user, `update public.goals set title = 'Renamed' where id = $1`, [
        goalId,
      ]);
      const rows = await h.asService<{ title: string }>(
        'select title from public.goals where id = $1',
        [goalId],
      );
      expect(rows[0]!.title).toBe('Renamed');
    });

    it('refuses to move the target', async () => {
      // Changing a target mid-window silently re-grades every day already
      // counted. The column grant is what makes this structural.
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await rejects(
        h.asUser(user, 'update public.goals set target = 1 where id = $1', [goalId]),
        /permission denied|column .target./i,
      );
    });

    it('refuses to move the window', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await rejects(
        h.asUser(
          user,
          `update public.goals set ends_on = '2027-01-01' where id = $1`,
          [goalId],
        ),
        /permission denied|column .ends_on./i,
      );
    });

    it('blocks a client from inserting a goal directly', async () => {
      const user = await h.createUser();
      await rejects(
        h.asUser(
          user,
          `insert into public.goals (created_by, title, kind, target, starts_on, ends_on)
           values ($1, 'Forged', 'cumulative', 1, '2026-01-01', '2026-01-02')`,
          [user],
        ),
        /permission denied/i,
      );
    });
  });

  describe('visibility', () => {
    it('hides a personal goal from everybody else', async () => {
      const owner = await h.createUser();
      const stranger = await h.createUser();
      const goalId = await personalGoal(owner);
      const rows = await h.asUser(
        stranger,
        'select id from public.goals where id = $1',
        [goalId],
      );
      expect(rows).toEqual([]);
    });

    it('shows a squad goal to every squad member', async () => {
      const { leader, members, squadId } = await seedSquad(1);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Shared', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );
      const seen = await h.asUser(
        members[0]!,
        'select id from public.goals where id = $1',
        [goal[0]!.id],
      );
      expect(seen).toHaveLength(1);
    });

    it('hides a squad goal from a non-member', async () => {
      const { leader, squadId } = await seedSquad(0);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Private', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );
      const outsider = await h.createUser();
      const seen = await h.asUser(
        outsider,
        'select id from public.goals where id = $1',
        [goal[0]!.id],
      );
      expect(seen).toEqual([]);
    });

    it('blocks a client from writing a completion', async () => {
      // Completion pays XP. A client that could insert one could award itself
      // unbounded XP, which is exactly what the service-role-only rule prevents.
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await rejects(
        h.asUser(
          user,
          `insert into public.goal_completions (goal_id, user_id, completed_on, xp_awarded)
           values ($1, $2, '2026-01-30', 99999)`,
          [goalId, user],
        ),
        /permission denied/i,
      );
    });

    it('grants authenticated nothing beyond SELECT and the title column', async () => {
      // Supabase's default privileges grant ALL on new public tables, and ALL
      // includes TRUNCATE — which RLS does NOT restrict. `revoke insert, update,
      // delete` would have left every goal in the system truncatable by any
      // signed-in client. Not reachable through PostgREST, which only issues the
      // four DML verbs, but the grant should not exist.
      const rows = await h.asService<{ table_name: string; privs: string }>(
        `select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
         from information_schema.table_privileges
         where table_name in ('goals', 'goal_participants', 'goal_completions')
           and grantee = 'authenticated'
         group by table_name order by table_name`,
      );
      // SELECT and nothing else, on all three. A column-level UPDATE grant does
      // not surface here — `title` and `description` show up in
      // `column_privileges`, which is the next assertion and the reason both
      // are needed.
      expect(rows).toEqual([
        { table_name: 'goal_completions', privs: 'SELECT' },
        { table_name: 'goal_participants', privs: 'SELECT' },
        { table_name: 'goals', privs: 'SELECT' },
      ]);

      const cols = await h.asService<{ column_name: string }>(
        `select column_name from information_schema.column_privileges
         where table_name = 'goals' and grantee = 'authenticated'
           and privilege_type = 'UPDATE' order by column_name`,
      );
      // Exactly two, and the list is the point: everything else on a goal is
      // fixed after creation, because moving a target mid-window would silently
      // re-grade days already counted.
      expect(cols).toEqual([{ column_name: 'description' }, { column_name: 'title' }]);
    });

    it('blocks a client from adding itself to somebody else’s goal', async () => {
      const owner = await h.createUser();
      const intruder = await h.createUser();
      const goalId = await personalGoal(owner);
      await rejects(
        h.asUser(
          intruder,
          'insert into public.goal_participants (goal_id, user_id) values ($1, $2)',
          [goalId, intruder],
        ),
        /permission denied/i,
      );
    });
  });

  describe('goal_window_scores', () => {
    async function seedDay(userId: string, date: string, total: number, status = 'final') {
      // Both uses of $4 are cast through text: without it Postgres deduces
      // day_status from the column and text from the comparison, and refuses.
      await h.asService(
        `insert into public.daily_scores (user_id, local_date, agi_points, total, status, finalized_at)
         values ($1, $2, $3, $3, $4::text::public.day_status,
                 case when $4::text = 'final' then now() end)`,
        [userId, date, total, status],
      );
    }

    it('returns only days inside the window', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await seedDay(user, '2025-12-31', 999);
      await seedDay(user, '2026-01-01', 100);
      await seedDay(user, '2026-01-30', 200);
      await seedDay(user, '2026-01-31', 888);

      const rows = await h.asUser<{ local_date: string; total: number }>(
        user,
        'select local_date, total from public.goal_window_scores($1)',
        [goalId],
      );
      expect(rows.map((r) => r.total)).toEqual([100, 200]);
    });

    it('has no upper bound for an open-ended goal, but keeps the lower one', async () => {
      const user = await h.createUser();
      const rows = await h.asUser<{ id: string }>(
        user,
        `select id from public.create_goal(
           'Open', null, 'cumulative', 500000, '2026-01-01'::date, null)`,
      );
      const goalId = rows[0]!.id;
      await seedDay(user, '2025-12-31', 999);
      await seedDay(user, '2026-01-01', 100);
      await seedDay(user, '2027-06-15', 200);

      const scores = await h.asUser<{ total: number }>(
        user,
        'select total from public.goal_window_scores($1)',
        [goalId],
      );
      // A day eighteen months later still counts; the day before the start
      // still does not. `ends_on is null` widens one bound, never both.
      expect(scores.map((r) => r.total)).toEqual([100, 200]);
    });

    it('reports status so the caller can exclude provisional days', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await seedDay(user, '2026-01-01', 100, 'provisional');
      const rows = await h.asUser<{ status: string }>(
        user,
        'select status from public.goal_window_scores($1)',
        [goalId],
      );
      expect(rows[0]!.status).toBe('provisional');
    });

    it('returns a participant who has no scored day at all', async () => {
      // The bug this covers, seen on device: the RPC inner-joined daily_scores,
      // so a member who had not started vanished from a squad goal's roster —
      // which is exactly what an "everyone must hit it" goal must not hide.
      // squad_leaderboard already left-joins for the same reason.
      const { leader, members, squadId } = await seedSquad(1);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Nobody moved', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );
      // Only the leader has a day; the member has none.
      await seedDay(leader, '2026-01-02', 300);

      const rows = await h.asUser<{ user_id: string; local_date: string | null }>(
        leader,
        'select user_id, local_date from public.goal_window_scores($1)',
        [goal[0]!.id],
      );
      const users = new Set(rows.map((r) => r.user_id));
      expect(users.size).toBe(2);
      expect(users.has(members[0]!)).toBe(true);
      // The scoreless member arrives as a single null-extended row.
      const memberRows = rows.filter((r) => r.user_id === members[0]!);
      expect(memberRows).toEqual([{ user_id: members[0]!, local_date: null }]);
    });

    it('still bounds a scored participant to the window after the left join', async () => {
      // The date bound has to live in the ON clause. Moved to WHERE it would
      // filter out the null-extended rows and quietly restore the inner join.
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await seedDay(user, '2025-12-31', 999);
      await seedDay(user, '2026-01-05', 500);

      const rows = await h.asUser<{ total: number | null }>(
        user,
        'select total from public.goal_window_scores($1)',
        [goalId],
      );
      expect(rows).toEqual([{ total: 500 }]);
    });

    it('returns every participant on a squad goal', async () => {
      const { leader, members, squadId } = await seedSquad(1);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Both', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );
      await seedDay(leader, '2026-01-02', 300);
      await seedDay(members[0]!, '2026-01-02', 400);

      const rows = await h.asUser<{ user_id: string; total: number }>(
        leader,
        'select user_id, total from public.goal_window_scores($1)',
        [goal[0]!.id],
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.total).sort()).toEqual([300, 400]);
    });

    it('serves a JWT-less caller that names a viewer, which is how finalize-days reads it', async () => {
      // This is the bug the first version shipped with. finalize-days runs as the
      // service role, so auth.uid() is null and the guard refused it — the goal
      // pass failed silently into a goal_settle_failed event while the day still
      // closed. squad_leaderboard already had p_as_user for the same reason.
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await seedDay(user, '2026-01-03', 700);

      const rows = await h.asService<{ total: number }>(
        'select total from public.goal_window_scores($1, $2)',
        [goalId, user],
      );
      expect(rows).toEqual([{ total: 700 }]);
    });

    it('still refuses a JWT-less caller that names nobody', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await rejects(
        h.asService('select * from public.goal_window_scores($1)', [goalId]),
        /authentication required/,
      );
    });

    it('ignores p_as_user when the caller has a JWT, so it cannot impersonate', async () => {
      // coalesce((select auth.uid()), p_as_user) — deliberately not the reverse,
      // which would let any authenticated client read a goal as somebody else.
      const owner = await h.createUser();
      const goalId = await personalGoal(owner);
      const stranger = await h.createUser();
      await rejects(
        h.asUser(stranger, 'select * from public.goal_window_scores($1, $2)', [
          goalId,
          owner,
        ]),
        /not a participant in this goal/,
      );
    });

    it('rejects a caller with no claim on the goal', async () => {
      const owner = await h.createUser();
      const goalId = await personalGoal(owner);
      const stranger = await h.createUser();
      await rejects(
        h.asUser(stranger, 'select * from public.goal_window_scores($1)', [goalId]),
        /not a participant in this goal/,
      );
    });

    it('exposes no path to raw health data', async () => {
      // §5 and deviation #4: the privacy rule is a projection, not a convention.
      // The function's declared return type is what bounds it — a widening would
      // have to change this signature, which is why asserting on it is worth more
      // than asserting on one call's rows.
      const signature = await h.asService<{ result: string }>(
        `select pg_get_function_result(oid) as result from pg_proc
         where proname = 'goal_window_scores'`,
      );
      const declared = signature[0]!.result;
      expect(declared).not.toMatch(/steps|distance|kcal|minutes|hour|had_workout|heart/i);
      expect(declared).not.toMatch(/agi|str|end_points|vit|tiers|consistency/i);
      expect(declared).toMatch(/total integer/);
    });
  });

  describe('abandon_goal', () => {
    it('removes the caller and deletes a personal goal outright', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await h.asUser(user, 'select public.abandon_goal($1)', [goalId]);
      const rows = await h.asService('select id from public.goals where id = $1', [
        goalId,
      ]);
      expect(rows).toEqual([]);
    });

    it('keeps a squad goal alive while anybody is still on it', async () => {
      const { leader, members, squadId } = await seedSquad(1);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Persist', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );
      await h.asUser(members[0]!, 'select public.abandon_goal($1)', [goal[0]!.id]);
      const rows = await h.asService<{ n: number }>(
        `select (select count(*)::int from public.goals where id = $1) as n`,
        [goal[0]!.id],
      );
      expect(rows[0]!.n).toBe(1);
    });

    it('rejects somebody who was never on it', async () => {
      const owner = await h.createUser();
      const goalId = await personalGoal(owner);
      const stranger = await h.createUser();
      await rejects(
        h.asUser(stranger, 'select public.abandon_goal($1)', [goalId]),
        /not a participant in this goal/,
      );
    });
  });

  describe('completion feeds the XP rollup', () => {
    async function xpOf(userId: string) {
      const rows = await h.asService<{ total_xp: number; level: number }>(
        'select total_xp, level from public.profiles where id = $1',
        [userId],
      );
      return rows[0]!;
    }

    it('adds goal XP on top of daily XP, without touching daily_scores', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await h.asService(
        `insert into public.daily_scores (user_id, local_date, total, xp_awarded)
         values ($1, '2026-01-05', 1000, 40)`,
        [user],
      );
      expect((await xpOf(user)).total_xp).toBe(40);

      await h.asService(
        `insert into public.goal_completions (goal_id, user_id, completed_on, xp_awarded)
         values ($1, $2, '2026-01-30', 164)`,
        [goalId, user],
      );
      expect((await xpOf(user)).total_xp).toBe(204);

      // The point of a separate table: a rescore replays xp_awarded from tier
      // points and would have wiped goal XP written into that column.
      const daily = await h.asService<{ xp_awarded: number }>(
        'select xp_awarded from public.daily_scores where user_id = $1',
        [user],
      );
      expect(daily[0]!.xp_awarded).toBe(40);
    });

    it('survives a rescore of the day that completed it', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await h.asService(
        `insert into public.daily_scores (user_id, local_date, total, xp_awarded)
         values ($1, '2026-01-30', 1000, 40)`,
        [user],
      );
      await h.asService(
        `insert into public.goal_completions (goal_id, user_id, completed_on, xp_awarded)
         values ($1, $2, '2026-01-30', 164)`,
        [goalId, user],
      );
      // Apple revises the day downward; the day rescores.
      await h.asService(
        `update public.daily_scores set total = 200, xp_awarded = 10
         where user_id = $1 and local_date = '2026-01-30'`,
        [user],
      );
      expect((await xpOf(user)).total_xp).toBe(174);
    });

    it('recomputes rather than increments, so a repeated latch is idempotent', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      for (let i = 0; i < 3; i++) {
        await h.asService(
          `insert into public.goal_completions (goal_id, user_id, completed_on, xp_awarded)
           values ($1, $2, '2026-01-30', 164)
           on conflict (goal_id, user_id) do nothing`,
          [goalId, user],
        );
      }
      expect((await xpOf(user)).total_xp).toBe(164);
    });

    it('derives a level that agrees with kairo-core', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await h.asService(
        `insert into public.goal_completions (goal_id, user_id, completed_on, xp_awarded)
         values ($1, $2, '2026-01-30', 500)`,
        [goalId, user],
      );
      const state = await xpOf(user);
      expect(state.level).toBe(levelForXp(500));
    });

    it('follows the goal being deleted', async () => {
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await h.asService(
        `insert into public.goal_completions (goal_id, user_id, completed_on, xp_awarded)
         values ($1, $2, '2026-01-30', 164)`,
        [goalId, user],
      );
      expect((await xpOf(user)).total_xp).toBe(164);
      await h.asUser(user, 'select public.abandon_goal($1)', [goalId]);
      expect((await xpOf(user)).total_xp).toBe(0);
    });
  });

  describe('erasure', () => {
    it('takes a personal goal with the account, leaving nothing behind', async () => {
      // `created_by` stopped cascading in 20260811140000 so that a shared goal
      // survives its author. A personal goal has nobody to survive *for*, and
      // an orphan row is that user's content outliving their erasure — so the
      // deletion trigger collects it instead.
      const user = await h.createUser();
      const goalId = await personalGoal(user);
      await h.asService(
        `insert into public.goal_completions (goal_id, user_id, completed_on, xp_awarded)
         values ($1, $2, '2026-01-30', 164)`,
        [goalId, user],
      );
      await h.asService('delete from public.profiles where id = $1', [user]);
      const rows = await h.asService<{ goals: number; parts: number; comps: number }>(
        `select
           (select count(*)::int from public.goals where id = $1) as goals,
           (select count(*)::int from public.goal_participants where goal_id = $1) as parts,
           (select count(*)::int from public.goal_completions where goal_id = $1) as comps`,
        [goalId],
      );
      expect(rows[0]).toEqual({ goals: 0, parts: 0, comps: 0 });
    });

    it('leaves a goal alone when somebody else is still on it', async () => {
      // The other half of the same rule, and the reason the cleanup above is
      // scoped rather than "delete goals with no participants".
      const { leader, squadId } = await seedSquad(1);
      const others = await h.asService<{ user_id: string }>(
        'select user_id from public.squad_members where squad_id = $1 and user_id <> $2',
        [squadId, leader],
      );
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Shared', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );

      await h.asService('delete from public.profiles where id = $1', [leader]);

      const rows = await h.asService<{ created_by: string | null }>(
        'select created_by from public.goals where id = $1',
        [goal[0]!.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.created_by).toBeNull();
      const parts = await h.asService(
        'select 1 from public.goal_participants where goal_id = $1 and user_id = $2',
        [goal[0]!.id, others[0]!.user_id],
      );
      expect(parts).toHaveLength(1);
    });

    it('cascades a squad goal when the squad is deleted', async () => {
      const { leader, squadId } = await seedSquad(0);
      const goal = await h.asUser<{ id: string }>(
        leader,
        `select id from public.create_goal('Doomed', null, 'cumulative', 1000,
           '2026-01-01'::date, '2026-01-30'::date, null, $1)`,
        [squadId],
      );
      await h.asService('delete from public.squads where id = $1', [squadId]);
      const rows = await h.asService('select id from public.goals where id = $1', [
        goal[0]!.id,
      ]);
      expect(rows).toEqual([]);
    });
  });
});

describe('profiles.character_body', () => {
  it('exists and is nullable', async () => {
    const rows = await h.asService<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'character_body'`,
    );
    // NULL means "never asked", which is what every profile created before
    // this column genuinely is. A not-null default would backfill an
    // assertion nobody made.
    expect(rows[0]!.is_nullable).toBe('YES');
    expect(rows[0]!.data_type).toBe('text');
  });

  it('accepts male and female', async () => {
    const user = await h.createUser();
    await h.asService(
      `update public.profiles set character_body = 'female' where id = $1`,
      [user],
    );
    const rows = await h.asService<{ character_body: string }>(
      `select character_body from public.profiles where id = $1`,
      [user],
    );
    expect(rows[0]!.character_body).toBe('female');
  });

  it("rejects a value outside the CHECK, including sex's 'other'", async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `update public.profiles set character_body = 'other' where id = $1`,
        [user],
      ),
      /character_body/,
    );
  });

  it('lets a client set it on their own row', async () => {
    const user = await h.createUser();
    await h.asUser(
      user,
      `update public.profiles set character_body = 'male' where id = $1`,
      [user],
    );
    const rows = await h.asService<{ character_body: string }>(
      `select character_body from public.profiles where id = $1`,
      [user],
    );
    expect(rows[0]!.character_body).toBe('male');
  });

  it('still refuses server-awarded columns after the grant rebuild', async () => {
    // The rebuild rewrites the whole column list. This is the half a careless
    // rebuild gets wrong: widening the grant past what was intended.
    const user = await h.createUser();
    await rejects(
      h.asUser(user, `update public.profiles set level = 99 where id = $1`, [user]),
      /permission denied/i,
    );
  });

  it('is in the column-scoped INSERT grant', async () => {
    const rows = await h.asService<{ column_name: string }>(
      `select distinct column_name from information_schema.column_privileges
       where table_name = 'profiles' and grantee = 'authenticated'
         and privilege_type = 'INSERT' order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'birth_year',
      'character_body',
      'character_name',
      'class',
      'exclude_from_recap',
      'height_cm',
      'id',
      'sex',
      'timezone',
      'weight_kg',
    ]);
  });
});

describe('telemetry and device tokens belong to the account, not the character', () => {
  // Both tables originally referenced `public.profiles`, which does not exist
  // for a user until onboarding finishes. Every write between sign-in and
  // profile creation therefore failed 23503 — observed on device 2026-08-11:
  //
  //   [telemetry] app_open 23503 ... violates "app_events_user_id_fkey"
  //   [notifications] token registration failed 23503 ... "device_tokens_user_id_fkey"
  //
  // The cost was never the dropped row. It is that the sign-in -> abandon
  // funnel could not be measured *at all*: a user who never names a character
  // produced no events by construction, so the one drop-off a beta most wants
  // to count was structurally invisible. A push token and a telemetry event
  // belong to an account and a device; neither is a property of the character.

  async function bareAuthUser(email: string): Promise<string> {
    const rows = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    return rows[0]!.id;
  }

  it('records an app_open for a signed-in user who has no profile yet', async () => {
    const id = await bareAuthUser('pre-profile-event@example.test');

    await h.asUser(
      id,
      `insert into public.app_events (user_id, type) values ($1, 'app_open')`,
      [id],
    );

    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from public.app_events where user_id = $1`,
      [id],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('registers a device token before the profile exists', async () => {
    const id = await bareAuthUser('pre-profile-token@example.test');

    await h.asUser(
      id,
      `insert into public.device_tokens (token, user_id, platform)
       values ('ExponentPushToken[pre-profile]', $1, 'ios')`,
      [id],
    );

    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from public.device_tokens where user_id = $1`,
      [id],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('still erases both when the account is deleted', async () => {
    // The cascade `profiles` was giving was always transitive — deleting an
    // auth.users row cascades to profiles, which cascaded onward to these.
    // Pointing straight at auth.users keeps erasure and removes the middleman,
    // so this asserts the guarantee did not move.
    const id = await bareAuthUser('erasure-probe@example.test');
    await h.asService(
      `insert into public.app_events (user_id, type) values ($1, 'app_open')`,
      [id],
    );
    await h.asService(
      `insert into public.device_tokens (token, user_id, platform)
       values ('ExponentPushToken[erasure]', $1, 'ios')`,
      [id],
    );

    await h.asService('delete from auth.users where id = $1', [id]);

    // `on delete cascade` — the token is gone with the account.
    const tokens = await h.asService<{ n: number }>(
      `select count(*)::int as n from public.device_tokens where user_id = $1`,
      [id],
    );
    expect(tokens[0]!.n).toBe(0);

    // `on delete set null` — the event survives, de-identified. Telemetry is
    // aggregate; keeping the row without an owner is the point of that rule.
    const orphaned = await h.asService<{ n: number }>(
      `select count(*)::int as n from public.app_events
       where user_id is null and type = 'app_open'`,
    );
    expect(orphaned[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it('targets auth.users rather than public.profiles', async () => {
    const rows = await h.asService<{ table_name: string; foreign_table: string }>(
      `select c.conrelid::regclass::text as table_name,
              c.confrelid::regclass::text as foreign_table
         from pg_constraint c
        where c.conname in ('app_events_user_id_fkey', 'device_tokens_user_id_fkey')
        order by table_name`,
    );
    expect(rows).toEqual([
      { table_name: 'app_events', foreign_table: 'auth.users' },
      { table_name: 'device_tokens', foreign_table: 'auth.users' },
    ]);
  });
});
