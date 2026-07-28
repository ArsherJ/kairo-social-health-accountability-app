import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

/**
 * Applies the real migrations to an in-process Postgres (PGlite) so the schema,
 * triggers, RPCs and RLS policies are executed rather than assumed.
 *
 * PGlite is genuine Postgres compiled to WASM, but it is not Supabase: the
 * `auth` and `realtime` schemas that the migrations depend on are provided by
 * the platform. The stubs below reproduce their observable contract —
 * `auth.uid()` reading the request JWT claim, `realtime.topic()`, the
 * `realtime.messages` table and `realtime.broadcast_changes()` — so the
 * migrations run unmodified.
 *
 * What this verifies: DDL validity and ordering, CHECK constraints, trigger
 * behaviour, RPC logic, and RLS enforcement under a non-owner role.
 *
 * What it does not verify: that Supabase's real Realtime server delivers the
 * broadcasts, and that the hosted `auth` schema behaves identically. Those
 * need `supabase start` against Docker.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Migrations this harness cannot apply, with the reason.
 *
 * Keep this list as short as possible — every entry is schema that no test
 * covers. An entry is only justified when the migration contains no testable
 * semantics, and it must be verified against the live project instead.
 */
const UNSUPPORTED_MIGRATIONS = new Map<string, string>([
  [
    '20260728150000_schedule_finalize_days.sql',
    // PGlite ships no pg_cron or pg_net, and there is nothing to assert here
    // beyond "the schedule exists" — which was checked against the real project
    // via supabase/scripts/remote-sql.sh (cron.job row, '5 * * * *', active).
    'requires pg_cron and pg_net extensions',
  ],
]);

/** Recreates just enough of the Supabase platform for the migrations to run. */
const PLATFORM_STUB = `
  create schema if not exists auth;
  create schema if not exists realtime;

  -- Supabase creates these roles; RLS policies grant to them by name.
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public to anon, authenticated, service_role;

  -- Mirrors Supabase's default privileges for the public schema, so the
  -- migrations' REVOKE statements are meaningful rather than no-ops.
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on functions to anon, authenticated, service_role;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  grant select on auth.users to authenticated, service_role;

  -- Reads the same GUC the real implementation does.
  create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(
      current_setting('request.jwt.claim.sub', true),
      ''
    )::uuid;
  $fn$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create table realtime.messages (
    id bigint generated always as identity primary key,
    topic text not null,
    extension text not null,
    event text,
    payload jsonb,
    inserted_at timestamptz not null default now()
  );
  alter table realtime.messages enable row level security;
  grant select on realtime.messages to authenticated;
  grant usage on schema realtime to anon, authenticated, service_role;

  create or replace function realtime.topic() returns text
  language sql stable as $fn$
    select nullif(current_setting('realtime.topic', true), '');
  $fn$;
  grant execute on function realtime.topic() to anon, authenticated, service_role;

  -- Records the call so tests can assert the trigger fired with the right topic.
  create or replace function realtime.broadcast_changes(
    topic_name text,
    event_name text,
    operation text,
    table_name text,
    table_schema text,
    new_record record,
    old_record record,
    level text default 'ROW'
  ) returns void
  language plpgsql as $fn$
  begin
    insert into realtime.messages (topic, extension, event, payload)
    values (
      topic_name, 'broadcast', event_name,
      jsonb_build_object(
        'operation', operation,
        'table', table_name,
        'schema', table_schema,
        'record', to_jsonb(new_record)
      )
    );
  end;
  $fn$;
`;

export interface Harness {
  db: PGlite;
  /** Run SQL as the table owner, bypassing RLS. Stands in for service_role. */
  asService<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL as `authenticated` with auth.uid() bound to `userId`. */
  asUser<T = unknown>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
  /** Create an auth user plus a profile, returning the id. */
  createUser(opts?: {
    characterName?: string;
    timezone?: string;
    isLegendary?: boolean;
  }): Promise<string>;
  close(): Promise<void>;
}

export async function setupHarness(): Promise<Harness> {
  const db = new PGlite();
  await db.exec(PLATFORM_STUB);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (UNSUPPORTED_MIGRATIONS.has(file)) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  async function asService<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await db.query<T>(sql, params);
    return result.rows;
  }

  async function asUser<T>(
    userId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    // A transaction keeps `set local` scoped to this statement batch. Switching
    // to `authenticated` matters: the owning role would bypass RLS entirely and
    // every policy assertion below would silently pass.
    await db.exec('begin');
    try {
      await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
      await db.exec('set local role authenticated');
      const result = await db.query<T>(sql, params);
      await db.exec('commit');
      return result.rows;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }

  let counter = 0;
  async function createUser(
    opts: { characterName?: string; timezone?: string; isLegendary?: boolean } = {},
  ): Promise<string> {
    counter += 1;
    const rows = await asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [`user${counter}@example.test`],
    );
    const id = rows[0]!.id;
    await asService(
      `insert into public.profiles (id, character_name, timezone, is_legendary)
       values ($1, $2, $3, $4)`,
      [
        id,
        opts.characterName ?? `Hunter${counter}`,
        opts.timezone ?? 'Asia/Manila',
        opts.isLegendary ?? false,
      ],
    );
    return id;
  }

  return {
    db,
    asService,
    asUser,
    createUser,
    close: () => db.close(),
  };
}
