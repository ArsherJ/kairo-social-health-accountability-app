import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, isFinalizable, mostRecentlyCompletedLocalDate } from '../../packages/kairo-core/src/day.ts';
import {
  DEFAULT_SQUAD_PROGRAM,
  SQUAD_PROGRAMS,
  weightedBoardTotal,
} from '../../packages/kairo-core/src/program.ts';
import { levelForXp, ratingForStatPoints } from '../../packages/kairo-core/src/progression.ts';
import { squadTopic } from '../../src/features/squad/squad-topic.ts';
import {
  DAILY_SLEEP_COLUMNS,
  WORKOUT_SESSION_COLUMNS,
} from '../functions/_shared/scoring-inputs.ts';
import {
  pairCandidates,
  replayLifecycle,
  REPLAY_PROFILE_SELECT,
  REPLAY_SCORE_SELECT,
  type ReplayProfileRow,
  type ReplayScoreRow,
} from '../functions/_shared/replay-plan.ts';
import { planDay } from '../functions/_shared/sync-plan.ts';
import { setupHarness, type Harness } from './harness.ts';
// The replay dry run's own board query, imported rather than retyped: a copy
// here would be a second thing to keep in step with the script, which is the
// drift this test exists to catch.
import { BOARD_TOTAL_SQL } from '../../scripts/replay-dry-run.mjs';

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

