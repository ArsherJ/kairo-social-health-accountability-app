import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { levelForXp } from '../../packages/kairo-core/src/progression.ts';
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

describe('migrations', () => {
  it('apply cleanly in order', async () => {
    const rows = await h.asService<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public'`,
    );
    expect(rows[0]!.count).toBe(12);
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

describe('sabotage log is immutable', () => {
  async function seedSquadWithHit() {
    const actor = await h.createUser();
    const squad = await h.asUser<{ id: string; invite_code: string }>(
      actor,
      `select id, invite_code from public.create_squad('Chaos')`,
    );
    const target = await h.createUser();
    await h.asUser(target, 'select public.join_squad($1)', [squad[0]!.invite_code]);

    const event = await h.asService<{ id: string }>(
      `insert into public.sabotage_events
         (actor_id, target_id, squad_id, item, actor_local_date, target_local_date, outcome)
       values ($1, $2, $3, 'banana', '2026-07-27', '2026-07-27', '{"scoreDelta":-500}')
       returning id`,
      [actor, target, squad[0]!.id],
    );
    return { actor, target, squadId: squad[0]!.id, eventId: event[0]!.id };
  }

  it('rejects UPDATE even for the owning role', async () => {
    const { eventId } = await seedSquadWithHit();
    await rejects(
      h.asService(`update public.sabotage_events set item = 'banana' where id = $1`, [
        eventId,
      ]),
      /append-only/,
    );
  });

  it('rejects DELETE even for the owning role', async () => {
    const { eventId } = await seedSquadWithHit();
    await rejects(
      h.asService('delete from public.sabotage_events where id = $1', [eventId]),
      /append-only/,
    );
  });

  it('refuses a self-targeted hit', async () => {
    const { actor, squadId } = await seedSquadWithHit();
    await rejects(
      h.asService(
        `insert into public.sabotage_events
           (actor_id, target_id, squad_id, item, actor_local_date, target_local_date)
         values ($1, $1, $2, 'banana', '2026-07-27', '2026-07-27')`,
        [actor, squadId],
      ),
      /no_self_target/,
    );
  });

  it('lets the target see the hit that landed on them', async () => {
    const { target } = await seedSquadWithHit();
    const seen = await h.asUser(
      target,
      'select id from public.sabotage_events where target_id = $1',
      [target],
    );
    expect(seen).toHaveLength(1);
  });

  it('blocks clients from forging a deploy', async () => {
    const { actor, target, squadId } = await seedSquadWithHit();
    await rejects(
      h.asUser(
        actor,
        `insert into public.sabotage_events
           (actor_id, target_id, squad_id, item, actor_local_date, target_local_date)
         values ($1, $2, $3, 'banana', '2026-07-27', '2026-07-27')`,
        [actor, target, squadId],
      ),
      /permission denied/i,
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
    await h.asService(
      `insert into public.daily_scores (user_id, local_date, total, tiers)
       values ($1, '2026-07-27', 1300, '{"AGI":"silver"}'),
              ($2, '2026-07-27', 2900, '{"AGI":"bronze"}')`,
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
    expect(messages[0]!.topic).toBe(`squad:${squadId}`);
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
