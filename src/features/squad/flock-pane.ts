/**
 * Which of the Flock tab's no-squad panes another screen is asking for.
 *
 * The pane is local state on a tab that Expo Router keeps mounted, so a request
 * from elsewhere — the welcome run's flock card is the only one today — has to
 * cross a navigation. A query parameter rather than a store, because that is
 * what the router is for and a store would have to be reset by whoever wrote
 * it.
 *
 * **One home for the vocabulary.** The href is built here and parsed here, so a
 * typo cannot make one side silently disagree with the other: `?pane=jion`
 * would simply land on the board with no error anywhere.
 *
 * Zero imports, so root Vitest can hold both halves against each other.
 */

/** The panes a caller may ask for. `choose` is where the tab starts, not a request. */
export type RequestablePane = 'create' | 'join';

const PARAM = 'pane';

/**
 * Where to send somebody who should arrive on a particular pane.
 *
 * The return type is the literal shape rather than `string` because typed
 * routes are on (`app.config.ts`'s `experiments.typedRoutes`), and a bare
 * `string` is not an `Href` — which is the compile error that would otherwise
 * push a call site back to writing the query out by hand.
 */
export function flockPaneHref(pane: RequestablePane): `/flock?pane=${RequestablePane}` {
  return `/flock?${PARAM}=${pane}`;
}

/**
 * The pane a parameter asks for, or null.
 *
 * Null for anything unrecognised **including the empty string**, which is what
 * the tab clears the parameter to once it has acted: left in place, the request
 * would reopen the form on every later visit to that tab — including a
 * notification tap days afterwards, which reads as the app losing its place.
 */
export function requestedPane(value: string | string[] | undefined): RequestablePane | null {
  return value === 'create' || value === 'join' ? value : null;
}

/** What the tab writes back to consume a request. */
export const CONSUMED_PANE_PARAMS = { [PARAM]: '' } as const;