describe('workout_sessions', () => {
  async function logSession(
    user: string,
    overrides: { hkUuid?: string; localDate?: string; activityType?: number; kcal?: number } = {},
  ) {
    await h.asService(
      `insert into public.workout_sessions
         (user_id, hk_uuid, local_date, started_at, ended_at, activity_type,
          duration_s, distance_m, active_kcal)
       values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, 2700, 7400.5, $7)
       on conflict (user_id, hk_uuid) do update
         set active_kcal = excluded.active_kcal,
             local_date  = excluded.local_date`,
      [
        user,
        overrides.hkUuid ?? 'HK-1',
        overrides.localDate ?? '2026-07-27',
        '2026-07-27T09:00:00Z',
        '2026-07-27T09:45:00Z',
        overrides.activityType ?? 37,
        overrides.kcal ?? 512.25,
      ],
    );
  }

  it('upserts on Apple’s own sample uuid rather than duplicating', async () => {
    // The idempotency property the whole ingest rests on: a re-synced window
    // re-sends the same workouts, and a workout Apple later revises has to
    // flow through the way retroactive step revisions already do.
    const user = await h.createUser();
    await logSession(user);
    await logSession(user, { kcal: 540 });

    const rows = await h.asService<{ active_kcal: string }>(
      'select active_kcal from public.workout_sessions where user_id = $1',
      [user],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.active_kcal)).toBe(540);
  });

  it('keeps sessions owner-readable and client-unwritable', async () => {
    const owner = await h.createUser();
    const stranger = await h.createUser();
    await logSession(owner);

    const own = await h.asUser(owner, 'select hk_uuid from public.workout_sessions');
    expect(own).toHaveLength(1);

    // A pace is at least as identifying as the hourly movement §5 protects: it
    // carries fitness, and with distance it carries routine.
    const theirs = await h.asUser(stranger, 'select hk_uuid from public.workout_sessions');
    expect(theirs).toHaveLength(0);

    await rejects(
      h.asUser(
        owner,
        `insert into public.workout_sessions
           (user_id, hk_uuid, local_date, started_at, ended_at, activity_type, duration_s)
         values ($1, 'FAKE', '2026-07-28', now(), now(), 37, 60)`,
        [owner],
      ),
      /permission denied/i,
    );
  });

  it('grants authenticated nothing beyond SELECT', async () => {
    // ALL includes TRUNCATE, which RLS does not restrict — so the migration
    // revokes the table grant and re-grants only SELECT.
    const rows = await h.asService<{ privs: string }>(
      `select string_agg(distinct privilege_type, ',' order by privilege_type) as privs
       from information_schema.table_privileges
       where table_name = 'workout_sessions' and grantee = 'authenticated'`,
    );
    expect(rows[0]!.privs).toBe('SELECT');
  });

  it('rejects negative measurements', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(
        `insert into public.workout_sessions
           (user_id, hk_uuid, local_date, started_at, ended_at, activity_type,
            duration_s, distance_m)
         values ($1, 'NEG', '2026-07-27', now(), now(), 37, 60, -1)`,
        [user],
      ),
      /check constraint/i,
    );
  });

  it('appears in no squad projection', async () => {
    // §3.2: this table is owner-only and must stay out of every RPC that
    // projects one member's data to another. Asserted against the function
    // bodies, because a leak would be added there and nowhere else.
    const rows = await h.asService<{ name: string }>(
      `select p.proname as name
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          -- Plain functions only. pg_get_functiondef raises on aggregates,
          -- and an aggregate cannot project a table in any case.
          and p.prokind = 'f'
          and pg_get_functiondef(p.oid) ilike '%workout_sessions%'`,
    );
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it('cascades a deleted account', async () => {
    const user = await h.createUser();
    await logSession(user);
    await h.asService('delete from public.profiles where id = $1', [user]);
    const rows = await h.asService('select 1 from public.workout_sessions where user_id = $1', [
      user,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('challenge_completions', () => {
  async function clearChallenge(
    user: string,
    overrides: { area?: string; localDate?: string; xp?: number } = {},
  ) {
    await h.asService(
      `insert into public.challenge_completions (user_id, area, local_date, target, xp_awarded)
       values ($1, $2, $3, $4::jsonb, $5)
       on conflict (user_id, area, local_date) do nothing`,
      [
        user,
        overrides.area ?? 'run',
        overrides.localDate ?? '2026-07-27',
        JSON.stringify({ area: 'run', kind: 'target', minDistanceM: 5000, paceSecPerKm: 291 }),
        overrides.xp ?? 40,
      ],
    );
  }

  it('latches one clear per area per local day', async () => {
    // Two qualifying sessions on the same day clear the same challenge once.
    const user = await h.createUser();
    await clearChallenge(user, { xp: 40 });
    await clearChallenge(user, { xp: 999 });

    const rows = await h.asService<{ xp_awarded: number }>(
      'select xp_awarded from public.challenge_completions where user_id = $1',
      [user],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.xp_awarded).toBe(40);
  });

  it('lets the two areas clear independently on one day', async () => {
    const user = await h.createUser();
    await clearChallenge(user, { area: 'run' });
    await clearChallenge(user, { area: 'strength' });
    const rows = await h.asService('select 1 from public.challenge_completions where user_id = $1', [
      user,
    ]);
    expect(rows).toHaveLength(2);
  });

  it('rejects an area outside the two', async () => {
    const user = await h.createUser();
    await rejects(clearChallenge(user, { area: 'yoga' }), /check constraint/i);
  });

  it('keeps completions owner-readable and client-unwritable', async () => {
    const owner = await h.createUser();
    const stranger = await h.createUser();
    await clearChallenge(owner);

    expect(await h.asUser(owner, 'select area from public.challenge_completions')).toHaveLength(1);
    expect(await h.asUser(stranger, 'select area from public.challenge_completions')).toHaveLength(
      0,
    );

    await rejects(
      h.asUser(
        owner,
        `insert into public.challenge_completions (user_id, area, local_date, target, xp_awarded)
         values ($1, 'run', '2026-07-28', '{}'::jsonb, 9999)`,
        [owner],
      ),
      /permission denied/i,
    );
  });

  it('grants authenticated nothing beyond SELECT', async () => {
    const rows = await h.asService<{ privs: string }>(
      `select string_agg(distinct privilege_type, ',' order by privilege_type) as privs
       from information_schema.table_privileges
       where table_name = 'challenge_completions' and grantee = 'authenticated'`,
    );
    expect(rows[0]!.privs).toBe('SELECT');
  });

  it('rolls challenge XP into total_xp as a THIRD source', async () => {
    // Not written to daily_scores.xp_awarded, which a rescore would replay and
    // silently wipe — the trap deviation #19 records for goals.
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, agi_points, xp_awarded)
       values ($1, '2026-07-27', 900, 100)`,
      [user],
    );
    await clearChallenge(user, { xp: 40 });

    const rows = await h.asService<{ total_xp: number }>(
      'select total_xp from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.total_xp).toBe(140);
  });

  it('recomputes rather than increments, so a re-run cannot double-pay', async () => {
    const user = await h.createUser();
    await clearChallenge(user, { xp: 40 });
    // Touch the row again: the trigger fires on UPDATE too, and a full
    // recompute must land on the same number an increment would inflate.
    await h.asService(
      `update public.challenge_completions set xp_awarded = 40 where user_id = $1`,
      [user],
    );
    const rows = await h.asService<{ total_xp: number }>(
      'select total_xp from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.total_xp).toBe(40);
  });

  it('does not fold challenge XP into any ability rating', async () => {
    // A cleared challenge is not activity in a stat; folding it into one would
    // inflate an ability the user never trained.
    const user = await h.createUser();
    await clearChallenge(user, { xp: 40 });
    const rows = await h.asService<{ agi_total: number; str_total: number }>(
      'select agi_total, str_total from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.agi_total).toBe(0);
    expect(rows[0]!.str_total).toBe(0);
  });

  it('cascades a deleted account without aborting the delete', async () => {
    // The AFTER trigger reaches profiles, which is already gone by the time the
    // cascade arrives here — so recalculate_user_xp matches no row and the
    // update is a harmless no-op. A BEFORE trigger here would abort the delete.
    const user = await h.createUser();
    await clearChallenge(user);
    await h.asService('delete from public.profiles where id = $1', [user]);
    const rows = await h.asService(
      'select 1 from public.challenge_completions where user_id = $1',
      [user],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('challenge opt-in columns', () => {
  it('defaults both areas off', async () => {
    // Nobody meets a permanently unmet card for something they do not do.
    const user = await h.createUser();
    const rows = await h.asService<{ trains_run: boolean; trains_strength: boolean }>(
      'select trains_run, trains_strength from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.trains_run).toBe(false);
    expect(rows[0]!.trains_strength).toBe(false);
  });

  it('lets a user opt themselves in', async () => {
    const user = await h.createUser();
    await h.asUser(user, 'update public.profiles set trains_run = true where id = $1', [user]);
    const rows = await h.asService<{ trains_run: boolean }>(
      'select trains_run from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.trains_run).toBe(true);
  });

  it('still refuses the derived columns after the revoke and re-grant', async () => {
    // The trap: a column-level REVOKE against a table-level GRANT is silently a
    // no-op, so the migration revokes the table grant and re-grants the list.
    // Getting that wrong fails open, which is what this asserts against.
    const user = await h.createUser();
    // Values typed per column, so a type error cannot masquerade as the
    // permission error this is actually asserting.
    const derived: Array<[string, string]> = [
      ['total_xp', '1'],
      ['level', '1'],
      ['agi_total', '1'],
      ['has_wearable', 'true'],
      ['is_legendary', 'true'],
    ];
    for (const [column, value] of derived) {
      await rejects(
        h.asUser(user, `update public.profiles set ${column} = ${value} where id = $1`, [user]),
        /permission denied/i,
      );
    }
  });
});

describe('per-stat ability rollups', () => {
  // Three rollups, matching CoreStat. `end_total` and `vit_total` were dropped
  // by 20260819150000 along with the columns that fed them — a fixture naming
  // either would fail at the SQL, which is the point of selecting them by name
  // rather than `select *`.
  async function ratings(userId: string) {
    const rows = await h.asService<{
      agi_total: number; str_total: number; mnd_total: number;
    }>(
      `select agi_total, str_total, mnd_total
       from public.profiles where id = $1`,
      [userId],
    );
    return rows[0]!;
  }

  async function setDayStats(
    userId: string,
    date: string,
    stats: { agi: number; str: number; mnd: number; xp?: number },
  ) {
    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, str_points, mind_points, xp_awarded)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, local_date) do update set
         agi_points = excluded.agi_points,
         str_points = excluded.str_points,
         mind_points = excluded.mind_points,
         xp_awarded = excluded.xp_awarded`,
      [userId, date, stats.agi, stats.str, stats.mnd, stats.xp ?? 0],
    );
  }

  it('starts at zero, which reads as rating 1', async () => {
    const user = await h.createUser();
    expect(await ratings(user)).toEqual({
      agi_total: 0, str_total: 0, mnd_total: 0,
    });
  });

  it('sums each stat across days independently', async () => {
    const user = await h.createUser();
    await setDayStats(user, '2026-07-26', { agi: 900, str: 200, mnd: 500 });
    await setDayStats(user, '2026-07-27', { agi: 500, str: 200, mnd: 0 });
    expect(await ratings(user)).toEqual({
      agi_total: 1_400, str_total: 400, mnd_total: 500,
    });
  });

  it('recomputes rather than increments, so re-syncing a day is idempotent', async () => {
    // The property the whole design rests on. Background delivery rewrites the
    // same day repeatedly; an incrementing rollup would triple this.
    const user = await h.createUser();
    for (let i = 0; i < 3; i++) {
      await setDayStats(user, '2026-07-27', { agi: 900, str: 0, mnd: 0 });
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
    await setDayStats(user, '2026-07-27', { agi: 500, str: 0, mnd: 0, xp: 25 });
    await setDayStats(user, '2026-07-27', { agi: 620, str: 0, mnd: 0, xp: 25 });
    expect((await ratings(user)).agi_total).toBe(620);
  });

  it('follows a deleted day back down', async () => {
    const user = await h.createUser();
    await setDayStats(user, '2026-07-27', { agi: 900, str: 900, mnd: 900 });
    await h.asService('delete from public.daily_scores where user_id = $1', [user]);
    expect(await ratings(user)).toEqual({
      agi_total: 0, str_total: 0, mnd_total: 0,
    });
  });

  it('feeds a rating that agrees with kairo-core', async () => {
    // Cross-language check, the same one `level` gets: the rollup is the input
    // and `ratingForStatPoints` is the curve, and nothing in SQL may reimplement
    // the curve.
    const user = await h.createUser();
    for (const points of [0, 99, 100, 27_000, 328_500]) {
      await setDayStats(user, '2026-07-27', { agi: points, str: 0, mnd: 0 });
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

describe('daily_scores.normalization_factor', () => {
  it('exists as numeric(4,3), not null, default 1.000', async () => {
    const rows = await h.asService<{
      is_nullable: string;
      data_type: string;
      numeric_precision: number;
      numeric_scale: number;
      column_default: string;
    }>(
      `select is_nullable, data_type, numeric_precision, numeric_scale, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = 'daily_scores'
         and column_name = 'normalization_factor'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.is_nullable).toBe('NO');
    expect(rows[0]!.data_type).toBe('numeric');
    expect(rows[0]!.numeric_precision).toBe(4);
    expect(rows[0]!.numeric_scale).toBe(3);
    expect(rows[0]!.column_default).toContain('1.000');
  });

  it('defaults to 1.000 for a row that names no value — the honest reading for every row scored before deviation #41', async () => {
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_scores (user_id, local_date) values ($1, '2026-07-27')`,
      [user],
    );
    const rows = await h.asService<{ normalization_factor: string }>(
      `select normalization_factor from public.daily_scores where user_id = $1`,
      [user],
    );
    expect(Number(rows[0]!.normalization_factor)).toBe(1);
  });
});

describe('profiles.mnd_total', () => {
  it('exists as integer, not null, default 0', async () => {
    const rows = await h.asService<{
      is_nullable: string;
      data_type: string;
      column_default: string;
    }>(
      `select is_nullable, data_type, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'mnd_total'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.is_nullable).toBe('NO');
    expect(rows[0]!.data_type).toBe('integer');
    expect(rows[0]!.column_default).toContain('0');
  });

  it('starts at zero, which reads as rating 1 — same as every other stat', async () => {
    const user = await h.createUser();
    const rows = await h.asService<{ mnd_total: number }>(
      'select mnd_total from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.mnd_total).toBe(0);
  });

  it('is maintained by the widened recalculate_user_xp, the same way agi_total is', async () => {
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, mind_points, xp_awarded)
       values ($1, '2026-07-27', 620, 25)`,
      [user],
    );
    const rows = await h.asService<{ mnd_total: number }>(
      'select mnd_total from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.mnd_total).toBe(620);
  });

  it('follows a same-tier rescore that leaves every other column untouched', async () => {
    // The trigger's skip guard (daily_scores_xp_rollup) tests every column the
    // rollup reads before deciding to skip recalculate_user_xp. It had to widen
    // by exactly one column the moment the rollup started reading mind_points —
    // otherwise a day whose mind_points moves while xp_awarded, agi_points and
    // str_points all hold steady would skip the recompute and leave mnd_total
    // silently stale. (The guard named end_points and vit_points too until
    // 20260819150000 dropped them.) Same shape as the AGI
    // regression above, for the column that just joined the rollup.
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, mind_points, xp_awarded)
       values ($1, '2026-07-27', 500, 25)`,
      [user],
    );
    await h.asService(
      `update public.daily_scores set mind_points = 620 where user_id = $1`,
      [user],
    );
    const rows = await h.asService<{ mnd_total: number }>(
      'select mnd_total from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.mnd_total).toBe(620);
  });

  it('is not client-writable — an ability cannot be minted', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'update public.profiles set mnd_total = 999999 where id = $1', [user]),
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

  function rowFor(userId: string, earnableStats = 3) {
    return planDay({
      userId,
      localDate: '2026-07-27',
      timeZone: 'Asia/Manila',
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: BUCKETS,
      hadWorkoutHours: new Set(),
      elevatedHeartRateHours: new Set(),
      sleepMinutes: 420,
      // The day sleeps, so three stats are earnable and the factor is 1.0.
      // `verifiedWorkoutMinutes` is zero because this fixture logs no workout,
      // which is a real answer rather than an omission — both fields are
      // required on DayPlanInput for exactly that distinction.
      earnableStats,
      verifiedStrengthMinutes: 0,
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

  it('stores the normalization factor the planner applied', async () => {
    // The column is numeric(4,3) and the phone-only factor is 3/2, so this
    // also proves the precision is wide enough for the only two values §2 can
    // produce. A silently truncated factor would be indistinguishable from
    // normalization never having been wired — the failure this task removes.
    const user = await h.createUser();
    const row = rowFor(user, 2);
    expect(row.normalization_factor).toBeCloseTo(1.5, 5);

    await insertPlannedRow(row as unknown as Record<string, unknown>);

    const stored = await h.asService<{ normalization_factor: string }>(
      'select normalization_factor from public.daily_scores where user_id = $1',
      [user],
    );
    expect(Number(stored[0]!.normalization_factor)).toBeCloseTo(1.5, 5);
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
    // 19 as of 20260830090000_race_results.sql. A number that moves without a
    // migration in the same commit is a table somebody added without deciding
    // whether it needs RLS — which is what the next case asks about.
    expect(rows[0]!.count).toBe(19);
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

  it('exposes tiers, totals and the four gated daily sums — but nothing hourly', async () => {
    // **This assertion was reversed by deviation #47 and that is deliberate.**
    // It used to list `steps`, `distance_m` and `active_kcal` as forbidden
    // columns. The race needs each member's daily total in raw units, so those
    // three plus `sleep_minutes` are now projected — behind the reciprocal
    // consent gate asserted in its own describe block below.
    //
    // What did NOT change is the line the projection actually defends:
    // `active_minutes` and `hour` are still absent, because the difference
    // between a day's total and a movement pattern is the whole of §5.
    const { leader, squadId } = await seedSquad();
    const rows = await h.asUser<Record<string, unknown>>(
      leader,
      'select * from public.squad_leaderboard($1)',
      [squadId],
    );
    const columns = Object.keys(rows[0]!);
    for (const forbidden of ['active_minutes', 'hour', 'avg_heart_rate']) {
      expect(columns).not.toContain(forbidden);
    }
    expect(columns).toContain('tiers');
    expect(columns).toContain('total');
    expect(columns).toContain('steps');
    expect(columns).toContain('sleep_minutes');
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

/**
 * The widened projection and its reciprocal, per-row consent gate.
 *
 * Spec §4.5 of the parent design gated per *squad*: nobody sees anything until
 * everybody has agreed. This is per row and reciprocal instead — a member's
 * totals are visible only when that member has consented AND the viewer has —
 * because whole-squad gating leaks the holdout's decision to the five people
 * who agreed and can see that something is missing.
 */
describe('squad_leaderboard raw totals (deviation #47)', () => {
  async function seedPair() {
    const alice = await h.createUser({ characterName: 'Alice' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      alice,
      `select id, invite_code from public.create_squad('Race')`,
    );
    const bob = await h.createUser({ characterName: 'Bob' });
    await h.asUser(bob, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    return { alice, bob, squadId: squad[0]!.id };
  }

  const consent = (userId: string) =>
    h.asService(
      `update public.profiles set squad_data_consent_at = now() where id = $1`,
      [userId],
    );

  /**
   * Service-role, because `health_buckets` has no client write grant at all —
   * Edge Functions own every mutation (§12), and the harness has to stand in
   * for one.
   */
  const insertBuckets = (
    userId: string,
    localDate: string,
    rows: { hour: number; steps: number; distance_m: number; active_kcal: number }[],
  ) =>
    Promise.all(
      rows.map((r) =>
        h.asService(
          `insert into public.health_buckets
             (user_id, local_date, hour, steps, distance_m, active_kcal)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (user_id, local_date, hour) do update
             set steps = excluded.steps,
                 distance_m = excluded.distance_m,
                 active_kcal = excluded.active_kcal`,
          [userId, localDate, r.hour, r.steps, r.distance_m, r.active_kcal],
        ),
      ),
    );

  const insertSleep = (userId: string, localDate: string, minutes: number) =>
    h.asService(
      `insert into public.daily_sleep (user_id, local_date, minutes)
       values ($1, $2, $3)
       on conflict (user_id, local_date) do update set minutes = excluded.minutes`,
      [userId, localDate, minutes],
    );

  const board = (viewer: string, squadId: string, day: string) =>
    h.asUser<Record<string, unknown>>(
      viewer,
      'select * from public.squad_leaderboard($1, $2)',
      [squadId, day],
    );

  const DAY = '2026-08-21';

  it('returns the four new columns in the contracted order', async () => {
    // The RPC is a set-returning function, so the row shape is pinned by
    // selecting from it rather than by reading a catalog table.
    const { alice, squadId } = await seedPair();
    const rows = await board(alice, squadId, DAY);
    expect(Object.keys(rows[0]!)).toEqual([
      'rank', 'user_id', 'character_name', 'class', 'level', 'local_date',
      'total', 'tiers', 'ratings', 'contributing_stats', 'has_rec', 'flagged',
      'status', 'current_streak', 'is_self', 'program', 'species',
      'steps', 'distance_m', 'active_kcal', 'sleep_minutes',
    ]);
  });

  it('withholds raw totals when the viewed member has not consented', async () => {
    const { alice, bob, squadId } = await seedPair();
    await consent(alice); // viewer consents; bob does not
    await insertBuckets(bob, DAY, [
      { hour: 8, steps: 3_000, distance_m: 2_100, active_kcal: 90 },
    ]);

    const rows = await board(alice, squadId, DAY);
    const bobRow = rows.find((r) => r.user_id === bob)!;
    expect(bobRow.steps).toBeNull();
    expect(bobRow.distance_m).toBeNull();
    expect(bobRow.active_kcal).toBeNull();
    expect(bobRow.sleep_minutes).toBeNull();
  });

  it('withholds raw totals from a viewer who has not consented, however many others have', async () => {
    // Reciprocity. Without it, declining is strictly dominant: you see six
    // people's figures and show none of your own.
    const { alice, bob, squadId } = await seedPair();
    await consent(bob); // the viewed member consents; alice does not
    await insertBuckets(bob, DAY, [
      { hour: 8, steps: 3_000, distance_m: 2_100, active_kcal: 90 },
    ]);

    const rows = await board(alice, squadId, DAY);
    const bobRow = rows.find((r) => r.user_id === bob)!;
    expect(bobRow.steps).toBeNull();
  });

  it("returns the day's summed totals when both sides have consented", async () => {
    const { alice, bob, squadId } = await seedPair();
    await consent(alice);
    await consent(bob);
    await insertBuckets(bob, DAY, [
      { hour: 8, steps: 3_000, distance_m: 2_100, active_kcal: 90 },
      { hour: 9, steps: 2_500, distance_m: 1_800, active_kcal: 70 },
    ]);
    await insertSleep(bob, DAY, 421);

    const rows = await board(alice, squadId, DAY);
    const bobRow = rows.find((r) => r.user_id === bob)!;
    expect(bobRow.steps).toBe(5_500);
    expect(Number(bobRow.distance_m)).toBe(3_900);
    expect(Number(bobRow.active_kcal)).toBe(160);
    expect(bobRow.sleep_minutes).toBe(421);
  });

  it('reports zero rather than null for a consenting member who has not moved', async () => {
    // Null and zero mean different things on the track: null is "not sharing"
    // and keeps the lane without a position, zero is a real day at the start
    // line. Collapsing them would make a consenting member look like a holdout.
    const { alice, bob, squadId } = await seedPair();
    await consent(alice);
    await consent(bob);

    const rows = await board(alice, squadId, DAY);
    const bobRow = rows.find((r) => r.user_id === bob)!;
    expect(bobRow.steps).toBe(0);
    // Sleep is the exception and stays null: no wearable reported a night, and
    // "0 minutes" would be a claim about sleep that was never measured.
    expect(bobRow.sleep_minutes).toBeNull();
  });

  it('still ranks by the program-weighted total, not by steps', async () => {
    // The race re-ranks on the client. The RPC's ordering must not change,
    // or the weighted board silently becomes a step board.
    const { alice, bob, squadId } = await seedPair();
    await consent(alice);
    await consent(bob);
    // Bob walks far and scores little; Alice scores well on breadth. Ranking
    // by steps would put Bob first, ranking by the weighted total puts Alice.
    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, str_points, consistency_points, total, tiers)
       values ($1, $2, 900, 1200, 800, 2900, '{"AGI":"silver"}'),
              ($3, $2, 1200, 0, 0, 1200, '{"AGI":"gold"}')`,
      [alice, DAY, bob],
    );
    await insertBuckets(bob, DAY, [
      { hour: 8, steps: 24_000, distance_m: 18_000, active_kcal: 300 },
    ]);

    const rows = await h.asUser<{ rank: string; total: number; steps: number }>(
      alice,
      'select rank, total, steps from public.squad_leaderboard($1, $2)',
      [squadId, DAY],
    );
    const totals = rows.map((r) => r.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    // And the ordering is genuinely not the step ordering — otherwise this
    // test would pass on a board that had been quietly reordered.
    expect(rows[0]!.steps).toBeLessThan(rows[1]!.steps);
  });

  it('exposes no hourly movement, heart rate or workout data', async () => {
    const rows = await h.asService<{ prosrc: string }>(
      `select prosrc from pg_proc where proname = 'squad_leaderboard'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.prosrc).not.toMatch(/workout_sessions/);
    expect(rows[0]!.prosrc).not.toMatch(/avg_heart_rate/);
    // The hour column is never selected and never grouped by, which is the
    // difference between a total and a movement pattern.
    expect(rows[0]!.prosrc).not.toMatch(/\bb\.hour\b/);
  });

  it('grants UPDATE on the consent column and on nothing new besides', async () => {
    const { alice } = await seedPair();
    await h.asUser(
      alice,
      `update public.profiles set squad_data_consent_at = now() where id = $1`,
      [alice],
    );
    // The table-level revoke that precedes the column grant must not have
    // widened anything: a rollup stays unwritable from the client.
    await rejects(
      h.asUser(alice, 'update public.profiles set agi_total = 999999 where id = $1', [
        alice,
      ]),
      /permission denied/,
    );
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
      'quest_tier_override',
      'sex',
      'species',
      'squad_data_consent_at',
      'timezone',
      'trains_run',
      'trains_strength',
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

describe('stat_records()', () => {
  /** Two days of buckets and one night, so every stat has a clear winner. */
  async function seedRecords(user: string): Promise<void> {
    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps, active_kcal)
       values ($1, '2026-07-27', 7, 4000, 100),
              ($1, '2026-07-27', 8, 3000, 120),
              ($1, '2026-07-28', 7, 9000, 90)`,
      [user],
    );
    await h.asService(
      `insert into public.daily_sleep (user_id, local_date, minutes, was_user_entered)
       values ($1, '2026-07-27', 400, false), ($1, '2026-07-28', 380, false)`,
      [user],
    );
  }

  it('returns the best day per stat, in raw units, with its date', async () => {
    const user = await h.createUser();
    await seedRecords(user);

    const rows = await h.asUser<{ stat: string; value: string; local_date: string }>(
      user,
      // `::text` because PGlite hands a `date` back as a JS Date rendered in
      // the runner's own zone, so a raw comparison passes or fails depending on
      // where the test is run.
      'select stat, value, local_date::text as local_date from public.stat_records() order by stat',
    );
    const by = Object.fromEntries(rows.map((r) => [r.stat, r]));

    // Motion is the 9,000 day, not the 7,000 day that had more hours in it.
    expect(Number(by.AGI!.value)).toBe(9_000);
    expect(by.AGI!.local_date).toBe('2026-07-28');
    // Body sums the day: 100 + 120 beats the single 90.
    expect(Number(by.STR!.value)).toBe(220);
    expect(Number(by.MND!.value)).toBe(400);
  });

  it('omits a stat with no qualifying day rather than reporting zero', async () => {
    // "No record yet" and "a record of zero" are different things, and only one
    // of them is true. A zero row would let a surface congratulate somebody on
    // a best night they have never had.
    const user = await h.createUser();
    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps, active_kcal)
       values ($1, '2026-07-27', 7, 5000, 0)`,
      [user],
    );
    const rows = await h.asUser<{ stat: string }>(
      user,
      'select stat from public.stat_records()',
    );
    expect(rows.map((r) => r.stat).sort()).toEqual(['AGI']);
  });

  // The same gate `scoringSleepMinutes` applies. Without it somebody types a
  // fourteen-hour night once and holds a record they did not sleep.
  it('ignores a hand-typed night', async () => {
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_sleep (user_id, local_date, minutes, was_user_entered)
       values ($1, '2026-07-27', 360, false), ($1, '2026-07-28', 840, true)`,
      [user],
    );
    const rows = await h.asUser<{ stat: string; value: string }>(
      user,
      "select stat, value from public.stat_records() where stat = 'MND'",
    );
    expect(Number(rows[0]!.value)).toBe(360);
  });

  // It takes no argument precisely so this cannot be got wrong — there is no
  // parameter to point at somebody else. A personal best must never be
  // reachable from another account: headroom pays the character, not the rank.
  it('returns only the caller own records', async () => {
    const mine = await h.createUser();
    const theirs = await h.createUser();
    await seedRecords(theirs);

    const rows = await h.asUser<{ stat: string }>(
      mine,
      'select stat from public.stat_records()',
    );
    expect(rows).toHaveLength(0);
  });
});

describe('has_sleep_source is server-observed', () => {
  it('blocks a client from claiming a sleep source it does not have', async () => {
    // This column decides which quests get drawn, and `finalize-days` grades
    // against it. Client-writable would let a forged client deal itself sleep
    // quests it cannot clear — or, worse, hide the ones it can and quietly
    // change what the grader pays. Same posture as `has_wearable` below, and
    // enforced the same way: it is simply absent from the column-level UPDATE
    // grant, because a column-level REVOKE against a table-level GRANT is a
    // silent no-op in Postgres.
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'update public.profiles set has_sleep_source = true where id = $1', [
        user,
      ]),
      /permission denied/i,
    );
  });

  it('defaults to false, which withholds an unclearable quest', async () => {
    // The safe direction. `true` by default would deal `starter-sleep-360` to
    // exactly the phone-only accounts this column exists to protect, on day
    // one, with no route to clearing it.
    const user = await h.createUser();
    const rows = await h.asService<{ has_sleep_source: boolean }>(
      'select has_sleep_source from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.has_sleep_source).toBe(false);
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
      `select id from public.create_squad('Locked In', 'strength')`,
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
      mind?: number;
      consistency?: number;
      factor?: number;
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
         (user_id, local_date, agi_points, str_points, mind_points,
          consistency_points, normalization_factor, total)
       values ($1, '2026-07-27', $2, $3, $4, $5, $6, 0)`,
      [
        leader,
        day.agi,
        day.str,
        day.mind ?? 0,
        day.consistency ?? 0,
        day.factor ?? 1,
      ],
    );
    const rows = await h.asUser<{ total: number; program: string }>(
      leader,
      `select total, program from public.squad_leaderboard($1, '2026-07-27'::date)`,
      [squadId],
    );
    return rows[0]!;
  }

  // A three-stat day: AGI gold, STR silver, MND bronze, and full breadth.
  // `end`/`vit`/`rec` are absent because 20260819150000 dropped the columns —
  // naming one here would fail at the SQL rather than quietly summing a zero.
  // MND is non-zero on purpose — the board did not pass mind_points at all
  // until 20260819140000, so a fixture that left it 0 would pass either way.
  const DAY = {
    agi: 1_200,
    str: 650,
    mind: 250,
    consistency: 800,
  };

  it('leaves an all_around board unweighted', async () => {
    expect((await boardWith('all_around', DAY)).total).toBe(2_900);
  });

  it('boosts AGI on a running board', async () => {
    expect((await boardWith('running', DAY)).total).toBe(3_500);
  });

  it('boosts STR on a strength board', async () => {
    expect((await boardWith('strength', DAY)).total).toBe(3_225);
  });

  // Walking boosted VIT until deviation #41 retired that stat; its
  // hourly-movement signal now lowers AGI's bands instead. A walking board
  // weighting p_vit would be weighting a column nothing writes.
  it('boosts AGI on a walking board', async () => {
    const agiOnly = { agi: 1_200, str: 0 };
    expect((await boardWith('walking', agiOnly)).total).toBe(1_800);
  });

  it('boosts MND on a recovery board', async () => {
    // 1,200 + 650 + (250 x 1.5) + 800.
    expect((await boardWith('recovery', DAY)).total).toBe(3_025);
  });

  it('counts MND on every program, not only recovery', async () => {
    // The board passed no mind_points at all until 20260819140000, so a Gold
    // night was 1,200 stored points the ranking number could not see — on
    // every program. Compared against the same day with MND zeroed, because a
    // single expected constant would not say which half moved.
    for (const program of SQUAD_PROGRAMS) {
      const withSleep = await boardWith(program, { ...DAY, mind: 1_200 });
      const withoutSleep = await boardWith(program, { ...DAY, mind: 0 });
      const weight = program === 'recovery' ? 1.5 : 1;
      expect(withSleep.total - withoutSleep.total).toBe(1_200 * weight);
    }
  });

  it('applies normalization, so a phone-only day ranks at its real total', async () => {
    // §2's whole purpose: two Gold stats scaled by 1.5 rank level with three
    // Gold stats scaled by 1. The board re-sums the per-stat columns rather
    // than reading daily_scores.total, so the factor has to reach it or the
    // gradient survives on the one surface §2 names.
    const phoneOnly = await boardWith('all_around', {
      agi: 1_200,
      str: 1_200,
      mind: 0,
      consistency: 800,
      factor: 1.5,
    });
    const wearable = await boardWith('all_around', {
      agi: 1_200,
      str: 1_200,
      mind: 1_200,
      consistency: 800,
      factor: 1,
    });

    expect(phoneOnly.total).toBe(4_400);
    expect(wearable.total).toBe(4_400);
  });

  it('leaves the consistency bonus outside normalization', async () => {
    // breadthBonus already accounts for earnable stats, so scaling the bonus
    // as well would apply one correction twice — 1,800 + 800, not 3,900.
    const day = await boardWith('all_around', {
      agi: 1_200,
      str: 0,
      mind: 0,
      consistency: 800,
      factor: 1.5,
    });
    expect(day.total).toBe(2_600);
  });

  it('reports the squad’s program on every row', async () => {
    expect((await boardWith('strength', DAY)).program).toBe('strength');
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
    // A runner and a lifter with identical raw totals. On a strength board the
    // lifter wins; the stored rows are untouched either way.
    const lifter = await h.createUser({ characterName: 'Lifter' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      lifter,
      `select id, invite_code from public.create_squad('Gym Rats', 'strength')`,
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
  //
  // `end` and `vit` are gone from the fixtures because 20260819150000 dropped
  // the parameters with the columns. They were pinned at 0 while they lasted
  // for a reason worth keeping in mind next time: `weightedBoardTotal` takes a
  // Record<CoreStat, number>, so any value the SQL side could see and the
  // TypeScript side could not would have made this differential diverge by
  // exactly those points — which is what a differential is supposed to catch,
  // not what it is supposed to be fed.
  //
  // `rec` stays. The column is gone and squad_leaderboard passes 0, but both
  // implementations still carry the term as a universal bonus, so the fixtures
  // exercise it with real values — a term dropped on one side only is a
  // divergence this test cannot see.
  //
  // `mind` and `factor` carry real values. They were 0 and absent while
  // program_weighted_total had no p_mind and no p_factor, which meant the two
  // parameters that actually differ between the four-stat and three-stat
  // models were the two this differential could not see.
  const FIXTURES = [
    { agi: 0, str: 0, mind: 0, consistency: 0, rec: 0, factor: 1 },
    { agi: 1_200, str: 650, mind: 250, consistency: 800, rec: 0, factor: 1 },
    { agi: 1_200, str: 1_200, mind: 1_200, consistency: 800, rec: 500, factor: 1 },
    // Phone-only: two stats earned, scaled by 3/2. The one shape §2 exists for.
    { agi: 1_200, str: 1_200, mind: 0, consistency: 800, rec: 0, factor: 1.5 },
    { agi: 650, str: 250, mind: 650, consistency: 400, rec: 0, factor: 1 },
    // Odd points force the .5 that round() has to resolve identically on both
    // sides. These cannot come out of the tier table, but nothing stops a
    // future one from producing them. The 1.5 factor stacks with the 1.5
    // program boost, so the .5 has to survive two multiplications.
    { agi: 125, str: 375, mind: 125, consistency: 0, rec: 0, factor: 1.5 },
    { agi: 1, str: 1, mind: 1, consistency: 0, rec: 0, factor: 1.5 },
  ];

  it('matches weightedBoardTotal for every program on every fixture day', async () => {
    for (const program of SQUAD_PROGRAMS) {
      for (const f of FIXTURES) {
        const rows = await h.asService<{ total: number }>(
          `select public.program_weighted_total($1, $2, $3, $4, $5, $6, $7) as total`,
          [program, f.agi, f.str, f.mind, f.consistency, f.rec, f.factor],
        );
        expect({ program, ...f, total: rows[0]!.total }).toEqual({
          program,
          ...f,
          total: weightedBoardTotal({
            program,
            statPoints: { AGI: f.agi, STR: f.str, MND: f.mind },
            consistencyBonus: f.consistency,
            recBonus: f.rec,
            normalizationFactor: f.factor,
          }),
        });
      }
    }
  });

  it('exists as exactly one overload — three stats, no p_end, no p_vit', async () => {
    // Postgres resolves by argument list, so a signature change here is a DROP
    // and never a `create or replace`. This has now been proved by mutation
    // twice. Deleting 20260819140000's `drop function` left the seven-argument
    // form standing beside the nine-argument one and every other test in this
    // suite passed. Deleting 20260819150000's leaves the nine-argument form —
    // whose body sums `p_end` and `p_vit`, columns that no longer exist —
    // standing beside the seven-argument one, waiting for the next call site
    // that passes nine arguments. This is the assertion that fails in both
    // cases, and the same trap `create_goal` hit with `p_metric`.
    const rows = await h.asService<{ args: string }>(
      `select pg_get_function_arguments(p.oid) as args
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'program_weighted_total'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.args).toContain('p_mind integer');
    expect(rows[0]!.args).toContain('p_factor numeric');
    // By name, because that is what a stale overload would carry. Substring
    // matches are safe here: no surviving parameter contains either word.
    expect(rows[0]!.args).not.toContain('p_end');
    expect(rows[0]!.args).not.toContain('p_vit');
  });

  it('is executable by authenticated but not anon, after the drop', async () => {
    // `drop` takes the EXECUTE grants with it, and nothing else in this suite
    // would notice — the differential above runs as the owner.
    //
    // What this actually pins is the re-REVOKE. Supabase's default privileges
    // grant ALL on new functions to anon and authenticated, so the re-grant is
    // belt and braces and removing it changes nothing; removing the revoke
    // hands anon a function it never had, and fails here.
    const rows = await h.asService<{ role: string; has: boolean }>(
      `select r.role, has_function_privilege(r.role,
         'public.program_weighted_total(text, integer, integer, integer,
            integer, integer, numeric)', 'execute') as has
         from (values ('authenticated'), ('anon')) as r(role)`,
    );
    expect(rows).toEqual([
      { role: 'authenticated', has: true },
      { role: 'anon', has: false },
    ]);
  });

  // The dry run calls this function too, and its call is the one that cannot
  // be checked by reading. The retired signature and the current one BOTH take
  // seven arguments — `p_mind` sits where `p_end` sat, `p_factor` (numeric)
  // where `p_rec` (integer) sat — and integer→numeric is an implicit cast, so
  // a call left in the old positional order resolves cleanly against the new
  // function and mis-ranks the cohort with no error anywhere. The overload
  // assertion above cannot see it: there is only one function, and it is being
  // called wrongly. Executing the script's literal query is what catches it.
  it('agrees with weightedBoardTotal when the replay dry run calls it', async () => {
    // **Two squads, on two different programs, because one cannot pin three
    // positions.** A program boosts exactly one stat and leaves the other two
    // at 1.0, so a single running squad is blind to a `p_str` ↔ `p_mind`
    // transposition — the two arguments weigh the same and the total does not
    // move. That is the trap's own neighbourhood: `p_mind` sits exactly where
    // `p_end` sat. Running separates AGI from {STR, MND}; strength separates
    // STR from {AGI, MND}; asserting both rows is what leaves no pair of stat
    // arguments interchangeable. It says nothing about `p_program` itself,
    // which is pinned by the differential above running every program.
    //
    // Distinct non-zero values in every position, a factor that is not 1 on
    // the running row, and a consistency bonus: a row of equal points would
    // pass whatever order it was fed.
    const runner = await h.createUser({ characterName: 'Runner' });
    await h.asUser(runner, `select public.create_squad('Dry run', 'running')`);
    const lifter = await h.createUser({ characterName: 'Lifter' });
    await h.asUser(lifter, `select public.create_squad('Dry run gym', 'strength')`);

    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, str_points, mind_points,
          consistency_points, normalization_factor, total, tiers)
       values ($1, '2026-08-18', 1200, 650, 250, 400, 1.500, 3000,
               '{"AGI":"gold","STR":"silver","MND":"bronze"}'),
              ($2, '2026-08-18', 650, 1200, 250, 800, 1.000, 2900,
               '{"AGI":"silver","STR":"gold","MND":"bronze"}')`,
      [runner, lifter],
    );

    // The script's query is deliberately unfiltered — it pulls every member-day
    // in the project — so this picks its own freshly created users out of
    // whatever else the suite has seeded rather than pinning a row count.
    const rows = await h.asService<{ user_id: string; old_weighted: number }>(
      BOARD_TOTAL_SQL,
    );
    const totalFor = (userId: string) => {
      const mine = rows.filter((r) => r.user_id === userId);
      expect(mine).toHaveLength(1);
      return mine[0]!.old_weighted;
    };

    expect(totalFor(runner)).toBe(
      weightedBoardTotal({
        program: 'running',
        statPoints: { AGI: 1_200, STR: 650, MND: 250 },
        consistencyBonus: 400,
        recBonus: 0,
        normalizationFactor: 1.5,
      }),
    );
    expect(totalFor(lifter)).toBe(
      weightedBoardTotal({
        program: 'strength',
        statPoints: { AGI: 650, STR: 1_200, MND: 250 },
        consistencyBonus: 800,
        recBonus: 0,
        normalizationFactor: 1,
      }),
    );
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

// ---------------------------------------------------------------------------
// Events (20260828090000) — deviations #45, #48, #49
// ---------------------------------------------------------------------------
//
// The harness shares one PGlite instance with no per-test reset, so these use
// their own users and October dates, clear of every other suite's fixtures.

describe('challenge_events', () => {
  /** A squad with `extra` members beyond the leader. */
  async function seedSquad(extra: number) {
    const leader = await h.createUser({ characterName: 'Leader' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad($1)`,
      [`Events ${Math.random().toString(36).slice(2, 8)}`],
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

  const createEvent = (
    userId: string,
    squadId: string | null,
    over: Partial<{
      title: string;
      kind: string;
      metric: string;
      target: number;
      startsOn: string;
      endsOn: string | null;
    }> = {},
  ) =>
    h.asUser<{ id: string; kind: string; target: number; closed_at: string | null }>(
      userId,
      `select * from public.create_event($1, $2, $3, $4, $5, $6::date, $7::date, $8)`,
      [
        over.title ?? 'The Carabao',
        null,
        over.kind ?? 'battle',
        over.metric ?? 'active_kcal',
        over.target ?? 4_000,
        over.startsOn ?? '2026-10-01',
        over.endsOn === undefined ? '2026-10-07' : over.endsOn,
        squadId,
      ],
    );

  it('creates a battle and freezes the whole squad onto it', async () => {
    const { leader, squadId } = await seedSquad(1);
    const created = await createEvent(leader, squadId);
    expect(created[0]!.kind).toBe('battle');
    expect(created[0]!.target).toBe(4_000);
    // Live, so every read's `closed_at is null` filter finds it.
    expect(created[0]!.closed_at).toBeNull();

    const rows = await h.asService<{ n: number }>(
      'select count(*)::int as n from public.event_participants where event_id = $1',
      [created[0]!.id],
    );
    expect(rows[0]!.n).toBe(2);
  });

  it('does not change a frozen roster when the squad gains a member', async () => {
    const { leader, squadId } = await seedSquad(1);
    const created = await createEvent(leader, squadId);
    const joiner = await h.createUser();
    const code = await h.asService<{ invite_code: string }>(
      'select invite_code from public.squads where id = $1',
      [squadId],
    );
    await h.asUser(joiner, 'select public.join_squad($1)', [code[0]!.invite_code]);

    const rows = await h.asService<{ n: number }>(
      'select count(*)::int as n from public.event_participants where event_id = $1',
      [created[0]!.id],
    );
    expect(rows[0]!.n).toBe(2);
  });

  it('rejects a goal kind on a LIVE row', async () => {
    const { leader, squadId } = await seedSquad(0);
    await rejects(
      h.asService(
        `insert into public.challenge_events
           (squad_id, created_by, title, kind, metric, target, starts_on, ends_on)
         values ($1, $2, 'Nope', 'cumulative', 'active_kcal', 10, '2026-10-01', '2026-10-07')`,
        [squadId, leader],
      ),
      /events_kind_check/,
    );
  });

  it('rejects a goal metric on a LIVE row', async () => {
    const { leader, squadId } = await seedSquad(0);
    await rejects(
      h.asService(
        `insert into public.challenge_events
           (squad_id, created_by, title, kind, metric, target, starts_on, ends_on)
         values ($1, $2, 'Nope', 'battle', 'daily_score', 10, '2026-10-01', '2026-10-07')`,
        [squadId, leader],
      ),
      /events_metric_check/,
    );
  });

  it('keeps a closed-out legacy row, so banked XP does not vanish', async () => {
    // Spec §9: goal_completions XP stays banked and nobody's level drops. A
    // completion's FK holds its row alive, and that row's kind is `cumulative`
    // — so the checks are conditional on closed_at rather than NOT VALID. A
    // closed row is whatever it used to be, including personal and open-ended.
    const { leader, squadId } = await seedSquad(0);
    await h.asService(
      `insert into public.challenge_events
         (squad_id, created_by, title, kind, metric, target, starts_on, ends_on, closed_at)
       values ($1, $2, 'Legacy', 'cumulative', 'daily_score', 5000, '2026-08-01', null, now())`,
      [squadId, leader],
    );
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from public.challenge_events
        where title = 'Legacy' and closed_at is not null`,
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('requires an end date — a boss with no deadline is not a fight', async () => {
    const { leader, squadId } = await seedSquad(0);
    await rejects(createEvent(leader, squadId, { endsOn: null }), /needs an end date/);
  });

  it('requires a squad — a personal Battle is a Challenge', async () => {
    const user = await h.createUser();
    await rejects(createEvent(user, null), /belongs to a squad/);
  });

  it('refuses an event for a squad the caller is not in', async () => {
    const { squadId } = await seedSquad(0);
    const outsider = await h.createUser();
    await rejects(createEvent(outsider, squadId), /not a member of this squad/);
  });

  it('allows at most one live event of each kind per squad', async () => {
    const { leader, members, squadId } = await seedSquad(1);
    await createEvent(leader, squadId, { title: 'First' });
    await rejects(
      createEvent(members[0]!, squadId, { title: 'Second', startsOn: '2026-10-02', endsOn: '2026-10-08' }),
      /challenge_events_one_live_per_kind/,
    );
  });

  it('frees the slot once the running event is closed', async () => {
    // `closed_at` is the one column the partial index keys off, which is what
    // makes abandoning an event different from deleting it.
    const { leader, squadId } = await seedSquad(0);
    const first = await createEvent(leader, squadId, { title: 'First' });
    await h.asUser(leader, 'select public.abandon_event($1)', [first[0]!.id]);
    const closed = await h.asService<{ closed_at: string | null }>(
      'select closed_at from public.challenge_events where id = $1',
      [first[0]!.id],
    );
    expect(closed[0]!.closed_at).not.toBeNull();
    await expect(createEvent(leader, squadId, { title: 'Second' })).resolves.toHaveLength(1);
  });

  it('grants the client no INSERT — create_event is the only door', async () => {
    const { leader, squadId } = await seedSquad(0);
    await rejects(
      h.asUser(
        leader,
        `insert into public.challenge_events
           (squad_id, created_by, title, kind, metric, target, starts_on, ends_on)
         values ($1, $2, 'Sneaky', 'battle', 'active_kcal', 1, '2026-10-01', '2026-10-02')`,
        [squadId, leader],
      ),
      /permission denied/i,
    );
  });

  it('lets the creator rename it and nothing else', async () => {
    // The target is fixed at creation for §8's reason: moving it mid-window
    // silently re-grades every day already counted.
    const { leader, squadId } = await seedSquad(0);
    const created = await createEvent(leader, squadId);
    await h.asUser(leader, `update public.challenge_events set title = 'Renamed' where id = $1`, [
      created[0]!.id,
    ]);
    await rejects(
      h.asUser(leader, `update public.challenge_events set target = 1 where id = $1`, [
        created[0]!.id,
      ]),
      /permission denied/i,
    );
    const stored = await h.asService<{ title: string; target: number }>(
      'select title, target from public.challenge_events where id = $1',
      [created[0]!.id],
    );
    expect(stored[0]!).toEqual({ title: 'Renamed', target: 4_000 });
  });
});

describe('event_progress', () => {
  const DAY = '2026-10-03';

  async function seedFight() {
    const alice = await h.createUser({ characterName: 'Alice' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      alice,
      `select id, invite_code from public.create_squad($1)`,
      [`Fight ${Math.random().toString(36).slice(2, 8)}`],
    );
    const bob = await h.createUser({ characterName: 'Bob' });
    await h.asUser(bob, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    const event = await h.asUser<{ id: string }>(
      alice,
      `select id from public.create_event(
         'The Carabao', null, 'battle', 'active_kcal', 4000,
         '2026-10-01'::date, '2026-10-07'::date, $1)`,
      [squad[0]!.id],
    );
    return { alice, bob, squadId: squad[0]!.id, eventId: event[0]!.id };
  }

  const consent = (userId: string) =>
    h.asService(`update public.profiles set squad_data_consent_at = now() where id = $1`, [userId]);

  /**
   * Service-role, because `health_buckets` has no client write grant at all —
   * Edge Functions own every mutation (§12), and the harness stands in for one.
   * A `daily_scores` row goes with it: `event_progress` LEFT JOINs that table
   * for the date and its status, so a day with buckets and no score carries no
   * row at all.
   */
  async function contribute(
    userId: string,
    localDate: string,
    kcal: number,
    status: 'provisional' | 'final' = 'provisional',
  ) {
    await h.asService(
      `insert into public.health_buckets (user_id, local_date, hour, steps, active_kcal)
       values ($1, $2, 8, 100, $3)
       on conflict (user_id, local_date, hour) do update set active_kcal = excluded.active_kcal`,
      [userId, localDate, kcal],
    );
    // `finalized_at` rides with the status: daily_scores_finalized_at_present
    // refuses a final row without one, which is the same pairing rescoreDay
    // writes.
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, status, finalized_at)
       values ($1, $2, $3, case when $4 then now() end)
       on conflict (user_id, local_date) do update set
         status = excluded.status,
         finalized_at = excluded.finalized_at`,
      [userId, localDate, status, status === 'final'],
    );
  }

  const progress = (viewer: string, eventId: string) =>
    h.asUser<{
      user_id: string;
      local_date: string;
      value: string | null;
      pooled_value: string;
      status: string;
    }>(viewer, 'select * from public.event_progress($1)', [eventId]);

  it("pools every participant's raw metric across the window", async () => {
    const { alice, bob, eventId } = await seedFight();
    await contribute(alice, DAY, 300);
    await contribute(bob, DAY, 200);

    const rows = await progress(alice, eventId);
    // One row per participant per day, and the pooled figure repeated on each —
    // it is a window function over the date, which is exactly why `pooledDays`
    // has to take each date ONCE.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => Number(r.pooled_value) === 500)).toBe(true);
  });

  it('keeps a participant who has contributed nothing on the roster', async () => {
    // Deviation #20's LEFT JOIN, in a new place: the roster's whole point is
    // who has and has not contributed, and an inner join deletes the answer.
    const { alice, bob, eventId } = await seedFight();
    await contribute(alice, DAY, 300);
    await contribute(bob, DAY, 0);

    const rows = await progress(alice, eventId);
    expect(rows.filter((r) => r.user_id === bob)).toHaveLength(1);
    expect(rows.every((r) => Number(r.pooled_value) === 300)).toBe(true);
  });

  it('withholds the per-member breakdown behind reciprocal consent, never the pooled total', async () => {
    // The pooled figure is what the event IS, and joining one is itself an act
    // of participation. An individual's raw active calories are exactly what
    // deviation #47's gate exists for. Known limit: a two-person squad can
    // invert the pooled total, and that is recorded rather than pretended away.
    const { alice, bob, eventId } = await seedFight();
    await consent(alice); // viewer consents; bob does not
    await contribute(alice, DAY, 300);
    await contribute(bob, DAY, 200);

    const rows = await progress(alice, eventId);
    // Bob has not consented, so his contribution is withheld even from a viewer
    // who has. Alice's own is not: both halves of the reciprocal gate hold for
    // her row, which is the same reading squad_leaderboard() takes of is_self.
    expect(rows.find((r) => r.user_id === bob)!.value).toBeNull();
    expect(Number(rows.find((r) => r.user_id === alice)!.value)).toBe(300);
    expect(rows.every((r) => Number(r.pooled_value) === 500)).toBe(true);

    await consent(bob);
    const both = await progress(alice, eventId);
    expect(Number(both.find((r) => r.user_id === bob)!.value)).toBe(200);
  });

  it('carries each participant their own day status', async () => {
    const { alice, bob, eventId } = await seedFight();
    await contribute(alice, DAY, 300, 'final');
    await contribute(bob, DAY, 200, 'provisional');

    const rows = await progress(alice, eventId);
    expect(rows.find((r) => r.user_id === alice)!.status).toBe('final');
    expect(rows.find((r) => r.user_id === bob)!.status).toBe('provisional');
  });

  it('refuses a caller who is not on the event and not in its squad', async () => {
    const { eventId } = await seedFight();
    const outsider = await h.createUser();
    await rejects(progress(outsider, eventId), /not a participant in this event/);
  });

  it('exposes no hourly movement, heart rate or workout data', async () => {
    const rows = await h.asService<{ prosrc: string }>(
      `select prosrc from pg_proc where proname = 'event_progress'`,
    );
    expect(rows[0]!.prosrc).not.toMatch(/workout_sessions/);
    expect(rows[0]!.prosrc).not.toMatch(/avg_heart_rate/);
    expect(rows[0]!.prosrc).not.toMatch(/\bb\.hour\b/);
  });
});

describe('the goal API is gone', () => {
  it('has no create_goal, goal_window_scores, can_see_goal or abandon_goal left', async () => {
    // Dropped by exact argument list, never `create or replace`: a surviving
    // overload fails nothing until a call site resolves to it.
    const rows = await h.asService<{ proname: string }>(
      `select proname from pg_proc
        where proname in ('create_goal', 'goal_window_scores', 'can_see_goal', 'abandon_goal',
                          'goals_validate', 'collect_orphaned_goals')`,
    );
    expect(rows).toEqual([]);
  });

  it('has no goals, goal_participants or goal_completions table left', async () => {
    const rows = await h.asService<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('goals', 'goal_participants', 'goal_completions')`,
    );
    expect(rows).toEqual([]);
  });

  it('left no constraint or index still spelled the old way', async () => {
    // A constraint reading `goals_*` on a table called challenge_events is how
    // the next reader concludes the rename was half-done.
    const rows = await h.asService<{ conname: string }>(
      // `contype <> 'n'`: newer Postgres materialises NOT NULL as a named
      // pg_constraint row, which `alter table ... rename constraint` will not
      // touch and which the hosted project does not even have. The names that
      // matter are the checks, keys and foreign keys.
      `select conname from pg_constraint
        where conrelid in ('public.challenge_events'::regclass,
                           'public.event_participants'::regclass,
                           'public.event_completions'::regclass)
          and contype <> 'n'
          and conname like 'goal%'
       union all
       select indexname from pg_indexes
        where tablename in ('challenge_events', 'event_participants', 'event_completions')
          and indexname like 'goal%'`,
    );
    expect(rows).toEqual([]);
  });

  it('still names every XP source, because the recompute is written out whole', async () => {
    // A full recompute, never an increment — so a source omitted here is a
    // source dropped, and every affected account's level falls on the next
    // write. The three per-stat rollups ride in the same function.
    const rows = await h.asService<{ prosrc: string }>(
      `select prosrc from pg_proc where proname = 'recalculate_user_xp'`,
    );
    expect(rows[0]!.prosrc).toMatch(/daily_scores/);
    expect(rows[0]!.prosrc).toMatch(/event_completions/);
    expect(rows[0]!.prosrc).toMatch(/challenge_completions/);
    expect(rows[0]!.prosrc).toMatch(/agi_total/);
    expect(rows[0]!.prosrc).toMatch(/str_total/);
    expect(rows[0]!.prosrc).toMatch(/mnd_total/);
    expect(rows[0]!.prosrc).not.toMatch(/from public\.goal_completions/);
  });
});

describe("other people's events", () => {
  async function sharedEvent() {
    const leader = await h.createUser({ characterName: 'Author' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad($1)`,
      [`Orphan ${Math.random().toString(36).slice(2, 8)}`],
    );
    const member = await h.createUser({ characterName: 'Other' });
    await h.asUser(member, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    const event = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_event('Shared', null, 'battle', 'active_kcal', 1000,
         '2026-10-01'::date, '2026-10-30'::date, $1)`,
      [squad[0]!.id],
    );
    return { leader, member, eventId: event[0]!.id };
  }

  it('survives with a null creator rather than being destroyed', async () => {
    // `created_by` is SET NULL, not CASCADE: a shared Event outlives its author.
    const { leader, member, eventId } = await sharedEvent();
    await h.asUser(leader, 'select public.delete_account()');

    const stored = await h.asService<{ created_by: string | null }>(
      'select created_by from public.challenge_events where id = $1',
      [eventId],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]!.created_by).toBeNull();

    // And the survivor is still on it — an Event without its roster would be
    // a different kind of loss.
    const participants = await h.asService(
      'select 1 from public.event_participants where event_id = $1 and user_id = $2',
      [eventId, member],
    );
    expect(participants).toHaveLength(1);
  });

  it('lets nobody inherit the right to rename an orphaned event', async () => {
    // `created_by = auth.uid()` against NULL is never true, which is the
    // intended reading of SET NULL here rather than an accident of it.
    const { leader, member, eventId } = await sharedEvent();
    await h.asUser(leader, 'select public.delete_account()');

    await h.asUser(member, `update public.challenge_events set title = 'Mine now' where id = $1`, [
      eventId,
    ]);
    const stored = await h.asService<{ title: string }>(
      'select title from public.challenge_events where id = $1',
      [eventId],
    );
    expect(stored[0]!.title).toBe('Shared');
  });

  it('sweeps an event left with neither a creator nor a participant', async () => {
    // The sweep names the tables in its BODY, which `alter table ... rename`
    // does not rewrite — so it was recreated, not renamed. It stays AFTER
    // DELETE: from BEFORE it reaches a completion, which updates `profiles`,
    // which modifies the row being deleted, and Postgres aborts the statement.
    const { leader, member, eventId } = await sharedEvent();
    await h.asUser(member, 'select public.delete_account()');
    await h.asUser(leader, 'select public.delete_account()');

    const rows = await h.asService('select id from public.challenge_events where id = $1', [
      eventId,
    ]);
    expect(rows).toEqual([]);
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
      'species',
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

describe('kairo_retention', () => {
  // Fixed, per-test cohort dates: kairo_retention aggregates by cohort_date
  // across every profile in the (shared, un-reset-between-tests) harness, so
  // two cases sharing a date would double-count each other's cohort.
  it('counts a user as retained when they scored exactly N days after joining', async () => {
    const user = await h.createUser();
    await h.asService('update public.profiles set created_at = $2 where id = $1', [
      user,
      '2026-08-01T00:00:00Z',
    ]);
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total)
       values ($1, $2, $3)`,
      [user, '2026-08-08', 3_000],
    );

    const d7 = await h.asService<{ cohort_size: number; retained: number }>(
      `select cohort_size, retained from public.kairo_retention(7)
       where cohort_date = '2026-08-01'`,
    );

    expect(d7[0]?.cohort_size).toBe(1);
    expect(d7[0]?.retained).toBe(1);
  });

  it('does not count activity on a different day as day-N retention', async () => {
    const user = await h.createUser();
    await h.asService('update public.profiles set created_at = $2 where id = $1', [
      user,
      '2026-08-02T00:00:00Z',
    ]);
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total)
       values ($1, $2, $3)`,
      [user, '2026-08-06', 3_000],
    );

    const d7 = await h.asService<{ cohort_size: number; retained: number }>(
      `select cohort_size, retained from public.kairo_retention(7)
       where cohort_date = '2026-08-02'`,
    );

    expect(d7[0]?.cohort_size).toBe(1);
    expect(d7[0]?.retained).toBe(0);
  });

  // Every player's day runs midnight-to-midnight in *their own* timezone
  // (§2), and daily_scores.local_date is always per-user-local — so the
  // cohort anchor has to be too. A profile created near midnight in the
  // 'Asia/Manila' default (UTC+8) lands on the *next* calendar day locally
  // even though its UTC instant is still the day before.
  it('anchors the cohort day on the profile\'s own timezone, not UTC', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    // 2026-08-10T20:00:00Z is 2026-08-11 04:00 in Asia/Manila (UTC+8) — a UTC
    // anchor would misdate this cohort a day early.
    await h.asService('update public.profiles set created_at = $2 where id = $1', [
      user,
      '2026-08-10T20:00:00Z',
    ]);
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total)
       values ($1, $2, $3)`,
      [user, '2026-08-18', 3_000],
    );

    const d7 = await h.asService<{ cohort_date: Date; cohort_size: number; retained: number }>(
      `select cohort_date, cohort_size, retained from public.kairo_retention(7)
       where cohort_date = '2026-08-11'`,
    );

    expect(d7[0]?.cohort_date?.toISOString().slice(0, 10)).toBe('2026-08-11');
    expect(d7[0]?.cohort_size).toBe(1);
    expect(d7[0]?.retained).toBe(1);
  });

  // The function reads every user's activity. A client session reaching it
  // would be a projection leak of exactly the kind squad_leaderboard() exists
  // to prevent.
  it('is not executable by the authenticated role', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'select * from public.kairo_retention(7)'),
      /permission denied/i,
    );
  });
});

describe('profiles.species', () => {
  it('exists and is nullable', async () => {
    const rows = await h.asService<{ is_nullable: string; data_type: string }>(
      `select is_nullable, data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'species'`,
    );
    // NULL means "never asked", which every row predating this column is.
    // A not-null default would backfill an assertion nobody made — and the
    // one-time picker keys off exactly this null.
    expect(rows[0]!.is_nullable).toBe('YES');
    expect(rows[0]!.data_type).toBe('text');
  });

  it('accepts each of the four species', async () => {
    const user = await h.createUser();
    for (const s of ['pilandok', 'tamaraw', 'carabao', 'eagle']) {
      await h.asService(`update public.profiles set species = $2 where id = $1`, [user, s]);
      const rows = await h.asService<{ species: string }>(
        `select species from public.profiles where id = $1`,
        [user],
      );
      expect(rows[0]!.species).toBe(s);
    }
  });

  it('rejects a value outside the CHECK', async () => {
    const user = await h.createUser();
    await rejects(
      h.asService(`update public.profiles set species = 'tarsier' where id = $1`, [user]),
      /species/,
    );
  });

  it('lets a client set it on their own row', async () => {
    // The swap path: the profile screen UPDATEs directly under the
    // column-scoped grant, with no RPC in between.
    const user = await h.createUser();
    await h.asUser(user, `update public.profiles set species = 'eagle' where id = $1`, [user]);
    const rows = await h.asService<{ species: string }>(
      `select species from public.profiles where id = $1`,
      [user],
    );
    expect(rows[0]!.species).toBe('eagle');
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
      'species',
      'timezone',
      'weight_kg',
    ]);
  });

  it('is in the column-scoped UPDATE grant, and the rest survived the rebuild', async () => {
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
      'quest_tier_override',
      'sex',
      'species',
      'squad_data_consent_at',
      'timezone',
      'trains_run',
      'trains_strength',
      'weight_kg',
    ]);
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

  it('keeps has_wearable out of both write grants', async () => {
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from information_schema.column_privileges
       where table_name = 'profiles' and grantee = 'authenticated'
         and column_name = 'has_wearable'
         and privilege_type in ('INSERT', 'UPDATE')`,
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('squad_leaderboard projects three lifetime ratings', () => {
  it('carries AGI, STR and MND — the CoreStat set, not the retired one', async () => {
    // `ratings` projected end_total and vit_total from 20260810150000 until the
    // contract migration, and never carried a Mind figure at all. LeaderboardRow
    // filters the map by CORE_STATS, so END and VIT were silently discarded and
    // MND read `undefined` — which ratingForStatPoints floors at 1. Every
    // squadmate's Mind ability therefore rendered as unearned no matter what
    // they slept, on a board that had been ranking them on it since
    // 20260819140000. Nothing failed; the number was simply always the same.
    //
    // Asserted as the whole object rather than one key: a map that gained MND
    // while keeping END and VIT would satisfy a `toHaveProperty` and still be
    // projecting two columns that no longer exist.
    const leader = await h.createUser({ characterName: 'Alpha' });
    const squad = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_squad('Ratings')`,
    );
    await h.asService(
      `insert into public.daily_scores
         (user_id, local_date, agi_points, str_points, mind_points)
       values ($1, '2026-07-27', 1200, 650, 250)`,
      [leader],
    );
    const rows = await h.asUser<{ ratings: Record<string, number> }>(
      leader,
      `select ratings from public.squad_leaderboard($1, '2026-07-27'::date)`,
      [squad[0]!.id],
    );
    expect(rows[0]!.ratings).toEqual({ AGI: 1_200, STR: 650, MND: 250 });
  });
});

