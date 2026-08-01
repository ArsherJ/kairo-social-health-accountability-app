/**
 * Squad capacity (§7).
 *
 * §7's table: a free squad holds 6, a Legendary one holds 15. The numbers are
 * deliberately duplicated in SQL — `squads.max_members`'s default in
 * `20260727120000_init_core.sql` and the `case` in `create_squad`
 * (`20260727120500_rpc.sql`) — because a migration cannot import TypeScript.
 * Both places carry a comment pointing here, so the duplication is a decision
 * rather than a drift waiting to happen.
 *
 * The database stays authoritative: `squads.max_members` is what the
 * membership trigger enforces. These constants exist so the *client* can
 * describe capacity before a squad exists, which is exactly solo mode's job.
 */

export const FREE_SQUAD_MAX_MEMBERS = 6;

export const LEGENDARY_SQUAD_MAX_MEMBERS = 15;
