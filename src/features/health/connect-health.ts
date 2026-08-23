import { track } from '@/features/telemetry/events.ts';
import { healthSource } from './health-source.ts';
import type { HealthPermissionState } from './permission-state.ts';
import { notifyHealthPermissionGranted } from './useHealthSync.ts';

/**
 * Everything that has to happen when a user connects Apple Health, in one place.
 *
 * **This exists because it was paraphrased once and three quarters of it went
 * missing.** The sequence lived inside `HealthAsk.ask()` while that sheet was
 * the only ask. When `/connect` was added as the first onboarding screen
 * (deviation #38) it was written from the plan, which showed only
 * `requestHealthPermission()` — so the new screen, the one the entire new-user
 * cohort now goes through, silently dropped background-delivery registration,
 * the immediate sync kickoff, and the `health_permission_failed` path.
 *
 * The dropped registration was the expensive one, and it was invisible: after
 * a grant, `readHealthPermissionState()` returns `'asked'`, so
 * `nextPermissionAsk` never offers the sheet again and nothing else would ever
 * have called `configureHealthBackgroundDelivery()`. Nothing errors, nothing
 * logs, and data simply arrives less often than it should.
 *
 * So: two callers, one function, and the next divergence is not possible.
 */
export interface HealthConnectResult {
  /** The request completed without throwing. **Not** "the user said yes" —
   *  HealthKit does not report read-permission denial. */
  ok: boolean;
  /** The state read back afterwards, or null if that read itself failed. */
  state: HealthPermissionState | null;
}

export async function connectHealth(
  userId: string | undefined,
): Promise<HealthConnectResult> {
  if (!healthSource.policy.supportsPermission) {
    return { ok: false, state: 'unavailable' };
  }

  try {
    await healthSource.requestPermission();
    await healthSource.configureBackgroundDelivery();
    // Sync straight away rather than waiting for the next foreground. The user
    // just connected Health and is looking at a screen showing zero.
    notifyHealthPermissionGranted();

    // No granted/denied in the payload: HealthKit does not report
    // read-permission denial, so an event claiming either would be believed and
    // wrong. The resulting state is what is actually knowable.
    //
    // `.catch(() => null)` rather than letting a rejection fall to the `catch`
    // below: everything above already succeeded — the request, the
    // background-delivery config and the sync kickoff — so a transient failure
    // *reading back* the state must not report the connect as failed,
    // re-present the sheet, or write a false `health_permission_failed`.
    const state = await healthSource.readPermissionState().catch(() => null);
    void track(userId, 'health_ask_completed', { state });
    return { ok: true, state };
  } catch (error) {
    // Caught, never rethrown. Both call sites invoke this from an onPress
    // handler, where a rejection is unhandled — and a `finally` that advances
    // the screen either way makes a failed connect look exactly like a
    // successful one, leaving the user with a character powered by nothing and
    // no reason to suspect it. `track` never throws, so nothing here can make
    // the failure worse.
    void track(userId, 'health_permission_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, state: null };
  }
}