describe('squad_leaderboard projects species', () => {
  async function seedSquad() {
    const leader = await h.createUser({ characterName: 'Alpha' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Species')`,
    );
    const member = await h.createUser({ characterName: 'Beta' });
    await h.asUser(member, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    return { leader, member, squadId: squad[0]!.id };
  }

  it('returns species last, and the rest of the row shape is unchanged', async () => {
    // The row shape is pinned because this RPC *is* the §5 privacy boundary:
    // squadmates reach data only through it. Species is cosmetic and
    // non-sensitive, unlike steps or heart rate — but the pin is what makes
    // adding a column a decision rather than an accident.
    const rows = await h.asService<{ column_name: string; ordinal_position: number }>(
      `select p.parameter_name as column_name, p.ordinal_position
         from information_schema.parameters p
         join information_schema.routines r using (specific_name)
        where r.routine_schema = 'public' and r.routine_name = 'squad_leaderboard'
          and p.parameter_mode = 'OUT'
        order by p.ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'rank',
      'user_id',
      'character_name',
      'class',
      'level',
      'local_date',
      'total',
      'tiers',
      'ratings',
      'contributing_stats',
      'has_rec',
      'flagged',
      'status',
      'current_streak',
      'is_self',
      'program',
      'species',
      // Deviation #47. Appended, never interleaved: every consumer reads by
      // name, but the plpgsql `return query` is positional and a column
      // inserted mid-list would silently shift four others.
      'steps',
      'distance_m',
      'active_kcal',
      'sleep_minutes',
    ]);
  });

  it('reports an event participant their squadmate species, and null for none', async () => {
    const leader = await h.createUser({ characterName: 'Alpha' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      leader,
      `select id, invite_code from public.create_squad('Event species')`,
    );
    const member = await h.createUser({ characterName: 'Beta' });
    await h.asUser(member, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    await h.asService(`update public.profiles set species = 'carabao' where id = $1`, [member]);
    // event_progress LEFT JOINs daily_scores for the day and its status, so a
    // participant with no scored day inside the window carries no row at all.
    for (const id of [leader, member]) {
      await h.asService(
        `insert into public.daily_scores (user_id, local_date) values ($1, '2026-01-02')
         on conflict (user_id, local_date) do nothing`,
        [id],
      );
    }

    const event = await h.asUser<{ id: string }>(
      leader,
      `select id from public.create_event(
         'Together', null, 'battle', 'active_kcal', 5000,
         '2026-01-01'::date, '2026-01-31'::date, $1)`,
      [squad[0]!.id],
    );

    const rows = await h.asUser<{ character_name: string; species: string | null }>(
      leader,
      'select character_name, species from public.event_progress($1)',
      [event[0]!.id],
    );
    expect(rows.find((r) => r.character_name === 'Beta')?.species).toBe('carabao');
    // Null is the pre-migration state and must survive as null — the roster
    // falls back to the initial disc for it rather than inventing an animal.
    expect(rows.find((r) => r.character_name === 'Alpha')?.species).toBeNull();
  });

  it('shows a squadmate their squadmate species', async () => {
    const { squadId, leader, member } = await seedSquad();
    await h.asService(`update public.profiles set species = 'tamaraw' where id = $1`, [member]);
    const rows = await h.asUser<{ character_name: string; species: string | null }>(
      leader,
      'select character_name, species from public.squad_leaderboard($1)',
      [squadId],
    );
    expect(rows.some((r) => r.species === 'tamaraw')).toBe(true);
  });

  it('reports null for a squadmate who has never chosen', async () => {
    // Null is the pre-migration state and must reach the client as null, not
    // as a default — the client renders a neutral figure for it.
    const { squadId, leader } = await seedSquad();
    const rows = await h.asUser<{ species: string | null }>(
      leader,
      'select species from public.squad_leaderboard($1)',
      [squadId],
    );
    expect(rows.every((r) => r.species === null || typeof r.species === 'string')).toBe(true);
  });
});

describe('three-stat expand migration', () => {
  it('adds mind_points to daily_scores, defaulted and non-negative', async () => {
    const rows = await h.asService<{ column_name: string; is_nullable: string }>(`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_scores'
        and column_name = 'mind_points'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.is_nullable).toBe('NO');
  });

  // Inverted by 20260819150000, which is the migration this assertion was
  // written to guard. It asserted the three columns SURVIVED the expand phase,
  // so that a rollback of the Edge Functions needed no schema restore; that
  // window closed when the contract migration dropped them. Both halves are
  // named: gone is not the same claim as "the three that remain are the right
  // three", and a drop that took `mind_points` with it would satisfy the first
  // on its own.
  it('drops rec_points, end_points and vit_points, and keeps exactly the three stats', async () => {
    const rows = await h.asService<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_scores'
        and column_name in ('rec_points', 'end_points', 'vit_points',
                            'agi_points', 'str_points', 'mind_points')
      order by column_name
    `);
    expect(rows.map((r) => r.column_name)).toEqual([
      'agi_points',
      'mind_points',
      'str_points',
    ]);
  });

  it('drops profiles.end_total and vit_total, leaving three lifetime rollups', async () => {
    // The rollup columns go with the score columns they summed. Split from the
    // test above because they are separate ALTERs on separate tables, and a
    // migration that dropped one pair and not the other would leave
    // recalculate_user_xp() naming a column that no longer exists — which
    // fails on the next sync, not here.
    const rows = await h.asService<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name in ('end_total', 'vit_total',
                            'agi_total', 'str_total', 'mnd_total')
      order by column_name
    `);
    expect(rows.map((r) => r.column_name)).toEqual([
      'agi_total',
      'mnd_total',
      'str_total',
    ]);
  });

  it('records sleep origin for the trust layers', async () => {
    const rows = await h.asService<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_sleep'
        and column_name in ('source', 'was_user_entered')
    `);
    expect(rows.map((r) => r.column_name).sort()).toEqual(['source', 'was_user_entered']);
  });

  it('records workout origin including heart-rate evidence', async () => {
    const rows = await h.asService<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'workout_sessions'
        and column_name in ('source_bundle_id', 'was_user_entered', 'has_heart_rate_evidence')
    `);
    expect(rows).toHaveLength(3);
  });

  // The third side of M1's guard. `scoring-inputs.ts` pins its select strings
  // to its row types at compile time, and its own tests build fixtures by
  // parsing those strings — but both live entirely inside TypeScript, so a
  // name that is spelled consistently and wrong everywhere still passes.
  // These two ask Postgres. Same seam, and the same reason, as `planDay`'s
  // row-shape test above: the layers are otherwise tested apart.
  it('selects only columns daily_sleep actually has', async () => {
    const rows = await h.asService<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_sleep'
    `);
    const existing = rows.map((r) => r.column_name);
    for (const column of DAILY_SLEEP_COLUMNS) expect(existing).toContain(column);
  });

  it('selects only columns workout_sessions actually has', async () => {
    const rows = await h.asService<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'workout_sessions'
    `);
    const existing = rows.map((r) => r.column_name);
    for (const column of WORKOUT_SESSION_COLUMNS) expect(existing).toContain(column);
  });

  it('stores the origin sync-health now writes, and reads NULL for a row without it', async () => {
    // The other half of the August 2026 seam: a migration and the function
    // that writes through it, checked against each other rather than apart.
    // NULL is asserted alongside because it is the whole existing cohort's
    // state, and `scoringSleepDates`/`verifiedWorkoutMinutesFrom` both have to
    // keep meaning "eligible" and "unverified" for it.
    const user = await h.createUser();

    await h.asService(
      `insert into public.daily_sleep (user_id, local_date, minutes, was_user_entered)
       values ($1, '2026-07-27', 480, true),
              ($1, '2026-07-26', 480, null)`,
      [user],
    );
    const sleep = await h.asService<{ local_date: string; was_user_entered: boolean | null }>(
      `select local_date, was_user_entered from public.daily_sleep
       where user_id = $1 order by local_date`,
      [user],
    );
    expect(sleep.map((r) => r.was_user_entered)).toEqual([null, true]);

    await h.asService(
      `insert into public.workout_sessions
         (user_id, hk_uuid, local_date, started_at, ended_at, activity_type,
          duration_s, distance_m, active_kcal,
          source_bundle_id, was_user_entered, has_heart_rate_evidence)
       values ($1, 'uuid-origin', '2026-07-27', now(), now(), 37,
               2700, 7400.50, 512.25,
               'com.apple.workout', false, true)`,
      [user],
    );
    const session = await h.asService<{
      source_bundle_id: string | null;
      was_user_entered: boolean | null;
      has_heart_rate_evidence: boolean | null;
    }>(
      `select source_bundle_id, was_user_entered, has_heart_rate_evidence
       from public.workout_sessions where user_id = $1`,
      [user],
    );
    expect(session[0]).toEqual({
      source_bundle_id: 'com.apple.workout',
      was_user_entered: false,
      has_heart_rate_evidence: true,
    });
  });

  it('accepts MND as a featured stat, and no longer END or VIT', async () => {
    const rows = await h.asService<{ def: string }>(`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.daily_scores'::regclass
        and pg_get_constraintdef(oid) like '%featured_stat%'
    `);
    expect(rows[0]!.def).toContain('MND');
    expect(rows[0]!.def).not.toContain('END');
    expect(rows[0]!.def).not.toContain('VIT');
  });

  // Contracted: END and VIT are retired, so three is the ceiling again.
  it('allows at most three contributing stats', async () => {
    // By exact name. `conname like '%contributing_stats%'` also matches the
    // column's NOT NULL constraint, which pg_constraint carries as a row of
    // its own — so a pattern match here is one row-ordering change away from
    // asserting against the wrong constraint.
    const rows = await h.asService<{ def: string }>(`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.daily_scores'::regclass
        and conname = 'daily_scores_contributing_stats_check'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.def).toContain('3');
    expect(rows[0]!.def).not.toContain('5');
  });

  /**
   * The deferred half of that constraint, now closed.
   *
   * 20260819110000 added it NOT VALID because the live project held 32 rows
   * scored under the four-stat model with `contributing_stats = 4`, and
   * `add constraint ... check` validates every existing row on the way in.
   * NOT VALID is not a weaker constraint — it is enforced on every INSERT and
   * UPDATE from the moment it exists — but it skips the scan of history, so
   * the guarantee was write-time only.
   *
   * 20260819150000 runs `validate constraint` after the §5 replay has
   * rewritten those rows, which is what makes the guarantee total. PGlite
   * starts empty and so cannot prove the replay worked; what it can prove is
   * that the statement is in the migration at all, which is exactly the half
   * that is easy to forget. Removing it costs a weaker guarantee and nothing
   * that fails, which is why this asserts on `convalidated` rather than on
   * anything a write would show.
   */
  it('validates the contributing-stats check once the replay has landed', async () => {
    // By exact name, not by pattern: `drop constraint if exists` in both
    // three-stat migrations targets this name, so a second constraint matching
    // the pattern would be one the drops never reach.
    const rows = await h.asService<{ conname: string; convalidated: boolean }>(`
      select conname, convalidated from pg_constraint
      where conrelid = 'public.daily_scores'::regclass
        and conname = 'daily_scores_contributing_stats_check'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.convalidated).toBe(true);
  });

  it('leaves the featured-stat check validated — no stored row has one', async () => {
    // Deviation #10 retired the rotation from the write path, so the column is
    // null everywhere and the scan has nothing to reject. Only the constraint
    // that would genuinely abort is deferred.
    const rows = await h.asService<{ convalidated: boolean }>(`
      select convalidated from pg_constraint
      where conrelid = 'public.daily_scores'::regclass
        and conname = 'daily_scores_featured_stat_check'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.convalidated).toBe(true);
  });
});

describe('the history replay', () => {
  /**
   * What `replay-scores` does against real Postgres, and the two traps in the
   * way of doing it by hand.
   *
   * "Replay all history" was a runbook line with no command under it. The two
   * executions an operator reaches for both fail, and both fail *inside* the
   * one-way deploy window:
   *
   *   - upserting `planDay`'s row straight back violates
   *     `daily_scores_finalized_at_present`, because the planner always
   *     returns `finalized_at: null` and a `final` row must carry one;
   *   - `rescoreDay(…, { finalize: true })` computes the right numbers and
   *     re-stamps `finalized_at` with the replay's own clock.
   *
   * The suite above notes that PGlite "starts empty and so cannot prove the
   * replay worked". It can, given rows: this seeds the live shape — final days
   * carrying `contributing_stats = 4` under a NOT VALID constraint — and runs
   * the enumeration and the write against them.
   *
   * What it still cannot prove: that PostgREST renders the same query the
   * handler builds. That half is `replay.deno.test.ts`, which drives the real
   * module against a fake client.
   */
  const CS_CHECK = 'daily_scores_contributing_stats_check';
  const STAMP = '2026-08-15T16:05:12.443Z';
  let user: string;

  /** Reproduce the live state: rows written before the check existed. */
  async function withoutTheCheck(fn: () => Promise<void>) {
    await h.asService(`alter table public.daily_scores drop constraint ${CS_CHECK}`);
    try {
      await fn();
    } finally {
      await h.asService(
        `alter table public.daily_scores
           add constraint ${CS_CHECK} check (contributing_stats between 0 and 3) not valid`,
      );
    }
  }

  beforeAll(async () => {
    user = await h.createUser({ timezone: 'Asia/Manila' });
    await withoutTheCheck(async () => {
      await h.asService(
        `insert into public.daily_scores
           (user_id, local_date, status, finalized_at, agi_points, str_points,
            mind_points, consistency_points, total, normalization_factor,
            contributing_stats, xp_awarded)
         values
           ($1, '2026-08-14', 'final', $2, 900, 600, 0, 200, 2400, 1.000, 4, 240),
           ($1, '2026-08-16', 'final', $2, 800, 400, 0, 200, 2000, 1.000, 4, 200),
           ($1, '2026-08-20', 'provisional', null, 700, 300, 0, 0, 1600, 1.000, 3, 160)`,
        [user, STAMP],
      );
    });
  });

  afterAll(async () => {
    await h.asService('delete from public.daily_scores where user_id = $1', [user]);
    // Back to the state 20260819150000 leaves behind, so the assertion on
    // `convalidated` above still describes the schema whatever ran here.
    await h.asService(`alter table public.daily_scores drop constraint if exists ${CS_CHECK}`);
    await h.asService(
      `alter table public.daily_scores
         add constraint ${CS_CHECK} check (contributing_stats between 0 and 3)`,
    );
  });

  /**
   * PGlite's driver hands `date` and `timestamptz` back as JS `Date`; PostgREST
   * hands them back as strings. The replay's pure half is written against the
   * wire shape, so the rows are normalized here rather than the module being
   * loosened to accept both — a module that accepted both would also accept a
   * column that had quietly become a Date in production.
   */
  function asWireRow(row: ReplayScoreRow): ReplayScoreRow {
    const date = row.local_date as unknown;
    const stamp = row.finalized_at as unknown;
    return {
      ...row,
      local_date: date instanceof Date ? date.toISOString().slice(0, 10) : date as string,
      finalized_at: stamp instanceof Date ? stamp.toISOString() : (stamp as string | null),
    };
  }

  it('the enumeration select returns every stored day, final ones included', async () => {
    // `REPLAY_SCORE_SELECT` is the same string the handler hands PostgREST, so
    // a column renamed on one side fails here rather than mid-window. Scoped
    // to this user because the suite shares one database; the replay's own
    // user filter is optional and the *status* filter is what must not exist.
    const rows = await h.asService<ReplayScoreRow>(
      `select ${REPLAY_SCORE_SELECT}
         from public.daily_scores
        where user_id = $1
        order by user_id, local_date`,
      [user],
    );

    expect(rows.map(asWireRow).map((r) => [r.local_date, r.status])).toEqual([
      ['2026-08-14', 'final'],
      ['2026-08-16', 'final'],
      ['2026-08-20', 'provisional'],
    ]);
    // The rows the contract migration's `validate constraint` aborts on. A
    // replay that cannot see them stalls the window at step 7.
    expect(rows.filter((r) => Number(r.contributing_stats) > 3)).toHaveLength(2);
  });

  it('pairs each day with its own profile timezone', async () => {
    const scoreRows = await h.asService<ReplayScoreRow>(
      `select ${REPLAY_SCORE_SELECT} from public.daily_scores
        where user_id = $1 order by local_date`,
      [user],
    );
    const profileRows = await h.asService<ReplayProfileRow>(
      `select ${REPLAY_PROFILE_SELECT} from public.profiles where id = $1`,
      [user],
    );

    const { candidates, unresolved } = pairCandidates(
      scoreRows.map(asWireRow),
      profileRows,
    );

    expect(unresolved).toEqual([]);
    expect(candidates.map((c) => [c.localDate, c.status, c.timeZone])).toEqual([
      ['2026-08-14', 'final', 'Asia/Manila'],
      ['2026-08-16', 'final', 'Asia/Manila'],
      ['2026-08-20', 'provisional', 'Asia/Manila'],
    ]);
    expect(candidates[0]!.finalizedAt).not.toBeNull();
    expect(candidates[2]!.finalizedAt).toBeNull();
  });

  it('the four-stat rows are what `validate constraint` aborts on', async () => {
    // Step 8 of the runbook, run early on purpose: this is the failure the
    // replay exists to prevent, reproduced rather than described.
    await rejects(
      h.asService(`alter table public.daily_scores validate constraint ${CS_CHECK}`),
      /daily_scores_contributing_stats_check/,
    );
  });

  it('a replayed row keeps its status and finalized_at, and validates', async () => {
    // The write the replay actually performs, on the rows above. `planDay`
    // supplies the scoring columns; `replayLifecycle` supplies the two the
    // replay must not touch.
    for (const [localDate, existingStatus] of [
      ['2026-08-14', 'final'],
      ['2026-08-16', 'final'],
      ['2026-08-20', 'provisional'],
    ] as const) {
      const planned = planDay({
        userId: user,
        localDate,
        timeZone: 'Asia/Manila',
        now: new Date('2026-08-20T04:00:00Z'),
        buckets: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          steps: hour >= 8 && hour < 18 ? 1_100 : 0,
          distanceM: hour >= 8 && hour < 18 ? 825 : 0,
          activeKcal: hour >= 8 && hour < 18 ? 26 : 0,
          activeMinutes: hour >= 8 && hour < 18 ? 6 : 0,
        })),
        hadWorkoutHours: new Set(),
        elevatedHeartRateHours: new Set(),
        sleepMinutes: 420,
        earnableStats: 3,
        verifiedStrengthMinutes: 0,
        existingStatus,
      }).row;

      const stored = await h.asService<{ finalized_at: Date | null }>(
        `select finalized_at from public.daily_scores
          where user_id = $1 and local_date = $2`,
        [user, localDate],
      );
      const finalizedAt = stored[0]!.finalized_at;

      await upsertScoreRow(
        replayLifecycle(planned, {
          status: existingStatus,
          finalizedAt: finalizedAt === null ? null : new Date(finalizedAt).toISOString(),
        }) as unknown as Record<string, unknown>,
      );
    }

    const after = await h.asService<{
      local_date: string;
      status: string;
      finalized_at: Date | null;
      contributing_stats: number;
      total: number;
    }>(
      `select local_date, status, finalized_at, contributing_stats, total
         from public.daily_scores where user_id = $1 order by local_date`,
      [user],
    );

    // The lifecycle is exactly where it was.
    expect(after.map((r) => r.status)).toEqual(['final', 'final', 'provisional']);
    expect(new Date(after[0]!.finalized_at!).toISOString()).toBe(STAMP);
    expect(new Date(after[1]!.finalized_at!).toISOString()).toBe(STAMP);
    expect(after[2]!.finalized_at).toBeNull();

    // And the scoring is not: step 7's check now reads 3 and 0, so step 8's
    // `validate constraint` succeeds where it aborted two tests ago.
    expect(Math.max(...after.map((r) => Number(r.contributing_stats)))).toBe(3);
    expect(after.every((r) => Number(r.total) > 0)).toBe(true);
    await h.asService(`alter table public.daily_scores validate constraint ${CS_CHECK}`);
  });

  it("planDay's own row cannot be stored for a final day", async () => {
    // The trap an operator hits first. `planDay` returns `status: 'final'`
    // with `finalized_at: null` for a frozen day (sync-plan.ts), because on
    // the two live write paths only finalize-days may stamp it — so the
    // obvious "upsert plan.row" is rejected by the schema, and it is rejected
    // partway through a one-way window.
    const planned = planDay({
      userId: user,
      localDate: '2026-08-14',
      timeZone: 'Asia/Manila',
      now: new Date('2026-08-20T04:00:00Z'),
      buckets: [{ hour: 9, steps: 1_100, distanceM: 825, activeKcal: 26, activeMinutes: 6 }],
      hadWorkoutHours: new Set(),
      elevatedHeartRateHours: new Set(),
      sleepMinutes: 420,
      earnableStats: 3,
      verifiedStrengthMinutes: 0,
      existingStatus: 'final',
    }).row;

    expect(planned.status).toBe('final');
    expect(planned.finalized_at).toBeNull();

    await rejects(
      upsertScoreRow(planned as unknown as Record<string, unknown>),
      /daily_scores_finalized_at_present/,
    );
  });

  /** What PostgREST's `.upsert(row, { onConflict: 'user_id,local_date' })` compiles to. */
  async function upsertScoreRow(row: Record<string, unknown>): Promise<void> {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const values = columns.map((c) => {
      const value = row[c];
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    });
    const updates = columns
      .filter((c) => c !== 'user_id' && c !== 'local_date')
      .map((c) => `${c} = excluded.${c}`);

    await h.asService(
      `insert into public.daily_scores (${columns.join(', ')})
       values (${placeholders.join(', ')})
       on conflict (user_id, local_date) do update set ${updates.join(', ')}`,
      values,
    );
  }
});

describe('quest_completions (deviation #50)', () => {
  /**
   * Quests themselves are never stored — `pickQuests()` derives them from
   * (user, local date, tier). Only the completion lands here, because it pays
   * XP and must fire exactly once.
   */
  async function clearQuest(
    user: string,
    overrides: { questId?: string; localDate?: string; xp?: number } = {},
  ) {
    await h.asService(
      `insert into public.quest_completions (user_id, local_date, quest_id, xp_awarded)
       values ($1, $2, $3, $4)
       on conflict (user_id, local_date, quest_id) do nothing`,
      [
        user,
        overrides.localDate ?? '2026-07-27',
        overrides.questId ?? 'steady-steps-7000',
        overrides.xp ?? 15,
      ],
    );
  }

  it('is readable by its owner and by nobody else', async () => {
    const owner = await h.createUser();
    const stranger = await h.createUser();
    await clearQuest(owner);

    expect(await h.asUser(owner, 'select quest_id from public.quest_completions')).toHaveLength(
      1,
    );
    expect(
      await h.asUser(stranger, 'select quest_id from public.quest_completions'),
    ).toHaveLength(0);
  });

  it('refuses a client write, because XP is server-authoritative', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(
        user,
        `insert into public.quest_completions (user_id, local_date, quest_id, xp_awarded)
         values ($1, '2026-07-28', 'strong-steps-15000', 500)`,
        [user],
      ),
      /permission denied/i,
    );
  });

  it('grants authenticated nothing beyond SELECT', async () => {
    // `revoke all` then re-grant, not a revoke of the four DML verbs:
    // Supabase's ALTER DEFAULT PRIVILEGES grants ALL on a new public table,
    // and ALL includes TRUNCATE, which RLS does not restrict.
    const rows = await h.asService<{ privs: string }>(
      `select string_agg(distinct privilege_type, ',' order by privilege_type) as privs
       from information_schema.table_privileges
       where table_name = 'quest_completions' and grantee = 'authenticated'`,
    );
    expect(rows[0]!.privs).toBe('SELECT');
  });

  it('latches once per quest per day, so cron overlap cannot double-pay', async () => {
    const user = await h.createUser();
    await clearQuest(user, { xp: 15 });
    await clearQuest(user, { xp: 999 });

    const rows = await h.asService<{ xp_awarded: number }>(
      'select xp_awarded from public.quest_completions where user_id = $1',
      [user],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.xp_awarded).toBe(15);
  });

  it('lets three quests latch independently on one day', async () => {
    const user = await h.createUser();
    await clearQuest(user, { questId: 'steady-steps-7000' });
    await clearQuest(user, { questId: 'steady-kcal-400' });
    await clearQuest(user, { questId: 'steady-sleep-420' });
    expect(
      await h.asService('select 1 from public.quest_completions where user_id = $1', [user]),
    ).toHaveLength(3);
  });

  it('rolls quest XP into profiles.total_xp as a FOURTH source', async () => {
    // Never into daily_scores.xp_awarded: a rescore replays that column from
    // tier points and would silently wipe it — deviation #19's trap, third
    // time it applies.
    const user = await h.createUser();
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, agi_points, xp_awarded)
       values ($1, '2026-07-27', 900, 100)`,
      [user],
    );
    await clearQuest(user, { xp: 20 });

    const rows = await h.asService<{ total_xp: number }>(
      'select total_xp from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.total_xp).toBe(120);
  });

  it('recomputes rather than increments, so a re-run cannot double-pay', async () => {
    const user = await h.createUser();
    await clearQuest(user, { xp: 20 });
    await h.asService(
      `update public.quest_completions set xp_awarded = 20 where user_id = $1`,
      [user],
    );
    const rows = await h.asService<{ total_xp: number }>(
      'select total_xp from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.total_xp).toBe(20);
  });

  it('does not fold quest XP into any ability rating', async () => {
    // A cleared quest is not activity in a stat. Folding it into one would
    // inflate an ability the user never trained — the same posture events and
    // challenges take.
    const user = await h.createUser();
    await clearQuest(user, { xp: 20 });
    const rows = await h.asService<{ agi_total: number; str_total: number; mnd_total: number }>(
      'select agi_total, str_total, mnd_total from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]).toEqual({ agi_total: 0, str_total: 0, mnd_total: 0 });
  });

  it('keeps every other XP source intact — the recompute is never an increment', async () => {
    // `recalculate_user_xp` is written out whole every time it changes, so the
    // failure mode of this migration is silently DROPPING a source. Plans 3
    // and 4 both rewrite it; whichever landed second had to carry the other's
    // sources forward, and this is what says so.
    const rows = await h.asService<{ prosrc: string }>(
      `select prosrc from pg_proc where proname = 'recalculate_user_xp'`,
    );
    expect(rows).toHaveLength(1);
    const body = rows[0]!.prosrc;
    expect(body).toMatch(/daily_scores/);
    expect(body).toMatch(/event_completions/);
    expect(body).toMatch(/challenge_completions/);
    expect(body).toMatch(/quest_completions/);
    // The stat rollups ride in the same function. A rebuild that forgot them
    // would drop every account's ability ratings to zero on the next sync.
    expect(body).toMatch(/agi_total/);
    expect(body).toMatch(/str_total/);
    expect(body).toMatch(/mnd_total/);
  });

  it('vanishes with the account it belongs to', async () => {
    const user = await h.createUser();
    await clearQuest(user);
    await h.asService('delete from auth.users where id = $1', [user]);
    expect(
      await h.asService('select 1 from public.quest_completions where user_id = $1', [user]),
    ).toHaveLength(0);
  });
});

describe('profiles.quest_tier_override', () => {
  it('starts null, which means the automatic rule', async () => {
    const user = await h.createUser();
    const rows = await h.asService<{ quest_tier_override: string | null }>(
      'select quest_tier_override from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.quest_tier_override).toBeNull();
  });

  it('lets the owner set their own tier and rejects an unknown one', async () => {
    const user = await h.createUser();
    await h.asUser(
      user,
      `update public.profiles set quest_tier_override = 'starter' where id = $1`,
      [user],
    );
    const rows = await h.asService<{ quest_tier_override: string }>(
      'select quest_tier_override from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.quest_tier_override).toBe('starter');

    await rejects(
      h.asUser(
        user,
        `update public.profiles set quest_tier_override = 'godlike' where id = $1`,
        [user],
      ),
      /check constraint/i,
    );
  });

  it('did not widen the column-scoped UPDATE grant past itself', async () => {
    // The table-level revoke that precedes the column grant must not have
    // widened anything: a server-awarded column stays unwritable.
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'update public.profiles set total_xp = 999999 where id = $1', [user]),
      /permission denied/i,
    );
  });
});

/**
 * The race, snapshotted (deviation #46, spec §7.3).
 *
 * A stored squad-day is read by every member of the squad, so it cannot carry
 * the per-viewer consent gate deviation #47 put on raw steps. The table
 * therefore stores everything and grants no client role anything at all;
 * `race_result()` applies the gate on the way out. The absent grant is a
 * stronger invariant than a policy and it is what the first case below pins —
 * a policy can be subtly wrong, a missing grant cannot be subtly present.
 */
describe('race_results (deviation #46)', () => {
  const DAY = '2026-08-24';

  async function seedPair() {
    const alice = await h.createUser({ characterName: 'Alice' });
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      alice,
      `select id, invite_code from public.create_squad('Snapshot')`,
    );
    const bob = await h.createUser({ characterName: 'Bob' });
    await h.asUser(bob, 'select public.join_squad($1)', [squad[0]!.invite_code]);
    return { alice, bob, squadId: squad[0]!.id };
  }

  const consent = (userId: string) =>
    h.asService(`update public.profiles set squad_data_consent_at = now() where id = $1`, [
      userId,
    ]);

  /** Service-role, because no client role may write this table at all. */
  const store = (squadId: string, localDate: string, standings: unknown[]) =>
    h.asService(
      `insert into public.race_results (squad_id, local_date, standings)
       values ($1, $2, $3::jsonb)`,
      [squadId, localDate, JSON.stringify(standings)],
    );

  const read = (viewer: string, squadId: string, localDate: string) =>
    h.asUser<Record<string, unknown>>(
      viewer,
      'select * from public.race_result($1, $2)',
      [squadId, localDate],
    );

  it('grants no client role anything — the row is read through race_result()', async () => {
    // Supabase's ALTER DEFAULT PRIVILEGES grants ALL on a new public table to
    // `authenticated`, and ALL includes TRUNCATE, which RLS does not restrict.
    // So the revoke is not decorative and this listing must be empty.
    const rows = await h.asService<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'race_results'
          and grantee in ('anon', 'authenticated')`,
    );
    expect(rows).toEqual([]);
  });

  it('refuses a direct select from a member of the squad', async () => {
    const { alice, squadId } = await seedPair();
    await store(squadId, DAY, []);
    await rejects(
      h.asUser(alice, 'select standings from public.race_results where squad_id = $1', [squadId]),
      /permission denied/i,
    );
  });

  it('is written once per squad per date', async () => {
    // Write-once is the §19 rule: a later Apple revision never retracts a win.
    const { squadId } = await seedPair();
    await store(squadId, DAY, [{ user_id: null, rank: 1, capped_steps: 10_000, species: 'eagle' }]);
    await rejects(
      store(squadId, DAY, [{ user_id: null, rank: 1, capped_steps: 9_000, species: 'eagle' }]),
      /duplicate key/i,
    );
  });

  it('returns rank and species to a squadmate without any consent', async () => {
    // A rank is not a health figure, and species is already in two projections
    // (deviation #40). Capped steps are the disclosure.
    const { alice, bob, squadId } = await seedPair();
    await store(squadId, DAY, [
      { user_id: bob, rank: 1, capped_steps: 9_100, species: 'eagle' },
    ]);

    const rows = await read(alice, squadId, DAY);
    expect(Number(rows[0]!.rank)).toBe(1);
    expect(rows[0]!.species).toBe('eagle');
    expect(rows[0]!.character_name).toBe('Bob');
    expect(rows[0]!.capped_steps).toBeNull();
  });

  it('withholds capped steps from a viewer who has not consented', async () => {
    // Reciprocity, exactly as squad_leaderboard: without it, declining is
    // strictly dominant.
    const { alice, bob, squadId } = await seedPair();
    await consent(bob);
    await store(squadId, DAY, [
      { user_id: bob, rank: 1, capped_steps: 9_100, species: 'eagle' },
    ]);

    const rows = await read(alice, squadId, DAY);
    expect(rows[0]!.capped_steps).toBeNull();
  });

  it('withholds capped steps for a member who has not consented', async () => {
    const { alice, bob, squadId } = await seedPair();
    await consent(alice);
    await store(squadId, DAY, [
      { user_id: bob, rank: 1, capped_steps: 9_100, species: 'eagle' },
    ]);

    const rows = await read(alice, squadId, DAY);
    expect(rows[0]!.capped_steps).toBeNull();
  });

  it('returns capped steps only when both sides have consented', async () => {
    const { alice, bob, squadId } = await seedPair();
    await consent(alice);
    await consent(bob);
    await store(squadId, DAY, [
      { user_id: bob, rank: 1, capped_steps: 9_100, species: 'eagle' },
    ]);

    const rows = await read(alice, squadId, DAY);
    expect(Number(rows[0]!.capped_steps)).toBe(9_100);
  });

  it('orders by the snapshotted rank', async () => {
    const { alice, bob, squadId } = await seedPair();
    await store(squadId, DAY, [
      { user_id: bob, rank: 2, capped_steps: 4_000, species: null },
      { user_id: alice, rank: 1, capped_steps: 10_000, species: null },
    ]);

    const rows = await read(alice, squadId, DAY);
    expect(rows.map((r) => Number(r.rank))).toEqual([1, 2]);
    expect(rows.map((r) => r.user_id)).toEqual([alice, bob]);
  });

  it('refuses a caller who is not in the squad', async () => {
    const { squadId } = await seedPair();
    const outsider = await h.createUser();
    await store(squadId, DAY, []);
    await rejects(
      h.asUser(outsider, 'select * from public.race_result($1, $2)', [squadId, DAY]),
      /not a member of this squad/,
    );
  });

  it('returns nothing for a day with no result yet, rather than raising', async () => {
    // The common case for today, and for any day a member is still living in.
    // An empty set is what the digest and the history screen read as "no
    // result" — an error there would be indistinguishable from a fault.
    const { alice, squadId } = await seedPair();
    const rows = await read(alice, squadId, '2020-01-01');
    expect(rows).toHaveLength(0);
  });

  it('disappears with the squad', async () => {
    const { alice, squadId } = await seedPair();
    await store(squadId, DAY, []);
    await h.asService('delete from public.squads where id = $1', [squadId]);
    const rows = await h.asService(
      'select 1 from public.race_results where squad_id = $1',
      [squadId],
    );
    expect(rows).toEqual([]);
    void alice;
  });
});

/**
 * The digest ledger (deviation #52).
 *
 * One digest per recipient per local day, and the rule lives in two places
 * because both are load-bearing: `users_needing_digest()`'s exclusion is the
 * *behaviour* — the ordinary path never attempts the second send — and the
 * partial unique index is the *guarantee*, which holds even if the selection
 * query is wrong. A client-side cap is not a cap; it is a race between the
 * same account's phone and tablet.
 */
describe('the digest ledger (deviation #52)', () => {
  const log = (userId: string, kind: string, localDate: string) =>
    h.asService(
      `insert into public.notification_log (user_id, kind, local_date) values ($1, $2, $3)`,
      [userId, kind, localDate],
    );

  it('refuses a second digest for the same user on the same local date', async () => {
    const user = await h.createUser();
    await log(user, 'daily_digest', '2026-08-26');
    await rejects(log(user, 'daily_digest', '2026-08-26'), /duplicate key/i);
  });

  it('lets the same user have a digest on the next local date', async () => {
    const user = await h.createUser();
    await log(user, 'daily_digest', '2026-08-26');
    await log(user, 'daily_digest', '2026-08-27');
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from public.notification_log
        where user_id = $1 and kind = 'daily_digest'`,
      [user],
    );
    expect(rows[0]!.n).toBe(2);
  });

  it('leaves every other kind free to repeat', async () => {
    // MAX_NOTIFICATIONS_PER_DAY in kairo-core bounds those. This index is only
    // about the one scheduled push, and constraining the rest here would move a
    // rule out of the module that owns it and tests it.
    const user = await h.createUser();
    await log(user, 'event_completed', '2026-08-26');
    await log(user, 'event_completed', '2026-08-26');
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from public.notification_log
        where user_id = $1 and kind = 'event_completed'`,
      [user],
    );
    expect(rows[0]!.n).toBe(2);
  });

  /**
   * A scored day inside the seven-day window, so the recipient passes the
   * activity predicate added 2026-09-02. Every selection case below needs one:
   * an account with no scored day is suppressed, deliberately, and without this
   * the cases about the *hour* and the *cap* would be passing for the wrong
   * reason.
   */
  const scoreDay = (userId: string, daysAgo: number) =>
    h.asService(
      `insert into public.daily_scores (user_id, local_date, agi_points, total)
       values ($1, (now() at time zone 'Asia/Manila')::date - $2::int, 1200, 1200)`,
      [userId, daysAgo],
    );

  it('selects a user living at the given local hour', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(user, 0);
    const hour = await h.asService<{ h: number }>(
      `select extract(hour from (now() at time zone 'Asia/Manila'))::int as h`,
    );
    const rows = await h.asService<{ user_id: string; local_date: string; timezone: string }>(
      'select * from public.users_needing_digest($1)',
      [hour[0]!.h],
    );
    const mine = rows.find((r) => r.user_id === user);
    expect(mine).toBeDefined();
    expect(mine!.timezone).toBe('Asia/Manila');
  });

  it('excludes anyone already sent from the selection query', async () => {
    // The exclusion IS the cap. The index behind it only ever fires when this
    // has already gone wrong.
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(user, 0);
    const hour = await h.asService<{ h: number }>(
      `select extract(hour from (now() at time zone 'Asia/Manila'))::int as h`,
    );
    await h.asService(
      `insert into public.notification_log (user_id, kind, local_date)
       values ($1, 'daily_digest', (now() at time zone 'Asia/Manila')::date)`,
      [user],
    );
    const rows = await h.asService<{ user_id: string }>(
      'select * from public.users_needing_digest($1)',
      [hour[0]!.h],
    );
    expect(rows.find((r) => r.user_id === user)).toBeUndefined();
  });

  it('does not exclude somebody whose only digest was yesterday', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(user, 0);
    const hour = await h.asService<{ h: number }>(
      `select extract(hour from (now() at time zone 'Asia/Manila'))::int as h`,
    );
    await h.asService(
      `insert into public.notification_log (user_id, kind, local_date)
       values ($1, 'daily_digest', (now() at time zone 'Asia/Manila')::date - 1)`,
      [user],
    );
    const rows = await h.asService<{ user_id: string }>(
      'select * from public.users_needing_digest($1)',
      [hour[0]!.h],
    );
    expect(rows.find((r) => r.user_id === user)).toBeDefined();
  });

  it('is not reachable from a client session', async () => {
    // It enumerates every user in the system — the same posture
    // kairo_retention() and users_at_local_hour() take.
    const user = await h.createUser();
    await rejects(
      h.asUser(user, 'select * from public.users_needing_digest(8)'),
      /permission denied/i,
    );
  });

  /**
   * The lapse predicate (deviation #60).
   *
   * The window is exactly seven local days ending today, so a scored day six
   * days ago qualifies and one seven days ago does not. That boundary is the
   * thing a future edit is most likely to move by one, and moving it by one in
   * the wrong direction silences an active cohort — hence a case on each side
   * of it rather than a single "recent" assertion.
   *
   * `total > 0` is the same reading of "scored" the client uses: `sync-health`
   * writes a row per date in the payload whether or not it scored, so a bare
   * row count would call every synced account active forever.
   */
  const digestUsers = async (userId: string) => {
    const hour = await h.asService<{ h: number }>(
      `select extract(hour from (now() at time zone 'Asia/Manila'))::int as h`,
    );
    const rows = await h.asService<{ user_id: string }>(
      'select * from public.users_needing_digest($1)',
      [hour[0]!.h],
    );
    return rows.some((r) => r.user_id === userId);
  };

  it('sends to somebody whose last scored day was six days ago', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(user, 6);
    expect(await digestUsers(user)).toBe(true);
  });

  it('stops at seven days, and stays stopped at eight', async () => {
    const seven = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(seven, 7);
    expect(await digestUsers(seven)).toBe(false);

    const eight = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(eight, 8);
    expect(await digestUsers(eight)).toBe(false);
  });

  it('suppresses an account that has never scored', async () => {
    // Deliberate, and it reads like a bug that deletes somebody's first digest.
    // It is not: the notification ask now fires on the *first scored day*
    // (`ask-policy.ts`), so an account with no scored day holds no push token
    // and there is nothing to suppress. The two rules meet at the same boundary
    // from opposite sides. A young-account exemption here would be a second
    // rule to disagree with the first.
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    expect(await digestUsers(user)).toBe(false);
  });

  it('ignores a row that scored zero, which is how a synced quiet day lands', async () => {
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total)
       values ($1, (now() at time zone 'Asia/Manila')::date, 0)`,
      [user],
    );
    expect(await digestUsers(user)).toBe(false);
  });

  it('resumes by itself when a lapsed account scores again', async () => {
    // Nothing is stored and nothing is reset: the predicate is a read over
    // scores, so the first scored day after a lapse ends it with no setting and
    // no support step.
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(user, 30);
    expect(await digestUsers(user)).toBe(false);
    await scoreDay(user, 0);
    expect(await digestUsers(user)).toBe(true);
  });

  it('leaves the account itself untouched', async () => {
    // Lapse stops the digest and nothing else — no demotion, no lost Mastery,
    // no altered gate, and no column recording it. Suppression is derivable
    // from scores whenever the question is asked, so a row per user per morning
    // to record a non-event would be writes for nothing.
    const user = await h.createUser({ timezone: 'Asia/Manila' });
    await scoreDay(user, 30);
    expect(await digestUsers(user)).toBe(false);

    const rows = await h.asService<{ total_xp: number; agi_total: number }>(
      'select total_xp, agi_total from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.agi_total).toBeGreaterThan(0);
  });

  it('did not drop users_at_local_hour', async () => {
    // Deliberately kept: replay-scores and any future scheduled push still want
    // it, and dropping a general helper because one caller stopped using it is
    // how the next feature reimplements it.
    const rows = await h.asService<{ n: number }>(
      `select count(*)::int as n from pg_proc where proname = 'users_at_local_hour'`,
    );
    expect(rows[0]!.n).toBeGreaterThan(0);
  });
});
