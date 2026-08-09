import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, isFinalizable, mostRecentlyCompletedLocalDate } from '../../packages/kairo-core/src/day.ts';
import {
  DEFAULT_SQUAD_PROGRAM,
  SQUAD_PROGRAMS,
  USER_FOCUSES,
  weightedBoardTotal,
} from '../../packages/kairo-core/src/program.ts';
import { levelForXp } from '../../packages/kairo-core/src/progression.ts';
import { squadTopic } from '../../src/features/squad/squad-topic.ts';
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
    expect(rows[0]!.count).toBe(11);
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
      `select invite_code, max_members from public.create_squad('Barkada')`,
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

describe('profiles.focus', () => {
  it('starts null, because focus is skippable', async () => {
    const user = await h.createUser();
    const rows = await h.asService<{ focus: string | null }>(
      'select focus from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.focus).toBeNull();
  });

  it('accepts every focus @kairo/core declares', async () => {
    const user = await h.createUser();
    for (const focus of USER_FOCUSES) {
      await h.asUser(user, 'update public.profiles set focus = $2 where id = $1', [
        user,
        focus,
      ]);
    }
    const rows = await h.asService<{ focus: string }>(
      'select focus from public.profiles where id = $1',
      [user],
    );
    expect(rows[0]!.focus).toBe(USER_FOCUSES[USER_FOCUSES.length - 1]);
  });

  it('rejects a focus the enum does not know', async () => {
    const user = await h.createUser();
    await rejects(
      h.asUser(user, `update public.profiles set focus = 'cycling' where id = $1`, [
        user,
      ]),
      /check constraint/i,
    );
  });

  it('can be set at profile creation, so onboarding needs no second round-trip', async () => {
    const seeded = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['focus-insert-probe@example.test'],
    );
    const id = seeded[0]!.id;

    await h.asUser(
      id,
      `insert into public.profiles (id, character_name, timezone, focus)
       values ($1, 'Lane', 'Asia/Manila', 'running')`,
      [id],
    );

    const rows = await h.asService<{ focus: string }>(
      'select focus from public.profiles where id = $1',
      [id],
    );
    expect(rows[0]!.focus).toBe('running');
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
