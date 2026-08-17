import { isValidInviteCode, normalizeInviteCode } from './invite-code.ts';

/**
 * An invite code held across the sign-in gate.
 *
 * A universal link can land on somebody who has never opened Kairo. The gate in
 * `app/_layout.tsx` sends them to `/sign-in`, and the code — the only part of
 * the link that carried any information — is gone by the time they come back.
 * So it is written down on arrival and read once afterwards.
 *
 * The decision half lives here with **no imports beyond `invite-code.ts`**,
 * which itself has none: root Vitest carries no `@/` alias and cannot parse
 * React Native's Flow syntax, so anything reaching MMKV goes in
 * `pending-invite-store.ts` instead. Same split as `buffer.ts` /
 * `milestone-store.ts`, for the same reason.
 */

export interface PendingInvite {
  /** Canonical form — six characters, `[A-Z0-9]`. */
  code: string;
  /** `Date.now()` when the link was opened. */
  savedAt: number;
}

/**
 * How long a stashed code survives.
 *
 * An hour: long enough for sign-in, an Apple ID prompt, a two-factor round trip
 * and naming a character, which is the whole gap this bridges. Deliberately not
 * indefinite — a code from last week ambushing somebody who opened the app for
 * an unrelated reason is worse than losing it, because they cannot tell where
 * it came from.
 */
export const PENDING_INVITE_TTL_MS = 60 * 60 * 1000;

/**
 * A code from a route param, or null if it is not one.
 *
 * Normalised first, so a link written `/join/ab1-2cd` works — links get retyped
 * and lowercased by chat clients, exactly like the codes the manual field
 * already forgives.
 */
export function inviteCodeFromParam(raw: string | string[] | undefined): string | null {
  // Expo Router hands back an array when a param appears more than once. There
  // is no sensible reading of two codes, so neither is used.
  if (typeof raw !== 'string') return null;
  const code = normalizeInviteCode(raw);
  return isValidInviteCode(code) ? code : null;
}

/** `now` is an argument, never a clock read, so the TTL is table-tested. */
export function isPendingInviteFresh(invite: PendingInvite, now: number): boolean {
  const age = now - invite.savedAt;
  // Negative ages are not impossible: a device clock can move backwards
  // between the write and the read. Treated as fresh rather than expired —
  // the invite is at most an hour old in wall-clock terms either way, and
  // discarding it would lose the thing this whole module exists to keep.
  return age < PENDING_INVITE_TTL_MS;
}

/**
 * Parse what came out of storage, or null.
 *
 * Validates rather than casts. This value is written by an older build of the
 * app as often as by the current one, and a malformed record must read as "no
 * pending invite" rather than crash the first screen after sign-in.
 */
export function parsePendingInvite(raw: unknown): PendingInvite | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.code !== 'string' || typeof value.savedAt !== 'number') return null;
  if (!Number.isFinite(value.savedAt)) return null;
  // Re-validated on the way out, not trusted because it was validated on the
  // way in: the codes' rules could tighten between the write and the read.
  if (!isValidInviteCode(value.code)) return null;
  return { code: normalizeInviteCode(value.code), savedAt: value.savedAt };
}
