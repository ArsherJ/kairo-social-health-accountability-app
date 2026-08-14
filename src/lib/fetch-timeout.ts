/**
 * Give every network request a deadline.
 *
 * `supabase-js` sets no timeout, and `fetch` has none of its own. That is fine
 * when a host refuses a connection — the request fails fast and the app shows
 * its retry panel — and it is not fine when a host is *black-holed*: DNS
 * resolves, the TCP handshake never completes, and the promise simply never
 * settles.
 *
 * **This is not hypothetical.** On 2026-08-14 a WiFi network began blocking
 * `*.supabase.co` that way. The profile query never resolved and never
 * rejected, so `resolveRoute` kept reporting `'loading'` — which `Gate` renders
 * as the KAIRO hold overlay — and the app sat there permanently, through
 * relaunches and a reinstall from TestFlight. The `'profile-error'` cover with
 * its "Try again" button was already built and was unreachable, because
 * nothing ever errored.
 *
 * The fix is at this level rather than in `Gate` on purpose: a screen cannot
 * tell "still arriving" from "never arriving", so the distinction has to be
 * made where the waiting happens. Every caller inherits it, including the ones
 * written later.
 *
 * Pure and dependency-free, so it is tested in Node like the rest of the
 * decision logic.
 */

/**
 * How long any single request may take before it is treated as failed.
 *
 * Deliberately generous. `sync-health` posts a whole day of buckets at once
 * (deviation #8) and the target market is Philippine mobile data, so a tight
 * deadline would turn slow-but-working syncs into failures — trading a rare
 * hang for a common one. The bug this exists to fix is "never", not "slow".
 */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Wrap a fetch implementation so requests reject once `timeoutMs` has passed.
 *
 * The underlying request is **aborted**, not merely abandoned: leaving the
 * socket open would keep the radio awake and go on costing the user's data
 * plan for an answer nobody is waiting for any more.
 *
 * A caller's own `signal` keeps working. supabase-js and TanStack Query both
 * cancel in-flight requests, and swapping their signal out for ours would
 * break that quietly.
 */
export function fetchWithTimeout(
  baseFetch: typeof fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();

    let timer: ReturnType<typeof setTimeout>;

    // Raced against the request rather than relying on the abort alone.
    //
    // Aborting only *asks* the transport to reject, and this wrapper exists
    // precisely for the case where the network layer is not behaving. A
    // transport that swallowed the abort would leave us hanging again — the
    // original bug, one level down. So the deadline is enforced here, and the
    // abort below is what frees the socket rather than what ends the wait.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Named so it is recognisable in a crash report or a log line. It
        // reaches the user as the profile screen's "that's usually just a bad
        // connection", which is the honest reading of a timeout.
        const expiry = new Error(`Request timed out after ${timeoutMs}ms`);
        controller.abort(expiry);
        reject(expiry);
      }, timeoutMs);
    });

    const callerSignal = init?.signal;
    const forwardAbort = () => controller.abort(callerSignal?.reason);

    if (callerSignal) {
      if (callerSignal.aborted) forwardAbort();
      else callerSignal.addEventListener('abort', forwardAbort);
    }

    try {
      return await Promise.race([
        baseFetch(input, { ...init, signal: controller.signal }),
        deadline,
      ]);
    } finally {
      // Both cleanups matter on the success path: the timer would otherwise
      // hold the JS context awake for its full duration after every request,
      // and the listener would leak for as long as the caller's signal lives.
      // Clearing it also means `deadline` can never reject after the race has
      // been decided, which would surface as an unhandled rejection.
      clearTimeout(timer!);
      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  };
}
