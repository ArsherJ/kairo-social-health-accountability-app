/**
 * Events fired before there is a user to attribute them to.
 *
 * `track()` needs a `userId` — `app_events.user_id` is the row's identity — so
 * anything recorded on the sign-in screen has nowhere to go until the session
 * exists. Dropping them would make the pre-auth pitch the one screen the
 * activation funnel cannot see, which is exactly the screen the funnel was
 * added to judge.
 *
 * **Zero imports**, so root Vitest can load it: that config has no `@/` alias
 * and cannot parse React Native's Flow syntax. Same constraint, and the same
 * reason, as `sync-state.ts` and `ask-order.ts`.
 */

export type BufferedEvent = {
  type: string;
  payload: Record<string, unknown>;
  /** Epoch ms at the moment the event happened, never at flush time. */
  occurredAt: number;
};

/**
 * Capped, because someone who opens the app and never signs in would otherwise
 * accumulate rows forever. Generous against the handful of pre-auth screens
 * that exist — reaching this cap means something is firing in a loop.
 */
export const MAX_BUFFERED_EVENTS = 20;

/** Append, oldest dropped first past the cap. Never mutates its argument. */
export function bufferEvent(
  buffer: readonly BufferedEvent[],
  event: BufferedEvent,
): BufferedEvent[] {
  const next = [...buffer, event];
  return next.slice(Math.max(0, next.length - MAX_BUFFERED_EVENTS));
}

/**
 * Take everything, leaving the buffer empty.
 *
 * Returns the next buffer rather than clearing in place so the caller decides
 * when the drain is committed — a flush whose writes fail should not be able to
 * lose events that were never sent.
 */
export function drainBuffer(buffer: readonly BufferedEvent[]): {
  drained: BufferedEvent[];
  next: BufferedEvent[];
} {
  return { drained: [...buffer], next: [] };
}
