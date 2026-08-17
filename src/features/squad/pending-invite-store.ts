import { createMMKV } from 'react-native-mmkv';
import {
  isPendingInviteFresh,
  parsePendingInvite,
  type PendingInvite,
} from './pending-invite.ts';

/**
 * Where an invite code waits while somebody signs in.
 *
 * The performing half of `pending-invite.ts` — every decision lives there, so
 * root Vitest can exercise the TTL and the parsing without MMKV. This file only
 * reads, writes and clears.
 *
 * **Not keyed by user, unlike every other store here.** That is the point: the
 * code is written *before* there is a user, by somebody who may be about to
 * create their account. Keying it would put it somewhere nothing could find it
 * again.
 *
 * Its own storage id for the same reason `kairo.telemetry` has one — clearing
 * health sync state or signing out must not discard an invite mid-flight.
 */
const storage = createMMKV({ id: 'kairo.invite' });

const KEY = 'pending-invite.v1';

/**
 * Remember a code across the sign-in gate.
 *
 * Overwrites: if two links are tapped before signing in, the second is the one
 * the user just chose, and the first is the one they abandoned.
 */
export function stashPendingInvite(code: string, now: number): void {
  const invite: PendingInvite = { code, savedAt: now };
  storage.set(KEY, JSON.stringify(invite));
}

/**
 * Take the pending code, if there is a fresh one. Clears it either way.
 *
 * Taking rather than reading is deliberate — this is called on every arrival at
 * the signed-in shell, and a code that stayed put would re-open the join screen
 * on every launch until it expired.
 */
export function takePendingInvite(now: number): string | null {
  const raw = storage.getString(KEY);
  storage.remove(KEY);
  if (raw === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Truncated or written by a build that stored something else. Already
    // cleared above, so the next launch starts clean.
    return null;
  }

  const invite = parsePendingInvite(parsed);
  if (invite === null) return null;
  return isPendingInviteFresh(invite, now) ? invite.code : null;
}

/** Drop a pending code without acting on it. */
export function clearPendingInvite(): void {
  storage.remove(KEY);
}
