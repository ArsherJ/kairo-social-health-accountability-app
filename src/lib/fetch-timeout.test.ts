import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from './fetch-timeout.ts';

/**
 * Written after a real incident on 2026-08-14. A WiFi network blocked
 * `*.supabase.co` at the TCP layer — DNS resolved, the connection never
 * established — and because supabase-js sets no timeout, the profile query
 * never settled. `resolveRoute` reports a query with no data as 'loading', so
 * the app sat on the KAIRO hold overlay indefinitely, across relaunches and a
 * reinstall, with the retry panel it already has unreachable.
 *
 * A request that hangs must become a request that fails.
 */

const never = () => new Promise<Response>(() => {});

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes a normal response straight through', async () => {
    const response = new Response('ok');
    const wrapped = fetchWithTimeout(async () => response, 1000);
    await expect(wrapped('https://example.test')).resolves.toBe(response);
  });

  it('rejects a request that never settles, rather than waiting forever', async () => {
    const wrapped = fetchWithTimeout(never, 1000);
    const pending = wrapped('https://example.test');
    // Attached before the timer runs: an unhandled rejection between the two
    // would fail the suite for the wrong reason.
    const assertion = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it('aborts the underlying request, not just the promise', async () => {
    // Without this the socket stays open and the phone keeps paying for it —
    // the point is to give up, not to look away.
    let seen: AbortSignal | undefined;
    const wrapped = fetchWithTimeout((_input, init) => {
      seen = init?.signal ?? undefined;
      return never();
    }, 1000);

    const pending = wrapped('https://example.test');
    const assertion = expect(pending).rejects.toThrow();
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(seen?.aborted).toBe(true);
  });

  it("honours the caller's own abort signal", async () => {
    // supabase-js and TanStack both cancel in-flight requests. Replacing the
    // caller's signal with ours would silently break that.
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const wrapped = fetchWithTimeout((_input, init) => {
      seen = init?.signal ?? undefined;
      return never();
    }, 60_000);

    void wrapped('https://example.test', { signal: controller.signal }).catch(() => {});
    expect(seen?.aborted).toBe(false);
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });

  it('does not leave a timer running once the request has settled', async () => {
    // A per-request timer that outlives its request keeps the JS context awake.
    const wrapped = fetchWithTimeout(async () => new Response('ok'), 1000);
    await wrapped('https://example.test');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ships a timeout long enough for a slow upload and short enough to escape', () => {
    // The sync-health payload is a whole day of buckets (deviation #8) and the
    // target market is Philippine mobile data, so this cannot be aggressive.
    // The bug being fixed is "never", not "slow".
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});
