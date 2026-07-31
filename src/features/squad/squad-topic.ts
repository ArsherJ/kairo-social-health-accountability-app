/**
 * The one definition of a wire contract whose two ends are a Postgres
 * trigger (broadcasts to this topic) and a client channel name (subscribes
 * to it). Nothing type-checks the two sides against each other — a typo on
 * either end fails silently, because RLS on `realtime.messages` simply never
 * admits the mismatched topic. Sharing this function between the client and
 * the schema test is what pins them together.
 *
 * Zero imports: root Vitest has no `@/` alias and cannot parse React
 * Native's Flow syntax, and this module is imported by a test that runs
 * there.
 */
export function squadTopic(squadId: string): string {
  return `squad:${squadId}`;
}
